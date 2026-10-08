import type { ManifestIssue } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/Button";
import { DirtyMark } from "@/components/ui/DirtyMark";
import { FileIssues, IssuesPanel, IssuesSummary, issueCount, issuesTone } from "./IssuesPopover";

const error: ManifestIssue = { severity: "error", code: "x", message: "Broken.", file: "a.md" };
const warning: ManifestIssue = { severity: "warning", code: "y", message: "Odd.", file: "a.md" };

describe("the editor's notifications (owner, 2026-10-01)", () => {
  it("counts and tones issues: red with any error, amber with warnings only, teal with none", () => {
    expect(issueCount([error, error, warning])).toBe("2 errors, 1 warning");
    expect(issueCount([])).toBe("No problems");
    expect([issuesTone([error, warning]), issuesTone([warning]), issuesTone([])]).toEqual([
      "error",
      "warning",
      "ok",
    ]);
  });

  it("shows a file's problems behind an icon in its tone, and nothing without any", () => {
    const html = renderToStaticMarkup(<FileIssues path="a.md" issues={[error]} />);
    expect(html).toContain('aria-label="Show problems: 1 error"');
    expect(html).toContain("text-error-text");
    expect(renderToStaticMarkup(<FileIssues path="a.md" issues={[]} />)).toBe("");
  });

  it("sums them up in a chip with a red hover for errors, and takes extra classes", () => {
    const html = renderToStaticMarkup(<IssuesSummary issues={[error]} className="ml-2" />);
    expect(html).toContain('aria-label="Problems: 1 error"');
    expect(html).toContain("hover:bg-error-subtle");
    expect(html).toContain("ml-2");
    expect(renderToStaticMarkup(<IssuesSummary issues={[warning]} />)).toContain(
      "hover:bg-warning-subtle",
    );
    expect(renderToStaticMarkup(<IssuesSummary issues={[]} />)).toContain("hover:bg-tint");
  });

  it("counts issues from elsewhere, and lists them apart only under their label (#142)", () => {
    const summary = renderToStaticMarkup(<IssuesSummary issues={[]} saved={[error]} />);
    expect(summary).toContain('aria-label="Problems: 1 error"');
    expect(summary).toContain("hover:bg-error-subtle");

    const apart = renderToStaticMarkup(
      <IssuesPanel
        issues={[warning]}
        saved={[error]}
        savedLabel="As of your last save."
        close={() => {}}
      />,
    );
    expect(apart.match(/aria-label="Problems"/g)).toHaveLength(2);
    expect(apart.indexOf("Odd.")).toBeLessThan(apart.indexOf("As of your last save."));
    expect(apart.indexOf("As of your last save.")).toBeLessThan(apart.indexOf("Broken."));
    // With nothing live, no "No problems found" above them.
    expect(
      renderToStaticMarkup(
        <IssuesPanel
          issues={[]}
          saved={[error]}
          savedLabel="As of your last save."
          close={() => {}}
        />,
      ),
    ).not.toContain("No problems found");

    // A file's icon counts them too.
    expect(
      renderToStaticMarkup(<FileIssues path="ronne.yaml" issues={[]} saved={[error]} />),
    ).toContain('aria-label="Show problems: 1 error"');

    const together = renderToStaticMarkup(
      <IssuesPanel issues={[warning]} saved={[error]} close={() => {}} />,
    );
    expect(together.match(/aria-label="Problems"/g)).toHaveLength(1);
    expect(together).toContain("Broken.");
  });

  it("disables a button with its reason, on hover and for screen readers", () => {
    const html = renderToStaticMarkup(<Button disabledReason="Save first.">Submit</Button>);
    expect(html).toMatch(/<span title="Save first\.".*<button[^>]*disabled=""/);
    expect(html).toContain('class="sr-only">Save first.<');
    expect(renderToStaticMarkup(<Button>Submit</Button>)).not.toContain("title=");
  });

  it("marks unsaved changes, with its words and classes as props", () => {
    expect(renderToStaticMarkup(<DirtyMark />)).toContain("<span>Unsaved changes</span>");
    expect(renderToStaticMarkup(<DirtyMark label="Not saved" className="ml-1" />)).toMatch(
      /class="[^"]*ml-1[^"]*".*Not saved/,
    );
  });
});
