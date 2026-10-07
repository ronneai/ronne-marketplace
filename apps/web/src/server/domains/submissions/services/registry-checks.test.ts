import type { ItemType } from "@ronneai/core";
import { describe, expect, it } from "vitest";
import {
  type NamedSubmission,
  type PublishedVersion,
  type RegistryLookup,
  unreleasedRegistry,
} from "../repositories/registry-lookup";
import { dependencyIssues, nameIssues, typeIssues } from "./registry-checks";

type Fake = Record<
  string,
  {
    type: ItemType;
    versions: (Partial<PublishedVersion> & { version: string })[];
    /** Its workspace (093); global, public, unless said. */
    workspace?: { id: string; private: boolean };
  }
>;
const GLOBAL = { id: "global", private: false };

type FakeSubmissions = Record<
  string,
  (Partial<NamedSubmission> & Pick<NamedSubmission, "status" | "type">)[]
>;

/**
 * An in-memory registry: `@scope/name` → type and published versions, and the name's submissions
 * that aren't drafts, newest first (056).
 */
const fakeRegistry = (items: Fake, submissions: FakeSubmissions = {}): RegistryLookup => ({
  findItem: async (scope, name) => {
    const found = items[`@${scope}/${name}`];
    return found
      ? {
          id: `@${scope}/${name}`,
          scope,
          name,
          type: found.type,
          workspace: found.workspace ?? GLOBAL,
        }
      : null;
  },
  publishedVersions: async (id) =>
    (items[id]?.versions ?? []).map((v) => ({
      id: `${id}@${v.version}`,
      publishedAt: new Date(0),
      artifactPath: "",
      sha256: "",
      yanked: false,
      dependencies: {},
      ...v,
    })),
  submissionsNamed: async (scope, name) =>
    (submissions[`@${scope}/${name}`] ?? []).map((sub, i) => ({
      id: `${scope}/${name}#${i}`,
      authorId: "me",
      proposal: false,
      dependencies: {},
      workspace: GLOBAL,
      ...sub,
    })),
  privateWorkspaces: async () => new Set(),
});

const agent = (dependencies: Record<string, string>) => ({
  itemName: "@team/reviewer",
  type: "agent" as const,
  dependencies,
  authorId: "me",
  workspaceId: "global",
});
const codes = async (registry: RegistryLookup, dependencies: Record<string, string>) =>
  (await dependencyIssues(registry, agent(dependencies))).map((i) => i.code);

describe("dependencyIssues", () => {
  const registry = fakeRegistry({
    "@team/secure-coding": {
      type: "skill",
      versions: [{ version: "1.0.0" }, { version: "1.4.0" }],
    },
    "@team/github": { type: "mcp-server", versions: [{ version: "2.0.0" }] },
    "@team/old": { type: "rule", versions: [{ version: "1.0.0", yanked: true }] },
    "@team/other-agent": { type: "agent", versions: [{ version: "1.0.0" }] },
  });

  it("passes dependencies that exist, may be depended on, and have a matching version", async () => {
    expect(
      await codes(registry, { "@team/secure-coding": "^1.2.0", "@team/github": "2.0.0" }),
    ).toEqual([]);
  });

  it("refuses a missing dependency and an unmatched range, and takes any type (096)", async () => {
    expect(await codes(registry, { "@team/nowhere": "^1.0.0" })).toEqual(["dependency_not_found"]);
    // An agent on another agent: any type may depend on any type.
    expect(await codes(registry, { "@team/other-agent": "^1.0.0" })).toEqual([]);
    expect(await codes(registry, { "@team/secure-coding": "^2.0.0" })).toEqual([
      "dependency_range",
    ]);
    // Yanked versions don't count.
    expect(await codes(registry, { "@team/old": "^1.0.0" })).toEqual(["dependency_range"]);
  });

  it("finds cycles through the versions that would be installed", async () => {
    const cyclic = fakeRegistry({
      "@team/a": {
        type: "bundle",
        versions: [{ version: "1.0.0", dependencies: { "@team/b": "^1.0.0" } }],
      },
      "@team/b": {
        type: "bundle",
        versions: [
          // The older version depended back on a; the one installed (1.1.0) depends on the new item.
          { version: "1.0.0", dependencies: { "@team/a": "^1.0.0" } },
          { version: "1.1.0", dependencies: { "@team/starter": "^1.0.0" } },
        ],
      },
    });
    const issues = await dependencyIssues(cyclic, {
      itemName: "@team/starter",
      type: "bundle",
      dependencies: { "@team/a": "^1.0.0" },
      authorId: "me",
      workspaceId: "global",
    });
    expect(issues).toMatchObject([
      {
        code: "dependency_cycle",
        message:
          "The dependencies go round in a circle: @team/starter → @team/a → @team/b → @team/starter.",
      },
    ]);
  });

  it("walks a shared dependency once and passes a diamond", async () => {
    const diamond = fakeRegistry({
      "@t/left": {
        type: "bundle",
        versions: [{ version: "1.0.0", dependencies: { "@t/base": "*" } }],
      },
      "@t/right": {
        type: "bundle",
        versions: [{ version: "1.0.0", dependencies: { "@t/base": "*" } }],
      },
      "@t/base": { type: "skill", versions: [{ version: "1.0.0" }] },
    });
    expect(
      await dependencyIssues(diamond, {
        itemName: "@t/top",
        type: "bundle",
        dependencies: { "@t/left": "*", "@t/right": "*" },
        authorId: "me",
        workspaceId: "global",
      }),
    ).toEqual([]);
  });

  it("with nothing released or in review, reports every dependency as not found", async () => {
    const [notFound] = await dependencyIssues(
      unreleasedRegistry,
      agent({ "@team/github": "^1.0.0" }),
    );
    expect(notFound).toMatchObject({ code: "dependency_not_found", file: "ronne.yaml" });
    expect(notFound?.message).toContain("isn't a published item or in review");
  });
});

describe("dependencies on their way (056)", () => {
  const registry = fakeRegistry(
    { "@team/github": { type: "mcp-server", versions: [{ version: "1.0.0" }] } },
    {
      "@team/secure-coding": [{ status: "submitted", type: "skill" }],
      "@team/approved": [{ status: "approved", type: "skill" }],
      "@team/fixing": [{ status: "changes_requested", type: "skill" }],
      "@team/gone": [{ status: "rejected", type: "skill" }],
      "@team/left": [{ status: "withdrawn", type: "skill" }],
      // Rejected once, then submitted again: the open one counts.
      "@team/again": [
        { status: "submitted", type: "skill" },
        { status: "rejected", type: "skill" },
      ],
      "@team/other-agent": [{ status: "submitted", type: "agent" }],
      // A proposal for 2.0.0 of a published item.
      "@team/github": [{ status: "submitted", type: "mcp-server", proposal: true }],
    },
  );
  const issues = (dependencies: Record<string, string>, release = false) =>
    dependencyIssues(registry, agent(dependencies), { release });

  it("passes an open submission at submit, with a warning saying it's on its way", async () => {
    for (const [name, label] of [
      ["@team/secure-coding", "in review"],
      ["@team/approved", "approved"],
      ["@team/fixing", "back with its author for changes"],
      ["@team/again", "in review"],
    ])
      expect(await issues({ [name as string]: "^1.0.0" })).toEqual([
        expect.objectContaining({
          severity: "warning",
          code: "dependency_pending",
          message: `${name} isn't released yet; it's ${label}. @team/reviewer can be released after it.`,
        }),
      ]);
  });

  it("refuses a rejected or withdrawn one, and a name with only a draft (it isn't listed)", async () => {
    expect(await issues({ "@team/gone": "^1.0.0" })).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "dependency_closed",
        message:
          "@team/gone was rejected, so it won't be released. Remove it from dependencies, or depend on another item.",
      }),
    ]);
    expect((await issues({ "@team/left": "^1.0.0" })).map((i) => i.code)).toEqual([
      "dependency_closed",
    ]);
    expect((await issues({ "@team/draft-only": "^1.0.0" })).map((i) => i.code)).toEqual([
      "dependency_not_found",
    ]);
  });

  it("takes a submission of any type (096)", async () => {
    expect((await issues({ "@team/other-agent": "^1.0.0" })).map((i) => i.code)).toEqual([
      "dependency_pending",
    ]);
  });

  it("warns when a new item's first release, 1.0.0, can't match the range", async () => {
    expect((await issues({ "@team/secure-coding": "^2.0.0" })).map((i) => i.code)).toEqual([
      "dependency_pending",
      "dependency_range_pending",
    ]);
  });

  it("waits on a proposal only when the published versions don't match", async () => {
    expect(await issues({ "@team/github": "^1.0.0" })).toEqual([]);
    expect((await issues({ "@team/github": "^2.0.0" })).map((i) => i.code)).toEqual([
      "dependency_pending",
    ]);
  });

  it("at release, refuses a dependency that's only on its way", async () => {
    expect(await issues({ "@team/approved": "^1.0.0" }, true)).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "dependency_unreleased",
        message: "@team/approved isn't released yet (it's approved). Release it first.",
      }),
    ]);
    expect(await issues({ "@team/github": "^1.0.0" }, true)).toEqual([]);
  });

  it("finds a cycle through submissions in review", async () => {
    const cyclic = fakeRegistry(
      {},
      {
        "@team/a": [{ status: "submitted", type: "bundle", dependencies: { "@team/b": "*" } }],
        "@team/b": [{ status: "approved", type: "bundle", dependencies: { "@team/starter": "*" } }],
      },
    );
    const found = await dependencyIssues(cyclic, {
      itemName: "@team/starter",
      type: "bundle",
      dependencies: { "@team/a": "*" },
      authorId: "me",
      workspaceId: "global",
    });
    expect(found.map((i) => i.code)).toEqual(["dependency_pending", "dependency_cycle"]);
    expect(found.at(-1)?.message).toBe(
      "The dependencies go round in a circle: @team/starter → @team/a → @team/b → @team/starter.",
    );
  });
});

describe("only your own items count before release (089)", () => {
  const registry = fakeRegistry(
    { "@team/github": { type: "mcp-server", versions: [{ version: "1.0.0" }] } },
    {
      "@infra/deploy": [{ status: "submitted", type: "skill", authorId: "otto" }],
      "@infra/ready": [{ status: "approved", type: "skill", authorId: "otto" }],
      // Someone else's resubmission after mine was rejected: theirs doesn't count for me.
      "@team/shared": [
        { status: "submitted", type: "skill", authorId: "otto" },
        { status: "rejected", type: "skill", authorId: "me" },
      ],
      // Both of us have it open: mine counts.
      "@team/both": [
        { status: "submitted", type: "skill", authorId: "otto" },
        { status: "approved", type: "skill", authorId: "me" },
      ],
      // Someone else's proposal for 2.0.0 of a published item.
      "@team/github": [
        { status: "submitted", type: "mcp-server", proposal: true, authorId: "otto" },
      ],
    },
  );
  const issues = (dependencies: Record<string, string>, release = false) =>
    dependencyIssues(registry, agent(dependencies), { release });

  it("refuses another author's open submission, saying it counts once published", async () => {
    expect(await issues({ "@infra/deploy": "^1.0.0" })).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "dependency_not_published",
        message:
          "@infra/deploy isn't released yet. You can depend on someone else's item once it's published.",
      }),
    ]);
    for (const name of ["@infra/ready", "@team/shared"])
      expect((await issues({ [name]: "^1.0.0" })).map((i) => i.code)).toEqual([
        "dependency_not_published",
      ]);
  });

  it("counts your own when others have one open too", async () => {
    expect((await issues({ "@team/both": "^1.0.0" })).map((i) => i.code)).toEqual([
      "dependency_pending",
    ]);
  });

  it("doesn't wait on another author's proposal: the published versions decide", async () => {
    expect(await issues({ "@team/github": "^1.0.0" })).toEqual([]);
    expect((await issues({ "@team/github": "^2.0.0" })).map((i) => i.code)).toEqual([
      "dependency_range",
    ]);
  });

  it("at release, another author's left from before 089 is unreleased, as in 056", async () => {
    expect((await issues({ "@infra/deploy": "^1.0.0" }, true)).map((i) => i.code)).toEqual([
      "dependency_unreleased",
    ]);
    expect((await issues({ "@team/github": "^2.0.0" }, true)).map((i) => i.code)).toEqual([
      "dependency_unreleased",
    ]);
  });

  it("still finds a cycle through another author's open submission", async () => {
    const cyclic = fakeRegistry(
      {},
      {
        "@team/a": [{ status: "submitted", type: "bundle", dependencies: { "@team/b": "*" } }],
        "@team/b": [
          {
            status: "submitted",
            type: "bundle",
            authorId: "otto",
            dependencies: { "@team/starter": "*" },
          },
        ],
      },
    );
    const found = await dependencyIssues(cyclic, {
      itemName: "@team/starter",
      type: "bundle",
      dependencies: { "@team/a": "*" },
      authorId: "me",
      workspaceId: "global",
    });
    expect(found.map((i) => i.code)).toEqual(["dependency_pending", "dependency_cycle"]);
  });
});

describe("nameIssues", () => {
  it("refuses a published name, then one proposed by an open submission", async () => {
    const registry = fakeRegistry({ "@team/taken": { type: "rule", versions: [] } });
    expect(
      (await nameIssues(registry, { scope: "team", name: "taken", proposedElsewhere: false }))[0]
        ?.message,
    ).toContain("already a published item");
    expect(
      (await nameIssues(registry, { scope: "team", name: "free", proposedElsewhere: true }))[0]
        ?.message,
    ).toContain("already proposed by another submission");
    expect(
      await nameIssues(registry, { scope: "team", name: "free", proposedElsewhere: false }),
    ).toEqual([]);
  });
});

describe("typeIssues", () => {
  const registry = fakeRegistry({
    "@team/fmt": { type: "hook", versions: [{ version: "1.0.0" }] },
  });
  it("refuses a proposal whose type isn't its item's", async () => {
    expect(
      await typeIssues(registry, { scope: { name: "team" }, name: "fmt", type: "hook" }),
    ).toEqual([]);
    const [issue] = await typeIssues(registry, {
      scope: { name: "team" },
      name: "fmt",
      type: "rule",
    });
    expect(issue).toMatchObject({ code: "type_changed", path: "/type" });
    expect(issue?.message).toContain("@team/fmt is a hook; a change can't make it a rule.");
  });
});

describe("the dependency rule of private workspaces (093)", () => {
  const ACME = { id: "acme", private: true };
  const BETA = { id: "beta", private: true };
  const registry = fakeRegistry(
    {
      "@acme-infra/deploy": { type: "skill", versions: [{ version: "1.0.0" }], workspace: ACME },
      "@beta-tools/lint": { type: "skill", versions: [{ version: "1.0.0" }], workspace: BETA },
      "@team/base": { type: "skill", versions: [{ version: "1.0.0" }] },
    },
    { "@beta-tools/draft": [{ status: "submitted", type: "skill", workspace: BETA }] },
  );
  const from = (workspaceId: string | null, dependencies: Record<string, string>) => ({
    ...agent(dependencies),
    workspaceId,
  });
  const issuesOf = async (
    workspaceId: string | null,
    dependencies: Record<string, string>,
    release = false,
  ) =>
    (await dependencyIssues(registry, from(workspaceId, dependencies), { release })).map((i) => [
      i.code,
      i.message,
    ]);

  it("lets an item depend on its own workspace's items and on public ones", async () => {
    expect(
      await issuesOf("acme", { "@acme-infra/deploy": "^1.0.0", "@team/base": "^1.0.0" }),
    ).toEqual([]);
    expect(await issuesOf("global", { "@team/base": "^1.0.0" })).toEqual([]);
  });

  it("refuses another private workspace's item, published or on its way, at submit and at release", async () => {
    for (const release of [false, true]) {
      expect(await issuesOf("acme", { "@beta-tools/lint": "^1.0.0" }, release)).toEqual([
        [
          "dependency_not_visible",
          "@beta-tools/lint is in a private workspace; only its own items can depend on it.",
        ],
      ]);
      expect(await issuesOf("global", { "@acme-infra/deploy": "^1.0.0" }, release)).toEqual([
        [
          "dependency_not_visible",
          "@acme-infra/deploy is in a private workspace; only its own items can depend on it.",
        ],
      ]);
    }
    expect((await issuesOf("acme", { "@beta-tools/draft": "^1.0.0" }))[0]?.[0]).toBe(
      "dependency_not_visible",
    );
  });

  it("refuses every private one when the item's workspace isn't known yet", async () => {
    expect((await issuesOf(null, { "@acme-infra/deploy": "^1.0.0" }))[0]?.[0]).toBe(
      "dependency_not_visible",
    );
    expect(await issuesOf(null, { "@team/base": "^1.0.0" })).toEqual([]);
  });
});
