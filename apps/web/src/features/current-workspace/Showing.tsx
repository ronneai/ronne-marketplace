import { Help } from "@/components/help/Help";
import { chooseHref } from "./current-workspace";

/**
 * The line under a filtered page's heading (120): which workspace it shows, and Show all, which
 * clears the current workspace and comes back here. `missing`: no workspace by that name the reader
 * can see, said the same whether it's private or doesn't exist; `not-reviewer`: one they don't
 * review in. Show all is a plain link: it sets a cookie (docs/knowledge/links-that-change-state.md).
 */
export const Showing = ({
  workspace,
  here,
  why,
}: {
  workspace: string;
  /** This page's path and query, to come back to. */
  here: string;
  why?: "missing" | "not-reviewer";
}) => (
  <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
    <span>
      {why === "missing" ? (
        <>
          No workspace <strong className="font-semibold text-fg">{workspace}</strong> you can see
        </>
      ) : why === "not-reviewer" ? (
        <>
          You don&apos;t review submissions in{" "}
          <strong className="font-semibold text-fg">{workspace}</strong>
        </>
      ) : (
        <>
          Showing <strong className="font-semibold text-fg">{workspace}</strong> only
        </>
      )}
    </span>
    <span aria-hidden>·</span>
    <a
      href={chooseHref(null, here)}
      className="text-link underline underline-offset-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      Show all
    </a>
    <Help id="current-workspace" />
  </p>
);
