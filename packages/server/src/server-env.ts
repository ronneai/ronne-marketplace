// The environment rmk-server gives the web app (feature 082). Values already set win, so
// RONNE_ENV_FILE, NODE_ENV and the rest can still be chosen by the person running it.
import { join } from "node:path";

type Env = Record<string, string | undefined>;

export const serverEnv = (options: {
  env: Env;
  dataDir: string;
  port: number;
  host?: string;
}): Env => {
  const { env, dataDir, port, host } = options;
  return {
    NODE_ENV: env.NODE_ENV || "production",
    NEXT_TELEMETRY_DISABLED: env.NEXT_TELEMETRY_DISABLED || "1",
    // The setup, the Documentation and the messages give rmk-server's commands, and the default
    // SQLite file and storage go in the data folder (apps/web/src/server/runtime.ts).
    RONNE_RUNTIME: "npm",
    RONNE_DATA_DIR: dataDir,
    RONNE_ENV_FILE: env.RONNE_ENV_FILE || join(dataDir, ".env"),
    PORT: String(port),
    // Next.js's standalone server listens on HOSTNAME. PUBLIC_URL is left alone: set in the
    // environment it would win over the setup's answer, so the app derives it from PORT instead.
    ...(host ? { HOSTNAME: host } : {}),
  };
};

/** Whether the settings file has a database yet: if not, the server starts in setup mode. */
export const isSetUp = (envFileText: string | undefined): boolean =>
  envFileText !== undefined && /^DATABASE_URL=.+$/m.test(envFileText);
