import { loadConfig } from "../config";
import { type Logger, logger } from "../log";
import { defaultPublicUrl } from "../runtime";
import { announceSetupCode, setupCodeShown } from "./announce-setup-code";
import { setupCodePath } from "./setup-code";
import { getSetupState, type SetupState } from "./state";

/**
 * The server's own start (instrumentation.ts), for a clone's `pnpm dev` and `pnpm start` (161):
 * before setup, or with settings but no root yet, the setup code is made if needed and logged.
 * Docker and the npm package show it in `prepareStart` first, so it isn't shown twice. A database
 * that doesn't answer shows nothing: the setup refuses it anyway.
 */
export const announceSetupCodeAtStart = async (
  options: {
    env?: Record<string, string | undefined>;
    log?: Logger;
    /** The instance's setup state: read from its settings and database by default. */
    getState?: () => Promise<SetupState>;
  } = {},
): Promise<string | null> => {
  if (setupCodeShown()) return null;
  const env = options.env ?? process.env;
  const config = loadConfig({ env });
  const state = await (options.getState ?? (() => getSetupState(config, { remember: false })))();
  if (state !== "not_configured" && state !== "incomplete") return null;
  return announceSetupCode({
    path: setupCodePath(env),
    url: config.publicUrl ?? defaultPublicUrl(env),
    log: options.log ?? logger.child({ domain: "server" }),
  });
};
