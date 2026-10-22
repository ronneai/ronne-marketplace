import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../db/testing/test-db";
import { adminEraseUser } from "../identity/actions/erase-user";
import { createRoot } from "../identity/actions/root-account";
import { signIn } from "../identity/actions/session";
import { exportUserData } from "../identity/actions/user-data";
import type { AppAuth } from "../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../identity/testing/test-auth";
import { kyselyOnboardingRepository } from "./repositories/kysely-onboarding-repository";

// The Getting started state meets privacy (feature 126): the data file (104) and erasing (103).
let t: TestDb;
let app: AppAuth;
let memberId: string;
let otherId: string;
let asRoot: Headers;
let asMember: Headers;
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
  memberId = await createTestUser(app, { email: "m@example.com", password });
  otherId = await createTestUser(app, { email: "o@example.com", password });
  asRoot = await signedIn("root@example.com");
  asMember = await signedIn("m@example.com");
});
afterEach(() => t.cleanup());

const onboardingRows = () => t.db.selectFrom("user_onboarding").selectAll().execute();

describe("the data file (104)", () => {
  it("has what the person did with the panel, and null when they did nothing", async () => {
    // One download per account in ten minutes, so the empty case is another account's.
    expect((await exportUserData(asRoot, otherId, app)).data.onboarding).toBeNull();
    const repo = kyselyOnboardingRepository(t.db, t.dialect);
    await repo.confirmInstall(memberId, new Date("2026-10-21T10:00:00Z"));
    await repo.hide(memberId, new Date("2026-10-21T11:00:00Z"));
    expect((await exportUserData(asMember, memberId, app)).data.onboarding).toEqual({
      hiddenAt: new Date("2026-10-21T11:00:00Z"),
      installConfirmedAt: new Date("2026-10-21T10:00:00Z"),
      completedSeenAt: null,
    });
  });

  it("is theirs alone, and root's download for the person has it", async () => {
    const repo = kyselyOnboardingRepository(t.db, t.dialect);
    await repo.hide(otherId, new Date("2026-10-21T11:00:00Z"));
    expect((await exportUserData(asMember, memberId, app)).data.onboarding).toBeNull();
    expect((await exportUserData(asRoot, otherId, app)).data.onboarding).toMatchObject({
      hiddenAt: new Date("2026-10-21T11:00:00Z"),
    });
  });
});

describe("erasing an account (103)", () => {
  it("deletes the person's row and leaves everyone else's", async () => {
    const repo = kyselyOnboardingRepository(t.db, t.dialect);
    await repo.hide(memberId, new Date());
    await repo.hide(otherId, new Date());
    await adminEraseUser(asRoot, memberId, "m@example.com", app);
    expect((await onboardingRows()).map((r) => r.user_id)).toEqual([otherId]);
  });

  it("is fine for someone with no row", async () => {
    await adminEraseUser(asRoot, memberId, "m@example.com", app);
    expect(await onboardingRows()).toEqual([]);
  });
});
