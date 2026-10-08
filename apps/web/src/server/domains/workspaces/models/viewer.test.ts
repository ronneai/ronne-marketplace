import { describe, expect, it } from "vitest";
import { narrowedViewer, seesWorkspace, visibilityKey, visibleWorkspaces } from "./viewer";

// Who sees which workspaces (093): the public ones for everyone signed in, a private one for its
// members (any role) and root, nothing signed out.
const WORKSPACES = [
  { id: "g", visibility: "public" as const },
  { id: "pub", visibility: "public" as const },
  { id: "acme", visibility: "private" as const },
  { id: "beta", visibility: "private" as const },
];
const user = (
  role: "root" | "user",
  workspaces: Record<string, "admin" | "moderator" | "user">,
) => ({
  id: "u1",
  role,
  workspaces,
});

describe("visibleWorkspaces (093)", () => {
  it("gives root every workspace, private ones included, without being a member", () => {
    const viewer = visibleWorkspaces(user("root", {}), WORKSPACES);
    expect(viewer).toEqual({
      userId: "u1",
      root: true,
      workspaceIds: ["acme", "beta", "g", "pub"],
      privateWorkspaceIds: ["acme", "beta"],
    });
    expect(seesWorkspace(viewer, "beta")).toBe(true);
    expect(seesWorkspace(viewer, "made-later")).toBe(true);
  });

  it("gives a member of a private workspace, in any role, that one and the public ones", () => {
    for (const role of ["user", "moderator", "admin"] as const) {
      const viewer = visibleWorkspaces(user("user", { g: "user", acme: role }), WORKSPACES);
      expect(viewer.workspaceIds, role).toEqual(["acme", "g", "pub"]);
      expect(viewer.privateWorkspaceIds, role).toEqual(["acme"]);
      expect(seesWorkspace(viewer, "beta"), role).toBe(false);
      expect(visibilityKey(viewer), role).toBe("acme");
    }
  });

  it("gives a non-member only the public ones, whatever they moderate elsewhere", () => {
    const viewer = visibleWorkspaces(user("user", { g: "moderator", pub: "admin" }), WORKSPACES);
    expect(viewer.workspaceIds).toEqual(["g", "pub"]);
    expect(viewer.privateWorkspaceIds).toEqual([]);
    expect(seesWorkspace(viewer, "acme")).toBe(false);
  });

  it("gives every public-only user the same, empty visibility key", () => {
    const a = visibleWorkspaces(user("user", { g: "user" }), WORKSPACES);
    const b = visibleWorkspaces({ ...user("user", {}), id: "u2" }, WORKSPACES);
    expect(visibilityKey(a)).toBe("");
    expect(visibilityKey(b)).toBe("");
    expect(a.workspaceIds).toEqual(b.workspaceIds);
  });

  it("gives nobody signed out nothing, and keys the private ones in sorted order", () => {
    expect(visibleWorkspaces(null, WORKSPACES)).toEqual({
      userId: null,
      root: false,
      workspaceIds: [],
      privateWorkspaceIds: [],
    });
    // The workspaces come in another order than sorted: the key mustn't follow the input's.
    const reversed = [...WORKSPACES].reverse();
    const both = visibleWorkspaces(user("user", { beta: "user", acme: "user" }), reversed);
    expect(both.privateWorkspaceIds).toEqual(["acme", "beta"]);
    expect(both.workspaceIds).toEqual(["acme", "beta", "g", "pub"]);
    expect(visibilityKey(both)).toBe("acme,beta");
  });

  it("ignores a membership of a workspace that no longer exists", () => {
    const viewer = visibleWorkspaces(user("user", { gone: "admin" }), WORKSPACES);
    expect(viewer.workspaceIds).toEqual(["g", "pub"]);
  });
});

describe("narrowedViewer (093, a git mirror)", () => {
  it("keeps the public workspaces and only the chosen private ones the viewer sees", () => {
    const member = visibleWorkspaces(user("user", { acme: "user", beta: "user" }), WORKSPACES);
    const narrowed = narrowedViewer(member, ["acme", "gone"]);
    expect(narrowed.workspaceIds).toEqual(["acme", "g", "pub"]);
    expect(narrowed.privateWorkspaceIds).toEqual(["acme"]);
    expect(visibilityKey(narrowedViewer(member, []))).toBe("");
  });

  it("never adds a private workspace the viewer doesn't see", () => {
    const outsider = visibleWorkspaces(user("user", {}), WORKSPACES);
    expect(narrowedViewer(outsider, ["acme"]).workspaceIds).toEqual(["g", "pub"]);
  });

  it("isn't root any more: root sees the chosen ones only, as a member would", () => {
    const root = visibleWorkspaces(user("root", {}), WORKSPACES);
    const narrowed = narrowedViewer(root, ["beta"]);
    expect(narrowed.root).toBe(false);
    expect(narrowed).toEqual({
      ...narrowedViewer(visibleWorkspaces(user("user", { beta: "user" }), WORKSPACES), ["beta"]),
      userId: "u1",
    });
  });
});
