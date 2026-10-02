import { CircleX, TriangleAlert } from "lucide-react";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { Notice } from "@/components/ui/Notice";
import type { DependencyMark } from "@/server/domains/submissions/actions/submissions";

const WAITS: Record<Extract<DependencyMark, { kind: "waits" }>["status"], string> = {
  submitted: "in review",
  changes_requested: "back with its author",
  // Approved, waiting for its release (owner, 2026-10-01).
  approved: "pending release",
  not_submitted: "not submitted",
};

/** One mark in words (056): "Waits on @team/github (in review)", "Blocked: @team/github was rejected". */
export const markText = (mark: DependencyMark): string =>
  mark.kind === "waits"
    ? `Waits on ${mark.dependency} (${WAITS[mark.status]})`
    : mark.through.length === 0
      ? `Blocked: ${mark.dependency} was ${mark.status}`
      : `Blocked: ${mark.dependency} waits on ${mark.through.at(-1)}, which was ${mark.status}`;

/** A dependency's own status in a word or two, for a badge beside its name. */
export const markStatus = (mark: DependencyMark): string =>
  mark.kind === "waits"
    ? WAITS[mark.status]
    : mark.through.length === 0
      ? mark.status
      : `${mark.through.at(-1)} ${mark.status}`;

/**
 * Beside a dependency's name (owner, 2026-10-01): an amber badge while it isn't released yet ("in
 * review", "approved", "not submitted"), a red one when it's blocked. The full sentence is on
 * hover and for screen readers. Reusable: any list of dependencies can show it, with its classes.
 */
export const DependencyStatusBadge = ({
  mark,
  className,
}: {
  mark: DependencyMark;
  className?: string;
}) => {
  const blocked = mark.kind === "blocked";
  const Icon = blocked ? CircleX : TriangleAlert;
  return (
    <Badge
      tone={blocked ? "error" : "warning"}
      title={markText(mark)}
      aria-label={markText(mark)}
      className={cn("gap-1", className)}
    >
      <Icon size={11} aria-hidden="true" />
      {markStatus(mark)}
    </Badge>
  );
};

/** A row's marks, as small badges: amber when blocked. */
export const DependencyMarkBadges = ({ marks }: { marks?: readonly DependencyMark[] }) =>
  marks && marks.length > 0 ? (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {marks.map((mark) => (
        <Badge key={mark.dependency} tone={mark.kind === "blocked" ? "warning" : "muted"}>
          {markText(mark)}
        </Badge>
      ))}
    </span>
  ) : null;

/**
 * A page's marks, as a notice: a warning when something is blocked, information while it only
 * waits. Says what that means for releasing.
 */
export const DependencyMarksNotice = ({ marks }: { marks?: readonly DependencyMark[] }) => {
  if (!marks || marks.length === 0) return null;
  const blocked = marks.some((mark) => mark.kind === "blocked");
  return (
    <Notice
      kind={blocked ? "warn" : "info"}
      title={
        blocked
          ? "A dependency won't be released."
          : "It can be released once its dependencies are."
      }
    >
      <ul className="mt-1 grid gap-0.5">
        {marks.map((mark) => (
          <li key={mark.dependency}>{markText(mark)}</li>
        ))}
      </ul>
      {blocked ? (
        <p className="mt-2 text-muted">
          Remove it from dependencies, or depend on another item, then submit again.
        </p>
      ) : null}
      <div className="mt-2">
        <Help id="waits-on" />
      </div>
    </Notice>
  );
};
