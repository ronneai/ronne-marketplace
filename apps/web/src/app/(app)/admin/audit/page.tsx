import { notFound } from "next/navigation";
import { AuditLogPage } from "@/features/admin-audit/AuditLogPage";
import { parseAuditQuery, type SearchParams } from "@/features/admin-audit/query";
import { appAuditPage } from "@/server/domains/audit/actions/audit-page";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Audit log · Ronne AI Marketplace" };

/** Root only (`audit.view`): anyone else gets a 404, so the page's existence isn't revealed (spec 007). */
const AuditLog = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const user = await getCurrentUser(await requestHeaders());
  if (!can(user, "audit.view")) notFound();

  const query = parseAuditQuery(await searchParams);
  const { events, next } = await appAuditPage({
    sort: "time",
    dir: "desc",
    size: 50,
    cursor: query.cursor,
    group: query.group,
    actor: query.actor,
    from: query.from,
    to: query.to,
  });
  return (
    <AuditLogPage
      events={events}
      nextCursor={next}
      filters={query.filters}
      paged={Boolean(query.cursor)}
    />
  );
};

export default AuditLog;
