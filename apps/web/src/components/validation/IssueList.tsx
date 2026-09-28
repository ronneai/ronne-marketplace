import type { ManifestIssue } from "@ronneai/core";

/** A message with its `backticked` names shown as code. */
const Message = ({ text }: { text: string }) =>
  text.split(/`([^`]+)`/).map((part, i) =>
    i % 2 === 1 ? (
      // The parts of one message never move, so their index is their identity.
      // biome-ignore lint/suspicious/noArrayIndexKey: see above.
      <code key={i} className="font-mono text-[0.85em]">
        {part}
      </code>
    ) : (
      part
    ),
  );

/**
 * Validation issues from `@ronneai/core` (feature 011): errors first, then warnings, each with the
 * file and line it's about. The submission editor (012) shows these under the editor and links each
 * one to its place. Plain text with mono `ERR:` / `WARN:` prefixes, as design system 032 wants.
 */
export const IssueList = ({
  issues,
  onSelect,
}: {
  issues: readonly ManifestIssue[];
  onSelect?: (issue: ManifestIssue) => void;
}) => {
  if (issues.length === 0)
    return (
      <p role="status" className="text-sm text-muted">
        <span className="mr-2 font-mono text-xs font-semibold text-fg">OK:</span>No problems found.
      </p>
    );
  const sorted = [...issues].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
  );
  return (
    <ul className="grid gap-1.5" aria-label="Problems">
      {sorted.map((issue, i) => {
        const where = `${issue.file ?? "ronne.yaml"}${issue.line ? `:${issue.line}` : ""}`;
        const content = (
          <>
            <span className="mr-2 font-mono text-xs font-semibold text-fg">
              {issue.severity === "error" ? "ERR:" : "WARN:"}
            </span>
            <span className="text-fg">
              <Message text={issue.message} />
            </span>
            <span className="ml-2 font-mono text-xs text-muted">{where}</span>
          </>
        );
        return (
          // Issues have no identity of their own; their order is stable for one input.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above.
          <li key={i} className="text-sm">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(issue)}
                className="rounded-control text-left hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
};
