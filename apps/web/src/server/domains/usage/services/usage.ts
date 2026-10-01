import type { ItemType } from "@ronneai/core";
import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import type { UsagePolicy } from "../../settings/models/usage-policy";
import { InvalidUsageReportError, UsageDisabledError } from "../exceptions/errors";
import {
  dayOf,
  daysBefore,
  MAX_EVENTS_PER_REPORT,
  RETENTION_DAYS,
  type UsageEvent,
  usageEventOf,
  usageKey,
} from "../models/usage-event";
import {
  usageByVersion as byVersion,
  summarizeUsage,
  type UsageSummary,
  WINDOW_DAYS,
} from "../models/usage-summary";
import type { UsageRepository, UsageRow } from "../repositories/usage-repository";

/**
 * Recording usage that `rmk` reports (feature 046, MVP §14.6). Any signed-in token may report while
 * root's usage policy isn't `off`; under `off` every report is refused. An event that can't be counted (an item
 * or version not published here, a stale day, an unknown value) is ignored rather than refused, so
 * one odd line never loses the rest. Only daily totals are stored: nothing about who reported.
 */
export type UsageDeps = {
  usage: UsageRepository;
  /** Root's usage policy (the settings domain). */
  policy: UsagePolicy;
  now: () => Date;
  /** Whether old totals are due for deletion today; the first report of each day prunes. */
  pruneDue: (today: string) => boolean;
};

export type UsageActor = { user: CurrentUser | null };

export type UsageSettings = { policy: UsagePolicy; retentionDays: number };

/** What `GET /api/v1/usage` says, so `rmk` knows whether and how to report. */
export const usageSettings = (deps: Pick<UsageDeps, "policy">, actor: UsageActor) => {
  requirePermission(actor.user, "account.manage_own");
  return { policy: deps.policy, retentionDays: RETENTION_DAYS } satisfies UsageSettings;
};

export const recordUsage = async (
  deps: UsageDeps,
  actor: UsageActor,
  body: unknown,
): Promise<{ accepted: number; ignored: number }> => {
  requirePermission(actor.user, "account.manage_own");
  if (deps.policy === "off") throw new UsageDisabledError();
  const list =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { events?: unknown }).events
      : undefined;
  if (!Array.isArray(list))
    throw new InvalidUsageReportError('A usage report is { "events": [ … ] }.');
  if (list.length > MAX_EVENTS_PER_REPORT)
    throw new InvalidUsageReportError(
      `A usage report has at most ${MAX_EVENTS_PER_REPORT} events; this one has ${list.length}.`,
    );

  const today = dayOf(deps.now());
  const events = list.map((value) => usageEventOf(value, today));
  const valid = events.filter((e): e is UsageEvent => e !== null);
  const published = await deps.usage.publishedVersions([...new Set(valid.map((e) => e.item))]);

  // Lines for the same row are summed first, so the database sees each row once.
  const rows = new Map<string, UsageRow>();
  let accepted = 0;
  for (const event of valid) {
    const item = published.get(event.item);
    if (!item?.versions.has(event.version)) continue;
    accepted += 1;
    const key = usageKey(event);
    const row = rows.get(key);
    if (row) row.count += event.count;
    else
      rows.set(key, {
        itemId: item.itemId,
        day: event.day,
        version: event.version,
        tool: event.tool,
        event: event.event,
        trigger: event.trigger,
        outcome: event.outcome,
        count: event.count,
      });
  }
  await deps.usage.add([...rows.values()]);
  if (deps.pruneDue(today)) await deps.usage.deleteBefore(daysBefore(today, RETENTION_DAYS - 1));
  return { accepted, ignored: list.length - accepted };
};

/** The item's usage for its page (047): everyone signed in sees it, from the minimum on. */
export const itemUsage = async (
  deps: Pick<UsageDeps, "usage" | "policy" | "now">,
  actor: UsageActor,
  item: { id: string; type: ItemType },
): Promise<UsageSummary> => {
  requirePermission(actor.user, "account.manage_own");
  const today = dayOf(deps.now());
  const rows = await deps.usage.rowsBetween(item.id, daysBefore(today, WINDOW_DAYS - 1), today);
  return summarizeUsage(rows, {
    today,
    type: item.type,
    collecting: deps.policy !== "off",
    hasData: rows.length > 0 || (await deps.usage.hasAny(item.id)),
  });
};

/** Runs and installs per version for the Versions page (047), or null under the minimum. */
export const itemUsageByVersion = async (
  deps: Pick<UsageDeps, "usage" | "now">,
  actor: UsageActor,
  itemId: string,
) => {
  requirePermission(actor.user, "account.manage_own");
  const today = dayOf(deps.now());
  return byVersion(
    await deps.usage.rowsBetween(itemId, daysBefore(today, WINDOW_DAYS - 1), today),
    today,
  );
};
