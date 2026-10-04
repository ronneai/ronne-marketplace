import { join } from "node:path";

type Env = Record<string, string | undefined>;

/**
 * How this instance was started, from RONNE_RUNTIME: `docker` (the image, 005), `npm` (the
 * `@ronneai/marketplace` package and its `rmk-server` command, 082), or `node` (a clone).
 */
export type Runtime = "docker" | "npm" | "node";

export const runtimeOf = (env: Env = process.env): Runtime =>
  env.RONNE_RUNTIME === "docker" || env.RONNE_RUNTIME === "npm" ? env.RONNE_RUNTIME : "node";

/**
 * Where a default data file goes: `./data/<name>` next to the app, or, for the npm package, in its
 * data folder (RONNE_DATA_DIR). An installed package's own folder may be read-only, and in Docker
 * `./data` is the volume already.
 */
export const defaultDataPath = (name: string, env: Env = process.env): string =>
  runtimeOf(env) === "npm" && env.RONNE_DATA_DIR
    ? join(env.RONNE_DATA_DIR, name)
    : `./data/${name}`;

/** The address to suggest when PUBLIC_URL isn't set: this machine, on the port the server uses. */
export const defaultPublicUrl = (env: Env = process.env): string =>
  `http://localhost:${env.PORT || "3000"}`;

/**
 * A script's command where it runs: `rmk-server <name>` for the npm package, `pnpm run <name>` in a
 * clone and inside the Docker container.
 */
export const scriptCommand = (name: string, env: Env = process.env): string =>
  runtimeOf(env) === "npm" ? `rmk-server ${name}` : `pnpm run ${name}`;

/** The terminal command for the setup, as this runtime runs it, from outside a container. */
export const setupCommand = (env: Env = process.env): string => {
  const runtime = runtimeOf(env);
  if (runtime === "docker") return "docker compose exec web pnpm run setup";
  if (runtime === "npm") return "rmk-server setup";
  return "pnpm run setup";
};
