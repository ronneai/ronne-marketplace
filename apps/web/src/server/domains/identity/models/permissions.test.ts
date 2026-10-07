import { describe, expect, it } from "vitest";
import {
  can,
  canInSome,
  INSTANCE_PERMISSIONS,
  type InstancePermission,
  requirePermission,
  type Subject,
  WORKSPACE_PERMISSIONS,
  type WorkspacePermission,
  workspacesWith,
} from "./permissions";

// MVP §2's matrix, by workspace (091): root everywhere; moderator and user per workspace.
const A = "workspace-a";
const B = "workspace-b";

const PEOPLE: Record<string, Subject> = {
  root: { role: "root", workspaces: {} },
  "admin in A": { role: "user", workspaces: { [A]: "admin" } },
  "moderator in A": { role: "user", workspaces: { [A]: "moderator" } },
  "user in A": { role: "user", workspaces: { [A]: "user" } },
  "non-member": { role: "user", workspaces: {} },
};

const INSTANCE = Object.keys(INSTANCE_PERMISSIONS) as InstancePermission[];
const WORKSPACE = Object.keys(WORKSPACE_PERMISSIONS) as WorkspacePermission[];

/** What each person holds in A, in B, and instance-wide. */
const EXPECTED: Record<
  string,
  { a: WorkspacePermission[]; b: WorkspacePermission[]; instance: InstancePermission[] }
> = {
  root: { a: WORKSPACE, b: WORKSPACE, instance: INSTANCE },
  "admin in A": { a: WORKSPACE, b: [], instance: ["account.manage_own"] },
  "moderator in A": {
    a: [
      "submissions.create",
      "submissions.view_submitted",
      "submissions.review",
      "submissions.publish",
      "versions.manage",
    ],
    b: [],
    instance: ["account.manage_own"],
  },
  "user in A": { a: ["submissions.create"], b: [], instance: ["account.manage_own"] },
  "non-member": { a: [], b: [], instance: ["account.manage_own"] },
};

describe("permissions (091)", () => {
  it.each(Object.keys(PEOPLE))("%s holds exactly their permissions, per workspace", (who) => {
    const person = PEOPLE[who] as Subject;
    const expected = EXPECTED[who];
    if (!expected) throw new Error(who);
    for (const permission of WORKSPACE) {
      expect(can(person, permission, A), `${who} → ${permission} in A`).toBe(
        expected.a.includes(permission),
      );
      expect(can(person, permission, B), `${who} → ${permission} in B`).toBe(
        expected.b.includes(permission),
      );
    }
    for (const permission of INSTANCE)
      expect(can(person, permission), `${who} → ${permission}`).toBe(
        expected.instance.includes(permission),
      );
  });

  it("splits the permissions: none is both instance-wide and per workspace", () => {
    expect(INSTANCE.filter((p) => (WORKSPACE as string[]).includes(p))).toEqual([]);
    expect([...INSTANCE, ...WORKSPACE].sort()).toEqual(
      [
        "account.manage_own",
        "audit.view",
        "members.manage",
        "scopes.create",
        "scopes.manage",
        "settings.manage",
        "submissions.create",
        "submissions.override",
        "submissions.publish",
        "submissions.review",
        "submissions.view_submitted",
        "users.manage",
        "users.view",
        "versions.manage",
        "workspace.edit",
        "workspaces.manage",
      ].sort(),
    );
  });

  it("refuses a workspace permission without a workspace, at type-check and at run time", () => {
    // @ts-expect-error A workspace permission needs the workspace it's checked in.
    expect(can(PEOPLE.root as Subject, "submissions.review")).toBe(false);
    // @ts-expect-error The same for requirePermission.
    expect(() => requirePermission(PEOPLE.root as Subject, "versions.manage")).toThrow();
  });

  it("ignores a root's memberships, and a user.role of moderator gives nothing", () => {
    expect(can({ role: "root", workspaces: { [A]: "user" } }, "submissions.review", A)).toBe(true);
    expect(can({ role: "moderator" as never, workspaces: {} }, "submissions.review", A)).toBe(
      false,
    );
    expect(can({ role: "moderator" as never, workspaces: {} }, "users.manage")).toBe(false);
  });

  it("gives nothing to someone who isn't signed in, or to an unknown workspace role", () => {
    for (const permission of INSTANCE) expect(can(null, permission)).toBe(false);
    for (const permission of WORKSPACE) expect(can(null, permission, A)).toBe(false);
    expect(
      can({ role: "user", workspaces: { [A]: "owner" as never } }, "submissions.create", A),
    ).toBe(false);
  });

  it("lists where a permission is held: all for root, the right memberships otherwise", () => {
    const both: Subject = { role: "user", workspaces: { [A]: "moderator", [B]: "user" } };
    expect(workspacesWith(PEOPLE.root as Subject, "submissions.review")).toBe("all");
    expect(workspacesWith(both, "submissions.review")).toEqual([A]);
    expect(workspacesWith(both, "submissions.create")).toEqual([A, B]);
    expect(workspacesWith(null, "submissions.create")).toEqual([]);
    expect(canInSome(both, "submissions.review")).toBe(true);
    expect(canInSome(PEOPLE["user in A"] as Subject, "submissions.review")).toBe(false);
    expect(canInSome(PEOPLE["non-member"] as Subject, "submissions.create")).toBe(false);
  });
});
