/**
 * SkillSpector's JSON report, checked and cut down to what Ronne keeps (feature 135).
 * The report is untrusted: it quotes item content. Only known fields survive, strings are cut,
 * and the findings are capped.
 */

export const SKILL_SCAN_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type SkillScanSeverity = (typeof SKILL_SCAN_SEVERITIES)[number];

export const SKILL_SCAN_RECOMMENDATIONS = ["SAFE", "CAUTION", "DO_NOT_INSTALL"] as const;
export type SkillScanRecommendation = (typeof SKILL_SCAN_RECOMMENDATIONS)[number];

/** At most this many findings are kept, most severe first; the rest are counted. */
export const SKILL_SCAN_MAX_FINDINGS = 200;
/** Every kept string is cut to this many characters. */
export const SKILL_SCAN_MAX_TEXT = 500;
/** The longest scanner version kept (a version, not text). */
export const SKILL_SCAN_VERSION_MAX = 64;

export type SkillScanFinding = {
  /** SkillSpector's rule id, such as `P2` or `AST8`. */
  rule: string;
  category: string;
  severity: SkillScanSeverity;
  /** 0 to 1, when the report gives one. */
  confidence: number | null;
  /** What was found, in SkillSpector's words ("Hidden Instructions"). */
  title: string;
  explanation: string | null;
  /** How to fix it, in SkillSpector's words (137); null when the report gives none. */
  remediation: string | null;
  /** The file inside the item, relative; null when the report names none or a path we refuse. */
  file: string | null;
  line: number | null;
};

export type SkillScanResult = {
  scanner: "skillspector";
  scannerVersion: string;
  /** What ran: `semantic` only when the LLM analysis was asked for and did run. */
  analysis: "static" | "semantic";
  /** True when semantic analysis was asked for but the LLM wasn't available: a static result. */
  llmUnavailable: boolean;
  /** 0 to 100. */
  score: number;
  severity: SkillScanSeverity;
  recommendation: SkillScanRecommendation;
  /** False when SkillSpector says some files were only partly analysed, or not at all. */
  complete: boolean;
  findings: SkillScanFinding[];
  /** Findings left out by the cap. */
  findingsOmitted: number;
};

export type SkillScanParse = { ok: true; result: SkillScanResult } | { ok: false; problem: string };

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

// Controls but tab and newline (Cc), every format character (Cf: the soft hyphen, zero-width and
// bidirectional marks, overrides and isolates, word joiners, the BOM, interlinear annotations, the
// tag characters used to hide text), every default-ignorable code point (what renders as nothing,
// assigned or not: variation selectors, fillers, U+034F, the reserved tag and ignorable ranges),
// line and paragraph separators, and lone surrogates (half pairs): anything that could make a
// finding read differently from what it says. Written as escapes, never as the characters.
const UNSAFE_CHARACTERS =
  /(?![\t\n])[\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}\p{Zl}\p{Zp}]/gu;

/** Cleaned and cut to `SKILL_SCAN_MAX_TEXT` characters (code points, so no half pairs). */
const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const clean = value.replace(UNSAFE_CHARACTERS, "").trim();
  if (clean.length === 0) return null;
  const points = Array.from(clean);
  return points.length > SKILL_SCAN_MAX_TEXT
    ? `${points.slice(0, SKILL_SCAN_MAX_TEXT - 1).join("")}…`
    : clean;
};

/** A relative path inside the item, or null for anything that could point outside it. */
const relativePath = (value: unknown): string | null => {
  // Too long to keep whole: cut, it would no longer name a file in the item.
  if (typeof value === "string" && Array.from(value).length > SKILL_SCAN_MAX_TEXT) return null;
  const path = text(value);
  if (!path) return null;
  if (path.startsWith("/") || path.startsWith("\\") || path.startsWith("~")) return null;
  // A scheme (`file:`, `https:`) or a drive letter (`C:`): not a path inside the item.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  if (path.split(/[\\/]/).includes("..")) return null;
  return path;
};

/** The largest line number kept: what an INTEGER column holds on every database. */
const MAX_LINE = 2_147_483_647;

const positiveInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_LINE
    ? value
    : null;

const RANK: Record<SkillScanSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const byConcern = (a: SkillScanFinding, b: SkillScanFinding) =>
  RANK[a.severity] - RANK[b.severity] ||
  (a.file ?? "").localeCompare(b.file ?? "") ||
  (a.line ?? 0) - (b.line ?? 0) ||
  a.rule.localeCompare(b.rule);

const finding = (issue: unknown, index: number): SkillScanFinding | string => {
  if (!isObject(issue)) return `issue ${index} is not an object`;
  const rule = text(issue.id);
  if (!rule) return `issue ${index} has no id`;
  if (!oneOf(SKILL_SCAN_SEVERITIES, issue.severity)) {
    return `issue ${index} has an unknown severity`;
  }
  const category = text(issue.category) ?? rule;
  const location = isObject(issue.location) ? issue.location : {};
  const confidence =
    typeof issue.confidence === "number" && issue.confidence >= 0 && issue.confidence <= 1
      ? issue.confidence
      : null;
  return {
    rule,
    category,
    severity: issue.severity,
    confidence,
    title: text(issue.pattern) ?? category,
    explanation: text(issue.explanation),
    remediation: text(issue.remediation),
    file: relativePath(location.file),
    line: positiveInteger(location.start_line),
  };
};

/**
 * Parses the stdout of `skillspector scan <dir> --format json`, with `--no-llm` unless `semantic`.
 * Refuses a report that isn't one, or whose `llm_requested` differs from what Ronne asked for: a
 * static scan must never have used an LLM.
 */
export const parseSkillScan = (
  stdout: string,
  options: { semantic?: boolean } = {},
): SkillScanParse => {
  const semantic = options.semantic === true;
  let report: unknown;
  try {
    report = JSON.parse(stdout);
  } catch {
    return { ok: false, problem: "not JSON" };
  }
  if (!isObject(report)) return { ok: false, problem: "not an object" };

  const risk = report.risk_assessment;
  if (!isObject(risk)) return { ok: false, problem: "no risk_assessment" };
  const { score, severity, recommendation } = risk;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) {
    return { ok: false, problem: "score is not 0 to 100" };
  }
  if (!oneOf(SKILL_SCAN_SEVERITIES, severity)) return { ok: false, problem: "unknown severity" };
  if (!oneOf(SKILL_SCAN_RECOMMENDATIONS, recommendation)) {
    return { ok: false, problem: "unknown recommendation" };
  }

  const metadata = isObject(report.metadata) ? report.metadata : {};
  if (metadata.llm_requested !== semantic) {
    return { ok: false, problem: semantic ? "not a semantic scan" : "not a static scan" };
  }
  const llmRan = semantic && metadata.llm_available === true && metadata.llm_error == null;
  const scannerVersion = text(metadata.skillspector_version);
  if (!scannerVersion) return { ok: false, problem: "no skillspector_version" };
  // It's stored in a 64-character column.
  if (Array.from(scannerVersion).length > SKILL_SCAN_VERSION_MAX) {
    return { ok: false, problem: "skillspector_version is too long" };
  }

  if (!Array.isArray(report.issues)) return { ok: false, problem: "no issues list" };
  const findings: SkillScanFinding[] = [];
  for (const [index, issue] of report.issues.entries()) {
    const parsed = finding(issue, index);
    if (typeof parsed === "string") return { ok: false, problem: parsed };
    findings.push(parsed);
  }
  findings.sort(byConcern);

  const completeness = isObject(report.analysis_completeness) ? report.analysis_completeness : {};
  return {
    ok: true,
    result: {
      scanner: "skillspector",
      scannerVersion,
      analysis: llmRan ? "semantic" : "static",
      llmUnavailable: semantic && !llmRan,
      // A whole number, as it's stored.
      score: Math.round(score),
      severity,
      recommendation,
      complete: completeness.is_complete === true,
      findings: findings.slice(0, SKILL_SCAN_MAX_FINDINGS),
      findingsOmitted: Math.max(0, findings.length - SKILL_SCAN_MAX_FINDINGS),
    },
  };
};
