import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, type Permission } from "./permissions";
import type { Role } from "./user";

// MVP §2's matrix for M1's permissions: role → what it can do.
const EXPECTED: Record<Role, Permission[]> = {
  user: ["account.manage_own"],
  moderator: ["account.manage_own"],
  root: ["account.manage_own", "users.view", "users.manage", "audit.view", "scopes.manage"],
};

describe("permissions", () => {
  it.each(Object.entries(EXPECTED))("%s has exactly its permissions", (role, allowed) => {
    for (const permission of Object.keys(PERMISSIONS) as Permission[]) {
      expect(can({ role: role as Role }, permission), `${role} → ${permission}`).toBe(
        allowed.includes(permission),
      );
    }
  });

  it("gives nothing to someone who isn't signed in", () => {
    for (const permission of Object.keys(PERMISSIONS) as Permission[]) {
      expect(can(null, permission)).toBe(false);
    }
  });

  it("gives nothing to a role outside the three", () => {
    expect(can({ role: "admin" as Role }, "users.manage")).toBe(false);
  });
});
