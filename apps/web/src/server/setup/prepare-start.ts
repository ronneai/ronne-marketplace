import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isConfigured, loadConfig } from "../config";
import { createDb } from "../db/create-db";
import { migrateToLatest } from "../db/migrate";
import { redactDatabaseUrl } from "../db/url";

/** Starting the server would be wrong: the container should stop (and be restarted). */
export class StartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartError";
  }
}

export type StartPlan = { mode: "setup-required" } | { mode: "ready"; applied: string[] };

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
  log?: (line: string) => void;
}): Promise<StartPlan> => {
  const log = options.log ?? ((line) => console.log(line));
  checkWritable(options.dataDir);

  const config = loadConfig({ appDir: options.appDir, env: options.env ?? process.env });
  if (!isConfigured(config)) {
    log(
      `Ronne AI Marketplace isn't set up yet: starting in setup mode. Open ${config.publicUrl ?? "http://localhost:3000"} in a browser and follow the setup, or run \`docker compose exec web pnpm run setup\`.`,
    );
    return { mode: "setup-required" };
  }

  const { db, dialect } = createDb(config.databaseUrl, { baseDir: options.appDir });
  try {
    log(`Checking migrations for ${redactDatabaseUrl(config.databaseUrl)} (${dialect})`);
    const applied = await migrateToLatest(db, dialect);
    log(
      applied.length ? `Applied migrations: ${applied.join(", ")}` : "The database is up to date.",
    );
    return { mode: "ready", applied };
  } catch (error) {
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
