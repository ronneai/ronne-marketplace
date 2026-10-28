import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { defaultDataPath } from "./runtime";

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
  /** LOG_LEVEL and LOG_FORMAT as given (feature 100); log/logger.ts reads them. */
  logLevel?: string;
  logFormat?: string;
  /** Every OTEL_* setting (101), the environment's over the file's; server/telemetry reads them. */
  otel?: Record<string, string>;
  /** RONNE_JOBS as given (102): `off` turns the in-process scheduler off; server/jobs reads it. */
  jobs?: string;
  /**
   * The security scan (135): RONNE_SKILL_SCANNER and RONNE_SKILL_SCANNER_TIMEOUT as given, and every
   * RONNE_SKILL_SCANNER_ENV_* setting (the environment's over the file's). domains/scans reads them.
   */
  skillScanner?: {
    command?: string;
    timeout?: string;
    env: Record<string, string>;
  };
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
  const withPrefix = (prefix: string): Record<string, string> =>
    Object.fromEntries(
      [...new Set([...Object.keys(file), ...Object.keys(env)])]
        .filter((key) => key.startsWith(prefix))
        .flatMap((key) => {
          const set = value(key);
          return set ? [[key, set]] : [];
        }),
    );

  return {
    envFile,
    databaseUrl: value("DATABASE_URL"),
    authSecret: value("AUTH_SECRET"),
    publicUrl: value("PUBLIC_URL"),
    storagePath: value("STORAGE_PATH") ?? defaultDataPath("storage", env),
    trustProxy: value("TRUST_PROXY") === "true",
    logLevel: value("LOG_LEVEL"),
    logFormat: value("LOG_FORMAT"),
    jobs: value("RONNE_JOBS"),
    otel: withPrefix("OTEL_"),
    skillScanner: {
      command: value("RONNE_SKILL_SCANNER"),
      timeout: value("RONNE_SKILL_SCANNER_TIMEOUT"),
      env: withPrefix("RONNE_SKILL_SCANNER_ENV_"),
    },
  };
};

/** The instance can serve requests: setup has written a database URL and a secret. */
export const isConfigured = (
  config: AppConfig,
): config is AppConfig & { databaseUrl: string; authSecret: string } => {
  return Boolean(config.databaseUrl && config.authSecret);
};

/**
 * Why the server won't start with BETTER_AUTH_SECRETS set (105), or null. Better Auth would sign
 * sessions and encrypt two-factor secrets with it instead of AUTH_SECRET (it wins over the secret
 * Ronne passes), and then rotate-secret, the backups and a restore would handle the wrong one.
 */
export const secretsConflict = (env: Env = process.env): string | null =>
  env.BETTER_AUTH_SECRETS
    ? "BETTER_AUTH_SECRETS is set in the environment. Ronne uses AUTH_SECRET alone, so there's one secret to back up and to replace (rotate-secret): unset BETTER_AUTH_SECRETS, then start the server again."
    : null;
