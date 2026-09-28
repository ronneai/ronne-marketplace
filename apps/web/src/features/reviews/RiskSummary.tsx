import type { RiskFlag } from "@ronneai/core";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { CodeText } from "@/components/validation/IssueList";
import { fileAnchor, lineAnchor } from "./anchors";

/**
 * What the item can do on a developer's machine (MVP §12, feature 014), at the top of the review
 * page and the author's view: each risk flag with a link to its file and line. Flags describe; the
 * reviewer decides.
 */
export const RiskSummary = ({
  flags,
  base,
}: {
  flags: readonly RiskFlag[];
  /** The review page, whose All files view the flags link into; without it, no links. */
  base?: string;
}) => {
  if (flags.length === 0) return null;
  return (
    <section
      aria-labelledby="risk-summary"
      className="grid gap-2 rounded-panel border border-warning/40 border-l-[3px] border-l-warning bg-warning-subtle p-4 text-sm"
    >
      <h2 id="risk-summary" className="flex items-center gap-2 font-semibold text-warning-text">
        <ShieldAlert size={16} aria-hidden="true" />
        What it can do ({flags.length})
      </h2>
      <ul className="grid gap-1.5">
        {flags.map((flag, i) => (
          // Flags have no identity of their own; their order is fixed for a revision.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above.
          <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-fg">
            {flag.widening ? (
              <span className="font-mono text-xs font-semibold text-warning-text">WIDENS:</span>
            ) : null}
            <span>
              <CodeText text={flag.message} />
            </span>
            {flag.file && !base ? (
              <span className="font-mono text-xs text-muted">
                {flag.file}
                {flag.line ? `:${flag.line}` : ""}
              </span>
            ) : null}
            {flag.file && base ? (
              <Link
                href={`${base}?view=all#${flag.line ? lineAnchor(flag.file, flag.line) : fileAnchor(flag.file)}`}
                className="font-mono text-xs text-muted underline underline-offset-2 hover:text-fg"
              >
                {flag.file}
                {flag.line ? `:${flag.line}` : ""}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        These are worked out from the files; the author can't set or hide them.
      </p>
    </section>
  );
};
