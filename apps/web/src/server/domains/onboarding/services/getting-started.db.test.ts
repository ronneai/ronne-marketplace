import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createMyToken, revokeMyToken } from "../../identity/actions/access-tokens";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { seedItem } from "../../shelves/repositories/test-seed";
import { createDraft } from "../../submissions/actions/drafts";
import { kyselyOnboardingRepository } from "../repositories/kysely-onboarding-repository";
import { kyselyProgressRepository } from "../repositories/kysely-progress-repository";
import {
  confirmInstall,
  gettingStarted,
  hideGettingStarted,
  markSetUpSeen,
  showGettingStarted,
} from "./getting-started";

// Every row of the spec's detection table (feature 126), against real tables.
let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let uma: { id: string; headers: Headers };
let ben: { id: string; headers: Headers };
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  asRoot = await signedIn("root@example.com");
  await createScope(asRoot, { name: "team", description: "Everyone." }, app);
  const person = async (email: string) => {
    const id = await createTestUser(app, { email, password });
    return { id, headers: await signedIn(email) };
  };
  uma = await person("uma@example.com");
  ben = await person("ben@example.com");
});
afterEach(() => t.cleanup());

const deps = () => ({
  progress: kyselyProgressRepository(t.db),
  onboarding: kyselyOnboardingRepository(t.db, t.dialect),
});
const of = async (who: { headers: Headers }) =>
  gettingStarted(deps(), { user: await getCurrentUser(who.headers, app), ip: null });
const at = (date = new Date()) => toDbDate(date, t.dialect);
const grant = (userId: string, status: string) =>
  t.db
    .insertInto("device_grants")
    .values({
      id: newId(),
      device_code_hash: newId() + newId(),
      user_code: newId().slice(-8),
      client_id: "rmk",
      name: "laptop",
      status,
      user_id: userId,
      requester_ip: null,
      approver_ip: null,
      interval_seconds: 5,
      last_polled_at: null,
      decided_at: at(),
      created_at: at(),
      expires_at: at(),
    })
    .execute();
const useTokens = (userId: string) =>
  t.db
    .updateTable("access_tokens")
    .set({ last_used_at: at() })
    .where("user_id", "=", userId)
    .execute();

describe("step 1, an access token", () => {
  it("starts undone, and a token ticks it", async () => {
    expect((await of(uma)).done.token).toBe(false);
    await createMyToken(uma.headers, { name: "laptop" }, app);
    expect((await of(uma)).done).toMatchObject({ token: true, connect: false });
  });

  it("is not ticked by a token that is revoked, and is by a second one that isn't", async () => {
    const token = await createMyToken(uma.headers, { name: "laptop" }, app);
    await revokeMyToken(uma.headers, token.id, app);
    expect((await of(uma)).done.token).toBe(false);
    await createMyToken(uma.headers, { name: "desk" }, app);
    expect((await of(uma)).done.token).toBe(true);
  });

  it("counts a token made by rmk login --web", async () => {
    await createMyToken(uma.headers, { name: "laptop" }, app);
    await t.db.updateTable("access_tokens").set({ created_via: "device" }).execute();
    expect((await of(uma)).done.token).toBe(true);
  });

  it("is the person's own: someone else's token ticks nothing", async () => {
    await createMyToken(ben.headers, { name: "laptop" }, app);
    expect((await of(uma)).done.token).toBe(false);
  });
});

describe("step 2, rmk connected", () => {
  it("is not ticked by a token that was never used", async () => {
    await createMyToken(uma.headers, { name: "laptop" }, app);
    expect((await of(uma)).done.connect).toBe(false);
  });

  it("is ticked once a token of theirs was used, even when it was revoked since", async () => {
    const token = await createMyToken(uma.headers, { name: "laptop" }, app);
    await useTokens(uma.id);
    expect((await of(uma)).done.connect).toBe(true);
    await revokeMyToken(uma.headers, token.id, app);
    expect(await of(uma)).toMatchObject({ done: { token: false, connect: true } });
  });

  it("is ticked by an approved or spent device grant, not by a pending, denied or expired one", async () => {
    for (const status of ["pending", "denied", "expired"]) await grant(uma.id, status);
    expect((await of(uma)).done.connect).toBe(false);
    await grant(uma.id, "approved");
    expect((await of(uma)).done.connect).toBe(true);
    await t.db.deleteFrom("device_grants").where("user_id", "=", uma.id).execute();
    await grant(uma.id, "spent");
    expect((await of(uma)).done.connect).toBe(true);
  });

  it("is the person's own: someone else's use and grants tick nothing", async () => {
    await createMyToken(ben.headers, { name: "laptop" }, app);
    await useTokens(ben.id);
    await grant(ben.id, "approved");
    expect((await of(uma)).done.connect).toBe(false);
  });
});

describe("step 3, installed one", () => {
  it("is ticked by the person's own word, only theirs", async () => {
    await deps().onboarding.confirmInstall(uma.id, new Date());
    expect((await of(uma)).done.install).toBe(true);
    expect((await of(ben)).done.install).toBe(false);
  });

  it("is ticked by nothing the instance sees: not an install in the usage totals, not a download", async () => {
    const item = await seedItem(t, "a");
    await t.db
      .insertInto("usage_daily")
      .values({
        item_id: item as string,
        day: "2026-10-21",
        version: "1.0.0",
        tool: "claude-code",
        event: "install",
        run_trigger: "",
        outcome: "",
        count: 9,
      })
      .execute();
    await createMyToken(uma.headers, { name: "laptop" }, app);
    await useTokens(uma.id);
    expect((await of(uma)).done.install).toBe(false);
  });
});

describe("step 4, a draft", () => {
  it("is ticked by a draft, and by a submission in any status; not by someone else's", async () => {
    expect((await of(uma)).done.draft).toBe(false);
    await createDraft(ben.headers, { scope: "team", name: "x", type: "rule" }, app);
    expect((await of(uma)).done.draft).toBe(false);
    await createDraft(uma.headers, { scope: "team", name: "y", type: "rule" }, app);
    expect((await of(uma)).done.draft).toBe(true);
    await t.db.updateTable("submissions").set({ status: "rejected" }).execute();
    expect((await of(uma)).done.draft).toBe(true);
  });
});

describe("the panel", () => {
  it("a long-time account with everything done never sees it", async () => {
    await createMyToken(uma.headers, { name: "laptop" }, app);
    await useTokens(uma.id);
    const state = deps().onboarding;
    await state.confirmInstall(uma.id, new Date());
    expect((await of(uma)).panel).toBe("setUp");
    await state.markCompletedSeen(uma.id, new Date());
    expect((await of(uma)).panel).toBeNull();
  });

  it("an account with only a token sees it with step 1 ticked", async () => {
    await createMyToken(uma.headers, { name: "laptop" }, app);
    expect(await of(uma)).toMatchObject({ panel: "steps", count: 1, current: "connect" });
  });

  it("hides, and shows again with what is true", async () => {
    const state = deps().onboarding;
    await state.hide(uma.id, new Date());
    expect((await of(uma)).panel).toBeNull();
    await state.show(uma.id, new Date());
    expect((await of(uma)).panel).toBe("steps");
  });

  it("refuses someone not signed in", async () => {
    await expect(gettingStarted(deps(), { user: null, ip: null })).rejects.toThrow();
  });
});

describe("hide, confirm, show again and 'You're set up' seen", () => {
  const act = async (who: { headers: Headers }) => ({
    user: await getCurrentUser(who.headers, app),
    ip: null,
  });

  it("hides, and shows again, for the person alone", async () => {
    await hideGettingStarted(deps(), await act(uma));
    expect((await of(uma)).panel).toBeNull();
    expect((await of(ben)).panel).toBe("steps");
    await showGettingStarted(deps(), await act(uma));
    expect((await of(uma)).panel).toBe("steps");
  });

  it("confirms an install, for the person alone, and keeps the first time", async () => {
    const first = new Date("2026-10-21T10:00:00Z");
    await confirmInstall({ ...deps(), now: () => first }, await act(uma));
    await confirmInstall(
      { ...deps(), now: () => new Date("2026-10-22T10:00:00Z") },
      await act(uma),
    );
    expect((await of(uma)).done.install).toBe(true);
    expect((await of(ben)).done.install).toBe(false);
    expect((await deps().onboarding.get(uma.id)).installConfirmedAt).toEqual(first);
  });

  it("marks 'You're set up' seen only when it is being shown", async () => {
    expect(await markSetUpSeen(deps(), await act(uma))).toBe(false);
    expect((await deps().onboarding.get(uma.id)).completedSeenAt).toBeNull();
    await createMyToken(uma.headers, { name: "laptop" }, app);
    await useTokens(uma.id);
    await confirmInstall(deps(), await act(uma));
    expect(await markSetUpSeen(deps(), await act(uma))).toBe(true);
    expect((await of(uma)).panel).toBeNull();
    expect((await of(ben)).panel).toBe("steps");
  });

  it("shows 'You're set up' again when a finished person asks for it", async () => {
    await createMyToken(uma.headers, { name: "laptop" }, app);
    await useTokens(uma.id);
    await confirmInstall(deps(), await act(uma));
    await markSetUpSeen(deps(), await act(uma));
    await hideGettingStarted(deps(), await act(uma));
    await showGettingStarted(deps(), await act(uma));
    expect((await of(uma)).panel).toBe("setUp");
  });

  it("refuses every one of them when nobody is signed in, changing nothing", async () => {
    const nobody = { user: null, ip: null };
    for (const run of [hideGettingStarted, confirmInstall, showGettingStarted, markSetUpSeen])
      await expect(run(deps(), nobody)).rejects.toThrow();
    expect(await t.db.selectFrom("user_onboarding").selectAll().execute()).toEqual([]);
  });
});
