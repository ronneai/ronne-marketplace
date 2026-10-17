import { describe, expect, it } from "vitest";
import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import { planGroupChanges } from "./group-sync";

const ACME = "ws-acme";
const OPS = "ws-ops";

const plan = (
  groups: string[],
  memberships: {
    workspaceId: string;
    role: "user" | "moderator" | "admin";
    source: string | null;
  }[],
  mappings = [
    { group: "eng", workspaceId: ACME, role: "user" as const },
    { group: "eng-leads", workspaceId: ACME, role: "moderator" as const },
    { group: "ops", workspaceId: OPS, role: "admin" as const },
    { group: "gone", workspaceId: null, role: "admin" as const },
  ],
) => planGroupChanges({ providerId: "okta", groups, mappings, memberships });

describe("planning what a sign-in's groups change", () => {
  it("adds the memberships of the groups the person is in", () => {
    expect(plan(["eng", "ops"], [])).toEqual([
      { kind: "add", workspaceId: ACME, role: "user" },
      { kind: "add", workspaceId: OPS, role: "admin" },
    ]);
  });

  it("gives the higher role when two mappings give one workspace", () => {
    expect(plan(["eng", "eng-leads"], [])).toEqual([
      { kind: "add", workspaceId: ACME, role: "moderator" },
    ]);
  });

  it("gives the higher role whichever order the mappings come in", () => {
    const reversed = [
      { group: "eng-leads", workspaceId: ACME, role: "moderator" as const },
      { group: "eng", workspaceId: ACME, role: "user" as const },
    ];
    expect(plan(["eng", "eng-leads"], [], reversed)).toEqual([
      { kind: "add", workspaceId: ACME, role: "moderator" },
    ]);
  });

  it("raises and lowers what this provider gave", () => {
    expect(plan(["eng-leads"], [{ workspaceId: ACME, role: "user", source: "okta" }])).toEqual([
      { kind: "change", workspaceId: ACME, from: "user", to: "moderator", takeOver: false },
    ]);
    expect(plan(["eng"], [{ workspaceId: ACME, role: "moderator", source: "okta" }])).toEqual([
      { kind: "change", workspaceId: ACME, from: "moderator", to: "user", takeOver: false },
    ]);
    expect(plan(["eng"], [{ workspaceId: ACME, role: "user", source: "okta" }])).toEqual([]);
  });

  it("removes what this provider gave when the person leaves the group", () => {
    expect(plan([], [{ workspaceId: OPS, role: "admin", source: "okta" }])).toEqual([
      { kind: "remove", workspaceId: OPS, role: "admin" },
    ]);
  });

  it("never touches a membership set by hand, even to raise or lower it", () => {
    expect(plan(["ops"], [{ workspaceId: OPS, role: "user", source: null }])).toEqual([]);
    expect(plan([], [{ workspaceId: OPS, role: "admin", source: null }])).toEqual([]);
  });

  it("leaves another provider's memberships to that provider", () => {
    expect(plan(["ops"], [{ workspaceId: OPS, role: "user", source: "entra" }])).toEqual([]);
    expect(plan([], [{ workspaceId: OPS, role: "admin", source: "entra" }])).toEqual([]);
  });

  it("skips a mapping whose workspace was deleted", () => {
    expect(plan(["gone"], [])).toEqual([]);
  });

  describe("in global, which nobody leaves", () => {
    const toGlobal = [
      { group: "mods", workspaceId: GLOBAL_WORKSPACE_ID, role: "moderator" as const },
    ];

    it("takes over the plain user row every account has", () => {
      expect(
        plan(
          ["mods"],
          [{ workspaceId: GLOBAL_WORKSPACE_ID, role: "user", source: null }],
          toGlobal,
        ),
      ).toEqual([
        {
          kind: "change",
          workspaceId: GLOBAL_WORKSPACE_ID,
          from: "user",
          to: "moderator",
          takeOver: true,
        },
      ]);
    });

    it("leaves a role root gave by hand there", () => {
      expect(
        plan(
          ["mods"],
          [{ workspaceId: GLOBAL_WORKSPACE_ID, role: "admin", source: null }],
          toGlobal,
        ),
      ).toEqual([]);
    });

    it("gives the row back as a hand-set user when the group goes", () => {
      expect(
        plan(
          [],
          [{ workspaceId: GLOBAL_WORKSPACE_ID, role: "moderator", source: "okta" }],
          toGlobal,
        ),
      ).toEqual([{ kind: "release", workspaceId: GLOBAL_WORKSPACE_ID, from: "moderator" }]);
    });

    it("changes nothing for a mapping to global as user", () => {
      expect(
        plan(
          ["all"],
          [{ workspaceId: GLOBAL_WORKSPACE_ID, role: "user", source: null }],
          [{ group: "all", workspaceId: GLOBAL_WORKSPACE_ID, role: "user" }],
        ),
      ).toEqual([]);
    });
  });
});
