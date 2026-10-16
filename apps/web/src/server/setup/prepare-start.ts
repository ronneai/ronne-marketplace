import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isConfigured, loadConfig, secretsConflict } from "../config";
import { createDb } from "../db/create-db";
import { migrateToLatest } from "../db/migrate";
import type { DatabaseDialect } from "../db/url";
import { type Logger, logger } from "../log";
import { defaultPublicUrl, setupCommand } from "../runtime";

/** Starting the server would be wrong: the container should stop (and be restarted). */
export class StartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartError";
  }
}

export type StartPlan =
  | { mode: "setup-required" }
  | { mode: "ready"; applied: string[]; dialect: DatabaseDialect };

/**
 * What the container does before starting the server (feature 005):
 * 1. make sure the data folder is writable (the volume can be owned by root);
 * 2. before setup, start in setup-required mode;
 * 3. after setup, apply pending migrations, so upgrading the image upgrades the database.
 * A failed migration throws StartError instead of serving a half-migrated database.
 */
export const prepareStart = async (options: {
  appDir: string;
  dataDir: string;
  env?: Record<string, string | undefined>;
  /** Where the start's lines go (feature 100): the server's logger by default. */
  log?: Logger;
}): Promise<StartPlan> => {
  const log = options.log ?? logger.child({ domain: "server" });
  checkWritable(options.dataDir);

  const env = options.env ?? process.env;
  const conflict = secretsConflict(env);
  if (conflict) throw new StartError(conflict);
  const config = loadConfig({ appDir: options.appDir, env });
  if (!isConfigured(config)) {
    // The address to open is the one value from the environment a line holds (080, 082): it isn't
    // secret, and the person starting a new instance needs it.
    log.info(
      "Not set up yet: starting in setup mode. Open the address in a browser, or run the setup",
      {
        url: config.publicUrl ?? defaultPublicUrl(env),
        command: setupCommand(env),
      },
    );
    return { mode: "setup-required" };
  }

  const { db, dialect } = createDb(config.databaseUrl, { baseDir: options.appDir });
  try {
    log.debug("Checking migrations", { dialect });
    const applied = await migrateToLatest(db, dialect);
    if (applied.length)
      log.event("server.migrations_applied", { count: applied.length, latest: applied.at(-1) });
    else log.info("Database up to date", { dialect });
    return { mode: "ready", applied, dialect };
  } catch (error) {
    // A line for collectors (the driver's error, its secrets redacted); start.ts prints the message.
    log.error("Migrations failed, so the server wasn't started", { dialect, err: error });
    throw new StartError(
      `Migrations failed, so the server wasn't started: ${(error as Error).message}`,
    );
  } finally {
    await db.destroy();
  }
};

const checkWritable = (dataDir: string) => {
  const probe = join(dataDir, `.write-check-${randomBytes(4).toString("hex")}`);
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(probe, "");
    rmSync(probe);
  } catch {
    throw new StartError(
      `${dataDir} isn't writable by this user (uid ${process.getuid?.() ?? "?"}). If it's a Docker volume created ` +
        "by root, fix its owner with: docker compose run --rm --user root web chown -R 1000:1000 /app/data",
    );
  }
};
