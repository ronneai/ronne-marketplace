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
  dismissals: readonly { finding: number; reason: string; by: string | null; at: Date | string }[];
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
      falsePositives: input.dismissals.map((d) => ({
        finding: d.finding,
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
