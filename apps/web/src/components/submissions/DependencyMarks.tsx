import { CircleX, Link2, TriangleAlert } from "lucide-react";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { Notice } from "@/components/ui/Notice";
import { Popover } from "@/components/ui/Popover";
import { TONES } from "@/components/ui/tones";
import type { DependencyMark } from "@/server/domains/submissions/actions/submissions";

const WAITS: Record<Extract<DependencyMark, { kind: "waits" }>["status"], string> = {
  submitted: "in review",
  changes_requested: "back with its author",
  // Approved, waiting for its release (owner, 2026-10-01).
  approved: "pending release",
  not_submitted: "not submitted",
};

/** How a closed dependency reads: a withdrawn one is "archived" since 057. */
const CLOSED: Record<Extract<DependencyMark, { kind: "blocked" }>["status"], string> = {
  rejected: "rejected",
  withdrawn: "archived",
};

/** One mark in words (056): "Waits on @team/github (in review)", "Blocked: @team/github was rejected". */
export const markText = (mark: DependencyMark): string =>
  mark.kind === "waits"
    ? `Waits on ${mark.dependency} (${WAITS[mark.status]})`
    : mark.through.length === 0
      ? `Blocked: ${mark.dependency} was ${CLOSED[mark.status]}`
      : `Blocked: ${mark.dependency} waits on ${mark.through.at(-1)}, which was ${CLOSED[mark.status]}`;

/** A dependency's own status in a word or two, for a badge beside its name. */
export const markStatus = (mark: DependencyMark): string =>
  mark.kind === "waits"
    ? WAITS[mark.status]
    : mark.through.length === 0
      ? CLOSED[mark.status]
      : `${mark.through.at(-1)} ${CLOSED[mark.status]}`;

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

/**
 * A row's dependencies that aren't released yet, as one icon (owner, 2026-10-01): a link with the
 * count, amber while they're pending, red when one is blocked. Clicking it lists each with its
 * status badge, in a popover of the same tone. Nothing when there are none. Reusable in any list.
 */
export const DependencyMarksIcon = ({
  marks,
  className,
}: {
  marks?: readonly DependencyMark[];
  className?: string;
}) => {
  if (!marks || marks.length === 0) return null;
  const tone = marks.some((mark) => mark.kind === "blocked") ? "error" : "warning";
  const count = marks.length;
  const label = `${count} ${count === 1 ? "dependency" : "dependencies"} ${tone === "error" ? "with a problem" : "not released yet"}`;
  return (
    <Popover
      label={label}
      tone={tone}
      buttonClassName={cn(
        "h-5 gap-1 rounded-full border px-1.5 text-[11px] font-semibold",
        TONES[tone].chip,
        TONES[tone].text,
        className,
      )}
      button={
        <>
          <Link2 size={12} aria-hidden="true" />
          {count}
        </>
      }
    >
      <>
        <p className="font-semibold">
          {tone === "error" ? "A dependency won't be released." : "It's released once these are."}
        </p>
        <ul className="grid gap-1.5">
          {marks.map((mark) => (
            <li key={mark.dependency} className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{mark.dependency}</span>
              <DependencyStatusBadge mark={mark} />
            </li>
          ))}
        </ul>
        <Help id="waits-on" />
      </>
    </Popover>
  );
};

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
