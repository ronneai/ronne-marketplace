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
  { type: ItemType; versions: (Partial<PublishedVersion> & { version: string })[] }
>;

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
    return found ? { id: `@${scope}/${name}`, scope, name, type: found.type } : null;
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
      proposal: false,
      dependencies: {},
      ...sub,
    })),
});

const agent = (dependencies: Record<string, string>) => ({
  itemName: "@team/reviewer",
  type: "agent" as const,
  dependencies,
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

  it("refuses a missing dependency, a type this item can't depend on, and an unmatched range", async () => {
    expect(await codes(registry, { "@team/nowhere": "^1.0.0" })).toEqual(["dependency_not_found"]);
    expect(await codes(registry, { "@team/other-agent": "^1.0.0" })).toEqual(["dependency_type"]);
    expect(await codes(registry, { "@team/secure-coding": "^2.0.0" })).toEqual([
      "dependency_range",
    ]);
    // Yanked versions don't count.
    expect(await codes(registry, { "@team/old": "^1.0.0" })).toEqual(["dependency_range"]);
    const [typeIssue] = await dependencyIssues(registry, agent({ "@team/other-agent": "^1.0.0" }));
    expect(typeIssue?.message).toBe(
      "@team/other-agent is an agent, which an agent can't depend on. An agent may depend on: skill, mcp-server, hook, rule, command.",
    );
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

  it("checks the type against the submission's", async () => {
    expect((await issues({ "@team/other-agent": "^1.0.0" })).map((i) => i.code)).toEqual([
      "dependency_type",
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
    });
    expect(found.map((i) => i.code)).toEqual(["dependency_pending", "dependency_cycle"]);
    expect(found.at(-1)?.message).toBe(
      "The dependencies go round in a circle: @team/starter → @team/a → @team/b → @team/starter.",
    );
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
