import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../db/dates";
import { createTestDb, type TestDb } from "../../db/testing/test-db";
import { adminEraseUser } from "../identity/actions/erase-user";
import { createRoot } from "../identity/actions/root-account";
import { signIn } from "../identity/actions/session";
import { exportUserData } from "../identity/actions/user-data";
import type { AppAuth } from "../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../identity/testing/test-auth";
import { sendFeedback } from "./actions/feedback";

// Feedback meets privacy (feature 127): the data file (104) and erasing an account (103).
let t: TestDb;
let app: AppAuth;
let memberId: string;
let otherId: string;
let asRoot: Headers;
let asMember: Headers;
let asOther: Headers;
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
  asOther = await signedIn("o@example.com");
});
afterEach(() => t.cleanup());

const rows = () => t.db.selectFrom("feedback").select(["id", "user_id", "message"]).execute();

describe("the data file (104)", () => {
  it("has what the person sent, as written, and an empty list when they sent nothing", async () => {
    // One download per account in ten minutes, so the empty case is another account's.
    expect((await exportUserData(asRoot, otherId, app)).data.feedback).toEqual([]);
    await sendFeedback(
      asMember,
      { kind: "idea", message: "Dark <i>mode</i>", page: "/menu?x=1" },
      app,
    );
    const { data } = await exportUserData(asMember, memberId, app);
    expect(data.feedback).toEqual([
      {
        kind: "idea",
        message: "Dark <i>mode</i>",
        page: "/menu",
        version: expect.stringMatching(/^\d+\.\d+\.\d+/),
        status: "new",
        sentAt: expect.any(Date),
        handledAt: null,
      },
    ]);
    // It is JSON, so it stays text.
    expect(JSON.parse(JSON.stringify(data)).feedback[0].message).toBe("Dark <i>mode</i>");
  });

  it("is theirs alone: someone else's messages are not in it", async () => {
    await sendFeedback(asOther, { kind: "praise", message: "Other's secret praise" }, app);
    const { data } = await exportUserData(asMember, memberId, app);
    expect(data.feedback).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("secret praise");
    expect((await exportUserData(asRoot, otherId, app)).data.feedback).toHaveLength(1);
  });
});

describe("erasing an account (103)", () => {
  it("deletes the person's messages, not keeping the text under the pseudonym, and leaves everyone else's", async () => {
    await sendFeedback(asMember, { kind: "problem", message: "member one" }, app);
    await sendFeedback(asMember, { kind: "idea", message: "member two" }, app);
    await sendFeedback(asOther, { kind: "idea", message: "other one" }, app);
    const result = await adminEraseUser(asRoot, memberId, "m@example.com", app);
    expect(result).toMatchObject({ feedbackDeleted: 2 });
    expect((await rows()).map((r) => r.message)).toEqual(["other one"]);
    // The event says how many, never what.
    const erased = await t.db
      .selectFrom("audit_log")
      .select("metadata")
      .where("action", "=", "user.erased")
      .executeTakeFirst();
    expect(JSON.parse(erased?.metadata as string)).toMatchObject({ feedbackDeleted: 2 });
    expect(erased?.metadata).not.toContain("member one");
    expect(JSON.stringify(await t.db.selectFrom("audit_log").selectAll().execute())).not.toContain(
      "member two",
    );
  });

  it("is fine for someone who sent nothing", async () => {
    const result = await adminEraseUser(asRoot, memberId, "m@example.com", app);
    expect(result).not.toHaveProperty("feedbackDeleted");
    expect(await rows()).toEqual([]);
  });

  it("keeps a message root handled when its handler is erased, the pointer holding (the user row stays)", async () => {
    await sendFeedback(asMember, { kind: "idea", message: "kept message" }, app);
    const [row] = await rows();
    await t.db
      .updateTable("feedback")
      .set({ status: "handled", handled_by: otherId, handled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", row?.id as string)
      .execute();
    await adminEraseUser(asRoot, otherId, "o@example.com", app);
    expect((await rows()).map((r) => r.message)).toEqual(["kept message"]);
    // The erased person's row stays for the history of the user table, so the pointer holds.
    const [after] = await t.db.selectFrom("feedback").select("handled_by").execute();
    expect(after?.handled_by).toBe(otherId);
  });
});
