import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

type Env = Record<string, string | undefined>;

/**
 * The instance's settings file: RONNE_ENV_FILE (absolute, or relative to the app), or `.env` next to
 * the app. Docker sets RONNE_ENV_FILE=/app/data/.env so the settings live on the data volume.
 */
export const envFilePath = (appDir: string = process.cwd(), env: Env = process.env): string => {
  return resolve(appDir, env.RONNE_ENV_FILE || ".env");
};

export type AppConfig = {
  envFile: string;
  databaseUrl?: string;
  authSecret?: string;
  publicUrl?: string;
  storagePath: string;
  /** Trust X-Forwarded-* headers from a reverse proxy (TRUST_PROXY=true). */
  trustProxy: boolean;
};

/**
 * Reads the settings file, with environment variables taking precedence over it (an empty variable
 * counts as unset). Read on each call, so a finished setup is picked up after a restart.
 */
export const loadConfig = (options: { appDir?: string; env?: Env } = {}): AppConfig => {
  const env = options.env ?? process.env;
  const envFile = envFilePath(options.appDir, env);
  // The settings file is chosen at runtime, so it's not part of the build: without the ignore
  // comments, Turbopack would trace the whole project into the server output.
  const file: Env = existsSync(/*turbopackIgnore: true*/ envFile)
    ? parseEnv(readFileSync(/*turbopackIgnore: true*/ envFile, "utf8"))
    : {};
  const value = (key: string) => env[key] || file[key] || undefined;

  return {
    envFile,
    databaseUrl: value("DATABASE_URL"),
    authSecret: value("AUTH_SECRET"),
    publicUrl: value("PUBLIC_URL"),
    storagePath: value("STORAGE_PATH") ?? "./data/storage",
    trustProxy: value("TRUST_PROXY") === "true",
  };
};

/** The instance can serve requests: setup has written a database URL and a secret. */
export const isConfigured = (
  config: AppConfig,
): config is AppConfig & { databaseUrl: string; authSecret: string } => {
  return Boolean(config.databaseUrl && config.authSecret);
};
