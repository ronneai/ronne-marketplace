import type { ItemType } from "@ronneai/core";
import { describe, expect, it } from "vitest";
import {
  type PublishedVersion,
  type RegistryLookup,
  unreleasedRegistry,
} from "../repositories/registry-lookup";
import { dependencyIssues, nameIssues, typeIssues } from "./registry-checks";

type Fake = Record<
  string,
  { type: ItemType; versions: (Partial<PublishedVersion> & { version: string })[] }
>;

/** An in-memory registry: `@scope/name` → type and published versions. */
const fakeRegistry = (items: Fake): RegistryLookup => ({
  findItem: async (scope, name) => {
    const found = items[`@${scope}/${name}`];
    return found ? { id: `@${scope}/${name}`, scope, name, type: found.type } : null;
  },
  publishedVersions: async (id) =>
    (items[id]?.versions ?? []).map((v) => ({
      id: `${id}@${v.version}`,
      publishedAt: new Date(0),
      artifactPath: "",
      yanked: false,
      dependencies: {},
      ...v,
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

  it("in M2, reports every dependency as not released yet", async () => {
    const [notFound] = await dependencyIssues(
      unreleasedRegistry,
      agent({ "@team/github": "^1.0.0" }),
    );
    expect(notFound).toMatchObject({ code: "dependency_not_found", file: "ronne.yaml" });
    expect(notFound?.message).toContain("has to be released before");
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
