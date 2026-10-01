import Link from "next/link";
import { ProposalBadges } from "@/components/submissions/ProposalBadges";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { LocalTime } from "@/components/ui/LocalTime";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import type { QueueRow, QueueTab } from "@/server/domains/submissions/actions/reviews";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { QUEUE_TABS } from "@/server/domains/submissions/services/queue";
import { type ApprovableRow, ApproveSelectCell } from "./BulkApprove";

const TAB_ORDER: QueueTab[] = ["needs", "waiting", "decided"];

const EMPTY: Record<QueueTab, string> = {
  needs: "Nothing needs review. New submissions show up here.",
  waiting: "No submission is waiting on its author.",
  decided: "Nothing has been decided yet.",
};

/** `?tab=`, when it's a tab; otherwise Needs review. */
export const queueTab = (value: string | string[] | undefined): QueueTab => {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "waiting" || tab === "decided" ? tab : "needs";
};

const tabClasses =
  "rounded-control px-3 py-1.5 text-sm text-muted hover:text-fg aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/** The review queue's tabs (feature 014), as links, so they work without JavaScript. */
export const QueueTabs = ({ tab }: { tab: QueueTab }) => (
  <nav aria-label="Review queue" className="flex flex-wrap gap-1 pb-4">
    {TAB_ORDER.map((id) => (
      <Link
        key={id}
        href={id === "needs" ? "/reviews" : `/reviews?tab=${id}`}
        aria-current={id === tab ? "page" : undefined}
        className={tabClasses}
      >
        {QUEUE_TABS[id].label}
      </Link>
    ))}
  </nav>
);

/** The rows this reviewer can approve now, for BulkApproveProvider (054). */
export const approvableRows = (rows: QueueRow[]): Record<string, ApprovableRow> =>
  Object.fromEntries(
    rows.flatMap((row) =>
      row.approvable.approvable
        ? [
            [
              row.id,
              {
                name: itemNameOf(row),
                type: row.type,
                author: row.authorName,
                revision: row.revision,
                riskKinds: row.riskKinds,
                override: row.approvable.override,
              },
            ],
          ]
        : [],
    ),
  );

/**
 * One tab of the queue: each submission, who sent it, since when, and whether it's risky. Needs
 * review has a checkbox on each row for approving many (054), inside BulkApproveProvider.
 */
export const QueueTable = ({
  tab,
  rows,
  nextCursor,
}: {
  tab: QueueTab;
  rows: QueueRow[];
  nextCursor: string | null;
}) => {
  if (rows.length === 0)
    return (
      <Panel padding="lg">
        <p className="text-sm text-muted">{EMPTY[tab]}</p>
      </Panel>
    );
  return (
    <div className="grid gap-4">
      <Table>
        <thead>
          <tr>
            {tab === "needs" ? (
              <Th>
                <span className="sr-only">Select</span>
              </Th>
            ) : null}
            <Th>Item</Th>
            <Th>Type</Th>
            <Th>Author</Th>
            <Th>Revision</Th>
            <Th>{tab === "decided" ? "Decided" : "Submitted"}</Th>
            {tab === "decided" ? <Th>Status</Th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {tab === "needs" ? (
                <Td className="w-8">
                  <ApproveSelectCell
                    id={row.id}
                    name={itemNameOf(row)}
                    reason={row.approvable.approvable ? null : row.approvable.reason}
                  />
                </Td>
              ) : null}
              <Td>
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/reviews/${row.id}`}
                    className="font-mono text-sm text-link hover:underline"
                  >
                    {itemNameOf(row)}
                  </Link>
                  <ProposalBadges proposal={row.proposal} stale={row.stale} />
                  {row.risky ? <Badge tone="warning">⚠ risk</Badge> : null}
                  {row.mine ? <Badge>yours</Badge> : null}
                </span>
              </Td>
              <Td>
                <Badge>{row.type}</Badge>
              </Td>
              <Td className="text-sm">{row.authorName}</Td>
              <Td className="font-mono text-xs">{row.revision ?? "–"}</Td>
              <Td className="whitespace-nowrap font-mono text-xs text-muted">
                <LocalTime
                  value={tab === "decided" ? row.updatedAt : (row.submittedAt ?? row.updatedAt)}
                />
              </Td>
              {tab === "decided" ? (
                <Td>
                  <StatusBadge status={row.status} />
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </Table>
      {nextCursor ? (
        <div>
          <Link
            href={`/reviews?tab=decided&cursor=${encodeURIComponent(nextCursor)}`}
            className={buttonClasses("secondary")}
          >
            Older decisions
          </Link>
        </div>
      ) : null}
    </div>
  );
};
