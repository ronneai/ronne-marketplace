import { Badge } from "@/components/ui/Badge";
import type { Proposal } from "@/server/domains/submissions/models/submission";

/**
 * Marks a change proposal (feature 017): the version it changes and, when a newer one has been
 * released since, `stale`. Nothing for a new item.
 */
export const ProposalBadges = ({
  proposal,
  stale,
}: {
  proposal: Proposal | null;
  stale?: string | null;
}) =>
  proposal ? (
    <>
      <Badge>change to {proposal.baseVersion}</Badge>
      {stale ? (
        <Badge tone="warning" title={`${stale} has been released since: rebase first.`}>
          stale
        </Badge>
      ) : null}
    </>
  ) : null;
