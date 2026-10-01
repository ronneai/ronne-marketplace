import type { ItemType } from "@ronneai/core";
import { daysBefore, RUN_OUTCOMES, RUN_TRIGGERS } from "./usage-event";

/**
 * What the item page shows of an item's usage (feature 047), worked out from its daily totals
 * (046). By default any install or run in the window shows; root can set a minimum (owner,
 * 2026-10-01), and under it no number leaves this module.
 */
/** A success rate needs this many runs whose outcome is known. */
export const MIN_KNOWN_OUTCOMES = 20;
/** The stat cards' window, in days, today included. */
export const WINDOW_DAYS = 30;
/** The Usage card's days: full days, today left out. */
export const CHART_DAYS = 14;

/** Types that never run on their own: their usage is installs only (046). */
export const RUNLESS_TYPES: readonly ItemType[] = [
  "hook",
  "rule",
  "output-style",
  "statusline",
  "permission-policy",
  "lsp-server",
  "bundle",
];

export const runsCounted = (type: ItemType) => !RUNLESS_TYPES.includes(type);

/** One stored row of the daily totals, as the summary reads it. */
export type DailyRow = {
  day: string;
  version: string;
  tool: string;
  event: string;
  trigger: string;
  outcome: string;
  count: number;
};

export type Share = { key: string; count: number; share: number };

export type UsageNumbers = {
  installs: number;
  removals: number;
  runs: number;
  /** Runs per day over the window, one decimal. */
  runsPerDay: number;
  /** Successful runs among those whose outcome is known, 0–1; null under 20 known outcomes. */
  successRate: number | null;
  /** Each tool's runs (or installs, for a type without runs) over the window, biggest first. */
  tools: Share[];
  /** The chart's days, oldest first, with zeros for days without reports. */
  days: { day: string; runs: number; installs: number; removals: number }[];
  /** The chart's busiest day, or null when nothing happened. */
  peak: { day: string; count: number } | null;
  /** Over the chart's days. */
  byTool: Share[];
  byTrigger: Share[];
  byOutcome: Share[];
};

export type UsageSummary =
  | {
      shown: false;
      collecting: boolean;
      hasData: boolean;
      /** Installs or runs in the window, but fewer than the minimum: the page names the minimum. */
      underMinimum: number | null;
    }
  | ({ shown: true; collecting: boolean; runsCounted: boolean } & UsageNumbers);

const sharesOf = (counts: Map<string, number>, order?: readonly string[]): Share[] => {
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const entries = [...counts.entries()].filter(([, n]) => n > 0);
  const sorted = order
    ? order.flatMap((key) => entries.filter(([k]) => k === key))
    : entries.sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1));
  return sorted.map(([key, count]) => ({ key, count, share: total ? count / total : 0 }));
};

const add = (map: Map<string, number>, key: string, n: number) =>
  map.set(key, (map.get(key) ?? 0) + n);

/**
 * The summary of an item's rows from the window (`today` and the 29 days before it). Without any
 * install or run there, it says only whether anything is stored, so the page can say why.
 */
export const summarizeUsage = (
  rows: readonly DailyRow[],
  options: {
    today: string;
    type: ItemType;
    collecting: boolean;
    hasData: boolean;
    /** Root's usage minimum (settings); 0 shows any usage. */
    minimum?: number;
  },
): UsageSummary => {
  const from = daysBefore(options.today, WINDOW_DAYS - 1);
  const inWindow = rows.filter((r) => r.day >= from && r.day <= options.today);
  const total = (event: string) =>
    inWindow.filter((r) => r.event === event).reduce((sum, r) => sum + r.count, 0);
  const installs = total("install");
  const removals = total("remove");
  const runs = total("run");
  const events = installs + runs;
  const minimum = options.minimum ?? 0;
  if (events === 0 || events < minimum)
    return {
      shown: false,
      collecting: options.collecting,
      hasData: options.hasData,
      underMinimum: events > 0 ? minimum : null,
    };

  const counted = runsCounted(options.type);
  const known = inWindow.filter((r) => r.event === "run" && r.outcome !== "unknown");
  const knownCount = known.reduce((sum, r) => sum + r.count, 0);
  const successes = known.filter((r) => r.outcome === "success").reduce((s, r) => s + r.count, 0);

  const tools = new Map<string, number>();
  for (const r of inWindow)
    if (r.event === (counted ? "run" : "install")) add(tools, r.tool, r.count);

  const chartFrom = daysBefore(options.today, CHART_DAYS);
  const chartTo = daysBefore(options.today, 1);
  const days = Array.from({ length: CHART_DAYS }, (_, i) => ({
    day: daysBefore(chartFrom, -i),
    runs: 0,
    installs: 0,
    removals: 0,
  }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  const byTool = new Map<string, number>();
  const byTrigger = new Map<string, number>();
  const byOutcome = new Map<string, number>();
  for (const r of rows) {
    const day = byDay.get(r.day);
    if (!day || r.day > chartTo) continue;
    if (r.event === "run") {
      day.runs += r.count;
      add(byTool, r.tool, r.count);
      add(byTrigger, r.trigger || "unknown", r.count);
      add(byOutcome, r.outcome || "unknown", r.count);
    } else if (r.event === "install") day.installs += r.count;
    else if (r.event === "remove") day.removals += r.count;
  }
  const measure = (d: (typeof days)[number]) => (counted ? d.runs : d.installs);
  const busiest = days.reduce<(typeof days)[number] | null>(
    (best, d) => (measure(d) > (best ? measure(best) : 0) ? d : best),
    null,
  );

  return {
    shown: true,
    collecting: options.collecting,
    runsCounted: counted,
    installs,
    removals,
    runs,
    runsPerDay: Math.round((runs / WINDOW_DAYS) * 10) / 10,
    successRate: knownCount >= MIN_KNOWN_OUTCOMES ? successes / knownCount : null,
    tools: sharesOf(tools),
    days,
    peak: busiest ? { day: busiest.day, count: measure(busiest) } : null,
    byTool: sharesOf(byTool),
    byTrigger: sharesOf(byTrigger, RUN_TRIGGERS),
    byOutcome: sharesOf(byOutcome, RUN_OUTCOMES),
  };
};

/**
 * Runs and installs per version over the window, for the Versions page; null when there are none,
 * or fewer than the minimum.
 */
export const usageByVersion = (
  rows: readonly DailyRow[],
  today: string,
  minimum = 0,
): Record<string, { runs: number; installs: number }> | null => {
  const from = daysBefore(today, WINDOW_DAYS - 1);
  const inWindow = rows.filter((r) => r.day >= from && r.day <= today);
  const events = inWindow
    .filter((r) => r.event === "run" || r.event === "install")
    .reduce((sum, r) => sum + r.count, 0);
  if (events === 0 || events < minimum) return null;
  const versions: Record<string, { runs: number; installs: number }> = {};
  for (const r of inWindow) {
    const entry = versions[r.version] ?? { runs: 0, installs: 0 };
    versions[r.version] = entry;
    if (r.event === "run") entry.runs += r.count;
    else if (r.event === "install") entry.installs += r.count;
  }
  return versions;
};
