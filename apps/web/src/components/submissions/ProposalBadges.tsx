import { useTranslations } from "next-intl";
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
}) => {
  const t = useTranslations("author.proposal");
  return proposal ? (
    <>
      <Badge>{t("changeTo", { version: proposal.baseVersion })}</Badge>
      {stale ? (
        <Badge tone="warning" title={t("staleTitle", { version: stale })}>
          {t("stale")}
        </Badge>
      ) : null}
    </>
  ) : null;
};
