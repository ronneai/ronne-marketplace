import type { ItemPage, VersionRow } from "@/server/domains/items/actions/versions";

/** Test data for the item page's render tests (features 016 and 018). */
export const versionRow = (overrides: Partial<VersionRow> = {}): VersionRow => ({
  id: "v1",
  itemId: "i1",
  version: "1.1.0",
  sha256: "ab".repeat(32),
  size: 2048,
  artifactPath: "team/github/1.1.0.tgz",
  publishedAt: new Date("2026-09-28T09:00:00Z"),
  yankedAt: null,
  yankReason: null,
  deprecatedMessage: null,
  publishedBy: "u1",
  publishedByName: "Rae Releaser",
  dependencies: {},
  disabledTargets: [],
  tags: ["latest"],
  ...overrides,
});

/** @team/github: 1.1.0 on latest, and 1.0.0, deprecated and yanked; showing 1.1.0. */
export const itemPageData = (overrides: Partial<ItemPage> = {}): ItemPage => {
  const latest = versionRow();
  return {
    item: {
      id: "i1",
      name: "github",
      scope: { id: "s1", name: "team" },
      type: "mcp-server",
      description: "GitHub tools.",
      ownerId: "u1",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      downloadCount: 0,
    },
    versions: [
      latest,
      versionRow({
        id: "v0",
        version: "1.0.0",
        tags: [],
        deprecatedMessage: "Use 1.1.0 or later.",
        yankedAt: new Date("2026-09-28T10:00:00Z"),
        yankReason: "Breaks on Windows.",
      }),
    ],
    tags: [{ tag: "latest", version: "1.1.0" }],
    canManage: false,
    shown: {
      ...latest,
      manifest: { description: "GitHub tools.", license: "MIT", keywords: ["git", "api"] },
      readme: "# GitHub\n\nUse it <script>alert(1)</script>.\n",
      files: [
        { path: "ronne.yaml", size: 120, executable: false },
        { path: "bin/run.sh", size: 2048, executable: true },
      ],
      notes: null,
      riskFlags: [],
      submissionId: "sub1",
      approval: { by: "Mo Moderator", at: new Date("2026-09-28T08:30:00Z"), override: false },
    },
    usedBy: [],
    listed: "1.1.0",
    latest: "1.1.0",
    installable: true,
    ownerName: "Rae Releaser",
    ...overrides,
  };
};
