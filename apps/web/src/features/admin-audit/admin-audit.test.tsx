import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseListQuery } from "@/components/ui/data-table/list-query";
import type { AuditEvent } from "@/server/domains/audit/models/audit-event";
import { actorLabel, detailPairs } from "./format";
import { AUDIT_LIST, auditQueryOf, checkedState } from "./list";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const audit = vi.hoisted(() => ({ appAuditPage: vi.fn(), appAuditEvent: vi.fn() }));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/domains/audit/actions/audit-page", () => audit);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
}));

const ULID = "01K6BZ3W1D8J9Q2R4T6V8X0Y2Z";
const state = (params: Record<string, string> = {}) =>
  checkedState(parseListQuery(AUDIT_LIST, params));

describe("the audit list's URL (060)", () => {
  it("turns a view into the server query; the date range covers the whole last day", () => {
    expect(
      auditQueryOf(
        state({
          action: "user.*",
          actor: "alex",
          from: "2026-09-01",
          to: "2026-09-02",
          size: "25",
        }),
      ),
    ).toEqual({
      sort: "time",
      dir: "desc",
      size: 25,
      cursor: undefined,
      action: undefined,
      group: "user",
      actor: "alex",
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-03T00:00:00Z"),
    });
    expect(auditQueryOf(state({ action: "user.created", sort: "action" }))).toMatchObject({
      action: "user.created",
      group: undefined,
      sort: "action",
      dir: "asc",
    });
  });

  it("drops an action the catalogue doesn't know, and an invalid date", () => {
    const view = state({ action: "users.*", from: "yesterday" });
    expect(view.filters).toMatchObject({ action: "", from: "" });
    expect(auditQueryOf(state({ action: "user.archived" }))).toMatchObject({
      action: undefined,
      group: undefined,
    });
  });
});

describe("format", () => {
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
  targetEmail: null,
  metadata: { remember: true },
  ipAddress: "203.0.113.9",
  createdAt: new Date("2026-09-27T19:15:03Z"),
  ...overrides,
});

const { AuditLogPage } = await import("./AuditLogPage");
const { default: Page } = await import("@/app/(app)/admin/audit/page");

const failed = event({
  id: "01K6BZ3W1D8J9Q2R4T6V8X0Y31",
  actorId: null,
  actorEmail: null,
  action: "auth.sign_in_failed",
  targetType: "none",
  targetId: null,
  metadata: { email: "x@example.com", reason: "invalid" },
  ipAddress: null,
});
const page = (props: Partial<Parameters<typeof AuditLogPage>[0]> = {}) =>
  renderToStaticMarkup(
    <AuditLogPage
      state={state()}
      events={[event(), failed]}
      page={{ next: "c2", previous: null }}
      total={{ count: 2, capped: false }}
      {...props}
    />,
  );

describe("AuditLogPage (060)", () => {
  it("shows one line per event: time, actor, the action and its summary, and a details link", () => {
    const html = page();
    for (const text of [
      "Audit log",
      "2026-09-27 19:15 UTC",
      "root@example.com",
      ">auth.signed_in<",
      "Signed in (remembered for 30 days)",
      ">system<",
      "Failed sign-in for",
      `href="/admin/audit?event=${ULID}"`,
      'aria-label="Details: Signed in (remembered for 30 days)"',
      "2 events",
      'href="/admin/audit?cursor=c2"',
      'value="user.*"',
      'value="user.role_changed"',
    ]) {
      expect(html, text).toContain(text);
    }
    // The IP address and metadata are in the dialog, not the line.
    expect(html).not.toContain("203.0.113.9");
    expect(html).not.toContain(">remember<");
  });

  it("sorts by time and by action from the headers", () => {
    const html = page();
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('href="/admin/audit?dir=asc"');
    expect(html).toContain('href="/admin/audit?sort=action"');
  });

  it("shows active filters as chips that remove themselves, and Clear", () => {
    const html = page({ state: state({ action: "user.*", actor: "alex" }), events: [] });
    expect(html).toContain("No events match these filters.");
    expect(html).toMatch(
      /aria-label="Remove the action filter"[^>]*href="\/admin\/audit\?actor=alex"/,
    );
    expect(html).toMatch(
      /aria-label="Remove the actor filter"[^>]*href="\/admin\/audit\?action=user\.\*"/,
    );
    expect(html).toMatch(/href="\/admin\/audit"[^>]*>Clear</);
  });

  it("opens an event's details: every field, the target link and the raw JSON", () => {
    const html = page({
      selected: event({
        targetType: "user",
        targetId: ULID,
        targetEmail: "alex@example.com",
        action: "user.role_changed",
        metadata: { from: "user", to: "moderator" },
      }),
    });
    for (const text of [
      "Event details",
      "2026-09-27 19:15:03 UTC",
      "Changed </span><strong",
      "alex@example.com",
      'href="/admin/users?q=alex%40example.com"',
      "203.0.113.9",
      ">from<",
      ">moderator<",
      "Raw JSON",
      "Open in Users",
      "copy json",
    ]) {
      expect(html, text).toContain(text);
    }
  });

  it("says when the event in the URL doesn't exist", () => {
    expect(page({ selected: "missing" })).toContain("That event doesn&#x27;t exist.");
  });
});

describe("/admin/audit page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audit.appAuditPage.mockResolvedValue({
      events: [event()],
      next: null,
      previous: null,
      total: { count: 1, capped: false },
    });
    audit.appAuditEvent.mockResolvedValue(event());
  });

  it("is a 404 for anyone but root, without reading the log", async () => {
    for (const user of [null, { role: "user" }, { role: "moderator" }]) {
      session.getCurrentUser.mockResolvedValueOnce(user);
      await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(audit.appAuditPage).not.toHaveBeenCalled();
  });

  it("shows root the log for the view in the URL, and the event it names", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ action: "auth.*", sort: "action", event: ULID }),
      }),
    );
    expect(html).toContain("auth.signed_in");
    expect(html).toContain("Event details");
    expect(audit.appAuditPage).toHaveBeenCalledWith(
      expect.objectContaining({ group: "auth", sort: "action", dir: "asc", size: 50 }),
    );
    expect(audit.appAuditEvent).toHaveBeenCalledWith(ULID);
  });

  it("doesn't look up an event id that isn't one", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ event: "../../etc" }) }),
    );
    expect(audit.appAuditEvent).not.toHaveBeenCalled();
    expect(html).toContain("That event doesn&#x27;t exist.");
  });
});
