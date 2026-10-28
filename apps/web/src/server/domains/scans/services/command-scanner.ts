import { type ChildProcessByStdio, spawn } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { Readable } from "node:stream";
import { parseSkillScan, pathProblemOf } from "@ronneai/core";
import type { ScanError, ScanFile, ScanProvider, SkillScanner } from "../models/scan";

/** RONNE_SKILL_SCANNER_TIMEOUT's default, in seconds. */
export const DEFAULT_SCAN_TIMEOUT_SECONDS = 300;
/** The most of the scanner's stdout Ronne reads: the report of 10,000 findings is about 10 MiB. */
export const SCAN_OUTPUT_LIMIT = 4 * 1024 * 1024;
const MAX_COMMAND_PARTS = 32;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses.
const CONTROL = /[\u0000-\u001f]/;

/**
 * RONNE_SKILL_SCANNER: a JSON array of the command (an absolute path: a relative one would be
 * looked up from the scan's folder, beside the submitted files) and its leading arguments, each a
 * non-empty string without control characters, or null when it's unset or isn't one. Set by the operator,
 * never from the web: whoever sets it can run anything as the server's user (135, decision 3).
 */
export const parseScannerCommand = (value: string | undefined): string[] | null => {
  if (!value?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_COMMAND_PARTS) {
    return null;
  }
  const valid = (part: unknown) => typeof part === "string" && part !== "" && !CONTROL.test(part);
  if (!parsed.every(valid) || !isAbsolute(parsed[0] as string)) return null;
  return parsed as string[];
};

/** RONNE_SKILL_SCANNER_TIMEOUT in seconds: a whole number from 30 to 3600, else the default. */
export const parseScanTimeout = (value: string | undefined): number => {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= 30 && seconds <= 3600
    ? seconds
    : DEFAULT_SCAN_TIMEOUT_SECONDS;
};

/** The prefix an operator puts on SkillSpector's own variables to pass them to semantic scans. */
export const PROVIDER_PREFIX = "RONNE_SKILL_SCANNER_ENV_";

type ProviderSpec = {
  /** The provider's own variables: the only ones passed with it besides the common three. */
  variables: readonly string[];
  /** Variables it can't work without. */
  needs: readonly string[];
  /** The variable that sets its endpoint, if it has one. */
  endpoint: string | null;
  /** Where the files go when no endpoint is set. */
  defaultHost: string;
};

/**
 * SkillSpector's providers Ronne supports (135, "A provider, for semantic analysis"). Only the
 * chosen provider's variables are passed: SkillSpector falls back to `OPENAI_API_KEY` and
 * `OPENAI_BASE_URL` for a provider whose own key is unset, which would send the files elsewhere.
 */
const PROVIDERS: Record<string, ProviderSpec> = {
  openai: {
    variables: ["OPENAI_API_KEY", "OPENAI_BASE_URL"],
    needs: ["OPENAI_API_KEY"],
    endpoint: "OPENAI_BASE_URL",
    defaultHost: "api.openai.com",
  },
  anthropic: {
    variables: ["ANTHROPIC_API_KEY"],
    needs: ["ANTHROPIC_API_KEY"],
    endpoint: null,
    defaultHost: "api.anthropic.com",
  },
  nv_build: {
    variables: ["NVIDIA_INFERENCE_KEY"],
    needs: ["NVIDIA_INFERENCE_KEY"],
    endpoint: null,
    defaultHost: "integrate.api.nvidia.com",
  },
  azure_openai: {
    variables: [
      "AZURE_OPENAI_API_KEY",
      "AZURE_OPENAI_ENDPOINT",
      "AZURE_OPENAI_DEPLOYMENT",
      "AZURE_OPENAI_API_VERSION",
    ],
    needs: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
    endpoint: "AZURE_OPENAI_ENDPOINT",
    defaultHost: "",
  },
  openai_compatible: {
    variables: ["SKILLSPECTOR_COMPAT_API_KEY", "SKILLSPECTOR_COMPAT_BASE_URL"],
    needs: ["SKILLSPECTOR_COMPAT_API_KEY", "SKILLSPECTOR_COMPAT_BASE_URL"],
    endpoint: "SKILLSPECTOR_COMPAT_BASE_URL",
    defaultHost: "",
  },
  ollama: {
    variables: ["OLLAMA_BASE_URL"],
    needs: [],
    endpoint: "OLLAMA_BASE_URL",
    defaultHost: "localhost:11434",
  },
};

/** Passed with every provider. */
const COMMON_PROVIDER_VARIABLES = [
  "SKILLSPECTOR_PROVIDER",
  "SKILLSPECTOR_MODEL",
  "SKILLSPECTOR_REASONING_EFFORT",
] as const;

const hostOf = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
};

/**
 * The provider set up for semantic scans, or null when there is none Ronne supports: read only from
 * `RONNE_SKILL_SCANNER_ENV_<NAME>`, with only the chosen provider's own variables. An unprefixed
 * `OPENAI_API_KEY` in Ronne's environment is never used. A provider missing what it needs, or whose
 * endpoint is no URL, counts as none.
 */
export const scanProvider = (env: Record<string, string | undefined>): ScanProvider | null => {
  const read = (name: string) => {
    const value = env[`${PROVIDER_PREFIX}${name}`]?.trim();
    return value && !CONTROL.test(value) ? value : undefined;
  };
  const name = read("SKILLSPECTOR_PROVIDER");
  // Own keys only: `constructor` or `__proto__` would otherwise find Object.prototype's.
  const spec = name && Object.hasOwn(PROVIDERS, name) ? PROVIDERS[name] : undefined;
  if (!name || !spec) return null;
  const variables: Record<string, string> = {};
  for (const variable of [...COMMON_PROVIDER_VARIABLES, ...spec.variables]) {
    const value = read(variable);
    if (value) variables[variable] = value;
  }
  if (spec.needs.some((variable) => !variables[variable])) return null;
  const endpoint = spec.endpoint ? variables[spec.endpoint] : undefined;
  const host = endpoint ? hostOf(endpoint) : spec.defaultHost;
  if (!host) return null;
  // The model is stored with each scan, in a 128-character column; the scanner gets it whole.
  const model = variables.SKILLSPECTOR_MODEL
    ? Array.from(variables.SKILLSPECTOR_MODEL).slice(0, 128).join("")
    : null;
  return { name, model, host, variables };
};

/**
 * The scanner's whole environment, built from nothing: none of Ronne's variables (`DATABASE_URL`,
 * `AUTH_SECRET`, …) reach it. SkillSpector gets its own deadline a little before Ronne's, so it
 * stops itself (and a container it runs in) before Ronne has to kill it.
 */
export const scannerEnvironment = (
  home: string,
  timeoutSeconds: number,
  parent: Record<string, string | undefined> = process.env,
  provider: ScanProvider | null = null,
): Record<string, string> => ({
  ...provider?.variables,
  PATH: parent.PATH || "/usr/local/bin:/usr/bin:/bin",
  HOME: home,
  TMPDIR: home,
  LANG: "C.UTF-8",
  SKILLSPECTOR_MAX_WORKFLOW_SECONDS: String(Math.max(20, timeoutSeconds - 10)),
  SKILLSPECTOR_LOG_LEVEL: "ERROR",
  LANGCHAIN_TRACING_V2: "false",
});

/**
 * Errors that mean the item's own paths are the problem: a path given twice, a file inside another,
 * or a name longer than the file system takes (255 bytes on Linux: 200 `é` are 400).
 */
const CLASHES = new Set(["EEXIST", "ENOTDIR", "EISDIR", "ENAMETOOLONG"]);

/** The longest file or folder name, in UTF-8 bytes (Linux's limit). */
const MAX_NAME_BYTES = 255;

/**
 * Two paths whose folders or names differ only in case (or Unicode form): a case-insensitive disk
 * (macOS's default) would merge them, and findings would name a path the item doesn't have. Refused
 * everywhere, so the result doesn't depend on the disk.
 */
const caseClash = (files: readonly ScanFile[]): boolean => {
  const seen = new Map<string, string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join("/");
      // Full case folding, as APFS does it: σ/ς, ß/ẞ/ss, ſ/s and ﬁ/fi are one name there. Lower,
      // upper, lower again: ẞ lowers to ß, which only upper-casing turns into SS.
      const key = prefix
        .normalize("NFKC")
        .toLowerCase()
        .toUpperCase()
        .toLowerCase()
        .normalize("NFKC");
      const known = seen.get(key);
      if (known !== undefined && known !== prefix) return true;
      seen.set(key, prefix);
    }
  }
  return false;
};

/**
 * Writes the files under `root`, refusing any path that could leave it, and a path given twice or
 * inside another file (`wx` never follows or replaces what's already there). A disk that is full
 * or refuses the write is Ronne's problem, not the item's: `write failed`.
 */
const writeFiles = async (
  root: string,
  files: readonly ScanFile[],
): Promise<"bad file path" | "write failed" | null> => {
  for (const file of files) if (pathProblemOf(file.path)) return "bad file path";
  if (caseClash(files)) return "bad file path";
  // Linux takes 255 bytes per name, macOS 255 characters: the smaller everywhere.
  const tooLong = (part: string) => Buffer.byteLength(part, "utf8") > MAX_NAME_BYTES;
  if (files.some((file) => file.path.split("/").some(tooLong))) return "bad file path";
  try {
    for (const file of files) {
      const target = join(root, ...file.path.split("/"));
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, file.bytes, { flag: "wx", mode: file.executable ? 0o700 : 0o600 });
    }
    return null;
  } catch (error) {
    return CLASHES.has((error as NodeJS.ErrnoException).code ?? "")
      ? "bad file path"
      : "write failed";
  }
};

/**
 * Lets the owner into every folder under `path`, so a folder the scanner locked can be removed.
 * Never through a symbolic link: `chmod` would change what it points at.
 */
const unlock = async (path: string): Promise<void> => {
  try {
    if (!(await lstat(path)).isDirectory()) return;
    await chmod(path, 0o700);
    for (const entry of await readdir(path, { withFileTypes: true }))
      if (entry.isDirectory()) await unlock(join(path, entry.name));
  } catch {
    // Not ours, or gone.
  }
};

/** Removes a scan folder, even one the scanner left locked (mode 000). */
const removeTree = async (path: string): Promise<void> => {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    await unlock(path);
    await rm(path, { recursive: true, force: true }).catch(() => {});
  }
};

/** How long a stopped scanner gets between SIGTERM and SIGKILL (the wrapper stops its container). */
export const KILL_GRACE_MS = 5_000;
/** How long Ronne waits for the pipes after the scanner exits, or after SIGKILL, before giving up. */
const SETTLE_MS = 2_000;

type Run = { code: number | null; signal: NodeJS.Signals | null; stdout: string } | ScanError;

/**
 * Runs the command with no shell, in its own process group, and reads at most `SCAN_OUTPUT_LIMIT`
 * bytes of stdout; stderr is drained and dropped. A timeout or too much output stops the group:
 * SIGTERM, then SIGKILL after `KILL_GRACE_MS`. When the scanner exits, whatever it left running in
 * its group is killed. Either way the promise settles within `SETTLE_MS` even if something outside
 * the group (its own session) still holds the pipes open.
 */
const run = (
  command: readonly string[],
  args: readonly string[],
  env: Record<string, string>,
  cwd: string,
  timeoutMs: number,
): Promise<Run> =>
  new Promise((resolve) => {
    const [program = "", ...leading] = command;
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(program, [...leading, ...args], {
        cwd,
        // Next.js types `process.env` with NODE_ENV required; the scanner's environment has none.
        env: env as NodeJS.ProcessEnv,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      // Some failures (ENOEXEC: a script without `#!`, a binary for another machine) throw here.
      resolve((error as NodeJS.ErrnoException).code === "ENOENT" ? "not found" : "not runnable");
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let stopped: ScanError | null = null;
    let exit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    let settled = false;
    const timers: NodeJS.Timeout[] = [];
    const later = (ms: number, fn: () => void) => {
      timers.push(setTimeout(fn, ms));
    };
    const signalGroup = (signal: NodeJS.Signals) => {
      try {
        if (child.pid && process.platform !== "win32") process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        // Already gone.
      }
    };
    const settle = (outcome: Run) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      child.stdout.destroy();
      child.stderr.destroy();
      resolve(outcome);
    };
    const finish = () =>
      settle(
        stopped ?? (exit ? { ...exit, stdout: Buffer.concat(chunks).toString("utf8") } : "signal"),
      );
    const stop = (reason: ScanError) => {
      if (stopped || settled) return;
      stopped = reason;
      signalGroup("SIGTERM");
      later(KILL_GRACE_MS, () => {
        signalGroup("SIGKILL");
        later(SETTLE_MS, finish);
      });
    };
    later(timeoutMs, () => stop("timeout"));
    child.stdout.on("data", (chunk: Buffer) => {
      if (stopped) return;
      size += chunk.length;
      if (size > SCAN_OUTPUT_LIMIT) stop("output too large");
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.on("error", (error: NodeJS.ErrnoException) => {
      settle(error.code === "ENOENT" ? "not found" : "not runnable");
    });
    child.on("exit", (code, signal) => {
      exit = { code, signal };
      // Whatever it started and left behind in its group goes with it.
      signalGroup("SIGKILL");
      later(SETTLE_MS, finish);
    });
    child.on("close", finish);
  });

/**
 * The scanner Ronne runs (135): the revision's files in a fresh private folder (`item/`, with the
 * scanner's HOME beside it in `home/`), `scan <item> --no-llm --format json` (without `--no-llm`
 * and with the provider's variables for a semantic scan), then the folder
 * removed whatever happened. Exit 0 and 1 are finished scans (1: score over 50); anything else,
 * or a report `parseSkillScan` refuses, is a failure with a short reason.
 */
export const commandSkillScanner = (options: {
  command: readonly string[] | null;
  /** Where the scan folders are made; the OS temporary folder by default. */
  tmpRoot?: string;
  /** Set up for semantic scans; without it every scan is static. */
  provider?: ScanProvider | null;
  timeoutSeconds?: number;
  env?: Record<string, string | undefined>;
}): SkillScanner => ({
  async scan(files, scanOptions = {}) {
    const { command } = options;
    const provider = scanOptions.semantic ? (options.provider ?? null) : null;
    if (!command || command.length === 0) return { ok: false, error: "not configured" };
    const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_SCAN_TIMEOUT_SECONDS;
    let made: string;
    try {
      made = await mkdtemp(join(options.tmpRoot ?? tmpdir(), "ronne-scan-"));
    } catch {
      return { ok: false, error: "no temporary folder" };
    }
    try {
      // mkdtemp creates the folder 0700; chmod again in case of an odd umask on the parent. Its
      // real path, so the scanner (and a container mounting it) sees no symbolic link (macOS's /var).
      let root: string;
      let item: string;
      let home: string;
      try {
        root = await realpath(made);
        await chmod(root, 0o700);
        item = join(root, "item");
        home = join(root, "home");
        await mkdir(item, { mode: 0o700 });
        await mkdir(home, { mode: 0o700 });
      } catch {
        return { ok: false, error: "no temporary folder" };
      }
      const written = await writeFiles(item, files);
      if (written) return { ok: false, error: written };

      const outcome = await run(
        command,
        provider
          ? ["scan", item, "--format", "json"]
          : ["scan", item, "--no-llm", "--format", "json"],
        scannerEnvironment(home, timeoutSeconds, options.env, provider),
        home,
        timeoutSeconds * 1000,
      );
      if (typeof outcome === "string") return { ok: false, error: outcome };
      if (outcome.signal) return { ok: false, error: "signal" };
      if (outcome.code !== 0 && outcome.code !== 1) {
        return { ok: false, error: `exit ${outcome.code ?? -1}` };
      }
      const report = parseSkillScan(outcome.stdout, { semantic: provider !== null });
      return report.ok
        ? { ok: true, result: report.result }
        : { ok: false, error: "invalid report" };
    } finally {
      await removeTree(made);
    }
  },
});

/**
 * Removes scan folders a scan didn't (Ronne's process died during it, 135): `ronne-scan-*` under
 * `tmpRoot` last changed before `before`. The job calls it before each run, with a margin past the
 * longest a scan can take, so a scan in progress is never touched.
 */
/**
 * Scan folders this old are always stale, whatever the timeout of whichever instance on this
 * machine made them: twice the longest timeout (3600 s) and the kill grace.
 */
export const STALE_SCAN_FOLDER_MS = 2 * (3600 * 1000 + KILL_GRACE_MS);

export const sweepScanFolders = async (
  before: Date,
  tmpRoot: string = tmpdir(),
): Promise<number> => {
  let names: string[];
  try {
    names = await readdir(tmpRoot);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!/^ronne-scan-[A-Za-z0-9]{6}$/.test(name)) continue;
    const path = join(tmpRoot, name);
    try {
      // lstat: a symbolic link named like a scan folder (another user's, in a shared /tmp) is
      // skipped, never followed. Only real folders this user owns.
      const info = await lstat(path);
      if (!info.isDirectory() || info.mtime >= before) continue;
      if (typeof process.getuid === "function" && info.uid !== process.getuid()) continue;
      await removeTree(path);
      removed++;
    } catch {
      // Gone meanwhile, or not ours to remove.
    }
  }
  return removed;
};
