import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isConfigured, loadConfig, secretsConflict } from "../config";
import { createDb, type Db } from "../db/create-db";
import { migrateToLatest } from "../db/migrate";
import type { DatabaseDialect } from "../db/url";
import { type Logger, logger } from "../log";
import { defaultPublicUrl, setupCommand } from "../runtime";
import { announceSetupCode, markSetupCodeShown } from "./announce-setup-code";
import { SETUP_CODE_FILE } from "./setup-code";

/** Starting the server would be wrong: the container should stop (and be restarted). */
export class StartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartError";
  }
}

export type StartPlan =
  | { mode: "setup-required" }
  | {
      mode: "ready";
      applied: string[];
      dialect: DatabaseDialect;
      /** Settings and tables but no root yet (an interrupted setup): the setup code is asked for. */
      incomplete?: true;
    };

/**
 * What the container does before starting the server (feature 005):
 * 1. make sure the data folder is writable (the volume can be owned by root);
 * 2. before setup, start in setup-required mode;
 * 3. after setup, apply pending migrations, so upgrading the image upgrades the database.
 * A failed migration throws StartError instead of serving a half-migrated database.
 * Until root exists (setup mode, or settings without root), the setup code is made if needed and
 * logged with the address to open (161).
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
  // Whatever happens next, the code is this script's to show: the server it starts doesn't check.
  markSetupCodeShown();

  const env = options.env ?? process.env;
  const conflict = secretsConflict(env);
  if (conflict) throw new StartError(conflict);
  const config = loadConfig({ appDir: options.appDir, env });
  // The address to open is the one value from the environment a line holds (080, 082): it isn't
  // secret, and the person starting a new instance needs it.
  const url = config.publicUrl ?? defaultPublicUrl(env);
  const announce = () =>
    announceSetupCode({ path: join(options.dataDir, SETUP_CODE_FILE), url, log });
  if (!isConfigured(config)) {
    log.info(
      "Not set up yet: starting in setup mode. Open the address in a browser, or run the setup",
      { url, command: setupCommand(env) },
    );
    announce();
    return { mode: "setup-required" };
  }

  const { db, dialect } = createDb(config.databaseUrl, { baseDir: options.appDir });
  try {
    log.debug("Checking migrations", { dialect });
    const applied = await migrateToLatest(db, dialect);
    if (applied.length)
      log.event("server.migrations_applied", { count: applied.length, latest: applied.at(-1) });
    else log.info("Database up to date", { dialect });
    if (!(await hasRoot(db))) {
      log.info("Not set up yet: no root account. Open the address in a browser, or run the setup", {
        url,
        command: setupCommand(env),
      });
      announce();
      return { mode: "ready", applied, dialect, incomplete: true };
    }
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

/**
 * Whether a root account exists, as setup's own state reads it (state.ts): one that isn't erased.
 * A query of its own, so the start script doesn't load the identity domain (and its password
 * hasher).
 */
const hasRoot = async (db: Db): Promise<boolean> =>
  (await db
    .selectFrom("user")
    .select("id")
    .where("role", "=", "root")
    .where("erased_at", "is", null)
    .limit(1)
    .executeTakeFirst()) !== undefined;

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
