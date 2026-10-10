import { canonicalItemName } from "@ronneai/core";
import { RENDERERS } from "@ronneai/core/render";

/**
 * One line of a usage report from `rmk` (feature 046, MVP §14.6): what happened to an item on one
 * day, and how many times. Nothing else exists in a report: no person, project, path or prompt.
 */
export const USAGE_EVENTS = ["install", "remove", "run"] as const;
export type UsageEventKind = (typeof USAGE_EVENTS)[number];

/** What started a run: typed by the person, chosen by the model, delegated by an agent, a CI run. */
export const RUN_TRIGGERS = ["user", "model", "agent", "ci", "unknown"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const RUN_OUTCOMES = ["success", "error", "cancelled", "unknown"] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

export const MAX_EVENTS_PER_REPORT = 500;
/** Far more than one machine runs one item in a day; anything above is a broken client. */
export const MAX_COUNT = 100_000;
/** How far back a day may be: `rmk` drops queued lines older than 3 days. */
export const DAYS_BACK = 3;
/** Usage is kept this many days (046's decision 2). */
export const RETENTION_DAYS = 90;

export type UsageEvent = {
  day: string;
  /** `@scope/name`. */
  item: string;
  version: string;
  tool: string;
  event: UsageEventKind;
  /** A run's; "" for installs and removals. */
  trigger: RunTrigger | "";
  outcome: RunOutcome | "";
  count: number;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// The manifest schema's semver pattern: a version as releases write it.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const MS_PER_DAY = 86_400_000;

/** The UTC day of a moment, `YYYY-MM-DD`. */
export const dayOf = (moment: Date): string => moment.toISOString().slice(0, 10);

/** The day `days` before (or, negative, after) `day`. */
export const daysBefore = (day: string, days: number): string =>
  dayOf(new Date(Date.parse(`${day}T00:00:00.000Z`) - days * MS_PER_DAY));

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

/** One event as reported, or null when it can't be counted: such events are ignored, not refused. */
export const usageEventOf = (value: unknown, today: string): UsageEvent | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { day, version, tool, event, count } = raw;
  // One way to write each name (118), so `@global/team/x` counts as `@team/x`.
  const item = typeof raw.item === "string" ? canonicalItemName(raw.item) : null;
  if (typeof day !== "string" || !DAY.test(day) || dayOf(new Date(`${day}T00:00:00.000Z`)) !== day)
    return null;
  // The machine's clock may be a day ahead; anything older than rmk keeps is stale.
  if (day > daysBefore(today, -1) || day < daysBefore(today, DAYS_BACK)) return null;
  if (item === null) return null;
  if (typeof version !== "string" || version.length > 64 || !SEMVER.test(version)) return null;
  if (typeof tool !== "string" || !RENDERERS.some((renderer) => renderer.id === tool)) return null;
  if (!isOneOf(USAGE_EVENTS, event)) return null;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_COUNT)
    return null;
  if (event !== "run") {
    if (raw.trigger !== undefined || raw.outcome !== undefined) return null;
    return { day, item, version, tool, event, trigger: "", outcome: "", count };
  }
  const trigger = raw.trigger ?? "unknown";
  const outcome = raw.outcome ?? "unknown";
  if (!isOneOf(RUN_TRIGGERS, trigger) || !isOneOf(RUN_OUTCOMES, outcome)) return null;
  return { day, item, version, tool, event, trigger, outcome, count };
};

/** The key two events share when they are the same row of the daily totals. */
export const usageKey = (e: Omit<UsageEvent, "count">): string =>
  [e.item, e.day, e.version, e.tool, e.event, e.trigger, e.outcome].join("\u0000");
