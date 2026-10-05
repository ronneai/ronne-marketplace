import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ApiError, apiClient } from "./api.js";
import { readUserConfig, tokenFor, type UserConfig } from "./config.js";
import { type Io, nowOf } from "./io.js";

/**
 * Usage reporting (feature 046, MVP §14.6). Each registry's root sets a policy: `off` (nothing is
 * reported), `choice` (reported unless the person turns it off) or `required` (always reported).
 * `rmk` learns it from `GET /api/v1/usage` at most once a day, queues daily counts of installs,
 * removals and runs of the items it installed, and sends them to the registry each item came from
 * at the end of a command. A line carries only what `UsageLine` has: never a person, project,
 * path, prompt or anything the AI tool was given.
 */
export type UsageLine = {
  /** The UTC day, `YYYY-MM-DD`. */
  day: string;
  item: string;
  version: string;
  tool: string;
  event: "install" | "remove" | "run";
  /** Runs only: what started it (user, model, agent, ci, unknown). */
  trigger?: string;
  /** Runs only: how it ended (success, error, cancelled, unknown). */
  outcome?: string;
  count: number;
};

export const USAGE_POLICIES = ["off", "choice", "required"] as const;
export type UsagePolicy = (typeof USAGE_POLICIES)[number];

/** Why rmk reports to a registry or not, as `rmk telemetry status` says it. */
export type ReportingReason =
  | "policy unknown"
  | "policy off"
  | "required"
  | "RMK_TELEMETRY=0"
  | "you turned it off"
  | "on by default";

export type Reporting = { enabled: boolean; policy: UsagePolicy | null; reason: ReportingReason };

/** At most this many lines go in one report, as the registry accepts (046). */
export const MAX_LINES_PER_REPORT = 500;
/** Queued lines older than this many days are dropped: the registry refuses them. */
export const QUEUE_DAYS = 3;
/** The queue for one registry keeps at most this many bytes, the newest. */
export const QUEUE_MAX_BYTES = 1024 * 1024;
/** How long a send or a policy check may take before rmk gives up until the next command. */
export const NETWORK_TIMEOUT_MS = 2000;
/** How often rmk asks a registry for its policy. */
export const POLICY_MAX_AGE_MS = 86_400_000;

const DAY_MS = 86_400_000;

/** What rmk remembers about each registry it reports to, next to the queues. */
type RegistryState = {
  policy?: UsagePolicy;
  policyCheckedAt?: string;
  /** The policy whose notice was printed, so each is printed once. */
  noticed?: UsagePolicy;
  lastSent?: string;
  /** When rmk last tried to send, sent or not: a hook doesn't start another send within the hour. */
  lastAttempt?: string;
};
type UsageState = { version: 1; registries: Record<string, RegistryState> };

const usageDir = (io: Io) => join(io.env.XDG_CACHE_HOME || join(io.home, ".cache"), "rmk", "usage");
const stateFile = (io: Io) => join(usageDir(io), "state.json");
const queueFile = (io: Io, registry: string) =>
  join(usageDir(io), `${createHash("sha256").update(registry).digest("hex").slice(0, 16)}.jsonl`);

const readState = (io: Io): UsageState => {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(io), "utf8")) as Partial<UsageState>;
    return { version: 1, registries: parsed.registries ?? {} };
  } catch {
    return { version: 1, registries: {} };
  }
};

const writeState = (io: Io, state: UsageState) => {
  mkdirSync(usageDir(io), { recursive: true });
  writeFileSync(stateFile(io), `${JSON.stringify(state, null, 2)}\n`);
};

const savedChoice = (io: Io, config?: UserConfig): UserConfig["telemetry"] => {
  try {
    return (config ?? readUserConfig(io)).telemetry;
  } catch {
    // An unreadable config is reported by the command that needs it.
    return undefined;
  }
};

const isOff = (value: string | undefined) =>
  value !== undefined && ["0", "false", "off", "no"].includes(value.trim().toLowerCase());

/**
 * Whether rmk reports to a registry, and why: the registry's policy first (unknown counts as off),
 * then, only where the policy lets people choose, `RMK_TELEMETRY=0` and `rmk telemetry off`.
 */
export const reportingTo = (
  io: Io,
  registry: string,
  options: { state?: UsageState; config?: UserConfig } = {},
): Reporting => {
  const policy = (options.state ?? readState(io)).registries[registry]?.policy ?? null;
  if (policy === null) return { enabled: false, policy, reason: "policy unknown" };
  if (policy === "off") return { enabled: false, policy, reason: "policy off" };
  if (policy === "required") return { enabled: true, policy, reason: "required" };
  if (isOff(io.env.RMK_TELEMETRY)) return { enabled: false, policy, reason: "RMK_TELEMETRY=0" };
  if (savedChoice(io, options.config)?.enabled === false)
    return { enabled: false, policy, reason: "you turned it off" };
  return { enabled: true, policy, reason: "on by default" };
};

const withTimeout =
  (io: Io): typeof fetch =>
  (input, init) =>
    io.fetch(input, { ...init, signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) });

const isPolicy = (value: unknown): value is UsagePolicy =>
  typeof value === "string" && (USAGE_POLICIES as readonly string[]).includes(value);

/**
 * Asks a registry for its usage policy when the last answer is over a day old (or `force`), and
 * remembers it. A registry from before 046 has no such endpoint: its policy is `off`. When it
 * can't be reached, the last answer stays. Never throws.
 */
export const refreshPolicy = async (
  io: Io,
  registry: string,
  token: string | null,
  options: { force?: boolean } = {},
): Promise<UsagePolicy | null> => {
  const state = readState(io);
  const known = state.registries[registry] ?? {};
  const checked = known.policyCheckedAt ? Date.parse(known.policyCheckedAt) : 0;
  if (!options.force && known.policy && nowOf(io).getTime() - checked < POLICY_MAX_AGE_MS)
    return known.policy;
  if (!token) return known.policy ?? null;
  let policy: UsagePolicy | null = known.policy ?? null;
  try {
    const answer = await apiClient(withTimeout(io), registry, token).get<{ policy?: unknown }>(
      "/usage",
    );
    policy = isPolicy(answer.policy) ? answer.policy : "off";
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) return policy;
    policy = "off";
  }
  state.registries[registry] = {
    ...known,
    policy,
    policyCheckedAt: nowOf(io).toISOString(),
  };
  writeState(io, state);
  if (policy === "off") rmSync(queueFile(io, registry), { force: true });
  return policy;
};

/**
 * The notice to print the first time rmk reports to a registry under a policy, or null. Records
 * that it was shown, so each policy's notice appears once per registry.
 */
export const usageNotice = (io: Io, registry: string): string | null => {
  const state = readState(io);
  const reporting = reportingTo(io, registry, { state });
  const known = state.registries[registry] ?? {};
  if (!reporting.enabled || !reporting.policy || known.noticed === reporting.policy) return null;
  state.registries[registry] = { ...known, noticed: reporting.policy };
  writeState(io, state);
  const docs = `${registry}/docs/usage`;
  return reporting.policy === "required"
    ? `${registry} requires usage reporting: rmk sends counts of installs and runs of the items it installed. What's sent: ${docs}`
    : `rmk reports usage counts (installs and runs of the items it installed) to ${registry}. To stop: rmk telemetry off. What's sent: ${docs}`;
};

/**
 * Adds lines to a registry's queue when rmk reports to it. Appends only, so a command and a tool's
 * hook can add at the same time. Never touches the network.
 */
export const queueUsage = (io: Io, registry: string, lines: readonly UsageLine[]) => {
  if (lines.length === 0 || !reportingTo(io, registry).enabled) return;
  mkdirSync(usageDir(io), { recursive: true });
  appendFileSync(
    queueFile(io, registry),
    lines.map((line) => `${JSON.stringify(line)}\n`).join(""),
  );
};

const keyOf = (line: UsageLine) =>
  [line.day, line.item, line.version, line.tool, line.event, line.trigger, line.outcome].join(
    "\u0000",
  );

const isLine = (value: unknown): value is UsageLine => {
  if (!value || typeof value !== "object") return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.day === "string" &&
    typeof line.item === "string" &&
    typeof line.version === "string" &&
    typeof line.tool === "string" &&
    typeof line.event === "string" &&
    typeof line.count === "number"
  );
};

/** The UTC day of a moment. */
export const dayOf = (moment: Date): string => moment.toISOString().slice(0, 10);

/** Raw queue text → the lines to send: recent, at most 1 MB of the newest, summed per row. */
const linesOf = (io: Io, text: string): UsageLine[] => {
  const encoder = new TextEncoder();
  const rows = text.split("\n");
  // Oldest out first: keep whole lines from the end, up to the limit.
  let size = 0;
  let start = rows.length;
  while (start > 0) {
    const next = encoder.encode(rows[start - 1] ?? "").length + 1;
    if (size + next > QUEUE_MAX_BYTES) break;
    size += next;
    start -= 1;
  }
  const oldest = dayOf(new Date(nowOf(io).getTime() - QUEUE_DAYS * DAY_MS));
  const sums = new Map<string, UsageLine>();
  for (const row of rows.slice(start)) {
    if (!row.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(row);
    } catch {
      continue;
    }
    if (!isLine(value) || value.day < oldest) continue;
    const key = keyOf(value);
    const sum = sums.get(key);
    if (sum) sum.count += value.count;
    else sums.set(key, { ...value });
  }
  return [...sums.values()].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
};

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");

/** The registries rmk knows: logged in to, or reported to. */
const knownRegistries = (io: Io, state: UsageState, config?: UserConfig) => {
  let saved: string[] = [];
  try {
    saved = Object.keys((config ?? readUserConfig(io)).registries);
  } catch {
    saved = [];
  }
  return [...new Set([...saved, ...Object.keys(state.registries)])].sort();
};

/** What would be sent to each registry now, as `rmk telemetry preview` prints it. */
export const queuedUsage = (io: Io): { registry: string; events: UsageLine[] }[] => {
  const state = readState(io);
  return knownRegistries(io, state)
    .map((registry) => ({
      registry,
      events: linesOf(io, readText(queueFile(io, registry))).slice(0, MAX_LINES_PER_REPORT),
    }))
    .filter((queue) => queue.events.length > 0);
};

export type FlushResult = {
  registry: string;
  sent: number;
  kept: number;
  outcome: "sent" | "kept" | "dropped";
  message?: string;
};

/**
 * Sends each registry's queue: its policy checked first (daily), then one request of at most 500
 * summed lines within 2 seconds. What couldn't be sent stays for the next command; a registry that
 * doesn't take usage (policy off, or the person turned it off) gets its queue deleted. Never throws.
 */
export const flushUsage = async (io: Io): Promise<FlushResult[]> => {
  const results: FlushResult[] = [];
  let config: UserConfig;
  try {
    config = readUserConfig(io);
  } catch {
    return results;
  }
  for (const registry of knownRegistries(io, readState(io), config)) {
    const file = queueFile(io, registry);
    if (!existsSync(file)) continue;
    const token = tokenFor(io, config, registry);
    await refreshPolicy(io, registry, token);
    const reporting = reportingTo(io, registry, { config });
    if (!reporting.enabled) {
      rmSync(file, { force: true });
      results.push({ registry, sent: 0, kept: 0, outcome: "dropped", message: reporting.reason });
      continue;
    }
    const attempted = readState(io);
    attempted.registries[registry] = {
      ...attempted.registries[registry],
      lastAttempt: nowOf(io).toISOString(),
    };
    writeState(io, attempted);
    // Moved aside first, so a hook writing meanwhile starts a new queue instead of being lost.
    const sending = `${file}.${process.pid}.sending`;
    renameSync(file, sending);
    const lines = linesOf(io, readText(sending));
    const batch = lines.slice(0, MAX_LINES_PER_REPORT);
    let keep = lines.slice(MAX_LINES_PER_REPORT);
    let result: FlushResult;
    if (batch.length === 0) result = { registry, sent: 0, kept: 0, outcome: "sent" };
    else if (!token) {
      keep = lines;
      result = { registry, sent: 0, kept: lines.length, outcome: "kept", message: "not logged in" };
    } else
      try {
        await apiClient(withTimeout(io), registry, token).post("/usage", { events: batch });
        const state = readState(io);
        state.registries[registry] = {
          ...state.registries[registry],
          lastSent: nowOf(io).toISOString(),
        };
        writeState(io, state);
        result = { registry, sent: batch.length, kept: keep.length, outcome: "sent" };
      } catch (error) {
        if (error instanceof ApiError && error.code === "usage_disabled") {
          keep = [];
          const state = readState(io);
          state.registries[registry] = {
            ...state.registries[registry],
            policy: "off",
            policyCheckedAt: nowOf(io).toISOString(),
          };
          writeState(io, state);
          result = { registry, sent: 0, kept: 0, outcome: "dropped", message: error.message };
        } else {
          keep = lines;
          result = {
            registry,
            sent: 0,
            kept: lines.length,
            outcome: "kept",
            message: (error as Error).message,
          };
        }
      }
    if (keep.length) appendFileSync(file, keep.map((line) => `${JSON.stringify(line)}\n`).join(""));
    rmSync(sending, { force: true });
    results.push(result);
  }
  return results;
};

/** When rmk last tried to send to a registry, or null. */
export const lastSendAttempt = (io: Io, registry: string): string | null =>
  readState(io).registries[registry]?.lastAttempt ?? null;

/** At the end of a command: sends what's queued, quietly. */
export const flushAfterCommand = async (io: Io) => {
  try {
    if (!existsSync(usageDir(io))) return;
    if (!readdirSync(usageDir(io)).some((name) => name.endsWith(".jsonl"))) return;
    await flushUsage(io);
  } catch {
    // Usage reporting must never change how a command ends.
  }
};

/** Deletes the queues of the registries that let people choose: `rmk telemetry off`. */
export const clearChoiceQueues = (io: Io) => {
  const state = readState(io);
  for (const registry of knownRegistries(io, state))
    if (state.registries[registry]?.policy !== "required")
      rmSync(queueFile(io, registry), { force: true });
};

/** What `rmk telemetry status` shows per registry. */
export const usageSummary = (io: Io) => {
  const state = readState(io);
  return knownRegistries(io, state).map((registry) => {
    const reporting = reportingTo(io, registry, { state });
    return {
      registry,
      policy: reporting.policy,
      reporting: reporting.enabled,
      reason: reporting.reason,
      queued: linesOf(io, readText(queueFile(io, registry))).length,
      lastSent: state.registries[registry]?.lastSent ?? null,
    };
  });
};
