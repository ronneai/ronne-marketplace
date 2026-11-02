import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { apiRoute } from "../../../http/api-route";
import { serverAction } from "../../../http/server-action";
import { runJob } from "../../../jobs/run-job";
import { setProcessChannel, withChannel, withRequestContext } from "../../../log";
import { AUDIT_ACTIONS, type AuditAction, inWorkspace } from "../models/audit-event";
import { listAuditEvents, recordAudit } from "./audit";

// Server actions read their headers and holds through Next; outside a request there are none.
vi.mock("../../../http/password-change-hold", () => ({
  PASSWORD_PATH: "/account/password",
  passwordChangeHold: async () => false,
}));
vi.mock("../../../http/two-factor-hold", () => ({
  SECURITY_PATH: "/account/security",
  twoFactorHold: async () => false,
}));

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  setProcessChannel(undefined);
  await t.cleanup();
});

const record = (action: AuditAction = "user.created") =>
  recordAudit(t.db, t.dialect, {
    actorId: null,
    action,
    target: { type: "instance" },
    workspaceId: null,
  });

const last = async () => {
  const { events } = await listAuditEvents(t.db, t.dialect, {});
  const event = events[0];
  if (!event) throw new Error("no event");
  return event;
};

const call = (route: string, headers: Record<string, string> = {}) =>
  apiRoute(route, async () => {
    await record();
    return new Response(null, { status: 204 });
  })(new Request(`http://localhost:3000${route}`, { headers }), {});

describe("what an event came from (166)", () => {
  it("an API request: its ID, as the response says it, the API channel and the client", async () => {
    const response = await call("/api/v1/drafts", { "user-agent": "rmk/0.9.0 (laptop; darwin)" });
    expect(await last()).toMatchObject({
      requestId: response.headers.get("x-request-id"),
      via: "api",
      userAgent: "rmk/0.9.0 (laptop; darwin)",
      outcome: "success",
    });
  });

  it("SCIM under /api/v1/scim, and the web app for the browser's own routes", async () => {
    await call("/api/v1/scim/v2/[...path]", { "user-agent": "Okta SCIM Client 1.0.0" });
    expect(await last()).toMatchObject({ via: "scim", userAgent: "Okta SCIM Client 1.0.0" });
    await call("/api/auth/[...all]");
    expect(await last()).toMatchObject({ via: "web", userAgent: null });
    await call("/account/data");
    expect(await last()).toMatchObject({ via: "web" });
  });

  it("a browser route outside /api keeps the ID proxy.ts gave it, the one its response carries", async () => {
    // proxy.ts sets X-Request-Id on the request it forwards (and on the response), even without
    // TRUST_PROXY; the route uses that one.
    const response = await call("/account/data", { "x-request-id": "01K9PROXYGIVENID0000000000" });
    expect(response.headers.get("x-request-id")).toBe("01K9PROXYGIVENID0000000000");
    expect((await last()).requestId).toBe("01K9PROXYGIVENID0000000000");
    // Under /api there's no proxy in between: without TRUST_PROXY, a sent ID isn't taken.
    const api = await call("/api/v1/me", { "x-request-id": "attacker-chosen" });
    expect((await last()).requestId).toBe(api.headers.get("x-request-id"));
    expect(api.headers.get("x-request-id")).not.toBe("attacker-chosen");
  });

  it("a server action: the web app, with a request ID of its own", async () => {
    await serverAction(async () => {
      await record();
    })();
    const event = await last();
    expect(event.via).toBe("web");
    expect(event.requestId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("a terminal command: cli, and no request", async () => {
    setProcessChannel("cli");
    await record();
    expect(await last()).toMatchObject({ via: "cli", requestId: null, userAgent: null });
  });

  it("a scheduled job: system; the same job run from a terminal (purge): cli", async () => {
    const job = () =>
      runJob({ db: t.db, dialect: t.dialect }, "probe", async () => {
        await record();
        return {};
      });
    await job();
    expect(await last()).toMatchObject({ via: "system", requestId: null });
    setProcessChannel("cli");
    await job();
    expect(await last()).toMatchObject({ via: "cli" });
  });

  it("withChannel keeps the request it runs in, and changes only the channel", async () => {
    await withRequestContext({ requestId: "req-1", via: "web", userAgent: "UA" }, () =>
      withChannel("system", () => record()),
    );
    expect(await last()).toMatchObject({ requestId: "req-1", via: "system", userAgent: "UA" });
  });

  it("nothing known: no channel", async () => {
    await record();
    expect(await last()).toMatchObject({ via: null, requestId: null, userAgent: null });
  });

  it("cuts and cleans the client, and leaves none when nothing is left", async () => {
    // Through a real request: a header is Latin-1, so a long plain one.
    await call("/api/v1/me", { "user-agent": `Mozilla/5.0 ${"x".repeat(400)}` });
    expect((await last()).userAgent).toHaveLength(256);
    // Cut at a whole character, never inside one (a pair of UTF-16 units).
    const long = `${"🙂".repeat(250)}${"x".repeat(50)}`;
    await withRequestContext({ requestId: "r", userAgent: long }, () => record());
    const kept = (await last()).userAgent ?? "";
    expect([...kept]).toHaveLength(256);
    expect(kept).toBe([...long].slice(0, 256).join(""));
    // Control and format characters out (a header can't hold a line break; a bidi mark can).
    await withRequestContext({ requestId: "r", userAgent: "rmk\u0007/1‮.0\u0000" }, () => record());
    expect((await last()).userAgent).toBe("rmk/1.0");
    await withRequestContext({ requestId: "r", userAgent: "a\u2028b\u2029c" }, () => record());
    expect((await last()).userAgent).toBe("abc");
    await withRequestContext({ requestId: "r", userAgent: " ​ " }, () => record());
    expect((await last()).userAgent).toBeNull();
  });

  it("records failures as failed, a SCIM refusal as denied, and the rest as a success", async () => {
    for (const [action, outcome] of [
      ["auth.sign_in_failed", "failed"],
      ["auth.two_factor_failed", "failed"],
      ["auth.sso_failed", "failed"],
      ["auth.device_denied", "failed"],
      ["auth.device_expired", "failed"],
      ["scim.request_refused", "denied"],
      ["auth.signed_in", "success"],
      ["version.published", "success"],
    ] as const) {
      await record(action);
      expect((await last()).outcome, action).toBe(outcome);
    }
  });
});

describe("the workspace an event is about (166)", () => {
  const event = (action: AuditAction, workspaceId?: string | null) =>
    recordAudit(t.db, t.dialect, {
      actorId: null,
      action,
      target: { type: "submission", id: "s1" },
      ...(workspaceId === undefined ? {} : { workspaceId }),
    });

  it("marks the actions about something in a workspace, and workspace pins only", () => {
    const marked = AUDIT_ACTIONS.filter((action) =>
      inWorkspace({ action, target: { type: "instance" } }),
    );
    const prefixes = [
      "workspace.",
      "scope.",
      "item.",
      "submission.",
      "version.",
      "dist_tag.",
      "scan.",
    ];
    expect(marked).toEqual(AUDIT_ACTIONS.filter((a) => prefixes.some((p) => a.startsWith(p))));
    // A few that stay out: a user's, a sign-in, the instance's.
    for (const action of ["user.created", "auth.signed_in", "instance.secret_rotated"] as const)
      expect(marked).not.toContain(action);
    // A pin is in a workspace on its shelf, not on root's Start here.
    expect(inWorkspace({ action: "pin.added", target: { type: "workspace", id: "w" } })).toBe(true);
    expect(inWorkspace({ action: "pin.added", target: { type: "instance" } })).toBe(false);
  });

  it("stores it and reads it back, byte for byte, outliving the workspace", async () => {
    await event("submission.approved", "01K9WORKSPACE0000000000000");
    expect((await last()).workspaceId).toBe("01K9WORKSPACE0000000000000");
    await event("user.created");
    expect((await last()).workspaceId).toBeNull();
  });

  it("refuses, under test, an event about something in a workspace recorded without it", async () => {
    await expect(event("submission.approved")).rejects.toThrow(
      '"submission.approved" is about something in a workspace',
    );
    await expect(
      recordAudit(t.db, t.dialect, {
        actorId: null,
        action: "pin.removed",
        target: { type: "workspace", id: "w" },
      }),
    ).rejects.toThrow("pin.removed");
    // Null says there's none to name (asking to join a name that isn't a workspace).
    await event("workspace.access_requested", null);
    expect((await last()).workspaceId).toBeNull();
    // Root's Start here and actions outside workspaces need none.
    await recordAudit(t.db, t.dialect, {
      actorId: null,
      action: "pin.added",
      target: { type: "instance" },
    });
    await event("user.created");
  });
});
