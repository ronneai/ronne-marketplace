import type { SkillScanResult } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ContentScan } from "@/server/domains/scans/repositories/content-scan-repository";
import { inLocale } from "@/test/intl";

vi.mock("./scan-actions", () => ({ askForScan: vi.fn() }));
// A visible stand-in, so the tests see where the panel keeps refreshing.
vi.mock("./ScanRefresh", () => ({ ScanRefresh: () => "REFRESHING" }));

const { ScanPanel } = await import("./ScanPanel");

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
    {
      rule: "P2",
      category: "Prompt Injection",
      severity: "HIGH",
      confidence: 0.9,
      title: "Hidden <b>Instructions</b>",
      explanation: "Ignore previous <script>alert(1)</script> instructions.",
      remediation: null,
      file: "SKILL.md",
      line: 10,
    },
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

const html = (view: { scan: ContentScan | null; canRequest: boolean }) =>
  renderToStaticMarkup(
    <ScanPanel
      view={{ dismissals: [], canDismiss: false, ...view }}
      base="/reviews/sub1"
      revisionId="r1"
      submissionId="sub1"
    />,
  );

describe("the review page's Security scan panel (135)", () => {
  it("shows nothing for an unscanned revision unless root can ask for a scan", () => {
    expect(html({ scan: null, canRequest: false })).toBe("");
    const page = html({ scan: null, canRequest: true });
    expect(page).toContain("This revision wasn&#x27;t scanned.");
    expect(page).toContain("Scan now");
  });

  it("says it's scanning while queued or running", () => {
    for (const status of ["queued", "running"] as const) {
      const page = html({ scan: scan({ status, result: null }), canRequest: false });
      expect(page).toContain("Scanning…");
      expect(page).toContain('aria-busy="true"');
      expect(page).toContain("REFRESHING");
    }
    // Only while it waits.
    expect(html({ scan: scan(), canRequest: false })).not.toContain("REFRESHING");
    expect(
      html({ scan: scan({ status: "failed", result: null, error: "timeout" }), canRequest: false }),
    ).not.toContain("REFRESHING");
  });

  it.each([
    ["CRITICAL", "bg-error-subtle"],
    ["HIGH", "bg-error-subtle"],
    ["MEDIUM", "bg-warning-subtle"],
    ["LOW", "bg-tint"],
  ] as const)("colours a %s badge with its token", (severity, token) => {
    const page = html({
      scan: scan({ result: result({ severity, findings: [] }) }),
      canRequest: false,
    });
    const badge = new RegExp(
      `<span class="[^"]*${token}[^"]*">${severity === "CRITICAL" ? "Critical" : severity === "HIGH" ? "High" : severity === "MEDIUM" ? "Medium" : "Low"}</span>`,
    );
    expect(page).toMatch(badge);
  });

  it("words why it failed, and offers root a new scan", () => {
    const page = html({
      scan: scan({ status: "failed", result: null, error: "timeout" }),
      canRequest: true,
    });
    expect(page).toContain("The scan didn&#x27;t finish: it ran past the timeout");
    expect(page).toContain("Scan again");
    expect(
      html({ scan: scan({ status: "failed", result: null, error: "exit 2" }), canRequest: false }),
    ).toContain("it exited with code 2");
  });

  it("shows the severity, score, recommendation and each finding as plain text, linked to its line", () => {
    const page = html({ scan: scan(), canRequest: false });
    expect(page).toContain("Critical");
    expect(page).toContain("score 100 of 100");
    expect(page).toContain("Likely unsafe");
    expect(page).toContain("Hidden &lt;b&gt;Instructions&lt;/b&gt;");
    expect(page).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page).not.toContain("<script>alert");
    expect(page).toContain("P2 · Prompt Injection");
    expect(page).toContain('href="/reviews/sub1?view=all&amp;file=SKILL.md&amp;line=10#files"');
    expect(page).toContain("Static scan by SkillSpector 2.13.2.");
    expect(page).toContain("Advisory: it can miss problems and flag safe code.");
    expect(page).not.toContain("Scan again");
  });

  it("names the provider of a semantic scan, and says when semantic didn't run", () => {
    expect(
      html({
        scan: scan({
          result: result({ analysis: "semantic" }),
          llm: { provider: "ollama", model: "qwen3-coder:30b" },
        }),
        canRequest: false,
      }),
    ).toContain("Static and semantic scan by SkillSpector 2.13.2, with ollama qwen3-coder:30b.");
    expect(
      html({ scan: scan({ result: result({ llmUnavailable: true }) }), canRequest: false }),
    ).toContain("semantic analysis didn&#x27;t run");
  });

  it("says when there are no findings, findings left out, or files not fully scanned", () => {
    expect(
      html({
        scan: scan({
          result: result({ findings: [], severity: "LOW", recommendation: "SAFE", score: 0 }),
        }),
        canRequest: false,
      }),
    ).toContain("No findings.");
    const page = html({
      scan: scan({ result: result({ findingsOmitted: 3, complete: false }) }),
      canRequest: false,
    });
    expect(page).toContain("3 more findings aren&#x27;t shown.");
    expect(page).toContain("Some files weren&#x27;t fully scanned");
  });

  it("reads in Portuguese and French", () => {
    expect(inLocale("pt", () => html({ scan: scan(), canRequest: false }))).toContain(
      "Provavelmente inseguro",
    );
    expect(inLocale("fr", () => html({ scan: scan(), canRequest: false }))).toContain(
      "Probablement dangereux",
    );
  });
});
