import type { SkillScanResult } from "@ronneai/core";

/**
 * What the security scan's card says (137), worked out from the kept result and nothing else: the
 * number of findings, the files they point at, and the findings counted by category.
 */
export type ScanSummary = {
  /** Every finding, those the cap left out included. */
  total: number;
  /** The files the kept findings point at, in the order they first appear. */
  files: string[];
  /** The kept findings by category, the most first, then by name. */
  categories: { category: string; count: number }[];
};

export const summarise = (result: SkillScanResult): ScanSummary => {
  const files: string[] = [];
  const counts = new Map<string, number>();
  for (const finding of result.findings) {
    if (finding.file && !files.includes(finding.file)) files.push(finding.file);
    counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
  }
  const categories = [...counts]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return { total: result.findings.length + result.findingsOmitted, files, categories };
};

/** The JSON a reviewer downloads (137): Ronne's kept copy, never SkillSpector's raw output. */
export const exportReport = (input: {
  item: string;
  revision: number | null;
  scannedAt: Date | string | null;
  result: SkillScanResult;
  llm: { provider: string; model: string | null } | null;
  dismissals: readonly {
    finding: number;
    kind: "false_positive" | "accepted";
    reason: string;
    by: string | null;
    at: Date | string;
  }[];
}): string =>
  `${JSON.stringify(
    {
      item: input.item,
      revision: input.revision,
      scannedAt: input.scannedAt === null ? null : new Date(input.scannedAt).toISOString(),
      scanner: `${input.result.scanner} ${input.result.scannerVersion}`,
      analysis: input.result.analysis,
      ...(input.llm ? { llm: input.llm } : {}),
      score: input.result.score,
      severity: input.result.severity,
      recommendation: input.result.recommendation,
      complete: input.result.complete,
      findings: input.result.findings,
      findingsOmitted: input.result.findingsOmitted,
      // Each reviewer's mark (137): a false positive, or an accepted risk.
      marks: input.dismissals.map((d) => ({
        finding: d.finding,
        kind: d.kind,
        reason: d.reason,
        by: d.by,
        at: new Date(d.at).toISOString(),
      })),
    },
    null,
    2,
  )}\n`;

/** A file name for the export: the item's name made safe, and the revision. */
export const exportName = (item: string, revision: number | null): string =>
  `${item.replace(/^@/, "").replace(/[^a-z0-9._-]+/gi, "-")}-r${revision ?? 0}-security-scan.json`;

/** A kept finding with its position in the scan, which is how a mark and a link name it. */
export type IndexedFinding = { finding: SkillScanResult["findings"][number]; index: number };

/**
 * What the Security scan tab filters by (137): each `null` is "all", a set the values kept. A set
 * is never empty or complete: `toggleChoice` turns both back into `null`.
 */
export type FindingFilter = {
  categories: ReadonlySet<string> | null;
  severities: ReadonlySet<SkillScanResult["severity"]> | null;
  /** `open`: not marked by a reviewer; `marked`: a false positive or an accepted risk. */
  statuses: ReadonlySet<"open" | "marked"> | null;
};

/**
 * A filter's choice after a value is ticked or unticked; `null` for "all". Unticking the last value
 * or ticking every one leaves "all", so a filter never hides everything and "All" is how both read.
 */
export const toggleChoice = <T extends string>(
  current: ReadonlySet<T> | null,
  all: readonly T[],
  value: T,
): ReadonlySet<T> | null => {
  // From "all", ticking a value narrows to it alone; the options read unticked while "All" is on.
  if (current === null) return new Set([value]);
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next.size === 0 || all.every((v) => next.has(v)) ? null : next;
};

const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

/** The findings the filter keeps, each with its position. */
export const filterFindings = (
  result: SkillScanResult,
  filter: FindingFilter,
  marked: ReadonlySet<number>,
): IndexedFinding[] =>
  result.findings
    .map((finding, index) => ({ finding, index }))
    .filter(
      ({ finding, index }) =>
        (filter.categories === null || filter.categories.has(finding.category)) &&
        (filter.severities === null || filter.severities.has(finding.severity)) &&
        (filter.statuses === null || filter.statuses.has(marked.has(index) ? "marked" : "open")),
    );

/**
 * The findings by file (137), as a code-quality tool's issue list: files by path, those that name
 * none last; in each, by line (none first: the file as a whole), then the most severe first.
 */
export const groupByFile = (
  findings: readonly IndexedFinding[],
): { file: string | null; findings: IndexedFinding[] }[] => {
  const groups = new Map<string | null, IndexedFinding[]>();
  for (const item of findings) {
    const list = groups.get(item.finding.file) ?? [];
    list.push(item);
    groups.set(item.finding.file, list);
  }
  return [...groups]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
    .map(([file, list]) => ({
      file,
      findings: list.sort(
        (a, b) =>
          (a.finding.line ?? 0) - (b.finding.line ?? 0) ||
          SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] ||
          a.index - b.index,
      ),
    }));
};
