import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import { notify } from "../services/notify";
import {
  latestNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  pageNotifications,
  unreadCount,
} from "./notifications";

let t: TestDb;
let app: AppAuth;
let ana: Headers;
let bruno: Headers;
let anaId: string;
let brunoId: string;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  anaId = await createTestUser(app, { email: "ana@example.com", password });
  brunoId = await createTestUser(app, { email: "bruno@example.com", password });
  ana = await signedIn("ana@example.com");
  bruno = await signedIn("bruno@example.com");
});
afterEach(() => t.cleanup());

const tell = (to: string, n = 1) =>
  Promise.all(
    Array.from({ length: n }, () =>
      notify(t.db, t.dialect, {
        recipients: [to],
        kind: "membership.added",
        actorId: null,
        subject: { type: "workspace", id: GLOBAL_WORKSPACE_ID },
        params: { workspace: "global", role: "user" },
      }),
    ),
  );

describe("reading your notifications (139)", () => {
  it("counts and lists your own, never anyone else's", async () => {
    await tell(anaId, 3);
    await tell(brunoId, 1);
    expect(await unreadCount(ana, app)).toBe(3);
    expect(await unreadCount(bruno, app)).toBe(1);
    const latest = await latestNotifications(ana, app);
    expect(latest?.unread).toBe(3);
    expect(latest?.items).toHaveLength(3);
    const paged = await pageNotifications(ana, { size: 2 }, app);
    expect(paged?.rows).toHaveLength(2);
    expect(paged?.next).not.toBeNull();
  });

  it("gives nothing to someone who isn't signed in", async () => {
    await tell(anaId);
    const nobody = new Headers();
    expect(await unreadCount(nobody, app)).toBeNull();
    expect(await latestNotifications(nobody, app)).toBeNull();
    expect(await pageNotifications(nobody, { size: 5 }, app)).toBeNull();
    expect(await markNotificationsRead(nobody, ["x"], app)).toBeNull();
    expect(await markAllNotificationsRead(nobody, app)).toBeNull();
  });

  it("lists at most ten in the popover", async () => {
    await tell(anaId, 14);
    const latest = await latestNotifications(ana, app);
    expect(latest?.items).toHaveLength(10);
    expect(latest?.unread).toBe(14);
  });
});

describe("marking read (139)", () => {
  it("marks your own and says how many are still unread", async () => {
    await tell(anaId, 3);
    const [first] = (await latestNotifications(ana, app))?.items ?? [];
    const result = await markNotificationsRead(ana, [first?.id ?? ""], app);
    expect(result).toEqual({ changed: [first?.id], unread: 2 });
    // Again: nothing changes.
    expect(await markNotificationsRead(ana, [first?.id ?? ""], app)).toEqual({
      changed: [],
      unread: 2,
    });
  });

  it("never marks someone else's, whatever ids it is given", async () => {
    await tell(anaId, 1);
    await tell(brunoId, 2);
    const theirs = (await latestNotifications(bruno, app))?.items.map((n) => n.id) ?? [];
    const result = await markNotificationsRead(ana, [...theirs, "x".repeat(200), ""], app);
    expect(result).toEqual({ changed: [], unread: 1 });
    expect(await unreadCount(bruno, app)).toBe(2);
    // Marking all is yours alone too.
    expect(await markAllNotificationsRead(ana, app)).toEqual({ changed: 1, unread: 0 });
    expect(await unreadCount(bruno, app)).toBe(2);
  });

  it("ignores ids beyond a page's worth", async () => {
    await tell(anaId, 3);
    const ids = ((await latestNotifications(ana, app))?.items ?? []).map((n) => n.id);
    const padded = [...Array.from({ length: 150 }, (_, i) => `pad-${i}`), ...ids];
    // The real ids sit past the 100th: they are not read.
    expect(await markNotificationsRead(ana, padded, app)).toEqual({ changed: [], unread: 3 });
  });
});
