import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DependencyMarksIcon, DependencyStatusBadge, markStatus } from "./DependencyMarks";

describe("dependency marks in a list (owner, 2026-10-01)", () => {
  it("shows one amber icon with the count while dependencies are pending", () => {
    const html = renderToStaticMarkup(
      <DependencyMarksIcon
        marks={[
          { kind: "waits", dependency: "@t/a", status: "approved" },
          { kind: "waits", dependency: "@t/b", status: "not_submitted" },
        ]}
        className="ml-2"
      />,
    );
    expect(html).toContain('aria-label="2 dependencies not released yet"');
    expect(html).toContain("text-warning-text");
    expect(html).toContain("ml-2");
    expect(html).not.toContain("Waits on");
  });

  it("turns red when one is blocked, and shows nothing without any", () => {
    const html = renderToStaticMarkup(
      <DependencyMarksIcon
        marks={[{ kind: "blocked", dependency: "@t/a", status: "rejected", through: [] }]}
      />,
    );
    expect(html).toContain('aria-label="1 dependency with a problem"');
    expect(html).toContain("text-error-text");
    expect(renderToStaticMarkup(<DependencyMarksIcon marks={[]} />)).toBe("");
  });

  it("words each status for its badge", () => {
    expect(markStatus({ kind: "waits", dependency: "@t/a", status: "approved" })).toBe(
      "pending release",
    );
    expect(
      renderToStaticMarkup(
        <DependencyStatusBadge mark={{ kind: "waits", dependency: "@t/a", status: "submitted" }} />,
      ),
    ).toContain("in review");
  });
});
