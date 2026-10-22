import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { FeedbackError, FeedbackLimitError, InvalidFeedbackError } from "../exceptions/errors";
import { FEEDBACK_PER_HOUR, FEEDBACK_WINDOW_MS } from "../models/feedback";
import { kyselyFeedbackRepository } from "../repositories/kysely-feedback-repository";
import * as service from "../services/feedback";
import { createFeedbackLimiter } from "../services/feedback-limiter";
import {
  countFeedback,
  countNewFeedback,
  deleteFeedback,
  findFeedback,
  markFeedbackHandled,
  pageFeedback,
  sendFeedback,
} from "./feedback";

// Feedback (feature 127) through the actions: who may send and who may read, the limit, the audit.
let t: TestDb;
let app: AppAuth;
let userId: string;
let asRoot: Headers;
let asUser: Headers;
let asAnon: Headers;
const password = "correct horse battery";
const query = { sort: "created", dir: "desc", size: 25 } as const;

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const audits = async () =>
  (
    await t.db
      .selectFrom("audit_log")
      .select(["action", "target_type", "target_id", "metadata", "actor_id"])
      .where("action", "like", "feedback.%")
      .orderBy("id", "asc")
      .execute()
  ).map((row) => ({ ...row, metadata: JSON.parse(row.metadata as string) }));

const inbox = async () => (await pageFeedback(asRoot, query, app)).rows;

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  userId = await createTestUser(app, { email: "u@example.com", password });
  asRoot = await signedIn("root@example.com");
  asUser = await signedIn("u@example.com");
  asAnon = new Headers();
});
afterEach(() => t.cleanup());

describe("sending", () => {
  it("stores a message from a signed-in person, with the page's path and the app version", async () => {
    await sendFeedback(
      asUser,
      { kind: "idea", message: "Dark mode <b>please</b>", page: "/catalogue?q=secret#x" },
      app,
    );
    const [row] = await inbox();
    expect(row).toMatchObject({
      kind: "idea",
      message: "Dark mode <b>please</b>",
      page: "/catalogue",
      status: "new",
      sender: { id: userId, email: "u@example.com" },
    });
    expect(row?.version).toMatch(/^\d+\.\d+\.\d+/);
    // Sending isn't audited: it is the person's own content and could be frequent.
    expect(await audits()).toEqual([]);
  });

  it("refuses someone signed out", async () => {
    await expect(sendFeedback(asAnon, { kind: "idea", message: "x" }, app)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await inbox()).toEqual([]);
  });

  it("refuses a form that isn't filled in right, with the reason", async () => {
    for (const [input, problem] of [
      [{ kind: "nope", message: "x" }, "kind_required"],
      [{ kind: "idea", message: "   " }, "message_required"],
      [{ kind: "idea", message: "a".repeat(4001) }, "message_too_long"],
    ] as const) {
      const error = await sendFeedback(asUser, input, app).catch((e) => e);
      expect(error).toBeInstanceOf(InvalidFeedbackError);
      expect(error.problem).toBe(problem);
    }
    expect(await inbox()).toEqual([]);
  });
});

describe("the limit", () => {
  const deps = (now: () => number) => ({
    feedback: kyselyFeedbackRepository(t.db, t.dialect),
    limiter: createFeedbackLimiter(now),
    version: "1.0.0",
  });
  const actor = () => ({
    user: { id: userId, role: "user", workspaces: {} } as never,
    ip: null,
  });

  it("allows 10 an hour per person, counts only what is stored, and resets", async () => {
    let clock = Date.parse("2026-10-22T10:00:00Z");
    const d = deps(() => clock);
    // A refused form doesn't use up the limit.
    for (let i = 0; i < 3; i++)
      await expect(
        service.sendFeedback(d, actor(), { kind: "idea", message: " " }),
      ).rejects.toBeInstanceOf(InvalidFeedbackError);
    for (let i = 0; i < FEEDBACK_PER_HOUR; i++)
      await service.sendFeedback(d, actor(), { kind: "idea", message: `m${i}` });
    await expect(
      service.sendFeedback(d, actor(), { kind: "idea", message: "one too many" }),
    ).rejects.toBeInstanceOf(FeedbackLimitError);
    expect(await inbox()).toHaveLength(FEEDBACK_PER_HOUR);
    // Another person has their own.
    const other = await createTestUser(app, { email: "o@example.com", password });
    await service.sendFeedback(
      d,
      { user: { id: other, role: "user", workspaces: {} } as never, ip: null },
      { kind: "idea", message: "someone else" },
    );
    clock += FEEDBACK_WINDOW_MS + 1;
    await service.sendFeedback(d, actor(), { kind: "idea", message: "next hour" });
  });
});

describe("reading and acting", () => {
  it("is root's alone, checked on the server", async () => {
    await sendFeedback(asUser, { kind: "problem", message: "It broke" }, app);
    const id = (await inbox())[0]?.id as string;
    for (const who of [asUser, asAnon]) {
      await expect(pageFeedback(who, query, app)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(countFeedback(who, {}, app)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(findFeedback(who, id, app)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(countNewFeedback(who, app)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(markFeedbackHandled(who, [id], app)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteFeedback(who, [id], app)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await inbox())[0]).toMatchObject({ id, status: "new" });
    expect(await audits()).toEqual([]);
  });

  it("lists, counts, finds and counts the new ones", async () => {
    await sendFeedback(asUser, { kind: "problem", message: "One" }, app);
    await sendFeedback(asUser, { kind: "praise", message: "Two" }, app);
    expect(await countNewFeedback(asRoot, app)).toBe(2);
    expect(await countFeedback(asRoot, { kind: "praise" }, app)).toEqual({
      count: 1,
      capped: false,
    });
    const [two] = await inbox();
    expect((await findFeedback(asRoot, two?.id as string, app))?.message).toBe("Two");
    expect(await findFeedback(asRoot, "not-an-id", app)).toBeNull();
    expect(await findFeedback(asRoot, newId(), app)).toBeNull();
  });

  it("marks only the selected messages handled, audits each without its text", async () => {
    for (const m of ["secret one", "secret two", "secret three"])
      await sendFeedback(asUser, { kind: "idea", message: m }, app);
    const [c, b, a] = (await inbox()).map((r) => r.id);
    const changed = await markFeedbackHandled(
      asRoot,
      [a as string, b as string, a as string, "x"],
      app,
    );
    expect(changed.sort()).toEqual([a, b].sort());
    expect((await inbox()).map((r) => r.status)).toEqual(["new", "handled", "handled"]);
    expect(await countNewFeedback(asRoot, app)).toBe(1);
    // Already handled: nothing changes and nothing more is audited.
    expect(await markFeedbackHandled(asRoot, [a as string], app)).toEqual([]);
    const events = await audits();
    expect(events.map((e) => [e.action, e.target_type, e.target_id]).sort()).toEqual(
      [
        ["feedback.handled", "feedback", a],
        ["feedback.handled", "feedback", b],
      ].sort(),
    );
    expect(JSON.stringify(events)).not.toMatch(/secret/);
    expect((await inbox()).find((r) => r.id === c)?.status).toBe("new");
  });

  it("deletes only the selected messages and audits each without its text", async () => {
    for (const m of ["secret one", "secret two"])
      await sendFeedback(asUser, { kind: "idea", message: m }, app);
    const [b, a] = (await inbox()).map((r) => r.id);
    expect(await deleteFeedback(asRoot, [a as string, newId()], app)).toEqual([a]);
    expect((await inbox()).map((r) => r.id)).toEqual([b]);
    const events = await audits();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "feedback.deleted", target_id: a });
    expect(JSON.stringify(events)).not.toMatch(/secret/);
  });

  it("refuses more than a page of ids at once", async () => {
    const ids = Array.from({ length: 101 }, () => newId());
    await expect(markFeedbackHandled(asRoot, ids, app)).rejects.toBeInstanceOf(FeedbackError);
    await expect(deleteFeedback(asRoot, ids, app)).rejects.toBeInstanceOf(FeedbackError);
  });
});
