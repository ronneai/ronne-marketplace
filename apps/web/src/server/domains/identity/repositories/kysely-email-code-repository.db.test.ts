import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../db/create-db";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { EMAIL_CODE_MAX_ATTEMPTS } from "../models/email-code";
import { type IssuedEmailCode, kyselyEmailCodeRepository } from "./kysely-email-code-repository";

let t: TestDb;
let clock: Date;
const SECRET = "test-secret-test-secret-test-secret-00";
const SUBJECT = "01PENDING00000000000000000";
const repo = (db = t.db) => kyselyEmailCodeRepository(db, t.dialect, SECRET);
const issue = (extra: { subjectId?: string; email?: string } = {}) =>
  repo().issue({
    purpose: "sign_up",
    subjectId: extra.subjectId ?? SUBJECT,
    email: extra.email ?? "ana@acme.example",
    minutes: 15,
    now: clock,
  });
const verify = (typed: string, db = t.db) =>
  repo(db).verify({ purpose: "sign_up", subjectId: SUBJECT, typed, now: clock });
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};
const issued = async () => {
  const result = await issue();
  if (!result.ok) throw new Error(result.reason);
  return result as IssuedEmailCode;
};
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

beforeEach(async () => {
  t = await createTestDb();
  clock = new Date("2026-11-21T12:00:00.000Z");
});
afterEach(() => t.cleanup());

describe("email codes in the database (190)", () => {
  it("store neither the code nor the address", async () => {
    const { code } = await issued();
    const row = await t.db.selectFrom("email_codes").selectAll().executeTakeFirstOrThrow();
    expect(JSON.stringify(row)).not.toContain(code);
    expect(JSON.stringify(row)).not.toContain("ana@acme.example");
  });

  it("take the right code once, and nothing after", async () => {
    const { code } = await issued();
    expect(await verify(code)).toEqual({ result: "ok" });
    expect(await verify(code)).toEqual({ result: "used" });
  });

  it("end after 5 wrong tries, the right code then refused too", async () => {
    const { code } = await issued();
    for (let i = 1; i <= EMAIL_CODE_MAX_ATTEMPTS; i++)
      expect(await verify(wrong(code))).toEqual({
        result: "wrong",
        attemptsLeft: EMAIL_CODE_MAX_ATTEMPTS - i,
      });
    expect(await verify(code)).toEqual({ result: "spent" });
  });

  it("end at their lifetime", async () => {
    const { code } = await issued();
    advance(15 * 60_000);
    expect(await verify(code)).toEqual({ result: "expired" });
  });

  it("wait 60 seconds between sends, and a new code ends the one before", async () => {
    const first = await issued();
    expect(await issue()).toEqual({ ok: false, reason: "wait", seconds: 60 });
    advance(60_000);
    const second = await issued();
    expect(await verify(first.code)).toMatchObject({
      result: first.code === second.code ? "ok" : "wrong",
    });
    expect(await verify(second.code)).toEqual(
      first.code === second.code ? { result: "used" } : { result: "ok" },
    );
  });

  it("mark the earlier code used when a new one is sent, and only the subject's own", async () => {
    await issued();
    await issue({ subjectId: "01OTHERSUBJECT000000000000", email: "bea@acme.example" });
    advance(60_000);
    const second = await issued();
    const rows = await t.db
      .selectFrom("email_codes")
      .select(["id", "subject_id", "consumed_at"])
      .orderBy("created_at")
      .orderBy("id")
      .execute();
    const mine = rows.filter((r) => r.subject_id === SUBJECT);
    expect(mine.map((r) => [r.id === second.id, r.consumed_at !== null])).toEqual([
      [false, true],
      [true, false],
    ]);
    expect(rows.find((r) => r.subject_id === "01OTHERSUBJECT000000000000")?.consumed_at).toBeNull();
  });

  it("send at most 3 to one address in an hour, whichever sign-up asks", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await issue({ subjectId: `01SUBJECT${i}00000000000000000`.slice(0, 26) })).ok).toBe(
        true,
      );
      advance(1000);
    }
    expect(
      await issue({ subjectId: "01SUBJECT90000000000000000", email: "ANA@acme.example" }),
    ).toEqual({
      ok: false,
      reason: "hourly",
    });
    expect(
      (await issue({ subjectId: "01SUBJECT80000000000000000", email: "bea@acme.example" })).ok,
    ).toBe(true);
    advance(60 * 60_000);
    expect((await issue({ subjectId: "01SUBJECT70000000000000000" })).ok).toBe(true);
  });

  it("hold the lifetime to 5–60 minutes, whatever the caller passes", async () => {
    for (const [minutes, held] of [
      [999, 60],
      [1, 5],
      [30, 30],
    ] as const) {
      const result = await repo().issue({
        purpose: "sign_up",
        subjectId: `01LIFETIME${minutes}`.padEnd(26, "0"),
        email: `life${minutes}@acme.example`,
        minutes,
        now: clock,
      });
      if (!result.ok) throw new Error(result.reason);
      expect(result.expiresAt.getTime() - clock.getTime()).toBe(held * 60_000);
    }
  });

  it("answer 'none' for a subject that has no code", async () => {
    expect(await verify("123456")).toEqual({ result: "none" });
  });

  it("give one success to right answers racing on several warm connections", async () => {
    const { code } = await issued();
    const server = t.url !== "file::memory:";
    const pools = server ? Array.from({ length: 6 }, () => createDb(t.url).db) : [t.db];
    try {
      // Each connection has answered once before the race, so they all start together.
      await Promise.all(pools.map((db) => db.selectFrom("email_codes").select("id").execute()));
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => verify(code, pools[i % pools.length])),
      );
      expect(results.filter((r) => r.result === "ok")).toHaveLength(1);
    } finally {
      if (server) await Promise.all(pools.map((db) => db.destroy()));
    }
  });

  it("spend no more than 5 tries when wrong guesses race", async () => {
    const { code } = await issued();
    await Promise.all(Array.from({ length: 12 }, () => verify(wrong(code))));
    const row = await t.db.selectFrom("email_codes").select("attempts").executeTakeFirstOrThrow();
    expect(Number(row.attempts)).toBe(EMAIL_CODE_MAX_ATTEMPTS);
    expect(await verify(code)).toEqual({ result: "spent" });
  });
});
