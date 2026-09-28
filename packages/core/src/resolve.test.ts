import { describe, expect, it } from "vitest";
import type { ItemType } from "./item-types.js";
import {
  REQUESTED,
  type RegistryItem,
  type RegistryReader,
  type RegistryVersion,
  ResolveError,
  resolve,
} from "./resolve.js";

type V = Partial<RegistryVersion> & { version: string };
type Spec = { type?: ItemType; tags?: Record<string, string>; versions: V[] };

/** An in-memory registry: name → item. `latest` defaults to the highest stable version given. */
const registry = (spec: Record<string, Spec>): RegistryReader & { reads: string[] } => {
  const reads: string[] = [];
  return {
    reads,
    item: async (name) => {
      reads.push(name);
      const found = spec[name];
      if (!found) return null;
      const item: RegistryItem = {
        type: found.type ?? "skill",
        tags: found.tags ?? {},
        versions: found.versions.map((v) => ({
          sha256: `sha-${name}-${v.version}`,
          yanked: false,
          deprecated: null,
          dependencies: {},
          ...v,
        })),
      };
      return item;
    },
  };
};

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ResolveError)
      return { code: error.code, details: error.details, message: error.message };
    throw error;
  }
  throw new Error("expected a ResolveError");
};

const versions = (resolution: { items: Record<string, { version: string }> }) =>
  Object.fromEntries(Object.entries(resolution.items).map(([name, item]) => [name, item.version]));

describe("resolve", () => {
  it("picks the highest version that fits, and pins dependencies to what was chosen", async () => {
    const reg = registry({
      "@t/agent": {
        type: "agent",
        versions: [
          { version: "1.0.0", dependencies: { "@t/skill": "^1.0.0" } },
          { version: "1.2.0", dependencies: { "@t/skill": "^1.1.0" } },
          { version: "2.0.0" },
        ],
      },
      "@t/skill": {
        versions: [
          { version: "1.0.0" },
          { version: "1.1.0" },
          { version: "1.4.2" },
          { version: "2.0.0" },
        ],
      },
    });
    const result = await resolve({ dependencies: { "@t/agent": "^1.0.0" } }, reg);
    expect(result.items).toEqual({
      "@t/agent": {
        version: "1.2.0",
        type: "agent",
        sha256: "sha-@t/agent-1.2.0",
        dependencies: { "@t/skill": "1.4.2" },
      },
      "@t/skill": {
        version: "1.4.2",
        type: "skill",
        sha256: "sha-@t/skill-1.4.2",
        dependencies: {},
      },
    });
    expect(result.warnings).toEqual([]);
  });

  it("turns dist-tags into versions, and fails on an unknown tag", async () => {
    const reg = registry({
      "@t/x": {
        tags: { latest: "1.0.0", next: "2.0.0-beta.1" },
        versions: [{ version: "1.0.0" }, { version: "2.0.0-beta.1" }],
      },
    });
    expect(versions(await resolve({ dependencies: { "@t/x": "latest" } }, reg))).toEqual({
      "@t/x": "1.0.0",
    });
    expect(versions(await resolve({ dependencies: { "@t/x": "next" } }, reg))).toEqual({
      "@t/x": "2.0.0-beta.1",
    });
    expect(await failure(resolve({ dependencies: { "@t/x": "stable-9" } }, reg))).toMatchObject({
      code: "tag_not_found",
      details: { item: "@t/x", tag: "stable-9", from: REQUESTED },
    });
  });

  it("gives one version to an item asked for twice, satisfying both ranges", async () => {
    const reg = registry({
      "@t/a": { versions: [{ version: "1.0.0", dependencies: { "@t/shared": ">=1.2.0" } }] },
      "@t/shared": { versions: [{ version: "1.1.0" }, { version: "1.3.0" }, { version: "2.0.0" }] },
    });
    const result = await resolve(
      { dependencies: { "@t/a": "^1.0.0", "@t/shared": "^1.0.0" } },
      reg,
    );
    expect(versions(result)).toEqual({ "@t/a": "1.0.0", "@t/shared": "1.3.0" });
  });

  it("names who asked for each range when they can't all be met", async () => {
    const reg = registry({
      "@t/a": { versions: [{ version: "1.0.0", dependencies: { "@t/shared": "^2.0.0" } }] },
      "@t/shared": { versions: [{ version: "1.5.0" }, { version: "2.1.0" }] },
    });
    const error = await failure(
      resolve({ dependencies: { "@t/a": "^1.0.0", "@t/shared": "^1.0.0" } }, reg),
    );
    expect(error).toMatchObject({
      code: "resolve_conflict",
      details: {
        item: "@t/shared",
        ranges: [
          { range: "^1.0.0", from: REQUESTED },
          { range: "^2.0.0", from: "@t/a@1.0.0" },
        ],
      },
    });
    expect(error.message).toContain("^2.0.0 (@t/a@1.0.0)");
  });

  it("skips yanked versions, and says when nothing fits", async () => {
    const reg = registry({
      "@t/x": { versions: [{ version: "1.0.0" }, { version: "1.1.0", yanked: true }] },
    });
    expect(versions(await resolve({ dependencies: { "@t/x": "^1.0.0" } }, reg))).toEqual({
      "@t/x": "1.0.0",
    });
    expect(await failure(resolve({ dependencies: { "@t/x": "^1.1.0" } }, reg))).toMatchObject({
      code: "no_matching_version",
      details: { item: "@t/x" },
    });
  });

  it("keeps a locked version while it fits, even yanked, and resolves again once it doesn't", async () => {
    const reg = registry({
      "@t/x": {
        versions: [{ version: "1.0.0" }, { version: "1.1.0", yanked: true }, { version: "1.2.0" }],
      },
    });
    const locked = { "@t/x": "1.1.0" };
    expect(versions(await resolve({ dependencies: { "@t/x": "^1.0.0" }, locked }, reg))).toEqual({
      "@t/x": "1.1.0",
    });
    expect(versions(await resolve({ dependencies: { "@t/x": "^1.2.0" }, locked }, reg))).toEqual({
      "@t/x": "1.2.0",
    });
    expect(
      versions(
        await resolve({ dependencies: { "@t/x": "^1.0.0" }, locked: { "@t/x": "9.9.9" } }, reg),
      ),
    ).toEqual({ "@t/x": "1.2.0" });
  });

  it("warns about deprecated versions, and still resolves them", async () => {
    const reg = registry({ "@t/x": { versions: [{ version: "1.0.0", deprecated: "Use @t/y." }] } });
    expect((await resolve({ dependencies: { "@t/x": "1.0.0" } }, reg)).warnings).toEqual([
      { item: "@t/x", version: "1.0.0", code: "deprecated", message: "Use @t/y." },
    ]);
  });

  it("only picks a pre-release when a range names one", async () => {
    const reg = registry({
      "@t/x": { versions: [{ version: "1.0.0" }, { version: "1.1.0-beta.1" }] },
    });
    expect(versions(await resolve({ dependencies: { "@t/x": "^1.0.0" } }, reg))).toEqual({
      "@t/x": "1.0.0",
    });
    expect(versions(await resolve({ dependencies: { "@t/x": "^1.1.0-beta.1" } }, reg))).toEqual({
      "@t/x": "1.1.0-beta.1",
    });
  });

  it("drops dependencies an item no longer needs when a newer version is chosen", async () => {
    const reg = registry({
      "@t/a": {
        versions: [
          { version: "1.0.0", dependencies: { "@t/old": "^1.0.0" } },
          { version: "1.1.0" },
        ],
      },
      "@t/c": { versions: [{ version: "1.0.0", dependencies: { "@t/a": ">=1.1.0 <2.0.0" } }] },
      "@t/old": { versions: [{ version: "1.0.0" }] },
    });
    // @a starts locked at 1.0.0 (needing @old), but @c's range moves it to 1.1.0, which doesn't.
    const result = await resolve(
      { dependencies: { "@t/a": "^1.0.0", "@t/c": "^1.0.0" }, locked: { "@t/a": "1.0.0" } },
      reg,
    );
    expect(versions(result)).toEqual({ "@t/a": "1.1.0", "@t/c": "1.0.0" });
  });

  it("doesn't search older versions to escape a conflict (no backtracking)", async () => {
    const reg = registry({
      "@t/a": {
        versions: [
          { version: "1.1.0", dependencies: { "@t/b": "^1.0.0" } },
          { version: "1.2.0", dependencies: { "@t/b": "^2.0.0" } },
        ],
      },
      "@t/b": { versions: [{ version: "1.0.0" }, { version: "2.0.0" }] },
    });
    // @a 1.1.0 would fit; the resolver reports the conflict, and the author widens a range.
    expect(
      await failure(resolve({ dependencies: { "@t/a": "^1.0.0", "@t/b": "^1.0.0" } }, reg)),
    ).toMatchObject({ code: "resolve_conflict", details: { item: "@t/b" } });
  });

  it("refuses a dependency cycle, and unknown items", async () => {
    const reg = registry({
      "@t/a": { versions: [{ version: "1.0.0", dependencies: { "@t/b": "^1.0.0" } }] },
      "@t/b": { versions: [{ version: "1.0.0", dependencies: { "@t/a": "^1.0.0" } }] },
    });
    expect(await failure(resolve({ dependencies: { "@t/a": "^1.0.0" } }, reg))).toMatchObject({
      code: "dependency_cycle",
      details: { cycle: ["@t/a", "@t/b", "@t/a"] },
    });
    expect(await failure(resolve({ dependencies: { "@t/nope": "^1.0.0" } }, reg))).toMatchObject({
      code: "item_not_found",
      details: { item: "@t/nope" },
    });
  });

  it("gives the same result every time, whatever order things are asked in", async () => {
    const spec = {
      "@t/a": { versions: [{ version: "1.0.0", dependencies: { "@t/c": "^1.0.0" } }] },
      "@t/b": { versions: [{ version: "1.0.0", dependencies: { "@t/c": "^1.2.0" } }] },
      "@t/c": { versions: [{ version: "1.0.0" }, { version: "1.2.0" }, { version: "1.3.0" }] },
    };
    const one = await resolve({ dependencies: { "@t/a": "*", "@t/b": "*" } }, registry(spec));
    const two = await resolve({ dependencies: { "@t/b": "*", "@t/a": "*" } }, registry(spec));
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
    expect(versions(one)).toEqual({ "@t/a": "1.0.0", "@t/b": "1.0.0", "@t/c": "1.3.0" });
  });

  it("reads each item from the registry once", async () => {
    const reg = registry({
      "@t/a": { versions: [{ version: "1.0.0", dependencies: { "@t/c": "^1.0.0" } }] },
      "@t/c": { versions: [{ version: "1.0.0" }] },
    });
    await resolve({ dependencies: { "@t/a": "^1.0.0", "@t/c": "^1.0.0" } }, reg);
    expect(reg.reads.sort()).toEqual(["@t/a", "@t/c"]);
  });
});
