import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { getCurrentUser, setLocale, signIn } from "./session";

let t: TestDb;
let app: AppAuth;
let userId: string;
let headers: Headers;
const email = "someone@example.com";
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  userId = await createTestUser(app, { email, password });
  const result = await signIn(new Headers(), { email, password, rememberMe: true }, app);
  if (!result.ok) throw new Error(`sign-in failed: ${result.error}`);
  headers = cookieHeaders(result.headers.get("set-cookie"));
});
afterEach(() => t.cleanup());

const stored = async () =>
  (
    await t.db
      .selectFrom("user")
      .select("locale")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow()
  ).locale;

describe("the saved language (129)", () => {
  it("starts automatic, and shows up on the signed-in user once saved", async () => {
    expect((await getCurrentUser(headers, app))?.locale).toBeNull();
    expect(await setLocale(headers, "pt", app)).toEqual({ ok: true, locale: "pt" });
    expect(await stored()).toBe("pt");
    expect((await getCurrentUser(headers, app))?.locale).toBe("pt");
    expect(await setLocale(headers, "fr", app)).toEqual({ ok: true, locale: "fr" });
    expect((await getCurrentUser(headers, app))?.locale).toBe("fr");
  });

  it("clears back to automatic with null", async () => {
    await setLocale(headers, "pt", app);
    expect(await setLocale(headers, null, app)).toEqual({ ok: true, locale: null });
    expect(await stored()).toBeNull();
    expect((await getCurrentUser(headers, app))?.locale).toBeNull();
  });

  it("refuses anything but a supported code, and changes nothing", async () => {
    await setLocale(headers, "pt", app);
    for (const value of ["es", "pt-BR", "EN", "", "auto", undefined, 3, {}])
      expect(await setLocale(headers, value, app)).toEqual({ ok: false, error: "invalid_locale" });
    expect(await stored()).toBe("pt");
  });

  it("needs a signed-in person", async () => {
    expect(await setLocale(new Headers(), "fr", app)).toEqual({
      ok: false,
      error: "not_signed_in",
    });
    expect(await stored()).toBeNull();
  });

  it("changes only the caller's own language", async () => {
    const otherId = await createTestUser(app, { email: "other@example.com", password });
    await setLocale(headers, "fr", app);
    const other = await t.db
      .selectFrom("user")
      .select("locale")
      .where("id", "=", otherId)
      .executeTakeFirstOrThrow();
    expect(other.locale).toBeNull();
  });

  it("counts a value the app no longer supports as automatic", async () => {
    await t.db.updateTable("user").set({ locale: "de" }).where("id", "=", userId).execute();
    expect((await getCurrentUser(headers, app))?.locale).toBeNull();
  });

  it("doesn't save for a disabled account", async () => {
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", userId)
      .execute();
    expect(await setLocale(headers, "fr", app)).toEqual({ ok: false, error: "not_signed_in" });
    expect(await stored()).toBeNull();
  });
});
