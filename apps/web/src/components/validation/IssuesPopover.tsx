"use client";

import type { Placement } from "@floating-ui/react";
import type { ManifestIssue } from "@ronneai/core";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui/cn";
import { Popover } from "@/components/ui/Popover";
import { TONES, type Tone } from "@/components/ui/tones";
import { IssueList } from "./IssueList";

/**
 * Validation issues behind small, reusable notifications (the editor's, owner, 2026-10-01). Each
 * piece takes its tone from the issues (`issuesTone`: red with any error, amber with warnings only,
 * teal with none) and accepts classes and placement, so other pages can use them as they are.
 */

/** How many errors and warnings, as words in the person's language: "2 errors, 1 warning". */
export const useIssueCount = () => {
  const t = useTranslations("author.issues");
  return (issues: readonly ManifestIssue[]): string => {
    const errors = issues.filter((issue) => issue.severity === "error").length;
    const warnings = issues.length - errors;
    if (errors && warnings)
      return t("both", {
        errors: t("errors", { count: errors }),
        warnings: t("warnings", { count: warnings }),
      });
    if (errors) return t("errors", { count: errors });
    if (warnings) return t("warnings", { count: warnings });
    return t("noProblems");
  };
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
  onRename,
  close,
}: {
  heading?: string;
  issues: readonly ManifestIssue[];
  saved?: readonly ManifestIssue[];
  savedLabel?: string;
  note?: string;
  onSelect?: (issue: ManifestIssue) => void;
  onRename?: (rename: { from: string; to: string }) => void;
  close: () => void;
}) => {
  const rename = onRename
    ? (value: { from: string; to: string }) => {
        close();
        onRename(value);
      }
    : undefined;
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
          {issues.length > 0 ? (
            <IssueList issues={issues} onSelect={select} onRename={rename} />
          ) : null}
          <p className="text-muted">{savedLabel}</p>
          <IssueList issues={saved} onSelect={select} onRename={rename} />
        </>
      ) : (
        <IssueList issues={[...issues, ...saved]} onSelect={select} onRename={rename} />
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
  onRename,
  className,
  placement,
}: {
  path: string;
  issues: readonly ManifestIssue[];
  /** As for IssuesSummary: counted with the rest, listed apart under `savedLabel` (#142). */
  saved?: readonly ManifestIssue[];
  savedLabel?: string;
  onSelect?: (issue: ManifestIssue) => void;
  onRename?: (rename: { from: string; to: string }) => void;
  className?: string;
  placement?: Placement;
}) => {
  const t = useTranslations("author.issues");
  const issueCount = useIssueCount();
  const all = [...issues, ...saved];
  return all.length === 0 ? null : (
    <Popover
      label={t("show", { count: issueCount(all) })}
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
          onRename={onRename}
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
  onRename,
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
  onRename?: (rename: { from: string; to: string }) => void;
  className?: string;
  placement?: Placement;
}) => {
  const t = useTranslations("author.issues");
  const issueCount = useIssueCount();
  const all = [...issues, ...saved];
  const tone = issuesTone(all);
  return (
    <Popover
      label={t("summary", { count: issueCount(all) })}
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
          onRename={onRename}
          close={close}
        />
      )}
    </Popover>
  );
};
