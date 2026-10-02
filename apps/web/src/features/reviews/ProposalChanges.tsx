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
}) => (
  <div className="grid gap-4">
    {proposal.manifest.length > 0 ? (
      <section aria-label="Manifest fields" className="grid gap-2">
        <h3 className="text-sm font-semibold text-fg">ronne.yaml fields</h3>
        <Table>
          <thead>
            <tr>
              <Th>Field</Th>
              <Th>In {proposal.baseVersion}</Th>
              <Th>Proposed</Th>
            </tr>
          </thead>
          <tbody>
            {proposal.manifest.map((change) => (
              <tr key={change.field}>
                <Td className="font-mono text-sm">{change.field}</Td>
                <Td className="font-mono text-xs whitespace-pre-wrap text-muted">
                  {change.before ?? "(not set)"}
                </Td>
                <Td className="font-mono text-xs whitespace-pre-wrap">
                  {change.after ?? "(removed)"}
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
        emptyText={`No changes to ${proposal.baseVersion}.`}
      />
    ) : (
      <p className="text-sm text-muted">
        The files of {proposal.baseVersion} couldn't be read, so the changes to it can't be shown.
        Ask root to check the storage.
      </p>
    )}
  </div>
);
