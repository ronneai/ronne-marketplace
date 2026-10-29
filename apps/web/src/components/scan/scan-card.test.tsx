import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillScanFinding, SkillScanResult } from "@ronneai/core";
import { parseSkillScan } from "@ronneai/core";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReviewScan } from "@/server/domains/scans/actions/scans";
import type { ContentScan } from "@/server/domains/scans/repositories/content-scan-repository";
import type { ScanGate } from "@/server/domains/submissions/models/scan-gate";
import { inLocale } from "@/test/intl";
import author from "../../../messages/en/author.json";

vi.mock("./scan-actions", () => ({ markFalsePositive: vi.fn(), restoreFalsePositive: vi.fn() }));
// A visible stand-in, so the tests see where the card keeps refreshing.
vi.mock("./ScanRefresh", () => ({ ScanRefresh: () => "REFRESHING" }));

const { ScanCard } = await import("./ScanCard");
const { ScanFindings } = await import("./ScanFindings");
const { ASK_FIX_MAX_LENGTH, askFixMessage, chosenFindings, findingLink } = await import(
  "./ScanFindings"
);
const { REVIEW_MESSAGE_MAX_LENGTH } = await import(
  "@/server/domains/submissions/exceptions/errors"
);
const { exportName, exportReport, filterFindings, groupByFile, summarise } = await import(
  "./summary"
);

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

  it("exports Ronne's kept copy with each mark and its kind, and names the file safely", () => {
    const json = JSON.parse(
      exportReport({
        item: "@team/tidy-notes",
        revision: 2,
        scannedAt: new Date("2026-10-28T12:00:05Z"),
        result: result(),
        llm: null,
        dismissals: [
          {
            finding: 0,
            kind: "false_positive",
            reason: "Docs.",
            by: "Mo",
            at: new Date("2026-10-28T13:00:00Z"),
          },
          {
            finding: 1,
            kind: "accepted",
            reason: "Known.",
            by: "Mo",
            at: new Date("2026-10-28T13:00:00Z"),
          },
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
      marks: [
        {
          finding: 0,
          kind: "false_positive",
          reason: "Docs.",
          by: "Mo",
          at: "2026-10-28T13:00:00.000Z",
        },
        {
          finding: 1,
          kind: "accepted",
          reason: "Known.",
          by: "Mo",
          at: "2026-10-28T13:00:00.000Z",
        },
      ],
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

describe("the findings, by file (137)", () => {
  const marks = (...indexes: number[]) => new Set(indexes);
  const none = { category: null, severity: null, status: null };

  it("groups by file, files by path and none last, and sorts by line, then the most severe", () => {
    const findings = [
      finding({ rule: "A", file: "b.md", line: 9, severity: "LOW" }),
      finding({ rule: "B", file: "a.md", line: 3 }),
      finding({ rule: "C", file: null, line: null }),
      finding({ rule: "D", file: "b.md", line: 2 }),
      finding({ rule: "E", file: "b.md", line: 9, severity: "CRITICAL" }),
    ];
    const groups = groupByFile(filterFindings(result({ findings }), none, marks()));
    expect(groups.map((g) => [g.file, g.findings.map((f) => f.finding.rule)])).toEqual([
      ["a.md", ["B"]],
      ["b.md", ["D", "E", "A"]],
      [null, ["C"]],
    ]);
  });

  it("filters by category, severity and status, keeping each finding's position", () => {
    const r = result();
    expect(
      filterFindings(r, { ...none, category: "Prompt Injection" }, marks()).map((f) => f.index),
    ).toEqual([0, 2]);
    expect(filterFindings(r, { ...none, severity: "HIGH" }, marks()).length).toBe(4);
    const mixed = result({
      findings: [finding({ severity: "LOW" }), finding(), finding({ severity: "CRITICAL" })],
    });
    expect(
      filterFindings(mixed, { ...none, severity: "LOW" }, marks()).map((f) => f.index),
    ).toEqual([0]);
    expect(filterFindings(r, { ...none, severity: "LOW" }, marks())).toEqual([]);
    expect(filterFindings(r, { ...none, status: "marked" }, marks(1)).map((f) => f.index)).toEqual([
      1,
    ]);
    expect(filterFindings(r, { ...none, status: "open" }, marks(1)).map((f) => f.index)).toEqual([
      0, 2, 3,
    ]);
  });

  it("keeps the quote within what a review message may hold, and says how many it left out", () => {
    expect(ASK_FIX_MAX_LENGTH).toBe(REVIEW_MESSAGE_MAX_LENGTH);
    const t = createTranslator({
      locale: "en",
      messages: { scan: author.scan },
      namespace: "scan",
    });
    const many = Array.from({ length: 200 }, (_, i) =>
      finding({ rule: `R${i}`, title: "T".repeat(60), remediation: "F".repeat(150) }),
    );
    const text = askFixMessage(
      t as never,
      result({ findings: many }),
      many.map((_, i) => i),
    );
    expect(text.length).toBeLessThanOrEqual(REVIEW_MESSAGE_MAX_LENGTH - 500);
    // Astral characters count twice in the textarea's maxLength (UTF-16): still within it.
    const astral = Array.from({ length: 200 }, (_, i) =>
      finding({ rule: `R${i}`, title: "\u{1D54F}".repeat(500) }),
    );
    const wide = askFixMessage(
      t as never,
      result({ findings: astral }),
      astral.map((_, i) => i),
    );
    expect(wide.length).toBeLessThanOrEqual(REVIEW_MESSAGE_MAX_LENGTH - 500);
    expect(text).toMatch(/…and \d+ more findings: see the Security scan tab\.$/);
    expect(text).toContain("(R0,");
  });

  it("asks only for the selected findings still open and shown", () => {
    const set = (...i: number[]) => new Set(i);
    // 1 was marked after it was selected; 3 is hidden by a filter.
    expect(chosenFindings(set(3, 0, 1, 2), set(1), set(0, 1, 2))).toEqual([0, 2]);
  });

  it("links to the page at a finding, keeping its tab", () => {
    expect(
      findingLink(
        { origin: "https://ronne.example", pathname: "/reviews/sub1", search: "?tab=scan" },
        3,
      ),
    ).toBe("https://ronne.example/reviews/sub1?tab=scan#finding-3");
  });

  it("quotes the findings for Request changes, in order, with where and how to fix", () => {
    const t = createTranslator({
      locale: "en",
      messages: { scan: author.scan },
      namespace: "scan",
    });
    expect(askFixMessage(t as never, result(), [3, 0])).toBe(
      [
        "Please fix these security scan findings:",
        "",
        "- Hidden <b>Instructions</b> (P2, SKILL.md:10): Remove the hidden text.",
        "- Hidden <b>Instructions</b> (SC2)",
      ].join("\n"),
    );
  });
});

describe("the security scan's findings (137)", () => {
  const findings = (
    props: {
      canDismiss?: boolean;
      base?: string | null;
      dismissals?: ReviewScan["dismissals"];
      askFix?: boolean;
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
        onAskFix={props.askFix ? () => {} : undefined}
      />,
    );

  it("shows each file's findings under its name, with a line column and the filters", () => {
    const html = findings();
    expect(html).toMatch(/aria-label="SKILL.md"/);
    expect(html).toMatch(/aria-label="scripts\/sync.py"/);
    expect(html).toContain("Not in a file");
    expect(html).toContain(">L10<");
    expect(html).toContain(">2 findings<");
    expect(html).toContain(">All (4)<");
    expect(html).toContain(">Prompt Injection (2)<");
    expect(html).toContain(">High (4)<");
    // Only the severities there are: no Critical, Medium or Low chip on an all-High scan.
    expect(html).not.toMatch(/>(Critical|Medium|Low) \(/);
    expect(html).toContain(">Open (4)<");
    expect(html).toContain("Remove the hidden text.");
    expect(html).toContain("Export report (JSON)");
    expect(html).toContain('id="finding-0"');
    expect(html).not.toContain("<script>");
  });

  it("links a line and a file into the Files tab, or shows them as text without one", () => {
    expect(findings()).toContain(
      'href="/reviews/sub1?tab=files&amp;view=all&amp;file=SKILL.md&amp;line=10#files"',
    );
    expect(findings()).toContain(
      'href="/reviews/sub1?tab=files&amp;view=all&amp;file=SKILL.md#files"',
    );
    const plain = findings({ base: null });
    expect(plain).toContain(">L10<");
    expect(plain).not.toContain("tab=files");
  });

  it("gives a reviewer Mark false positive and Accept the risk as icons beside it, and everyone Copy link", () => {
    const viewer = findings();
    expect(viewer).not.toContain("Mark false positive");
    expect(viewer).not.toContain("Accept the risk");
    expect(viewer).toContain("Copy link");
    const reviewer = findings({ canDismiss: true });
    // Icons, named for the finding, with no words beside them (owner, 2026-10-29).
    expect(reviewer).toContain(
      'aria-label="Mark false positive: Hidden &lt;b&gt;Instructions&lt;/b&gt;, SKILL.md:10, finding 1"',
    );
    expect(reviewer).toContain(
      'aria-label="Accept the risk: Hidden &lt;b&gt;Instructions&lt;/b&gt;, SKILL.md:10, finding 1"',
    );
    expect(reviewer).not.toMatch(/>Mark false positive</);
    // The tooltip is only the action (owner, 2026-10-29); the name keeps the finding.
    expect(reviewer).toMatch(/aria-label="Accept the risk: [^"]*" title="Accept the risk"/);
    expect(reviewer).toMatch(/aria-label="Copy link: [^"]*" title="Copy link"/);
    // An open finding's row lights up under the mouse.
    expect(reviewer).toMatch(/<li id="finding-0"[^>]*hover:bg-canvas/);
    // Told apart by colour, tokens only (owner, 2026-10-29): amber accepts, teal asks for a fix.
    const tone = (name: string) =>
      new RegExp(`aria-label="${name}: [^"]*"[^>]*class="([^"]*)"`).exec(reviewer)?.[1] ?? "";
    expect(tone("Accept the risk")).toContain("text-warning-text");
    expect(tone("Mark false positive")).toContain("text-fg");
    expect(tone("Copy link")).toContain("text-muted");
    expect(tone("Accept the risk")).not.toContain("text-muted");
    // They act as buttons: the hand cursor, toned or not.
    expect(tone("Accept the risk")).toContain("cursor-pointer");
    expect(tone("Copy link")).toContain("cursor-pointer");
    // The rule and category sit where the buttons were, at the bottom of the finding.
    expect(reviewer).toMatch(/How to fix:.*?P2 · Prompt Injection/s);
  });

  it("offers Ask the author to fix it, and selecting findings, only where it's given", () => {
    expect(findings()).not.toContain("Ask the author to fix it");
    const html = findings({ askFix: true });
    expect(html).toContain("Ask the author to fix it");
    expect(html).toContain("Select all");
    // Always there, and off with nothing selected (owner, 2026-10-29).
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Ask the author to fix the selected findings</,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Clear the selection</);
    expect(html).toContain(
      'aria-label="Select Hidden &lt;b&gt;Instructions&lt;/b&gt;, SKILL.md:10, finding 1"',
    );
  });

  it("shows a mark's kind, by whom and why, with Restore for a reviewer only", () => {
    const at = new Date();
    const marked = findings({
      canDismiss: true,
      askFix: true,
      dismissals: [
        {
          finding: 0,
          kind: "false_positive",
          reason: "Docs <i>only</i>.",
          by: { id: "m", name: "Mo" },
          at,
        },
        {
          finding: 1,
          kind: "accepted",
          reason: "Reads it on purpose.",
          by: { id: "m", name: null },
          at,
        },
      ],
    });
    expect(marked).toContain(">False positive<");
    expect(marked).toContain("Marked a false positive by Mo");
    expect(marked).toContain("Docs &lt;i&gt;only&lt;/i&gt;.");
    expect(marked).toContain(">Accepted risk<");
    expect(marked).toContain("Risk accepted by a former user");
    expect(marked).toContain(
      'aria-label="Restore: Hidden &lt;b&gt;Instructions&lt;/b&gt;, SKILL.md:10, finding 1"',
    );
    expect(marked).toContain(">Marked (2)<");
    // A marked finding isn't asked about: the two marked ones have no Ask, the others do.
    expect(marked.match(/aria-label="Ask the author to fix it: /g)?.length).toBe(2);
    const read = findings({
      dismissals: [
        { finding: 0, kind: "false_positive", reason: "Docs.", by: { id: "m", name: "Mo" }, at },
      ],
    });
    expect(read).not.toContain('aria-label="Restore: ');
  });

  it("keeps the toolbar when every finding is marked, with all three buttons off", () => {
    const html = findings({
      canDismiss: true,
      askFix: true,
      dismissals: result().findings.map((_, finding) => ({
        finding,
        kind: "false_positive" as const,
        reason: "Fine.",
        by: { id: "m", name: "Mo" },
        at: new Date(),
      })),
    });
    for (const name of [
      "Ask the author to fix the selected findings",
      "Select all",
      "Clear the selection",
    ])
      expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${name}<`));
  });

  it("names every control for its own finding, even two alike at one line (SkillSpector's report)", () => {
    const report = readFileSync(
      join(process.cwd(), "../../packages/core/src/skill-scan/fixtures/reports/bad-skill.json"),
      "utf8",
    );
    const parsed = parseSkillScan(report);
    if (!parsed.ok) throw new Error(parsed.problem);
    const html = renderToStaticMarkup(
      <ScanFindings
        item="@team/bad"
        revision={1}
        scan={{ id: "s1", finishedAt: null, llm: null }}
        result={parsed.result}
        dismissals={[]}
        canDismiss
        submissionId="sub1"
        base="/reviews/sub1"
        onAskFix={() => {}}
      />,
    );
    const names = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(parsed.result.findings.length * 4);
    expect(new Set(names).size).toBe(names.length);
  });

  it("is in Portuguese and French", () => {
    expect(inLocale("pt", () => findings({ canDismiss: true }))).toContain("Aceitar o risco");
    expect(inLocale("fr", () => findings({ canDismiss: true }))).toContain("Accepter le risque");
  });
});
