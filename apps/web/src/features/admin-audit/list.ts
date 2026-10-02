import { defineList, type ListState } from "@/components/ui/data-table/list-query";
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditActionGroup,
  actionsInGroup,
} from "@/server/domains/audit/models/audit-event";
import type { AuditQuery } from "@/server/domains/audit/repositories/audit-repository";

/** /admin/audit as a server data table (feature 060): what it sorts and filters by. */
export const AUDIT_LIST = defineList({
  path: "/admin/audit",
  sorts: { time: "desc", action: "asc" },
  defaultSort: "time",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { action: "string", actor: "string", from: "day", to: "day" },
});

export type AuditListState = ListState<"time" | "action", "action" | "actor" | "from" | "to">;

const isAction = (value: string): value is AuditAction =>
  (AUDIT_ACTIONS as readonly string[]).includes(value);

/** `user.*` → `user`, when it's a group of the catalogue. */
const groupOf = (value: string): AuditActionGroup | undefined => {
  const group = value.endsWith(".*") ? value.slice(0, -2) : "";
  return (AUDIT_ACTION_GROUPS as readonly string[]).includes(group)
    ? (group as AuditActionGroup)
    : undefined;
};

/** Drops an action filter the catalogue doesn't know, so the form and chips never show it. */
export const checkedState = (state: AuditListState): AuditListState => {
  const { action } = state.filters;
  return action && !isAction(action) && !groupOf(action)
    ? { ...state, filters: { ...state.filters, action: "" } }
    : state;
};

const utcDay = (day: string, plusDays = 0): Date | undefined => {
  if (!day) return undefined;
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + plusDays);
  return date;
};

/** The server query for a view: `to` includes its whole day. */
export const auditQueryOf = (state: AuditListState): AuditQuery => {
  const { action, actor, from, to } = state.filters;
  return {
    sort: state.sort,
    dir: state.dir,
    size: state.size,
    cursor: state.cursor,
    action: isAction(action) ? action : undefined,
    group: groupOf(action),
    actor: actor || undefined,
    from: utcDay(from),
    to: utcDay(to, 1),
  };
};

/** The action filter's choices: each group, its "all" option first, then its actions. */
export const ACTION_OPTIONS = AUDIT_ACTION_GROUPS.map((group) => ({
  group,
  all: `${group}.*`,
  actions: actionsInGroup(group),
}));
