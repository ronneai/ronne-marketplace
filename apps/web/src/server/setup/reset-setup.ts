import { existsSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { loadConfig } from "../config";
import { parseDatabaseUrl, redactDatabaseUrl, UnsupportedDatabaseUrlError } from "../db/url";

/**
 * `pnpm run reset-setup` (feature 036): puts a clone back to "not set up", so the web setup can
 * be tried again. Development only: it refuses in production and in Docker, and it isn't in the
 * image. It removes the settings file, the SQLite database it names when that file is under the
 * app folder (with its -wal and -shm files), and the storage folder when it's under `data/`.
 */

export type ResetItem = { kind: "settings" | "database" | "storage"; path: string };

export type ResetPlan = {
  items: ResetItem[];
  /** What's left alone, and why. */
  notes: string[];
};

export class ResetRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResetRefusedError";
  }
}

const isUnder = (path: string, folder: string) => path.startsWith(`${folder}${sep}`);

export const planReset = (options: {
  appDir: string;
  env?: Record<string, string | undefined>;
}): ResetPlan => {
  const env = options.env ?? process.env;
  if (env.NODE_ENV === "production")
    throw new ResetRefusedError("reset-setup only runs in development (NODE_ENV is production).");
  if (env.RONNE_RUNTIME === "docker")
    throw new ResetRefusedError(
      "reset-setup only runs from a clone, not in Docker. To start over there, remove the ronne-data volume.",
    );

  const appDir = resolve(options.appDir);
  const config = loadConfig({ appDir, env });
  const items: ResetItem[] = [];
  const notes: string[] = [];

  if (existsSync(config.envFile)) items.push({ kind: "settings", path: config.envFile });

  if (config.databaseUrl) {
    try {
      const database = parseDatabaseUrl(config.databaseUrl, appDir);
      if (database.dialect !== "sqlite") {
        notes.push(
          `The ${database.dialect === "postgres" ? "PostgreSQL" : "MySQL"} database (${redactDatabaseUrl(config.databaseUrl)}) is left untouched: drop it by hand to start over, or setup will find its tables and root and the instance will simply be ready again.`,
        );
      } else if (database.filename === ":memory:") {
        // Nothing on disk.
      } else if (!isUnder(database.filename, appDir)) {
        notes.push(
          `The SQLite database ${database.filename} is outside the app folder and is left alone.`,
        );
      } else {
        for (const suffix of ["", "-wal", "-shm"]) {
          const path = `${database.filename}${suffix}`;
          if (existsSync(path)) items.push({ kind: "database", path });
        }
      }
    } catch (error) {
      if (!(error instanceof UnsupportedDatabaseUrlError)) throw error;
      notes.push(
        `DATABASE_URL isn't one Ronne AI Marketplace understands; nothing else is removed.`,
      );
    }
  }

  const storage = resolve(appDir, config.storagePath);
  if (existsSync(storage)) {
    if (isUnder(storage, join(appDir, "data"))) items.push({ kind: "storage", path: storage });
    else
      notes.push(
        `The storage folder ${storage} is outside the app's data folder and is left alone.`,
      );
  }

  return { items, notes };
};

/** Removes everything in the plan and returns the paths, in order. */
export const applyReset = (plan: ResetPlan): string[] => {
  const removed: string[] = [];
  for (const item of plan.items) {
    rmSync(item.path, { recursive: item.kind === "storage", force: true });
    removed.push(item.path);
  }
  return removed;
};
