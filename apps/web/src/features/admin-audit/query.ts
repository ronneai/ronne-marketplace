import { isId } from "@/server/db/ids";
import {
  AUDIT_ACTION_GROUPS,
  type AuditActionGroup,
} from "@/server/domains/audit/models/audit-event";

export type SearchParams = Record<string, string | string[] | undefined>;

/** The filters as the form shows them: strings, "" when unset. */
export type AuditFilters = { group: string; actor: string; from: string; to: string };

export type AuditPageQuery = {
  filters: AuditFilters;
  cursor?: string;
  group?: AuditActionGroup;
  actor?: string;
  /** UTC midnight of the `from` day. */
  from?: Date;
  /** UTC midnight after the `to` day: the range includes the whole `to` day. */
  to?: Date;
};

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function utcDay(value: string, plusDays = 0): Date | undefined {
  if (!DAY.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() + plusDays);
  return date;
}

/** Reads /admin/audit's query string. Anything malformed is ignored rather than trusted. */
export function parseAuditQuery(params: SearchParams): AuditPageQuery {
  const group = first(params.group);
  const actor = first(params.actor);
  const from = first(params.from);
  const to = first(params.to);
  const cursor = first(params.cursor);
  const validGroup = (AUDIT_ACTION_GROUPS as readonly string[]).includes(group)
    ? (group as AuditActionGroup)
    : undefined;
  const validActor = actor === "system" || isId(actor) ? actor : undefined;
  return {
    filters: {
      group: validGroup ?? "",
      actor: validActor ?? "",
      from: utcDay(from) ? from : "",
      to: utcDay(to) ? to : "",
    },
    cursor: isId(cursor) ? cursor : undefined,
    group: validGroup,
    actor: validActor,
    from: utcDay(from),
    to: utcDay(to, 1),
  };
}

/** The URL of another page with the same filters. */
export function auditPageUrl(filters: AuditFilters, cursor?: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/admin/audit?${query}` : "/admin/audit";
}
