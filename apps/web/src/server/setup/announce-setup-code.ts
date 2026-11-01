import type { Logger } from "../log";
import { ensureSetupCode, formatSetupCode, SetupCodeFileError } from "./setup-code";

/**
 * Shown once per process: `prepareStart` shows the code before the server starts (Docker, the npm
 * package), and the server's own start (instrumentation.ts: `pnpm dev`, `pnpm start`) doesn't show
 * it again. On globalThis, as the server's bundle and the start script are separate modules.
 */
const memory = globalThis as typeof globalThis & { __ronneSetupCodeShown?: boolean };

export const setupCodeShown = (): boolean => memory.__ronneSetupCodeShown === true;

/**
 * The start script (`prepareStart`) has dealt with the code, shown or not needed: the server's own
 * start doesn't look at the setup state again.
 */
export const markSetupCodeShown = (): void => {
  memory.__ronneSetupCodeShown = true;
};

/** Forgets that the code was shown (tests). */
export const resetSetupCodeShown = (): void => {
  delete memory.__ronneSetupCodeShown;
};

/**
 * At a start before setup (161): makes the code if there isn't one (`setup.code_created`, without
 * the code) and logs `server.setup_code` with the code and the address to open, the one line that
 * carries it. A folder that can't take the file logs `setup.code_unwritable`, and a file that holds
 * no code `setup.code_invalid`: the web setup then refuses, and the terminal setup still works.
 * Returns the code, or null when there's none.
 */
export const announceSetupCode = (options: {
  path: string;
  url: string;
  log: Logger;
}): string | null => {
  const { log } = options;
  memory.__ronneSetupCodeShown = true;
  let code: string;
  try {
    const result = ensureSetupCode(options.path);
    code = result.code;
    if (result.created) log.event("setup.code_created");
  } catch (err) {
    // A file that holds no code is left for `setup-code` to replace; anything else is the folder.
    log.event(err instanceof SetupCodeFileError ? "setup.code_invalid" : "setup.code_unwritable", {
      err,
    });
    return null;
  }
  log.event("server.setup_code", { code: formatSetupCode(code), url: options.url });
  return code;
};
