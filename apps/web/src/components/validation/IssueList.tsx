import type { ManifestIssue } from "@ronneai/core";
import { useTranslations } from "next-intl";

/** A message with its `backticked` names shown as code. */
export const CodeText = ({ text }: { text: string }) =>
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
 * file and line it's about. The messages are core's, in English as `rmk` prints them (131); the
 * words around them follow the person's language. The submission editor (012) shows these under the editor and links each
 * one to its place. Mono `ERR:` / `WARN:` prefixes in red and amber (design system 032); the
 * message stays in the text colour, so a long list is still easy to read.
 */
export const IssueList = ({
  issues,
  onSelect,
  onRename,
}: {
  issues: readonly ManifestIssue[];
  onSelect?: (issue: ManifestIssue) => void;
  /** Writes a dependency under its name now (118), for an issue that offers it. */
  onRename?: (rename: { from: string; to: string }) => void;
}) => {
  const t = useTranslations("author.issues");
  const field = useTranslations("common.field");
  if (issues.length === 0)
    return (
      <p role="status" className="text-sm text-muted">
        <span className="mr-2 font-mono text-xs font-semibold text-fg">{t("ok")}</span>
        {t("none")}
      </p>
    );
  const sorted = [...issues].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
  );
  return (
    <ul className="grid gap-1.5" aria-label={t("list")}>
      {sorted.map((issue, i) => {
        const where = `${issue.file ?? "ronne.yaml"}${issue.line ? `:${issue.line}` : ""}`;
        const content = (
          <>
            <span
              className={`mr-2 font-mono text-xs font-semibold ${issue.severity === "error" ? "text-error-text" : "text-warning-text"}`}
            >
              {field(issue.severity === "error" ? "error" : "warning")}
            </span>
            <span className="text-fg">
              <CodeText text={issue.message} />
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
            {issue.rename && onRename ? (
              <button
                type="button"
                onClick={() => issue.rename && onRename(issue.rename)}
                className="ml-2 rounded-control border border-strong px-1.5 py-0.5 text-xs font-semibold text-fg hover:border-accent outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:min-h-11"
              >
                {t("rename")}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};
