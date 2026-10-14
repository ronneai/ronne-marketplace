import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, type AuditEvent } from "@/server/domains/audit/models/audit-event";
import { SUMMARIES, summarize, summaryText } from "./summary";

const event = (action: string, metadata: AuditEvent["metadata"] = {}, extra = {}): AuditEvent => ({
  id: "01K6BZ3W1D8J9Q2R4T6V8X0Y31",
  actorId: null,
  actorEmail: null,
  action,
  targetType: "user",
  targetId: null,
  targetEmail: null,
  metadata,
  ipAddress: null,
  createdAt: new Date("2026-10-02T12:00:00Z"),
  ...extra,
});

const line = (action: string, metadata: AuditEvent["metadata"] = {}, extra = {}) =>
  summaryText(summarize(event(action, metadata, extra)));

describe("audit summaries (060)", () => {
  it("has one for every action in the catalogue", () => {
    expect(Object.keys(SUMMARIES).sort()).toEqual([...AUDIT_ACTIONS].sort());
    for (const action of AUDIT_ACTIONS) {
      const text = line(action, { name: "@team/x", version: "1.0.0", tag: "latest" });
      expect(text, action).not.toContain(`${action} (`);
      expect(text.length, action).toBeGreaterThan(5);
    }
  });

  it("reads as sentences from what each event records", () => {
    expect(line("auth.signed_in", { remember: true })).toBe("Signed in (remembered for 30 days)");
    expect(line("auth.sign_in_failed", { email: "alex@example.com", reason: "invalid" })).toBe(
      "Failed sign-in for alex@example.com: wrong email or password",
    );
    expect(
      line("user.role_changed", { from: "user", to: "moderator" }, { targetEmail: "alex@x.com" }),
    ).toBe("Changed alex@x.com from user to moderator");
    expect(
      line("user.disabled", { sessionsEnded: 2, tokensRevoked: 1 }, { targetEmail: "alex@x.com" }),
    ).toBe("Disabled alex@x.com (2 sessions ended, 1 token revoked)");
    expect(
      line("instance.access_revoked", {
        via: "cli",
        scope: "everyone",
        sessionsEnded: 41,
        tokensRevoked: 23,
      }),
    ).toBe(
      "Revoked everyone's access (41 sessions ended, 23 tokens revoked) from the command line",
    );
    expect(
      line(
        "instance.access_revoked",
        { via: "cli", scope: "user", email: "alex@x.com", sessionsEnded: 0, tokensRevoked: 0 },
        { targetEmail: "alex@x.com" },
      ),
    ).toBe("Revoked the access of alex@x.com (nothing left) from the command line");
    expect(line("instance.secret_rotated", { via: "cli", sessionsEnded: 4 })).toBe(
      "Replaced AUTH_SECRET, so everyone signs in again (4 sessions ended) from the command line",
    );
    expect(
      line("instance.backup_made", {
        via: "cli",
        tables: 31,
        rows: 1284,
        files: 412,
        bytes: 1_000_000,
        encrypted: false,
        settings: true,
      }),
    ).toBe(
      "Made a backup: 1284 rows in 31 tables, 412 stored files, with the settings file from the command line",
    );
    expect(
      line("instance.restored", {
        via: "cli",
        from: { version: "0.3.2", dialect: "sqlite", time: "2026-10-12T15:31:02.123Z" },
        rows: 1284,
        files: 412,
      }),
    ).toBe(
      "Restored a backup made by Ronne 0.3.2 at 2026-10-12 15:31: 1284 rows, 412 stored files from the command line",
    );
    expect(line("access_token.created", { name: "laptop", expiresAt: null, via: "cli" })).toBe(
      "Created token laptop (no expiry, from rmk login)",
    );
    expect(
      line("version.published", { name: "@team/reviewer", version: "1.2.0", tag: "latest" }),
    ).toBe("Published @team/reviewer@1.2.0 as latest");
    expect(
      line("dist_tag.moved", { name: "@team/reviewer", tag: "beta", from: "1.2.0", to: "1.3.0" }),
    ).toBe("Moved beta of @team/reviewer from 1.2.0 to 1.3.0");
    expect(line("workspace.created", { name: "acme", description: "Acme's teams." })).toBe(
      "Created workspace acme",
    );
    expect(
      line("workspace.renamed", {
        from: "acme",
        to: "acme-platform",
        items: 12,
        requestsJoined: 0,
      }),
    ).toBe("Renamed workspace acme to acme-platform");
    expect(line("workspace.updated", { name: "acme", from: "a", to: "b" })).toBe(
      "Changed the description of workspace acme",
    );
    expect(line("workspace.deleted", { name: "acme" })).toBe("Deleted workspace acme");
    // The open move requests into it (115), closed with it.
    expect(line("workspace.deleted", { name: "acme", members: 2, scopeMoves: 1 })).toBe(
      "Deleted workspace acme (2 members, 1 move request)",
    );
    expect(line("workspace.deleted", { name: "acme", members: 1, scopeMoves: 0 })).toBe(
      "Deleted workspace acme (1 member)",
    );
    expect(
      line("scope.moved", {
        scope: "@beta/infra",
        newName: "@acme/infra",
        to: "acme",
        direct: false,
        items: 2,
        reviewed: 1,
      }),
    ).toBe("Approved moving @beta/infra to acme, as @acme/infra (2 items, 1 version reviewed)");
    const named = { scope: "@beta/infra", newName: "@acme/infra-tools", to: "acme" };
    expect(line("scope.move_requested", named)).toBe(
      "Asked to move @beta/infra to acme, as @acme/infra-tools",
    );
    expect(line("scope.move_declined", named)).toBe("Declined moving @beta/infra to acme");
    expect(line("scope.move_cancelled", { ...named, reason: "asker_lost_role" })).toBe(
      "Cancelled moving @beta/infra to acme (whoever asked can no longer move it)",
    );
    // Requests to join (094).
    const asker = { email: "uma@x.com", workspace: "acme" };
    expect(line("workspace.access_requested", asker)).toBe("uma@x.com asked to join acme");
    expect(line("workspace.access_approved", { ...asker, role: "user" })).toBe(
      "Approved uma@x.com joining acme as user",
    );
    expect(line("workspace.access_approved", { ...asker, role: "user", direct: true })).toBe(
      "Approved the request of uma@x.com by adding them to acme as user",
    );
    expect(line("workspace.access_declined", asker)).toBe("Declined uma@x.com joining acme");
    expect(line("workspace.access_cancelled", asker)).toBe(
      "uma@x.com cancelled their request to join acme",
    );
    expect(
      line("user.disabled", { sessionsEnded: 0, tokensRevoked: 0, requestsCancelled: 2 }),
    ).toBe("Disabled a user (2 requests to join cancelled)");
    // Its visibility (093), and its description as before.
    expect(line("workspace.updated", { name: "acme", visibility: "private", from: "public" })).toBe(
      "Made workspace acme private",
    );
    expect(line("workspace.updated", { name: "acme", visibility: "public", from: "private" })).toBe(
      "Made workspace acme public",
    );
    expect(line("workspace.updated", { name: "acme", from: "Old.", to: "New." })).toBe(
      "Changed the description of workspace acme",
    );
    expect(line("scope.created", { name: "team", description: "A team." })).toBe(
      "Created scope @team",
    );
    expect(line("settings.usage_policy", { from: "off", to: "choice" })).toBe(
      "Changed the usage policy from off to people choose",
    );
    expect(
      line("submission.rebased", { name: "@team/x", from: "1.0.0", to: "1.1.0", conflicts: ["a"] }),
    ).toBe("Rebased @team/x from 1.0.0 to 1.1.0 (1 conflict)");
  });

  it("marks names and codes for the page to style", () => {
    expect(
      summarize(event("version.published", { name: "@t/x", version: "1.0.0", tag: "latest" })),
    ).toEqual(["Published ", { name: "@t/x@1.0.0" }, " as ", { code: "latest" }]);
  });

  it("never throws: missing keys read as nothing, an unknown action falls back", () => {
    expect(line("user.disabled")).toBe("Disabled a user");
    expect(line("submission.approved")).toBe("Approved an item");
    expect(line("user.archived")).toBe("user.archived (user)");
  });
});
