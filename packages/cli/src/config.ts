import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RmkError } from "./errors.js";
import type { Io } from "./io.js";

/**
 * `~/.config/rmk/config.json` (cli-files.md): the default registry and a token per registry. Only
 * rmk's own token lives here; it's written with mode 0600, and a file other users can read is
 * refused. `RMK_TOKEN` and `RMK_REGISTRY` override it, for CI.
 */
export type UserConfig = {
  version: 1;
  defaultRegistry?: string;
  registries: Record<string, { token: string; email?: string }>;
  /** The person's choice about usage reporting (046): one per machine, for every registry. */
  telemetry?: { enabled: boolean; decidedAt: string };
};

export const configDir = (io: Io) =>
  join(io.env.XDG_CONFIG_HOME || join(io.home, ".config"), "rmk");
export const configPath = (io: Io) => join(configDir(io), "config.json");

const EMPTY: UserConfig = { version: 1, registries: {} };

export const readUserConfig = (io: Io): UserConfig => {
  const path = configPath(io);
  if (!existsSync(path)) return { ...EMPTY, registries: {} };
  if (process.platform !== "win32" && (statSync(path).mode & 0o077) !== 0)
    throw new RmkError(
      `${path} can be read by other users, and it holds your token. Run: chmod 600 ${path}`,
      1,
      "config_readable",
    );
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<UserConfig>;
  return {
    version: 1,
    defaultRegistry: parsed.defaultRegistry,
    registries: parsed.registries ?? {},
    ...(parsed.telemetry && typeof parsed.telemetry.enabled === "boolean"
      ? { telemetry: { enabled: parsed.telemetry.enabled, decidedAt: parsed.telemetry.decidedAt } }
      : {}),
  };
};

/** Sorted keys and a trailing newline, like every rmk file; the folder 0700 and the file 0600. */
export const writeUserConfig = (io: Io, config: UserConfig) => {
  const dir = configDir(io);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = configPath(io);
  const json = JSON.stringify(
    config,
    (_key, value: unknown) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
          )
        : value,
    2,
  );
  writeFileSync(path, `${json}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
};

/** A registry URL as a key: no trailing slash. A loop, not a regex, which CodeQL flags as slow. */
export const normalizeRegistry = (url: string) => {
  const trimmed = url.trim();
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === "/") end -= 1;
  return trimmed.slice(0, end);
};

export type Registry = { url: string; token: string | null; email?: string };

/**
 * The registry a command talks to, and the token for it: `--registry`, else `RMK_REGISTRY`, else
 * the config's default; the token from `RMK_TOKEN`, else the config.
 */
export const registryFor = (io: Io, config: UserConfig, override?: string): Registry => {
  const url = normalizeRegistry(override || io.env.RMK_REGISTRY || config.defaultRegistry || "");
  if (!url)
    throw new RmkError(
      "No registry: run `rmk login --registry <url>`, or set RMK_REGISTRY.",
      2,
      "no_registry",
    );
  const saved = config.registries[url];
  return { url, token: io.env.RMK_TOKEN || saved?.token || null, email: saved?.email };
};
