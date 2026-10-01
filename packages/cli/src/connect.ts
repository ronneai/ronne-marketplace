import { apiClient, checkRegistryUrl } from "./api.js";
import { readUserConfig, registryFor } from "./config.js";
import { RmkError } from "./errors.js";
import type { Io } from "./io.js";

/**
 * The registry a command or the MCP server talks to, and a client for it (features 022, 027): the
 * `--registry` override, `RMK_REGISTRY`, the project's registry (unless `project` is false, as for
 * user scope) or the config's default, with `RMK_TOKEN` or the saved token. `needToken` refuses to
 * go on without one, saying to run `rmk login`.
 */
export const connectRegistry = (
  io: Io,
  {
    registry: override,
    insecure = false,
    needToken = true,
    project = true,
  }: {
    registry?: string;
    insecure?: boolean;
    needToken?: boolean;
    project?: boolean;
  } = {},
) => {
  const config = readUserConfig(io);
  const registry = registryFor(io, config, override, project);
  checkRegistryUrl(registry.url, insecure);
  if (needToken && !registry.token)
    throw new RmkError(
      `You're not logged in to ${registry.url}. Run \`rmk login\`.`,
      1,
      "not_logged_in",
    );
  return { config, registry, api: apiClient(io.fetch, registry.url, registry.token) };
};
