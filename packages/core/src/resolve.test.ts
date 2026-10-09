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

  it("falls back to an older version to escape a conflict (#141)", async () => {
    const reg = registry({
      "@t/a": {
        versions: [
          { version: "1.1.0", dependencies: { "@t/b": "^1.0.0" } },
          { version: "1.2.0", dependencies: { "@t/b": "^2.0.0" } },
        ],
      },
      "@t/b": { versions: [{ version: "1.0.0" }, { version: "2.0.0" }] },
    });
    // @a 1.2.0 wants @b ^2, against the request's ^1: @a 1.1.0 fits, so it's chosen.
    expect(
      versions(await resolve({ dependencies: { "@t/a": "^1.0.0", "@t/b": "^1.0.0" } }, reg)),
    ).toEqual({ "@t/a": "1.1.0", "@t/b": "1.0.0" });
  });

  it("installs items that need each other, one version each, and refuses unknown items (112)", async () => {
    const reg = registry({
      "@t/a": { versions: [{ version: "1.0.0", dependencies: { "@t/b": "^1.0.0" } }] },
      "@t/b": {
        versions: [
          { version: "1.0.0", dependencies: { "@t/a": "^1.0.0" } },
          { version: "1.1.0", dependencies: { "@t/a": "^1.0.0" } },
        ],
      },
    });
    const pair = await resolve({ dependencies: { "@t/a": "^1.0.0" } }, reg);
    expect(versions(pair)).toEqual({ "@t/a": "1.0.0", "@t/b": "1.1.0" });
    expect(pair.items["@t/b"]?.dependencies).toEqual({ "@t/a": "1.0.0" });
    // Asked for from either side, the same answer.
    expect(versions(await resolve({ dependencies: { "@t/b": "^1.0.0" } }, reg))).toEqual(
      versions(pair),
    );
    expect(await failure(resolve({ dependencies: { "@t/nope": "^1.0.0" } }, reg))).toMatchObject({
      code: "item_not_found",
      message: "@t/nope isn't a published item.",
      details: { item: "@t/nope" },
    });
  });

  it("resolves a cycle of three, and two cycles joined by a plain dependency (112)", async () => {
    const reg = registry({
      "@t/a": { versions: [{ version: "1.0.0", dependencies: { "@t/b": "^1.0.0" } }] },
      "@t/b": { versions: [{ version: "1.0.0", dependencies: { "@t/c": "^1.0.0" } }] },
      "@t/c": {
        versions: [{ version: "1.0.0", dependencies: { "@t/a": "^1.0.0", "@t/d": "^1.0.0" } }],
      },
      "@t/d": { versions: [{ version: "1.0.0", dependencies: { "@t/e": "^1.0.0" } }] },
      "@t/e": { versions: [{ version: "1.0.0", dependencies: { "@t/d": "^1.0.0" } }] },
    });
    expect(versions(await resolve({ dependencies: { "@t/b": "^1.0.0" } }, reg))).toEqual({
      "@t/a": "1.0.0",
      "@t/b": "1.0.0",
      "@t/c": "1.0.0",
      "@t/d": "1.0.0",
      "@t/e": "1.0.0",
    });
  });

  it("drops a pair that needs each other once nothing else reaches it (112)", async () => {
    // @t/x 1.1.0 brings @t/a, which needs @t/b and back. @t/y then pins @t/x to 1.0.0, which needs
    // nothing: @t/a and @t/b still ask for each other, but no request reaches them any more.
    const reg = registry({
      "@t/x": {
        versions: [{ version: "1.0.0" }, { version: "1.1.0", dependencies: { "@t/a": "^1.0.0" } }],
      },
      "@t/y": { versions: [{ version: "1.0.0", dependencies: { "@t/x": "~1.0.0" } }] },
      "@t/a": { versions: [{ version: "1.0.0", dependencies: { "@t/b": "^1.0.0" } }] },
      "@t/b": { versions: [{ version: "1.0.0", dependencies: { "@t/a": "^1.0.0" } }] },
    });
    const result = await resolve({ dependencies: { "@t/x": "^1.0.0", "@t/y": "^1.0.0" } }, reg);
    expect(versions(result)).toEqual({ "@t/x": "1.0.0", "@t/y": "1.0.0" });
    expect(reg.reads).toContain("@t/a");
  });

  it("doesn't let a pair nothing reaches cause a conflict, nor blame it (112)", async () => {
    // @t/a 2.0.0 brings @t/p ↔ @t/q at 1.0.0; @t/z then wants @t/a <2 and @t/q ^2. @t/p only asks
    // for @t/q ^1 because @t/q 1.0.0 brings it: once @t/q is 2.0.0, @t/p goes.
    const spec = (q: V[]) =>
      registry({
        "@t/a": {
          versions: [{ version: "1.0.0" }, { version: "2.0.0", dependencies: { "@t/p": "^1" } }],
        },
        "@t/p": { versions: [{ version: "1.0.0", dependencies: { "@t/q": "^1" } }] },
        "@t/q": { versions: q },
        "@t/z": { versions: [{ version: "1.0.0", dependencies: { "@t/a": "<2", "@t/q": "^2" } }] },
      });
    const request = { dependencies: { "@t/a": "*", "@t/z": "*" } };
    const both = spec([{ version: "1.0.0", dependencies: { "@t/p": "^1" } }, { version: "2.0.0" }]);
    expect(versions(await resolve(request, both))).toEqual({
      "@t/a": "1.0.0",
      "@t/q": "2.0.0",
      "@t/z": "1.0.0",
    });
    // With no @t/q 2.0.0, the error names only what still asks: @t/z.
    const only = spec([{ version: "1.0.0", dependencies: { "@t/p": "^1" } }]);
    expect(await failure(resolve(request, only))).toMatchObject({
      code: "no_matching_version",
      message: "@t/q has no published version that fits ^2 (@t/z@1.0.0).",
    });
  });

  it("stops going back and forth when a cycle asks the item that brought it to change (112)", async () => {
    // @t/root 2.0.0 brings @t/x ↔ @t/y, and @t/y wants @t/root ^1: only @t/root 1.0.0, alone, fits.
    const reg = registry({
      "@t/root": {
        versions: [{ version: "1.0.0" }, { version: "2.0.0", dependencies: { "@t/x": "^1" } }],
      },
      "@t/x": { versions: [{ version: "1.0.0", dependencies: { "@t/y": "^1" } }] },
      "@t/y": {
        versions: [{ version: "1.0.0", dependencies: { "@t/x": "^1", "@t/root": "^1" } }],
      },
    });
    expect(versions(await resolve({ dependencies: { "@t/root": "*" } }, reg))).toEqual({
      "@t/root": "1.0.0",
    });
  });

  it("still reports a conflict a cycle really causes (112)", async () => {
    // @t/a needs @t/b, and @t/b needs @t/a ^2, which doesn't exist: no answer.
    const reg = registry({
      "@t/a": { versions: [{ version: "1.0.0", dependencies: { "@t/b": "^1" } }] },
      "@t/b": { versions: [{ version: "1.0.0", dependencies: { "@t/a": "^2" } }] },
    });
    expect(await failure(resolve({ dependencies: { "@t/a": "^1" } }, reg))).toMatchObject({
      code: "resolve_conflict",
      details: { item: "@t/a" },
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

describe("a missing dependency (093)", () => {
  it("names the item that asks for it: gone, or in a workspace the caller can't see", async () => {
    const reg = registry({
      "@team/front": {
        tags: { latest: "1.0.0" },
        versions: [{ version: "1.0.0", dependencies: { "@acme/deploy": "^1.0.0" } }],
      },
    });
    expect(
      await failure(resolve({ dependencies: { "@team/front": "^1.0.0" } }, reg)),
    ).toMatchObject({
      code: "item_not_found",
      message: "@acme/deploy isn't a published item (asked for by @team/front@1.0.0).",
      details: { item: "@acme/deploy", from: ["@team/front@1.0.0"] },
    });
  });
});

describe("falling back to older versions on a conflict (#141)", () => {
  /** The issue's registry: B 1.2.0, published later, pins A to 1.0.0; B 1.1.0 asks for nothing. */
  const issue = () =>
    registry({
      "@t/a": {
        versions: [{ version: "1.0.0" }, { version: "1.1.0", dependencies: { "@t/b": "^1.0.0" } }],
      },
      "@t/b": {
        versions: [{ version: "1.1.0" }, { version: "1.2.0", dependencies: { "@t/a": "1.0.0" } }],
      },
    });

  it("installs A 1.1.0 with B 1.1.0 when B 1.2.0 conflicts", async () => {
    expect(versions(await resolve({ dependencies: { "@t/a": "^1.1.0" } }, issue()))).toEqual({
      "@t/a": "1.1.0",
      "@t/b": "1.1.0",
    });
  });

  it("keeps a lock of A 1.1.0 and B 1.1.0 as it is", async () => {
    const locked = { "@t/a": "1.1.0", "@t/b": "1.1.0" };
    expect(
      versions(await resolve({ dependencies: { "@t/a": "^1.1.0" }, locked }, issue())),
    ).toEqual(locked);
  });

  it("moves a locked B 1.2.0 that conflicts back to B 1.1.0", async () => {
    const locked = { "@t/a": "1.1.0", "@t/b": "1.2.0" };
    expect(
      versions(await resolve({ dependencies: { "@t/a": "^1.1.0" }, locked }, issue())),
    ).toEqual({ "@t/a": "1.1.0", "@t/b": "1.1.0" });
  });

  it("resolves a conflict that needs two versions set aside", async () => {
    // @t/p 1.1.0 and @t/q 1.1.0 both want @t/z ^2, the request wants ^1: only both older ones fit.
    const reg = registry({
      "@t/x": { versions: [{ version: "1.0.0", dependencies: { "@t/p": "^1", "@t/q": "^1" } }] },
      "@t/p": {
        versions: [{ version: "1.0.0" }, { version: "1.1.0", dependencies: { "@t/z": "^2" } }],
      },
      "@t/q": {
        versions: [{ version: "1.0.0" }, { version: "1.1.0", dependencies: { "@t/z": "^2" } }],
      },
      "@t/z": { versions: [{ version: "1.0.0" }, { version: "2.0.0" }] },
    });
    expect(versions(await resolve({ dependencies: { "@t/x": "^1", "@t/z": "^1" } }, reg))).toEqual({
      "@t/p": "1.0.0",
      "@t/q": "1.0.0",
      "@t/x": "1.0.0",
      "@t/z": "1.0.0",
    });
  });

  it("resolves when setting either of two clashing versions aside is enough", async () => {
    // @t/p 1.1.0 wants @t/z ^1.5 and @t/q 1.1.0 wants ~1.2: setting either aside works. Names go
    // in order, so @t/p falls back first, and @t/q keeps its newest version.
    const reg = registry({
      "@t/x": { versions: [{ version: "1.0.0", dependencies: { "@t/p": "^1", "@t/q": "^1" } }] },
      "@t/p": {
        versions: [{ version: "1.0.0" }, { version: "1.1.0", dependencies: { "@t/z": "^1.5" } }],
      },
      "@t/q": {
        versions: [{ version: "1.0.0" }, { version: "1.1.0", dependencies: { "@t/z": "~1.2" } }],
      },
      "@t/z": { versions: [{ version: "1.2.0" }, { version: "1.6.0" }] },
    });
    expect(versions(await resolve({ dependencies: { "@t/x": "^1" } }, reg))).toEqual({
      "@t/p": "1.0.0",
      "@t/q": "1.1.0",
      "@t/x": "1.0.0",
      "@t/z": "1.2.0",
    });
  });

  it("reports the first conflict, as before, when no older version helps", async () => {
    // @t/b's only version pins @t/a to 1.0.0; the request asks for ^1.1.0.
    const reg = registry({
      "@t/a": {
        versions: [{ version: "1.0.0" }, { version: "1.1.0", dependencies: { "@t/b": "^1.0.0" } }],
      },
      "@t/b": { versions: [{ version: "1.0.0", dependencies: { "@t/a": "1.0.0" } }] },
    });
    expect(await failure(resolve({ dependencies: { "@t/a": "^1.1.0" } }, reg))).toEqual({
      code: "resolve_conflict",
      message:
        "No version of @t/a fits every range asking for it: ^1.1.0 (the request), 1.0.0 (@t/b@1.0.0).",
      details: {
        item: "@t/a",
        ranges: [
          { range: "^1.1.0", from: REQUESTED },
          { range: "1.0.0", from: "@t/b@1.0.0" },
        ],
      },
    });
  });

  it("stops at its limit with the first conflict on a registry built to explode", async () => {
    // Forty versions each of @t/p and @t/q, every one wanting @t/z ^2 against the request's ^1:
    // nothing works, and trying every pair of exclusions would take forever.
    const many = () =>
      Array.from({ length: 40 }, (_, i) => ({
        version: `1.${i}.0`,
        dependencies: { "@t/z": "^2" },
      }));
    const reg = registry({
      "@t/x": { versions: [{ version: "1.0.0", dependencies: { "@t/p": "^1", "@t/q": "^1" } }] },
      "@t/p": { versions: many() },
      "@t/q": { versions: many() },
      "@t/z": { versions: [{ version: "1.0.0" }, { version: "2.0.0" }] },
    });
    const started = Date.now();
    expect(await failure(resolve({ dependencies: { "@t/x": "^1", "@t/z": "^1" } }, reg))).toEqual({
      code: "resolve_conflict",
      message:
        "No version of @t/z fits every range asking for it: ^1 (the request), ^2 (@t/p@1.39.0), ^2 (@t/q@1.39.0).",
      details: {
        item: "@t/z",
        ranges: [
          { range: "^1", from: REQUESTED },
          { range: "^2", from: "@t/p@1.39.0" },
          { range: "^2", from: "@t/q@1.39.0" },
        ],
      },
    });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("still reports a missing item instead of avoiding it with an older version", async () => {
    // @t/a 1.1.0 asks for an item that isn't there; 1.0.0 wouldn't, but a missing item stays an error.
    const reg = registry({
      "@t/a": {
        versions: [
          { version: "1.0.0" },
          { version: "1.1.0", dependencies: { "@t/gone": "^1.0.0" } },
        ],
      },
    });
    expect(await failure(resolve({ dependencies: { "@t/a": "^1.0.0" } }, reg))).toMatchObject({
      code: "item_not_found",
      details: { item: "@t/gone", from: ["@t/a@1.1.0"] },
    });
  });
});

describe("what falling back may and may not do (#141)", () => {
  it("falls back when a version's dependency has no matching version", async () => {
    // @t/a 1.1.0 wants @t/b ^2, which doesn't exist; @t/a 1.0.0 wants ^1, which does.
    const reg = registry({
      "@t/a": {
        versions: [
          { version: "1.0.0", dependencies: { "@t/b": "^1" } },
          { version: "1.1.0", dependencies: { "@t/b": "^2" } },
        ],
      },
      "@t/b": { versions: [{ version: "1.0.0" }] },
    });
    expect(versions(await resolve({ dependencies: { "@t/a": "^1" } }, reg))).toEqual({
      "@t/a": "1.0.0",
      "@t/b": "1.0.0",
    });
    // A range the request itself asks for is never set aside.
    expect(await failure(resolve({ dependencies: { "@t/b": "^3" } }, reg))).toMatchObject({
      code: "no_matching_version",
      details: { item: "@t/b" },
    });
  });

  it("tries the newest version below a locked one that's set aside, before newer ones", async () => {
    const reg = registry({
      "@t/a": {
        versions: [{ version: "1.0.0" }, { version: "1.1.0", dependencies: { "@t/b": "^1.0.0" } }],
      },
      "@t/b": {
        versions: [
          { version: "1.0.0" },
          { version: "1.1.0" },
          { version: "1.2.0", dependencies: { "@t/a": "1.0.0" } },
          { version: "1.3.0" },
        ],
      },
    });
    const request = { dependencies: { "@t/a": "^1.1.0" } };
    expect(
      versions(await resolve({ ...request, locked: { "@t/a": "1.1.0", "@t/b": "1.2.0" } }, reg)),
    ).toEqual({ "@t/a": "1.1.0", "@t/b": "1.1.0" });
    // Without the lock, the newest version that works.
    expect(versions(await resolve(request, reg))).toEqual({ "@t/a": "1.1.0", "@t/b": "1.3.0" });
  });

  it("never falls back to a yanked version", async () => {
    const reg = registry({
      "@t/a": {
        versions: [{ version: "1.0.0" }, { version: "1.1.0", dependencies: { "@t/b": "^1.0.0" } }],
      },
      "@t/b": {
        versions: [
          { version: "1.0.0" },
          { version: "1.1.0", yanked: true },
          { version: "1.2.0", dependencies: { "@t/a": "1.0.0" } },
        ],
      },
    });
    expect(versions(await resolve({ dependencies: { "@t/a": "^1.1.0" } }, reg))).toEqual({
      "@t/a": "1.1.0",
      "@t/b": "1.0.0",
    });
  });

  it("lets a registry that can't be read fail the install, even while falling back", async () => {
    const reg = registry({
      "@t/a": {
        versions: [
          { version: "1.0.0", dependencies: { "@t/c": "^1" } },
          { version: "1.1.0", dependencies: { "@t/b": "^2" } },
        ],
      },
      "@t/b": { versions: [{ version: "1.0.0" }] },
    });
    // @t/c is only reached once @t/a 1.1.0 is set aside: its read fails, and that's the error.
    const broken = new Error("The registry didn't answer.");
    const reader: RegistryReader = {
      item: async (name) => {
        if (name === "@t/c") throw broken;
        return reg.item(name);
      },
    };
    await expect(resolve({ dependencies: { "@t/a": "^1" } }, reader)).rejects.toBe(broken);
  });

  it("reads a missing item once, however many paths reach it", async () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        version: `1.${i}.0`,
        dependencies: { [i === count - 1 ? "@t/z" : "@t/gone"]: i === count - 1 ? "^2" : "^1" },
      }));
    const reg = registry({
      "@t/x": { versions: [{ version: "1.0.0", dependencies: { "@t/p": "^1", "@t/q": "^1" } }] },
      "@t/p": { versions: many(10) },
      "@t/q": { versions: many(10) },
      "@t/z": { versions: [{ version: "1.0.0" }, { version: "2.0.0" }] },
    });
    await failure(resolve({ dependencies: { "@t/x": "^1", "@t/z": "^1" } }, reg));
    expect(reg.reads.filter((name) => name === "@t/gone")).toHaveLength(1);
  });

  it("stays quick on items with thousands of versions, and reports the first conflict", async () => {
    // @t/p and @t/q each have 20,000 2.x versions that ^1 passes over, and forty 1.x ones that all
    // want @t/z ^2 against the request's ^1. Every attempt checks the 2.x ones again: without the
    // budget on version checks, the step limit alone would let this run for minutes.
    const many = () => [
      ...Array.from({ length: 20_000 }, (_, i) => ({ version: `2.${i}.0` })),
      ...Array.from({ length: 40 }, (_, i) => ({
        version: `1.${i}.0`,
        dependencies: { "@t/z": "^2" },
      })),
    ];
    const reg = registry({
      "@t/x": { versions: [{ version: "1.0.0", dependencies: { "@t/p": "^1", "@t/q": "^1" } }] },
      "@t/p": { versions: many() },
      "@t/q": { versions: many() },
      "@t/z": { versions: [{ version: "1.0.0" }, { version: "2.0.0" }] },
    });
    const started = Date.now();
    expect(await failure(resolve({ dependencies: { "@t/x": "^1", "@t/z": "^1" } }, reg))).toEqual({
      code: "resolve_conflict",
      message:
        "No version of @t/z fits every range asking for it: ^1 (the request), ^2 (@t/p@1.39.0), ^2 (@t/q@1.39.0).",
      details: {
        item: "@t/z",
        ranges: [
          { range: "^1", from: REQUESTED },
          { range: "^2", from: "@t/p@1.39.0" },
          { range: "^2", from: "@t/q@1.39.0" },
        ],
      },
    });
    expect(Date.now() - started).toBeLessThan(4_000);
  });
});

describe("the budget on range checks (#141)", () => {
  it("stays quick when many items ask for the same item", async () => {
    // A hundred items each ask @t/z for >=0, so each version of @t/z is checked against a hundred
    // ranges. Every @t/q wants @t/z ^1 and every @t/r ^2: nothing works, and the budget, counting
    // each range checked, has to stop it soon.
    const many = Array.from({ length: 100 }, (_, i) => `@t/p${String(i).padStart(3, "0")}`);
    const spec: Record<
      string,
      { versions: { version: string; dependencies?: Record<string, string> }[] }
    > = {
      "@t/x": {
        versions: [
          {
            version: "1.0.0",
            dependencies: Object.fromEntries([...many, "@t/q", "@t/r"].map((n) => [n, "^1"])),
          },
        ],
      },
      "@t/q": {
        versions: Array.from({ length: 20 }, (_, i) => ({
          version: `1.${i}.0`,
          dependencies: { "@t/z": "^1" },
        })),
      },
      "@t/r": {
        versions: Array.from({ length: 20 }, (_, i) => ({
          version: `1.${i}.0`,
          dependencies: { "@t/z": "^2" },
        })),
      },
      "@t/z": {
        versions: [
          { version: "1.0.0" },
          ...Array.from({ length: 2_000 }, (_, i) => ({ version: `2.${i}.0` })),
        ],
      },
    };
    for (const name of many)
      spec[name] = {
        versions: [
          { version: "1.0.0", dependencies: { "@t/z": ">=0" } },
          { version: "1.1.0", dependencies: { "@t/z": ">=0" } },
        ],
      };
    const started = Date.now();
    expect(
      await failure(resolve({ dependencies: { "@t/x": "^1", "@t/z": "*" } }, registry(spec))),
    ).toMatchObject({ code: "resolve_conflict", details: { item: "@t/z" } });
    expect(Date.now() - started).toBeLessThan(4_000);
  });
});

describe("a missing item while falling back (#141, decision 4)", () => {
  it("reports a missing item the first try asked for, instead of stepping around it", async () => {
    // @t/a 2.0.0 conflicts on @t/b and also asks for @t/z, which doesn't exist; @t/a 1.0.0 asks
    // for neither. The conflict comes first in name order, but nothing is set aside past @t/z.
    const reg = registry({
      "@t/a": {
        versions: [
          { version: "1.0.0" },
          { version: "2.0.0", dependencies: { "@t/b": "1.0.0", "@t/z": "^1.0.0" } },
        ],
      },
      "@t/b": { versions: [{ version: "1.0.0" }, { version: "2.0.0" }] },
    });
    expect(
      await failure(
        resolve({ dependencies: { "@t/a": "^1.0.0 || ^2.0.0", "@t/b": "^2.0.0" } }, reg),
      ),
    ).toEqual({
      code: "item_not_found",
      message: "@t/z isn't a published item (asked for by @t/a@2.0.0).",
      details: { item: "@t/z", from: ["@t/a@2.0.0"] },
    });
  });
});

describe("a missing item when nothing can be set aside (#141, decision 4)", () => {
  it("keeps today's error when only the request's range fails", async () => {
    // @t/b ^2 comes from the request alone, so nothing is set aside, and nothing is read ahead.
    const reg = registry({
      "@t/a": { versions: [{ version: "1.0.0", dependencies: { "@t/zz": "^1" } }] },
      "@t/b": { versions: [{ version: "1.0.0" }] },
    });
    expect(
      await failure(resolve({ dependencies: { "@t/a": "^1", "@t/b": "^2" } }, reg)),
    ).toMatchObject({ code: "no_matching_version", details: { item: "@t/b" } });
  });
});
