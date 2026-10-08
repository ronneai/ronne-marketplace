"use client";

import type { Placement } from "@floating-ui/react";
import type { ManifestIssue } from "@ronneai/core";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Popover } from "@/components/ui/Popover";
import { TONES, type Tone } from "@/components/ui/tones";
import { IssueList } from "./IssueList";

/**
 * Validation issues behind small, reusable notifications (the editor's, owner, 2026-10-01). Each
 * piece takes its tone from the issues (`issuesTone`: red with any error, amber with warnings only,
 * teal with none) and accepts classes and placement, so other pages can use them as they are.
 */

/** How many errors and warnings, as words: "2 errors, 1 warning". */
export const issueCount = (issues: readonly ManifestIssue[]): string => {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  const words = [
    errors ? `${errors} ${errors === 1 ? "error" : "errors"}` : "",
    warnings ? `${warnings} ${warnings === 1 ? "warning" : "warnings"}` : "",
  ].filter(Boolean);
  return words.length ? words.join(", ") : "No problems";
};

/** The tone a set of issues takes: `error` with any error, `warning` with warnings only. */
export const issuesTone = (issues: readonly ManifestIssue[]): Tone =>
  issues.some((issue) => issue.severity === "error")
    ? "error"
    : issues.length > 0
      ? "warning"
      : "ok";

/** The tone's icon: a red cross, an amber triangle, or a teal check. */
export const IssuesIcon = ({
  issues,
  size = 14,
  className,
}: {
  issues: readonly ManifestIssue[];
  size?: number;
  className?: string;
}) => {
  const tone = issuesTone(issues);
  const Icon = tone === "error" ? CircleX : tone === "warning" ? TriangleAlert : CircleCheck;
  return (
    <Icon size={size} aria-hidden="true" className={cn("shrink-0", TONES[tone].text, className)} />
  );
};

/**
 * The popover's list: an optional heading, the issues, each one going to its place, a note. With
 * `savedLabel`, the `saved` issues are listed apart under it (the editor's registry checks while
 * there are unsaved changes, #142); without it, they're listed with the rest.
 */
export const IssuesPanel = ({
  heading,
  issues,
  saved = [],
  savedLabel,
  note,
  onSelect,
  close,
}: {
  heading?: string;
  issues: readonly ManifestIssue[];
  saved?: readonly ManifestIssue[];
  savedLabel?: string;
  note?: string;
  onSelect?: (issue: ManifestIssue) => void;
  close: () => void;
}) => {
  const select = onSelect
    ? (issue: ManifestIssue) => {
        close();
        onSelect(issue);
      }
    : undefined;
  return (
    <>
      {heading ? <p className="font-mono font-semibold">{heading}</p> : null}
      {savedLabel && saved.length > 0 ? (
        <>
          {issues.length > 0 ? <IssueList issues={issues} onSelect={select} /> : null}
          <p className="text-muted">{savedLabel}</p>
          <IssueList issues={saved} onSelect={select} />
        </>
      ) : (
        <IssueList issues={[...issues, ...saved]} onSelect={select} />
      )}
      {note ? <p className="text-muted">{note}</p> : null}
    </>
  );
};

/**
 * A file's problems behind an icon right after its name: clicking it lists them in a popover in
 * the same tone. Nothing when the file has none.
 */
export const FileIssues = ({
  path,
  issues,
  saved = [],
  savedLabel,
  onSelect,
  className,
  placement,
}: {
  path: string;
  issues: readonly ManifestIssue[];
  /** As for IssuesSummary: counted with the rest, listed apart under `savedLabel` (#142). */
  saved?: readonly ManifestIssue[];
  savedLabel?: string;
  onSelect?: (issue: ManifestIssue) => void;
  className?: string;
  placement?: Placement;
}) => {
  const all = [...issues, ...saved];
  return all.length === 0 ? null : (
    <Popover
      label={`Show problems: ${issueCount(all).toLowerCase()}`}
      button={<IssuesIcon issues={all} />}
      buttonClassName={cn("p-0.5", className)}
      tone={issuesTone(all)}
      placement={placement}
    >
      {(close) => (
        <IssuesPanel
          heading={`${path} · ${issueCount(all)}`}
          issues={issues}
          saved={saved}
          savedLabel={savedLabel}
          onSelect={onSelect}
          close={close}
        />
      )}
    </Popover>
  );
};

/**
 * Every problem summed up in a chip: "2 errors, 1 warning", or "No problems", in its tone (a red
 * hover for errors), with the list in a popover. Next to the item's name in the editor.
 */
export const IssuesSummary = ({
  issues,
  saved = [],
  savedLabel,
  note,
  onSelect,
  className,
  placement,
}: {
  issues: readonly ManifestIssue[];
  /** Issues from elsewhere, counted with the rest; listed apart under `savedLabel` when it's given. */
  saved?: readonly ManifestIssue[];
  savedLabel?: string;
  /** What the problems mean here, such as that errors stop a submit. */
  note?: string;
  onSelect?: (issue: ManifestIssue) => void;
  className?: string;
  placement?: Placement;
}) => {
  const all = [...issues, ...saved];
  const tone = issuesTone(all);
  return (
    <Popover
      label={`Problems: ${issueCount(all)}`}
      maxWidth={520}
      tone={tone === "ok" ? "default" : tone}
      placement={placement}
      buttonClassName={cn(
        "h-6 gap-1.5 border px-2 font-mono text-xs text-fg",
        TONES[tone].chip,
        className,
      )}
      button={
        <>
          <IssuesIcon issues={all} />
          {issueCount(all)}
        </>
      }
    >
      {(close) => (
        <IssuesPanel
          issues={issues}
          saved={saved}
          savedLabel={savedLabel}
          note={note}
          onSelect={onSelect}
          close={close}
        />
      )}
    </Popover>
  );
};
