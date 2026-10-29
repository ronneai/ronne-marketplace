import type { SkillScanFinding, SkillScanResult } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReviewScan } from "@/server/domains/scans/actions/scans";
import type { ContentScan } from "@/server/domains/scans/repositories/content-scan-repository";
import type { ScanGate } from "@/server/domains/submissions/models/scan-gate";
import { inLocale } from "@/test/intl";

vi.mock("./scan-actions", () => ({ markFalsePositive: vi.fn(), restoreFalsePositive: vi.fn() }));
// A visible stand-in, so the tests see where the card keeps refreshing.
vi.mock("./ScanRefresh", () => ({ ScanRefresh: () => "REFRESHING" }));

const { ScanCard } = await import("./ScanCard");
const { ScanFindings } = await import("./ScanFindings");
const { exportName, exportReport, summarise } = await import("./summary");

const finding = (overrides: Partial<SkillScanFinding> = {}): SkillScanFinding => ({
  rule: "P2",
  category: "Prompt Injection",
  severity: "HIGH",
  confidence: 0.9,
  title: "Hidden <b>Instructions</b>",
  explanation: "Ignore previous <script>alert(1)</script> instructions.",
  remediation: "Remove the hidden text.",
  file: "SKILL.md",
  line: 10,
  ...overrides,
});

const result = (overrides: Partial<SkillScanResult> = {}): SkillScanResult => ({
  scanner: "skillspector",
  scannerVersion: "2.13.2",
  analysis: "static",
  llmUnavailable: false,
  score: 100,
  severity: "CRITICAL",
  recommendation: "DO_NOT_INSTALL",
  complete: true,
  findings: [
    finding(),
    finding({ rule: "PE3", category: "Credential Access", title: "Credential Access" }),
    finding({ rule: "P1", file: "scripts/sync.py", line: 2 }),
    finding({ rule: "SC2", category: "Supply Chain", file: null, line: null, remediation: null }),
  ],
  findingsOmitted: 0,
  ...overrides,
});

const scan = (overrides: Partial<ContentScan> = {}): ContentScan => ({
  id: "s1",
  revisionId: "r1",
  status: "done",
  attempts: 1,
  result: result(),
  llm: null,
  error: null,
  queuedAt: new Date("2026-10-28T12:00:00Z"),
  startedAt: new Date("2026-10-28T12:00:01Z"),
  finishedAt: new Date("2026-10-28T12:00:05Z"),
  ...overrides,
});

const view = (overrides: Partial<ReviewScan> = {}): ReviewScan => ({
  scan: scan(),
  canRequest: false,
  dismissals: [],
  canDismiss: false,
  ...overrides,
});

const OPEN: ScanGate = { blocked: false, threshold: null };

const card = (
  props: {
    view?: ReviewScan;
    gate?: ScanGate;
    inspectHref?: string | null;
    author?: boolean;
    request?: string;
    override?: string;
  } = {},
) =>
  renderToStaticMarkup(
    <ScanCard
      view={props.view ?? view()}
      gate={props.gate ?? OPEN}
      item="@team/tidy-notes"
      revision={1}
      submissionId="sub1"
      base="/reviews/sub1"
      inspectHref={props.inspectHref === undefined ? "/reviews/sub1?tab=scan" : props.inspectHref}
      author={props.author}
      request={props.request}
      override={props.override}
    />,
  );

describe("summarise (137)", () => {
  it("counts every finding, names the files in order, and sorts categories by count then name", () => {
    expect(summarise(result({ findingsOmitted: 3 }))).toEqual({
      total: 7,
      files: ["SKILL.md", "scripts/sync.py"],
      categories: [
        { category: "Prompt Injection", count: 2 },
        { category: "Credential Access", count: 1 },
        { category: "Supply Chain", count: 1 },
      ],
    });
  });

  it("exports Ronne's kept copy with the false positives, and names the file safely", () => {
    const json = JSON.parse(
      exportReport({
        item: "@team/tidy-notes",
        revision: 2,
        scannedAt: new Date("2026-10-28T12:00:05Z"),
        result: result(),
        llm: null,
        dismissals: [
          { finding: 0, reason: "Docs.", by: "Mo", at: new Date("2026-10-28T13:00:00Z") },
        ],
      }),
    );
    expect(json).toMatchObject({
      item: "@team/tidy-notes",
      revision: 2,
      scannedAt: "2026-10-28T12:00:05.000Z",
      scanner: "skillspector 2.13.2",
      score: 100,
      findings: result().findings,
      falsePositives: [{ finding: 0, reason: "Docs.", by: "Mo", at: "2026-10-28T13:00:00.000Z" }],
    });
    expect(json).not.toHaveProperty("llm");
    expect(exportName("@team/tidy notes", 2)).toBe("team-tidy-notes-r2-security-scan.json");
  });
});

describe("the security scan's card (137)", () => {
  it("sums up a finished scan: recommendation, severity, findings by category, the score", () => {
    const html = card();
    expect(html).toContain(">Likely unsafe<");
    expect(html).toContain(">Critical<");
    expect(html).toContain("SkillSpector 2.13.2");
    expect(html).toContain("4 findings");
    expect(html).toContain("in 2 files:");
    expect(html).toContain('<code class="font-mono">SKILL.md</code>');
    expect(html).toMatch(/Prompt Injection <strong>2<\/strong>/);
    expect(html).toMatch(/>100<span[^>]*> of 100</);
    expect(html).toContain('href="/reviews/sub1?tab=scan"');
    expect(html).toContain(">Inspect 4 findings<");
    expect(html).toContain("Static scan by SkillSpector 2.13.2.");
    // The red frame for Likely unsafe; plain text, never HTML.
    expect(html).toContain("border-error/40");
    expect(html).not.toContain("<b>");
  });

  it("names three files at most, then how many more", () => {
    const many = ["a.md", "b.md", "c.md", "d.md", "e.md"].map((file) => finding({ file }));
    expect(card({ view: view({ scan: scan({ result: result({ findings: many }) }) }) })).toContain(
      "and 2 more",
    );
  });

  it("says a clean scan is clean, in a plain frame, with nothing to inspect", () => {
    const html = card({
      view: view({
        scan: scan({
          result: result({ findings: [], score: 0, recommendation: "SAFE", severity: "LOW" }),
        }),
      }),
    });
    expect(html).toContain("No findings");
    expect(html).toContain(">Looks safe<");
    expect(html).toContain("border-hairline");
    expect(html).not.toContain("Inspect");
  });

  it("says what blocks approval, or that the scan is under the threshold", () => {
    expect(card({ gate: { blocked: false, threshold: 70 } })).toContain("Under the threshold, 70.");
    const blocked = card({
      gate: { blocked: true, by: "score", score: 100, threshold: 70 },
      override: "OVERRIDE",
    });
    expect(blocked).toContain("ERR:");
    expect(blocked).toContain(
      "Approval is blocked: the security scan&#x27;s score, 100, is at or above the threshold, 70.",
    );
    expect(blocked).toContain("OVERRIDE");
    // The author is told what to do.
    expect(
      card({ gate: { blocked: true, by: "score", score: 100, threshold: 70 }, author: true }),
    ).toContain("Change the files and send it again.");
  });

  it("keeps 135's waiting, failed and not-scanned states, with the gate's word and root's actions", () => {
    const waiting = card({
      view: view({ scan: scan({ status: "queued", result: null }) }),
      gate: { blocked: true, by: "pending", score: null, threshold: 70 },
    });
    expect(waiting).toContain("Scanning…");
    expect(waiting).toContain("REFRESHING");
    expect(waiting).toContain("WARN:");
    expect(waiting).toContain("Approval waits for the security scan to finish.");
    const failed = card({
      view: view({ scan: scan({ status: "failed", result: null, error: "timeout" }) }),
      request: "SCAN AGAIN",
    });
    expect(failed).toContain("it ran past the timeout");
    expect(failed).toContain("SCAN AGAIN");
    expect(card({ view: view({ scan: null }) })).toBe("");
    expect(
      renderToStaticMarkup(
        <ScanCard
          view={view({ scan: null })}
          gate={OPEN}
          item="@team/tidy-notes"
          revision={1}
          submissionId="sub1"
          base="/reviews/sub1"
          inspectHref="/reviews/sub1?tab=scan"
          always
        />,
      ),
    ).toContain("This revision wasn&#x27;t scanned.");
    expect(
      card({
        view: view({ scan: null }),
        gate: { blocked: true, by: "none", score: null, threshold: 70 },
      }),
    ).toContain("This revision wasn&#x27;t scanned.");
  });

  it("shows the findings under the card where there are no tabs: the author's page", () => {
    const html = card({ inspectHref: null, author: true });
    expect(html).not.toContain("Inspect 4 findings");
    expect(html).toContain("How to fix:");
    expect(html).toContain("Remove the hidden text.");
  });

  it("is in Portuguese and French", () => {
    expect(inLocale("pt", () => card())).toContain(">Provavelmente inseguro<");
    expect(inLocale("pt", () => card())).toContain("Ver 4 achados");
    expect(inLocale("fr", () => card())).toContain("Examiner 4 résultats");
  });
});

describe("the security scan's findings (137)", () => {
  const findings = (
    props: {
      canDismiss?: boolean;
      base?: string | null;
      dismissals?: ReviewScan["dismissals"];
    } = {},
  ) =>
    renderToStaticMarkup(
      <ScanFindings
        item="@team/tidy-notes"
        revision={1}
        scan={{ id: "s1", finishedAt: new Date("2026-10-28T12:00:05Z"), llm: null }}
        result={result()}
        dismissals={props.dismissals ?? []}
        canDismiss={props.canDismiss ?? false}
        submissionId="sub1"
        base={props.base === undefined ? "/reviews/sub1" : props.base}
      />,
    );

  it("lists every finding with its rule, explanation and fix, and filters by category", () => {
    const html = findings();
    expect(html).toContain(">All (4)<");
    expect(html).toContain(">Prompt Injection (2)<");
    expect(html).toContain("Showing 4 of 4");
    expect(html).toContain("P2 · Prompt Injection");
    expect(html).toContain("Remove the hidden text.");
    expect(html).toContain("Export report (JSON)");
    expect(html).not.toContain("<script>");
  });

  it("links a finding's file and line into the Files tab, or shows it as text without one", () => {
    expect(findings()).toContain(
      'href="/reviews/sub1?tab=files&amp;view=all&amp;file=SKILL.md&amp;line=10#files"',
    );
    const plain = findings({ base: null });
    expect(plain).toContain(">SKILL.md:10<");
    expect(plain).not.toContain("tab=files");
  });

  it("offers Mark false positive to a reviewer only, and shows a mark with its reason and Restore", () => {
    expect(findings()).not.toContain("Mark false positive");
    expect(findings({ canDismiss: true })).toContain("Mark false positive");
    const marked = findings({
      canDismiss: true,
      dismissals: [
        { finding: 0, reason: "Docs <i>only</i>.", by: { id: "m", name: "Mo" }, at: new Date() },
      ],
    });
    expect(marked).toContain("Marked a false positive by Mo");
    expect(marked).toContain("Docs &lt;i&gt;only&lt;/i&gt;.");
    expect(marked).toContain(">Restore<");
    const read = findings({
      dismissals: [{ finding: 0, reason: "Docs.", by: { id: "m", name: null }, at: new Date() }],
    });
    expect(read).toContain("Marked a false positive by a former user");
    expect(read).not.toContain(">Restore<");
  });
});
