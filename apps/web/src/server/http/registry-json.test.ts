import { describe, expect, it } from "vitest";
import { itemPageData, versionRow } from "@/features/item-page/fixtures";
import { itemJson, itemSummaryJson, versionJson } from "./registry-json";

describe("registry JSON", () => {
  it("summarises a catalogue entry", () => {
    expect(
      itemSummaryJson({
        id: "i",
        workspace: "acme",
        privateWorkspace: true,
        scope: "team",
        name: "fmt",
        type: "hook",
        version: "1.2.0",
        description: "Formats.",
        keywords: ["format"],
        publishedAt: new Date("2026-09-20T10:00:00Z"),
        lastPublishedAt: new Date("2026-09-20T10:00:00Z"),
        risky: true,
        deprecatedMessage: null,
        installable: true,
        downloadCount: 7,
        support: { "claude-code": "native", codex: "native", cursor: "off" },
      }),
    ).toEqual({
      // Outside global, the workspace is part of the name (118).
      name: "@acme/team/fmt",
      workspace: { name: "acme", visibility: "private" },
      type: "hook",
      description: "Formats.",
      keywords: ["format"],
      version: "1.2.0",
      publishedAt: "2026-09-20T10:00:00.000Z",
      deprecated: null,
      installable: true,
      risky: true,
      downloads: 7,
      support: { "claude-code": "native", codex: "native", cursor: "off" },
    });
  });

  it("gives an item's tags as a map, and every version with its yank and deprecation", () => {
    const data = itemPageData();
    const json = itemJson(data);
    expect(json).toMatchObject({
      name: "@team/github",
      workspace: { name: data.item.workspace, visibility: "public" },
      owner: "Rae Releaser",
      downloads: 0,
      tags: { latest: "1.1.0" },
    });
    expect(json.versions.map((v) => [v.version, v.yanked, v.deprecated])).toEqual([
      ["1.1.0", false, null],
      ["1.0.0", true, "Use 1.1.0 or later."],
    ]);
  });

  it("gives one version with its manifest, files, risk flags and yank reason", () => {
    const data = itemPageData();
    const yanked = versionRow({
      version: "1.0.0",
      yankedAt: new Date("2026-09-28T10:00:00Z"),
      yankReason: "Broken.",
      tags: [],
    });
    const json = versionJson({ ...data, shown: { ...data.shown, ...yanked } });
    expect(json).toMatchObject({
      name: "@team/github",
      version: "1.0.0",
      yanked: true,
      yankedAt: "2026-09-28T10:00:00.000Z",
      yankReason: "Broken.",
      manifest: { license: "MIT" },
      riskFlags: [],
    });
    expect(json.files.map((f) => f.path)).toEqual(["ronne.yaml", "bin/run.sh"]);
  });
});
