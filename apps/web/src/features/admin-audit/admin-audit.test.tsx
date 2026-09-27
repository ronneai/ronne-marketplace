import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@/server/domains/audit/models/audit-event";
import { actorLabel, detailPairs, formatUtc } from "./format";
import { auditPageUrl, parseAuditQuery } from "./query";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const audit = vi.hoisted(() => ({ appAuditPage: vi.fn() }));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/domains/audit/actions/audit-page", () => audit);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const ULID = "01K6BZ3W1D8J9Q2R4T6V8X0Y2Z";

describe("parseAuditQuery", () => {
  it("reads valid filters, and makes the date range cover the whole last day", () => {
    const query = parseAuditQuery({
      group: "access_token",
      actor: ULID,
      from: "2026-09-01",
      to: "2026-09-02",
      cursor: ULID,
    });
    expect(query).toMatchObject({
      group: "access_token",
      actor: ULID,
      cursor: ULID,
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-03T00:00:00Z"),
      filters: { group: "access_token", actor: ULID, from: "2026-09-01", to: "2026-09-02" },
    });
    expect(parseAuditQuery({ actor: "system" }).actor).toBe("system");
  });

  it("ignores anything malformed rather than trusting it", () => {
    const query = parseAuditQuery({
      group: "users",
      actor: "'; drop table audit_log; --",
      from: "yesterday",
      to: "2026-13-45",
      cursor: "../../etc",
    });
    expect(query).toEqual({
      filters: { group: "", actor: "", from: "", to: "" },
      cursor: undefined,
      group: undefined,
      actor: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("builds page URLs that keep the filters", () => {
    const filters = { group: "auth", actor: "", from: "2026-09-01", to: "" };
    expect(auditPageUrl(filters, ULID)).toBe(
      `/admin/audit?group=auth&from=2026-09-01&cursor=${ULID}`,
    );
    expect(auditPageUrl({ group: "", actor: "", from: "", to: "" })).toBe("/admin/audit");
  });
});

describe("format", () => {
  it("shows UTC with the zone", () => {
    expect(formatUtc(new Date("2026-09-27T19:15:03.123Z"))).toBe("2026-09-27 19:15:03 UTC");
  });

  it("names the actor: email, cli, system, or the id of a removed user", () => {
    expect(actorLabel({ actorId: ULID, actorEmail: "root@example.com", metadata: {} })).toBe(
      "root@example.com",
    );
    expect(actorLabel({ actorId: null, actorEmail: null, metadata: { via: "cli" } })).toBe("cli");
    expect(actorLabel({ actorId: null, actorEmail: null, metadata: {} })).toBe("system");
    expect(actorLabel({ actorId: ULID, actorEmail: null, metadata: {} })).toBe(ULID);
  });

  it("lists details as key and value pairs", () => {
    expect(detailPairs({ email: "a@example.com", remember: true, sessionsEnded: 2 })).toEqual([
      ["email", "a@example.com"],
      ["remember", "true"],
      ["sessionsEnded", "2"],
    ]);
  });
});

const event = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  id: ULID,
  actorId: ULID,
  actorEmail: "root@example.com",
  action: "auth.signed_in",
  targetType: "session",
  targetId: "01K6BZ3W1D8J9Q2R4T6V8X0Y30",
  metadata: { remember: true },
  ipAddress: "203.0.113.9",
  createdAt: new Date("2026-09-27T19:15:03Z"),
  ...overrides,
});

const { AuditLogPage } = await import("./AuditLogPage");
const { default: Page } = await import("@/app/(app)/admin/audit/page");

describe("AuditLogPage", () => {
  const noFilters = { group: "", actor: "", from: "", to: "" };

  it("renders the events with every column, and the next-page link", () => {
    const html = renderToStaticMarkup(
      <AuditLogPage
        events={[
          event(),
          event({
            id: "01K6BZ3W1D8J9Q2R4T6V8X0Y31",
            actorId: null,
            actorEmail: null,
            action: "auth.sign_in_failed",
            targetType: "none",
            targetId: null,
            metadata: { email: "x@example.com", reason: "invalid" },
            ipAddress: null,
          }),
        ]}
        nextCursor={ULID}
        filters={noFilters}
        paged={false}
        actors={[{ id: ULID, email: "root@example.com" }]}
      />,
    );
    for (const text of [
      "Audit log",
      "2026-09-27 19:15:03 UTC",
      "root@example.com",
      "auth.signed_in",
      "auth.sign_in_failed",
      "session",
      ">remember<",
      ">true<",
      "203.0.113.9",
      ">system<",
      `href="/admin/audit?cursor=${ULID}"`,
      "Older →",
      'value="access_token"',
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).not.toContain("Newest");
  });

  it("says when nothing matches, and links back to the newest page", () => {
    const html = renderToStaticMarkup(
      <AuditLogPage
        events={[]}
        nextCursor={null}
        filters={{ ...noFilters, group: "user" }}
        paged
        actors={[]}
      />,
    );
    expect(html).toContain("No events match these filters.");
    expect(html).toContain('href="/admin/audit?group=user"');
    expect(html).not.toContain("Older");
  });
});

describe("/admin/audit page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audit.appAuditPage.mockResolvedValue({ events: [event()], nextCursor: null, actors: [] });
  });

  it("is a 404 for anyone but root, without reading the log", async () => {
    for (const user of [null, { role: "user" }, { role: "moderator" }]) {
      session.getCurrentUser.mockResolvedValueOnce(user);
      await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(audit.appAuditPage).not.toHaveBeenCalled();
  });

  it("shows root the log, passing the parsed filters on", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ group: "auth", cursor: ULID }) }),
    );
    expect(html).toContain("auth.signed_in");
    expect(audit.appAuditPage).toHaveBeenCalledWith({
      cursor: ULID,
      group: "auth",
      actor: undefined,
      from: undefined,
      to: undefined,
    });
  });
});
