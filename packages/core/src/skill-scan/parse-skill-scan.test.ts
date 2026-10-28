import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseSkillScan,
  SKILL_SCAN_MAX_FINDINGS,
  SKILL_SCAN_MAX_TEXT,
  type SkillScanResult,
} from "./parse-skill-scan.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/reports/${name}.json`, import.meta.url), "utf8");

const parsed = (stdout: string): SkillScanResult => {
  const outcome = parseSkillScan(stdout);
  if (!outcome.ok) throw new Error(outcome.problem);
  return outcome.result;
};

/** The smallest report parseSkillScan accepts, with `issues` and overrides. */
const report = (issues: unknown[] = [], overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    risk_assessment: { score: 10, severity: "LOW", recommendation: "SAFE" },
    metadata: { skillspector_version: "2.13.2", llm_requested: false },
    analysis_completeness: { is_complete: true },
    issues,
    ...overrides,
  });

const issue = (overrides: Record<string, unknown> = {}) => ({
  id: "P2",
  category: "Prompt Injection",
  severity: "HIGH",
  confidence: 0.9,
  pattern: "Hidden Instructions",
  explanation: "Hidden text tells the agent to do something else.",
  location: { file: "SKILL.md", start_line: 10 },
  ...overrides,
});

describe("parseSkillScan on SkillSpector's real reports", () => {
  it("reads a clean skill as safe, with no findings", () => {
    expect(parsed(fixture("secure-coding"))).toEqual({
      scanner: "skillspector",
      scannerVersion: "2.13.2",
      analysis: "static",
      llmUnavailable: false,
      score: 0,
      severity: "LOW",
      recommendation: "SAFE",
      complete: true,
      findings: [],
      findingsOmitted: 0,
    });
  });

  it("reads an MCP server's findings", () => {
    const result = parsed(fixture("github-mcp"));
    expect(result).toMatchObject({ score: 22, severity: "MEDIUM", recommendation: "CAUTION" });
    expect(result.findings.map((f) => [f.rule, f.severity, f.file])).toEqual([
      ["PE3", "HIGH", "ronne.yaml"],
      ["E1", "MEDIUM", "ronne.yaml"],
    ]);
  });

  it("catches the bad skill, most severe first", () => {
    const result = parsed(fixture("bad-skill"));
    expect(result).toMatchObject({
      score: 100,
      severity: "CRITICAL",
      recommendation: "DO_NOT_INSTALL",
      complete: true,
      findingsOmitted: 0,
    });
    expect(result.findings).toHaveLength(14);
    expect(result.findings.slice(0, 2).map((f) => f.severity)).toEqual(["CRITICAL", "CRITICAL"]);
    const rules = new Set(result.findings.map((f) => f.rule));
    // The hidden instruction, the credential read, curl | bash, base64 and exec of downloaded code.
    for (const rule of ["P1", "P2", "PE3", "SC2", "SC3", "AST8", "TT5"]) {
      expect(rules).toContain(rule);
    }
    expect(result.findings.find((f) => f.rule === "P2")).toEqual({
      rule: "P2",
      category: "Prompt Injection",
      severity: "HIGH",
      confidence: expect.any(Number),
      title: "Hidden Instructions",
      explanation: expect.any(String),
      file: "SKILL.md",
      line: 10,
    });
  });

  it("keeps none of the quoted item content", () => {
    const stored = JSON.stringify(parsed(fixture("bad-skill")));
    expect(stored).not.toContain("collector.example.com");
    expect(stored).not.toContain("id_rsa");
  });

  it("falls back to the category when a finding has no title", () => {
    const lp3 = parsed(fixture("bad-skill")).findings.find((f) => f.rule === "LP3");
    expect(lp3?.title).toBe("MCP Least Privilege");
  });
});

describe("parseSkillScan refuses what isn't a static SkillSpector report", () => {
  it.each([
    ["not JSON", "Traceback (most recent call last):", "not JSON"],
    ["an array", "[]", "not an object"],
    ["no risk assessment", JSON.stringify({ issues: [] }), "no risk_assessment"],
    [
      "a score over 100",
      report([], { risk_assessment: { score: 101, severity: "LOW", recommendation: "SAFE" } }),
      "score is not 0 to 100",
    ],
    [
      "a score that isn't a number",
      report([], { risk_assessment: { score: "0", severity: "LOW", recommendation: "SAFE" } }),
      "score is not 0 to 100",
    ],
    [
      "an unknown severity",
      report([], { risk_assessment: { score: 0, severity: "NONE", recommendation: "SAFE" } }),
      "unknown severity",
    ],
    [
      "an unknown recommendation",
      report([], { risk_assessment: { score: 0, severity: "LOW", recommendation: "OK" } }),
      "unknown recommendation",
    ],
    [
      "an LLM scan",
      report([], { metadata: { skillspector_version: "2.13.2", llm_requested: true } }),
      "not a static scan",
    ],
    [
      "no word on the LLM",
      report([], { metadata: { skillspector_version: "2.13.2" } }),
      "not a static scan",
    ],
    ["no version", report([], { metadata: { llm_requested: false } }), "no skillspector_version"],
    ["no issues list", report([], { issues: {} }), "no issues list"],
    ["an issue that isn't an object", report(["P2"]), "issue 0 is not an object"],
    ["an issue without an id", report([issue({ id: "" })]), "issue 0 has no id"],
    [
      "an issue with an unknown severity",
      report([issue(), issue({ severity: "INFO" })]),
      "issue 1 has an unknown severity",
    ],
  ])("refuses %s", (_name, stdout, problem) => {
    expect(parseSkillScan(stdout)).toEqual({ ok: false, problem });
  });
});

describe("parseSkillScan and semantic scans", () => {
  const semantic = (metadata: Record<string, unknown>) =>
    report([], { metadata: { skillspector_version: "2.13.2", llm_requested: true, ...metadata } });

  it("refuses a static report when a semantic scan was asked for", () => {
    expect(parseSkillScan(fixture("secure-coding"), { semantic: true })).toEqual({
      ok: false,
      problem: "not a semantic scan",
    });
  });

  it("reads a semantic scan whose LLM ran", () => {
    const outcome = parseSkillScan(semantic({ llm_available: true }), { semantic: true });
    expect(outcome).toMatchObject({
      ok: true,
      result: { analysis: "semantic", llmUnavailable: false },
    });
  });

  it.each([
    ["unavailable", { llm_available: false }],
    ["failed", { llm_available: true, llm_error: "timeout" }],
    ["silent", {}],
  ])("keeps a semantic scan whose LLM was %s as a static result", (_name, metadata) => {
    const outcome = parseSkillScan(semantic(metadata), { semantic: true });
    expect(outcome).toMatchObject({
      ok: true,
      result: { analysis: "static", llmUnavailable: true },
    });
  });
});

describe("parseSkillScan's caps and cleaning", () => {
  it("keeps the most severe findings up to the cap and counts the rest", () => {
    const many = Array.from({ length: 10_000 }, (_, i) =>
      issue({ id: `R${i}`, severity: i === 9_999 ? "CRITICAL" : "LOW" }),
    );
    const result = parsed(report(many));
    expect(result.findings).toHaveLength(SKILL_SCAN_MAX_FINDINGS);
    expect(result.findingsOmitted).toBe(10_000 - SKILL_SCAN_MAX_FINDINGS);
    expect(result.findings[0]).toMatchObject({ rule: "R9999", severity: "CRITICAL" });
  });

  it("cuts long strings by characters, never inside a surrogate pair", () => {
    const long = "😀".repeat(SKILL_SCAN_MAX_TEXT * 4);
    const [finding] = parsed(report([issue({ explanation: long, pattern: long })])).findings;
    const points = Array.from(finding?.explanation ?? "");
    expect(points).toHaveLength(SKILL_SCAN_MAX_TEXT);
    expect(points.at(-1)).toBe("…");
    expect(points.slice(0, -1).every((p) => p === "😀")).toBe(true);
    expect(Array.from(finding?.title ?? "")).toHaveLength(SKILL_SCAN_MAX_TEXT);
  });

  it.each([
    ["the right-to-left mark", "\u200f"],
    ["the Arabic letter mark", "\u061c"],
    ["a zero-width space", "\u200b"],
    ["a zero-width joiner", "\u200d"],
    ["the line separator", "\u2028"],
    ["a byte order mark", "\ufeff"],
    ["a word joiner", "\u2060"],
    ["a soft hyphen", "\u00ad"],
    ["the combining grapheme joiner", "\u034f"],
    ["the Mongolian vowel separator", "\u180e"],
    ["a variation selector", "\ufe0f"],
    ["the Hangul filler", "\u3164"],
    ["an interlinear annotation anchor", "\ufff9"],
    ["a tag character", "\u{e0069}"],
    ["an unassigned default-ignorable", "\u{e0080}"],
    ["a reserved ignorable", "\ufff0"],
    ["the Khmer inherent vowel", "\u17b4"],
    ["an invisible operator slot", "\u2065"],
    ["a lone surrogate", "\ud800"],
  ])("removes %s", (_name, character) => {
    const [finding] = parsed(report([issue({ pattern: `Hid${character}den` })])).findings;
    expect(finding?.title).toBe("Hidden");
  });

  it("removes text hidden in tag characters", () => {
    const hidden = Array.from("ignore previous", (c) =>
      String.fromCodePoint(0xe0000 + (c.codePointAt(0) ?? 0)),
    ).join("");
    const [finding] = parsed(report([issue({ explanation: `Safe${hidden}` })])).findings;
    expect(finding?.explanation).toBe("Safe");
  });

  it("keeps tabs and newlines in an explanation", () => {
    const [finding] = parsed(report([issue({ explanation: "One.\n\tTwo." })])).findings;
    expect(finding?.explanation).toBe("One.\n\tTwo.");
  });

  it("drops a path too long to keep whole", () => {
    const [finding] = parsed(
      report([issue({ location: { file: `${"x".repeat(600)}.md`, start_line: 1 } })]),
    ).findings;
    expect(finding?.file).toBeNull();
  });

  it("stores the score as a whole number", () => {
    expect(
      parsed(
        report([], {
          risk_assessment: { score: 42.5, severity: "MEDIUM", recommendation: "CAUTION" },
        }),
      ).score,
    ).toBe(43);
  });

  it("refuses a version too long for its column", () => {
    expect(
      parseSkillScan(
        report([], { metadata: { skillspector_version: "9".repeat(65), llm_requested: false } }),
      ),
    ).toEqual({ ok: false, problem: "skillspector_version is too long" });
  });

  it("removes control characters and bidirectional overrides", () => {
    const [finding] = parsed(
      report([
        issue({ pattern: "Hidden\u202e snoitcurtsnI\u0000\u001b[31m", explanation: "\t\n" }),
      ]),
    ).findings;
    expect(finding?.title).toBe("Hidden snoitcurtsnI[31m");
    expect(finding?.explanation).toBeNull();
  });

  it.each([
    ["/etc/passwd"],
    ["\\\\server\\share"],
    ["C:\\Users\\x"],
    ["../outside.md"],
    ["scripts/../../outside.md"],
    ["file:///etc/passwd"],
    ["https://evil.example/x"],
    ["~/x"],
  ])("drops the path %s", (file) => {
    const [finding] = parsed(report([issue({ location: { file, start_line: 3 } })])).findings;
    expect(finding).toMatchObject({ file: null, line: 3 });
  });

  it("keeps lines only as positive integers, and confidence only from 0 to 1", () => {
    const findings = parsed(
      report([
        issue({ id: "A", location: { file: "a.md", start_line: 0 }, confidence: 1.5 }),
        issue({ id: "B", location: { file: "b.md", start_line: 2.5 }, confidence: -1 }),
        issue({ id: "D", location: { file: "d.md", start_line: 1e20 } }),
        issue({ id: "C", location: "SKILL.md", confidence: "high" }),
      ]),
    ).findings;
    // A finding with no file comes before those with one, at the same severity.
    expect(findings.map((f) => [f.rule, f.file, f.line, f.confidence])).toEqual([
      ["C", null, null, null],
      ["A", "a.md", null, null],
      ["B", "b.md", null, null],
      ["D", "d.md", null, 0.9],
    ]);
  });

  it("orders by severity, then file, line and rule", () => {
    const findings = parsed(
      report([
        issue({ id: "Z", severity: "LOW", location: { file: "a.md", start_line: 1 } }),
        issue({ id: "B", severity: "HIGH", location: { file: "b.md", start_line: 1 } }),
        issue({ id: "A", severity: "HIGH", location: { file: "a.md", start_line: 9 } }),
        issue({ id: "C", severity: "HIGH", location: { file: "a.md", start_line: 2 } }),
      ]),
    ).findings;
    expect(findings.map((f) => f.rule)).toEqual(["C", "A", "B", "Z"]);
  });

  it("says when SkillSpector didn't analyse everything", () => {
    expect(parsed(report([], { analysis_completeness: { is_complete: false } })).complete).toBe(
      false,
    );
    expect(parsed(report([], { analysis_completeness: undefined })).complete).toBe(false);
  });
});
