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
    expect(line("workspace.updated", { name: "acme", from: "a", to: "b" })).toBe(
      "Changed the description of workspace acme",
    );
    expect(line("workspace.deleted", { name: "acme" })).toBe("Deleted workspace acme");
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
