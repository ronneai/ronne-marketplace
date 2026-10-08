import type { ManifestIssue } from "@ronneai/core";
import { MANIFEST_PATH } from "@/server/domains/submissions/models/submission";

/** What sets one issue apart from another: two with the same key say the same thing. */
const keyOf = (issue: ManifestIssue) =>
  [issue.severity, issue.code, issue.message, issue.file ?? "", issue.path ?? ""].join("\u0000");

/**
 * The registry's issues from the last save or the page load (#142), less those 011's live checks
 * already list, so each problem shows once.
 */
export const savedOnly = (
  live: readonly ManifestIssue[],
  saved: readonly ManifestIssue[],
): ManifestIssue[] => {
  const seen = new Set(live.map(keyOf));
  return saved.filter((issue) => {
    const key = keyOf(issue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Said above the registry's issues while the files differ from what they checked (#142). */
export const AS_OF_SAVE = "As of your last save: the registry's checks run again when you save.";

/** One file's problems: 011's live ones, and the registry's from the last save. */
export type FileProblems = { live: ManifestIssue[]; saved: ManifestIssue[] };

/**
 * Everything the editor shows (#142): the registry's issues next to 011's, each once; all of them,
 * for the count; each file's, for the tree, where one about a file that
 * isn't there (a missing SKILL.md) belongs to ronne.yaml, which names it; and the label that sets
 * the registry's apart while the files differ from what they checked.
 */
export const editorProblems = (
  live: readonly ManifestIssue[],
  checked: readonly ManifestIssue[],
  { paths, dirty, readOnly }: { paths: readonly string[]; dirty: boolean; readOnly: boolean },
) => {
  const saved = savedOnly(live, checked);
  const here = new Set(paths);
  const byFile = new Map<string, FileProblems>();
  const add = (issue: ManifestIssue, side: keyof FileProblems) => {
    const path = issue.file && here.has(issue.file) ? issue.file : MANIFEST_PATH;
    const entry = byFile.get(path) ?? { live: [], saved: [] };
    entry[side].push(issue);
    byFile.set(path, entry);
  };
  for (const issue of live) add(issue, "live");
  for (const issue of saved) add(issue, "saved");
  return {
    saved,
    all: [...live, ...saved],
    byFile,
    savedLabel: dirty && !readOnly && saved.length > 0 ? AS_OF_SAVE : undefined,
  };
};
