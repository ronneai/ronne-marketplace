import { useTranslations } from "next-intl";
import { Table, Td, Th } from "@/components/ui/Table";
import type { ProposalView } from "@/server/domains/submissions/actions/reviews";
import { ReviewChanges } from "./ReviewFiles";

/**
 * What a change proposal changes against the version it started from (feature 017): the manifest's
 * top-level fields side by side, then each file as 014's line diffs.
 */
export const ProposalChanges = ({
  proposal,
  selected,
}: {
  proposal: ProposalView;
  /** The changed file shown (058), from `?file=`. */
  selected?: string;
}) => {
  const t = useTranslations("author.review");
  return (
    <div className="grid gap-4">
      {proposal.manifest.length > 0 ? (
        <section aria-label={t("manifestFields")} className="grid gap-2">
          <h3 className="text-sm font-semibold text-fg">{t("manifestHeading")}</h3>
          <Table>
            <thead>
              <tr>
                <Th>{t("field")}</Th>
                <Th>{t("inVersion", { version: proposal.baseVersion })}</Th>
                <Th>{t("proposed")}</Th>
              </tr>
            </thead>
            <tbody>
              {proposal.manifest.map((change) => (
                <tr key={change.field}>
                  <Td className="font-mono text-sm">{change.field}</Td>
                  <Td className="font-mono text-xs whitespace-pre-wrap text-muted">
                    {change.before ?? t("notSet")}
                  </Td>
                  <Td className="font-mono text-xs whitespace-pre-wrap">
                    {change.after ?? t("removed")}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ) : null}
      {proposal.changes ? (
        <ReviewChanges
          changes={proposal.changes}
          selected={selected}
          emptyText={t("noChangesTo", { version: proposal.baseVersion })}
        />
      ) : (
        <p className="text-sm text-muted">{t("unreadable", { version: proposal.baseVersion })}</p>
      )}
    </div>
  );
};
