import { notFound } from "next/navigation";
import { AuditLogPage } from "@/features/admin-audit/AuditLogPage";
import { parseAuditQuery, type SearchParams } from "@/features/admin-audit/query";
import { appAuditPage } from "@/server/domains/audit/actions/audit-page";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Audit log · Ronne" };

/** Root only (`audit.view`): anyone else gets a 404, so the page's existence isn't revealed (spec 007). */
export default async function AuditLog({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser(await requestHeaders());
  if (!can(user, "audit.view")) notFound();

  const query = parseAuditQuery(await searchParams);
  const { events, nextCursor, actors } = await appAuditPage({
    cursor: query.cursor,
    group: query.group,
    actor: query.actor,
    from: query.from,
    to: query.to,
  });
  return (
    <AuditLogPage
      events={events}
      nextCursor={nextCursor}
      filters={query.filters}
      paged={Boolean(query.cursor)}
      actors={actors}
    />
  );
}
