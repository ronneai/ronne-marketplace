import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Input, Label, selectClasses } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { PageHeader } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import type { AuditEvent } from "@/server/domains/audit/models/audit-event";
import { AUDIT_ACTION_GROUPS } from "@/server/domains/audit/models/audit-event";
import { actorLabel, detailPairs } from "./format";
import { type AuditFilters, auditPageUrl } from "./query";

/**
 * /admin/audit (spec 007): read-only, newest first, 50 a page. The filters are a GET form, so they
 * work without JavaScript and every view has a URL.
 */
export const AuditLogPage = ({
  events,
  nextCursor,
  filters,
  paged,
}: {
  events: AuditEvent[];
  nextCursor: string | null;
  filters: AuditFilters;
  /** Whether this isn't the first page. */
  paged: boolean;
}) => {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who did what, when and from where. Times are in your time zone; hover one for UTC. Read-only."
      />
      <form
        method="get"
        action="/admin/audit"
        className="mb-4 grid gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:items-end"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="group">Action</Label>
          <select id="group" name="group" defaultValue={filters.group} className={selectClasses}>
            <option value="">All actions</option>
            {AUDIT_ACTION_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}.*
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="actor">Actor</Label>
          <Input
            id="actor"
            name="actor"
            type="search"
            placeholder="Email, or system"
            defaultValue={filters.actor}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="from">From (UTC)</Label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">To (UTC)</Label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonClasses("secondary")}>
            Filter
          </button>
          <Link href="/admin/audit" className={buttonClasses("ghost")}>
            Clear
          </Link>
        </div>
      </form>

      {events.length === 0 ? (
        <p className="rounded-panel border border-hairline bg-surface p-4 text-sm text-muted">
          No events{Object.values(filters).some(Boolean) ? " match these filters" : " yet"}.
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th>Details</Th>
              <Th>IP address</Th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="align-top">
                <Td mono className="py-2 whitespace-nowrap">
                  <LocalTime value={event.createdAt} precision="second" />
                </Td>
                <Td className="py-2">
                  <span className="font-mono text-[13px]">{actorLabel(event)}</span>
                </Td>
                <Td className="py-2">
                  <Badge>{event.action}</Badge>
                </Td>
                <Td mono className="py-2 text-muted">
                  {event.targetType === "none" ? "—" : event.targetType}
                  {event.targetId ? (
                    <span className="block text-[11px] break-all">{event.targetId}</span>
                  ) : null}
                </Td>
                <Td className="py-2">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 font-mono text-xs">
                    {detailPairs(event.metadata).map(([key, value]) => (
                      <div key={key} className="contents">
                        <dt className="text-muted">{key}</dt>
                        <dd className="break-all text-fg">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Td>
                <Td mono className="py-2 text-muted">
                  {event.ipAddress ?? "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <nav aria-label="Pages" className="mt-4 flex justify-between gap-2">
        {paged ? (
          <Link href={auditPageUrl(filters)} className={buttonClasses("ghost")}>
            ← Newest
          </Link>
        ) : (
          <span />
        )}
        {nextCursor ? (
          <Link href={auditPageUrl(filters, nextCursor)} className={buttonClasses("secondary")}>
            Older →
          </Link>
        ) : null}
      </nav>
    </>
  );
};
