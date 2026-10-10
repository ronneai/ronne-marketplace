import { parseItemName } from "@ronneai/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { itemPath } from "@/components/catalogue/ItemCard";
import { Badge } from "@/components/ui/Badge";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { LocalTime } from "@/components/ui/LocalTime";
import { utcText } from "@/components/ui/time-text";
import type { AuditEvent } from "@/server/domains/audit/models/audit-event";
import { actorLabel, detailPairs } from "./format";
import { type SummaryPart, summarize } from "./summary";

/** A summary's parts: names in bold, codes (tags) in mono. */
export const Summary = ({ parts }: { parts: SummaryPart[] }) => (
  <>
    {parts.map((part, i) =>
      typeof part === "string" ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
        <span key={i}>{part}</span>
      ) : "name" in part ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
        <strong key={i} className="font-semibold text-fg">
          {part.name}
        </strong>
      ) : (
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
        <code key={i} className="font-mono text-[13px]">
          {part.code}
        </code>
      ),
    )}
  </>
);

const linkClass = "text-link underline-offset-2 hover:underline";

const OPEN_LABELS: Record<string, string> = {
  user: "Open in Users",
  submission: "Open the submission",
  item: "Open the item",
  item_version: "Open the item",
};

/** Where the app shows the target, when it has a page for it. */
const targetHref = (event: AuditEvent): string | null => {
  const name = typeof event.metadata.name === "string" ? event.metadata.name : "";
  const ref = parseItemName(name);
  switch (event.targetType) {
    case "user":
      return event.targetEmail ? `/admin/users?q=${encodeURIComponent(event.targetEmail)}` : null;
    case "submission":
      return event.targetId ? `/submissions/${event.targetId}` : null;
    case "item":
    case "item_version":
      return ref ? itemPath(ref) : null;
    default:
      return null;
  }
};

const Row = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className="contents">
    <dt className="text-muted">{term}</dt>
    <dd className="min-w-0 break-words text-fg">{children}</dd>
  </div>
);

/** Everything recorded about one event (060), for its dialog. */
export const EventDetails = ({ event }: { event: AuditEvent }) => {
  const href = targetHref(event);
  const target =
    event.targetType === "none" ? (
      "—"
    ) : (
      <>
        {event.targetType}
        {event.targetEmail ? ` · ${event.targetEmail}` : ""}
        {event.targetId ? (
          <span className="block font-mono text-xs text-muted">{event.targetId}</span>
        ) : null}
        {href ? (
          <Link href={href} className={`${linkClass} block text-sm`}>
            {OPEN_LABELS[event.targetType] ?? "Open"}
          </Link>
        ) : null}
      </>
    );
  const pairs = detailPairs(event.metadata);
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
        <Row term="When">
          <LocalTime value={event.createdAt} precision="second" />
          <span className="block font-mono text-xs text-muted">
            {utcText(event.createdAt, "second")}
          </span>
        </Row>
        <Row term="Actor">
          {actorLabel(event)}
          {event.actorId ? (
            <span className="block font-mono text-xs text-muted">{event.actorId}</span>
          ) : null}
        </Row>
        <Row term="Action">
          <Badge>{event.action}</Badge>
          <span className="mt-1 block">
            <Summary parts={summarize(event)} />
          </span>
        </Row>
        <Row term="Target">{target}</Row>
        <Row term="IP address">
          <span className="font-mono text-[13px]">{event.ipAddress ?? "—"}</span>
        </Row>
        <Row term="Details">
          {pairs.length === 0 ? (
            "—"
          ) : (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-xs">
              {pairs.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted">{key}</dt>
                  <dd className="break-all">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Row>
        <Row term="Event id">
          <span className="font-mono text-[13px]">{event.id}</span>
        </Row>
      </dl>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-fg">Raw JSON</summary>
        <div className="mt-2">
          <CopyableCommand
            command={JSON.stringify(event, null, 2)}
            label="Copy JSON"
            prompt={false}
            wrap
          />
        </div>
      </details>
    </div>
  );
};
