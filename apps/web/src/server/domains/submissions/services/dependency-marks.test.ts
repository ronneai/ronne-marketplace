import { describe, expect, it } from "vitest";
import type { NamedSubmission, RegistryLookup } from "../repositories/registry-lookup";
import { marksFor } from "./dependency-marks";

type Named = Partial<NamedSubmission> & Pick<NamedSubmission, "status">;
const PUBLIC = { id: "global", private: false };

/** Published items (`@scope/name` → versions) and each name's submissions, newest first. */
const registry = (
  published: Record<string, string[]>,
  submissions: Record<string, Named[]>,
): RegistryLookup => ({
  findItem: async (scope, name) =>
    published[`@${scope}/${name}`]
      ? { id: `@${scope}/${name}`, scope, name, type: "skill", workspace: PUBLIC }
      : null,
  publishedVersions: async (id) =>
    (published[id] ?? []).map((version) => ({
      id: `${id}@${version}`,
      version,
      publishedAt: new Date(0),
      artifactPath: "",
      sha256: "",
      yanked: false,
      dependencies: {},
    })),
  ownDraftNamed: async () => null,
  submissionsNamed: async (scope, name) =>
    (submissions[`@${scope}/${name}`] ?? []).map((s, i) => ({
      id: `${name}#${i}`,
      type: "skill",
      authorId: "me",
      proposal: false,
      dependencies: {},
      workspace: PUBLIC,
      ...s,
    })),
  privateWorkspaces: async () => new Set(),
});

describe("marksFor (056)", () => {
  it("marks each dependency without a matching release: waiting, not submitted, or blocked", async () => {
    const lookup = registry(
      { "@t/released": ["1.0.0"] },
      {
        "@t/review": [{ status: "submitted" }],
        "@t/fixing": [{ status: "changes_requested" }],
        "@t/ok": [{ status: "approved" }],
        "@t/gone": [{ status: "rejected" }],
        "@t/left": [{ status: "withdrawn" }],
      },
    );
    expect(
      await marksFor(lookup, {
        "@t/released": "^1.0.0",
        "@t/review": "*",
        "@t/fixing": "*",
        "@t/ok": "*",
        "@t/gone": "*",
        "@t/left": "*",
        "@t/nowhere": "*",
      }),
    ).toEqual([
      { kind: "waits", dependency: "@t/review", status: "submitted" },
      { kind: "waits", dependency: "@t/fixing", status: "changes_requested" },
      { kind: "waits", dependency: "@t/ok", status: "approved" },
      { kind: "blocked", dependency: "@t/gone", status: "rejected", through: [] },
      { kind: "blocked", dependency: "@t/left", status: "withdrawn", through: [] },
      { kind: "waits", dependency: "@t/nowhere", status: "not_submitted" },
    ]);
  });

  it("blocks through a chain: A waits on B, which waits on C, which was rejected", async () => {
    const lookup = registry(
      {},
      {
        "@t/b": [{ status: "approved", dependencies: { "@t/c": "*" } }],
        "@t/c": [{ status: "rejected" }],
      },
    );
    expect(await marksFor(lookup, { "@t/b": "*" })).toEqual([
      { kind: "blocked", dependency: "@t/b", status: "rejected", through: ["@t/c"] },
    ]);
  });

  it("waits again once a rejected dependency is submitted anew, and stops at a cycle", async () => {
    const lookup = registry(
      {},
      {
        "@t/again": [{ status: "submitted" }, { status: "rejected" }],
        "@t/x": [{ status: "submitted", dependencies: { "@t/y": "*" } }],
        "@t/y": [{ status: "submitted", dependencies: { "@t/x": "*" } }],
      },
    );
    expect(await marksFor(lookup, { "@t/again": "*", "@t/x": "*" })).toEqual([
      { kind: "waits", dependency: "@t/again", status: "submitted" },
      { kind: "waits", dependency: "@t/x", status: "submitted" },
    ]);
  });

  it("leaves a published item whose range doesn't match to the checks", async () => {
    expect(await marksFor(registry({ "@t/old": ["1.0.0"] }, {}), { "@t/old": "^2.0.0" })).toEqual(
      [],
    );
  });
});
