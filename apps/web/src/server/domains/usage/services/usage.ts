import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
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
import type { UsageRepository, UsageRow } from "../repositories/usage-repository";

/**
 * Recording usage that `rmk` reports (feature 046, MVP §14.6). Any signed-in token may report; the
 * instance can refuse every report (`USAGE_TELEMETRY=off`). An event that can't be counted (an item
 * or version not published here, a stale day, an unknown value) is ignored rather than refused, so
 * one odd line never loses the rest. Only daily totals are stored: nothing about who reported.
 */
export type UsageDeps = {
  usage: UsageRepository;
  /** Whether this instance accepts usage. */
  accepting: boolean;
  now: () => Date;
  /** Whether old totals are due for deletion today; the first report of each day prunes. */
  pruneDue: (today: string) => boolean;
};

export type UsageActor = { user: CurrentUser };

export type UsageSettings = { accepting: boolean; retentionDays: number };

/** What `GET /api/v1/usage` says, so `rmk telemetry on` can tell the person. */
export const usageSettings = (deps: Pick<UsageDeps, "accepting">, actor: UsageActor) => {
  requirePermission(actor.user, "account.manage_own");
  return { accepting: deps.accepting, retentionDays: RETENTION_DAYS } satisfies UsageSettings;
};

export const recordUsage = async (
  deps: UsageDeps,
  actor: UsageActor,
  body: unknown,
): Promise<{ accepted: number; ignored: number }> => {
  requirePermission(actor.user, "account.manage_own");
  if (!deps.accepting) throw new UsageDisabledError();
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
    if (!item || !item.versions.has(event.version)) continue;
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
