import { resolve } from "node:path";
import { loadConfig } from "../config";
import { defaultPublicUrl, hostCommand } from "../runtime";
import { ensureSetupCode, formatSetupCode, setupCodePath } from "./setup-code";
import { getSetupState, type SetupState } from "./state";

/**
 * `setup-code` (161): `pnpm run setup-code`, `rmk-server setup-code`, or
 * `docker compose exec web pnpm run setup-code`. Prints the code the web setup asks for, making one
 * when there's none (or replacing a file that holds none: one person, one process). Shell access is
 * the proof. Once root exists there's no code: it refuses.
 */
export type SetupCodeAnswer =
  | { kind: "code"; code: string; created: boolean; url: string }
  | { kind: "set-up"; message: string };

export const runSetupCode = async (options: {
  appDir: string;
  env?: Record<string, string | undefined>;
  /** The instance's setup state: read from its settings and database by default. */
  getState?: () => Promise<SetupState>;
}): Promise<SetupCodeAnswer> => {
  const env = options.env ?? process.env;
  const config = loadConfig({ appDir: options.appDir, env });
  const state = await (options.getState ?? (() => getSetupState(config, { remember: false })))();
  if (state === "ready")
    return {
      kind: "set-up",
      message: `This instance is already set up, so there's no setup code. Sign in; to recover root, run \`${hostCommand("reset-root-password", env)}\`.`,
    };
  // A database that doesn't answer (`unavailable`) still gets its code: the web setup refuses until
  // it answers, and the person at this terminal may be about to fix it.
  const path = resolve(options.appDir, setupCodePath(env));
  const { code, created } = ensureSetupCode(path, { replaceInvalid: true });
  return { kind: "code", code, created, url: config.publicUrl ?? defaultPublicUrl(env) };
};

/** What the command prints for a code: the code in groups of five, and where to enter it. */
export const setupCodeLines = (answer: Extract<SetupCodeAnswer, { kind: "code" }>): string[] => [
  `Setup code: ${formatSetupCode(answer.code)}`,
  `Open ${answer.url.replace(/\/+$/, "")}/setup and enter it.`,
];
