import { type AppConfig, isConfigured, loadConfig } from "../config";
import type { CreatedDb } from "../db/create-db";
import { getAppDb } from "../db/instance";
import { findRoot } from "../domains/identity/actions/root-account";

/**
 * How far an instance's setup has got (feature 036):
 * - `not_configured`: no DATABASE_URL or AUTH_SECRET in the settings (file or environment);
 * - `incomplete`: settings, but no tables or no root account yet (a web setup that was interrupted,
 *   or a `pnpm run setup` cancelled after writing the file);
 * - `unavailable`: settings, but the database doesn't answer;
 * - `ready`: settings, tables and a root account.
 */
export type SetupState = "not_configured" | "incomplete" | "unavailable" | "ready";

const TIMEOUT_MS = 3_000;

// `ready` is remembered per process, keyed by the database URL: root can't be deleted or demoted,
// so it never goes back. Not in development, where `pnpm run reset-setup` must show on the next request.
const memory = globalThis as typeof globalThis & { __ronneSetupReady?: string };

export type SetupStateOptions = {
  getDb?: (url: string) => CreatedDb;
  /** Remember `ready` for the process. Defaults to production only. */
  remember?: boolean;
};

const rememberByDefault = () => process.env.NODE_ENV === "production";

export const getSetupState = async (
  config: AppConfig = loadConfig(),
  options: SetupStateOptions = {},
): Promise<SetupState> => {
  if (!isConfigured(config)) return "not_configured";
  const remember = options.remember ?? rememberByDefault();
  if (remember && memory.__ronneSetupReady === config.databaseUrl) return "ready";

  const check = async (): Promise<SetupState> => {
    const { db, dialect } = (options.getDb ?? getAppDb)(config.databaseUrl);
    const tables = await db.introspection.getTables();
    if (!tables.some((table) => table.name === "user")) return "incomplete";
    if (!(await findRoot(db, dialect))) return "incomplete";
    return "ready";
  };
  let state: SetupState;
  try {
    state = await Promise.race([
      check(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS).unref?.(),
      ),
    ]);
  } catch {
    return "unavailable";
  }
  if (state === "ready" && remember) memory.__ronneSetupReady = config.databaseUrl;
  return state;
};

/** Called once root is created, so the next request doesn't check again. */
export const markSetupReady = (databaseUrl: string, remember = rememberByDefault()): void => {
  if (remember) memory.__ronneSetupReady = databaseUrl;
};

/** Forgets a remembered `ready` (tests). */
export const resetSetupState = (): void => {
  delete memory.__ronneSetupReady;
};
