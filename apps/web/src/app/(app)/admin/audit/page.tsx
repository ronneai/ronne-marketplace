import { notFound } from "next/navigation";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { AuditLogPage } from "@/features/admin-audit/AuditLogPage";
import { AUDIT_LIST, auditQueryOf, checkedState } from "@/features/admin-audit/list";
import { isId } from "@/server/db/ids";
import {
  appAuditEvent,
  appAuditPage,
  appAuditWorkspaces,
} from "@/server/domains/audit/actions/audit-page";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";
import { adminTitle } from "../metadata";

export const generateMetadata = adminTitle("audit");

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Root only (`audit.read`, which the actions check too since 166): anyone else gets a 404, so the
 * page's existence isn't revealed (spec 007). The view (filters, sort, size, page) and the open
 * event are all in the URL (060).
 */
const AuditLog = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  await holdPage();
  const user = await getCurrentUser(await requestHeaders());
  if (!can(user, "audit.read")) notFound();

  const params = await searchParams;
  const state = checkedState(parseListQuery(AUDIT_LIST, params));
  const eventId = first(params.event) ?? "";
  const [{ events, next, previous, total }, selected, workspaces] = await Promise.all([
    appAuditPage(user, auditQueryOf(state)),
    eventId ? (isId(eventId) ? appAuditEvent(user, eventId) : null) : undefined,
    appAuditWorkspaces(user),
  ]);
  return (
    <AuditLogPage
      state={state}
      events={events}
      page={{ next, previous }}
      total={total}
      workspaces={workspaces}
      selected={selected === null ? "missing" : selected}
    />
  );
};

export default AuditLog;
