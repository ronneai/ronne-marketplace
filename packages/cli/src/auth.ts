import { connectRegistry } from "./connect.js";
import { usage } from "./errors.js";
import type { Io } from "./io.js";
import type { Output } from "./output.js";

/**
 * `rmk auth headers [--registry <url>]` (feature 077): the `Authorization` header for a registry,
 * as one JSON object on stdout and nothing else, for Claude Code's `headersHelper` on the
 * registry's plugin marketplace. The token is `RMK_TOKEN` or the one `rmk login` saved; without
 * one it fails with exit 1 and says why on stderr, and Claude Code shows the marketplace as
 * failing to load. Claude Code runs it from `~/.claude`, so a project's registry never applies.
 */
type Args = {
  positionals: string[];
  values: Record<string, string | boolean | string[] | undefined>;
};

export const AUTH_USAGE = "rmk auth headers [--registry <url>]";

export const authCommand = async (io: Io, args: Args, out: Output) => {
  const [action, ...rest] = args.positionals;
  if (action !== "headers" || rest.length) throw usage(`Usage: ${AUTH_USAGE}`);
  const { registry } = connectRegistry(io, {
    registry: typeof args.values.registry === "string" ? args.values.registry : undefined,
    insecure: args.values.insecure === true,
    project: false,
  });
  const headers = { Authorization: `Bearer ${registry.token}` };
  out.set("registry", registry.url);
  out.set("headers", headers);
  out.say(JSON.stringify(headers));
};
