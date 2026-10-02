import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DependencyOption } from "@/server/domains/submissions/actions/composer";

vi.mock("./actions", () => ({ findDependenciesAction: vi.fn() }));
const { DependencyField } = await import("./DependencyField");
const { dependencyRows, rangeFor, statusText, versionChoices } = await import("./model");

const option = (overrides: Partial<DependencyOption> = {}): DependencyOption => ({
  name: "@team/github",
  type: "mcp-server",
  status: "published",
  mine: false,
  author: null,
  description: null,
  versions: ["1.4.0", "1.3.0", "2.0.0-beta.1"],
  latest: "1.4.0",
  ...overrides,
});

describe("picking a dependency (056)", () => {
  it("starts on latest, takes a chosen version, and gives an unreleased item ^1.0.0", () => {
    expect(rangeFor(option())).toBe("^1.4.0");
    expect(rangeFor(option(), "1.3.0")).toBe("^1.3.0");
    expect(rangeFor(option(), "2.0.0-beta.1")).toBe("2.0.0-beta.1");
    expect(rangeFor(option({ status: "draft", versions: [], latest: null }))).toBe("^1.0.0");
  });

  it("lists latest first, then each other version", () => {
    expect(versionChoices(option())).toEqual([
      { label: "latest (1.4.0)", range: "^1.4.0" },
      { label: "1.3.0", range: "^1.3.0" },
      { label: "2.0.0-beta.1", range: "2.0.0-beta.1" },
    ]);
    expect(versionChoices(option({ versions: [], latest: null }))).toEqual([
      { label: "1.0.0, its first release", range: "^1.0.0" },
    ]);
  });

  it("says each option's status and whose it is", () => {
    expect(statusText(option())).toBe("published 1.4.0");
    expect(statusText(option({ status: "submitted", mine: true, latest: null }))).toBe(
      "in review, yours",
    );
    expect(statusText(option({ status: "approved", author: "Otto", latest: null }))).toBe(
      "pending release, by Otto",
    );
  });

  it("reads the rows from the manifest, keeping odd ranges as text", () => {
    expect(dependencyRows({ "@a/b": "^1.0.0", "@c/d": null })).toEqual([
      ["@a/b", "^1.0.0"],
      ["@c/d", ""],
    ]);
    expect(dependencyRows(undefined)).toEqual([]);
  });

  it("shows each row with its range and a search to add one, never a free name field", () => {
    const html = renderToStaticMarkup(
      <DependencyField
        value={{ "@team/github": "^1.0.0" }}
        type="agent"
        itemName="@team/reviewer"
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("@team/github");
    expect(html).toContain('aria-label="Range of @team/github"');
    expect(html).toContain('value="^1.0.0"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Add a dependency"');
    expect(html).not.toContain('placeholder="Item"');
  });

  it("marks a dependency that isn't released yet beside its name: amber, red when blocked", () => {
    const html = renderToStaticMarkup(
      <DependencyField
        value={{ "@team/github": "^1.0.0", "@team/lint": "^1.0.0", "@team/ok": "^1.0.0" }}
        type="agent"
        itemName="@team/reviewer"
        onChange={() => undefined}
        marks={[
          { kind: "waits", dependency: "@team/github", status: "approved" },
          { kind: "blocked", dependency: "@team/lint", status: "rejected", through: [] },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Waits on @team/github (pending release)"');
    expect(html).toMatch(/border-warning[^"]*"[^>]*>.*?pending release</);
    expect(html).toContain('aria-label="Blocked: @team/lint was rejected"');
    expect(html).toContain("text-error-text");
    expect(html.match(/Waits on|Blocked:/g)).toHaveLength(4);
  });
});
