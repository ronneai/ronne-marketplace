import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DependencyOption } from "@/server/domains/submissions/actions/composer";

vi.mock("./actions", () => ({ findDependenciesAction: vi.fn() }));
const { DependencyField } = await import("./DependencyField");
const { acceptsText, dependencyRows, rangeFor, statusText, versionChoices } = await import(
  "./model"
);

const option = (overrides: Partial<DependencyOption> = {}): DependencyOption => ({
  name: "@team/github",
  type: "mcp-server",
  status: "published",
  mine: false,
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

  it("says what a range accepts (#143)", () => {
    expect(acceptsText("^1.2.3")).toBe("1.2.3 or later 1.x");
    expect(acceptsText("^0.2.3")).toBe("0.2.3 or later 0.2.x");
    expect(acceptsText("^0.0.3")).toBe("only 0.0.3");
    expect(acceptsText("1.2.3")).toBe("exactly 1.2.3");
    expect(acceptsText("1.2.3-beta.1")).toBe("exactly 1.2.3-beta.1");
    for (const range of [
      "~1.2.3",
      ">=1.0.0",
      "^1.2.3-beta.1",
      "^1.2",
      "",
      "latest",
      "01.2.3",
      "1.2.3-.",
      "1.2.3-01",
      "1.2.3-beta.007",
    ])
      expect(acceptsText(range), range).toBeNull();
  });

  it("offers compatible ranges, latest first, then exact versions, each label starting with what it writes (#143)", () => {
    expect(versionChoices(option())).toEqual([
      {
        label: "Compatible",
        choices: [
          {
            label: "^1.4.0 · 1.4.0 or later 1.x, latest",
            range: "^1.4.0",
            accepts: "1.4.0 or later 1.x, latest",
          },
          { label: "^1.3.0 · 1.3.0 or later 1.x", range: "^1.3.0", accepts: "1.3.0 or later 1.x" },
        ],
      },
      {
        label: "Exactly",
        choices: [
          { label: "1.4.0 · exactly 1.4.0", range: "1.4.0", accepts: "exactly 1.4.0" },
          { label: "1.3.0 · exactly 1.3.0", range: "1.3.0", accepts: "exactly 1.3.0" },
          {
            label: "2.0.0-beta.1 · exactly 2.0.0-beta.1",
            range: "2.0.0-beta.1",
            accepts: "exactly 2.0.0-beta.1",
          },
        ],
      },
    ]);
  });

  it("reads 0.x ranges as caret means them (#143)", () => {
    const [compatible] = versionChoices(option({ versions: ["0.2.3", "0.0.3"], latest: "0.2.3" }));
    expect(compatible?.choices.map((c) => c.label)).toEqual([
      "^0.2.3 · 0.2.3 or later 0.2.x, latest",
      "^0.0.3 · only 0.0.3",
    ]);
  });

  it("offers an unreleased item its first release, compatible or exact (#143)", () => {
    expect(versionChoices(option({ status: "draft", versions: [], latest: null }))).toEqual([
      {
        label: "Compatible",
        choices: [
          {
            label: "^1.0.0 · its first release, or a later 1.x",
            range: "^1.0.0",
            accepts: "its first release, or a later 1.x",
          },
        ],
      },
      {
        label: "Exactly",
        choices: [
          {
            label: "1.0.0 · exactly its first release",
            range: "1.0.0",
            accepts: "exactly its first release",
          },
        ],
      },
    ]);
  });

  it("keeps a pre-release out of Compatible, even when it's the listed version (#143)", () => {
    const groups = versionChoices(option({ versions: ["1.0.0-beta.1"], latest: "1.0.0-beta.1" }));
    expect(groups).toEqual([
      {
        label: "Exactly",
        choices: [
          {
            label: "1.0.0-beta.1 · exactly 1.0.0-beta.1",
            range: "1.0.0-beta.1",
            accepts: "exactly 1.0.0-beta.1",
          },
        ],
      },
    ]);
    // The default pick is still offered.
    expect(groups.flatMap((g) => g.choices.map((c) => c.range))).toContain(
      rangeFor(option({ versions: ["1.0.0-beta.1"], latest: "1.0.0-beta.1" })),
    );
  });

  it("lists a single release once in each group (#143)", () => {
    const groups = versionChoices(option({ versions: ["1.0.0"], latest: "1.0.0" }));
    expect(groups.map((g) => g.choices.map((c) => c.range))).toEqual([["^1.0.0"], ["1.0.0"]]);
    for (const group of versionChoices(option())) {
      const ranges = group.choices.map((c) => c.range);
      expect(new Set(ranges).size).toBe(ranges.length);
    }
  });

  it("says each option's status and whose it is", () => {
    expect(statusText(option())).toBe("published 1.4.0");
    expect(statusText(option({ status: "submitted", mine: true, latest: null }))).toBe(
      "in review, yours",
    );
    expect(statusText(option({ status: "approved", mine: true, latest: null }))).toBe(
      "pending release, yours",
    );
    expect(statusText(option({ mine: true }))).toBe("published 1.4.0, yours");
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
