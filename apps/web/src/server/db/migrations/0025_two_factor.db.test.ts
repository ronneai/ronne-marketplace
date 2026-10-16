// biome-ignore lint/style/noRestrictedImports: this test decrypts what Better Auth stored, to prove it's encrypted.
import { symmetricDecrypt } from "better-auth/crypto";
// biome-ignore lint/style/noRestrictedImports: this test checks the migration against Better Auth's own schema.
import { getMigrations } from "better-auth/db/migration";
// biome-ignore lint/style/noRestrictedImports: this test checks the migration against Better Auth's own schema.
import { twoFactor } from "better-auth/plugins/two-factor";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authSchema, twoFactorSchema } from "../../domains/identity/models/auth-schema";
import { type Auth, createAuth } from "../../domains/identity/repositories/better-auth";
import { totpCode } from "../../domains/identity/testing/totp";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { isUniqueViolation } from "../locks";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let auth: Auth;

const SECRET = "test-secret-test-secret-test-secret-00";
const PASSWORD = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  auth = createAuth({
    db: t.db,
    dialect: t.dialect,
    secret: SECRET,
    baseURL: "http://localhost:3000",
    validateSchema: false, // no background query left when the pool closes
  });
});
afterEach(() => t.cleanup());

/** RFC 4648 base32 without padding, as an `otpauth://` URI spells the secret. */
const base32 = (text: string): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of Buffer.from(text)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
};

/** A `Cookie` header from a response's `Set-Cookie` headers, as a browser would send it back. */
const cookies = (headers: Headers, previous = ""): string => {
  const jar = new Map(
    previous
      .split("; ")
      .filter(Boolean)
      .map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]),
  );
  for (const line of headers.getSetCookie()) {
    const pair = line.split(";")[0] ?? "";
    const name = pair.slice(0, pair.indexOf("="));
    const value = pair.slice(pair.indexOf("=") + 1);
    if (value === "" || /max-age=0/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
};

const createUser = async (email: string) => {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    { email, name: "Someone", emailVerified: false },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(PASSWORD),
  });
  return user.id;
};

const signIn = (email: string) =>
  auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });

/** Signs in and turns two-factor on, as enrolment will: password, then a first code. */
const enrol = async (email: string) => {
  const { headers } = await signIn(email);
  const session = new Headers({ cookie: cookies(headers) });
  const enabled = await auth.api.enableTwoFactor({
    body: { password: PASSWORD, method: "totp" },
    headers: session,
  });
  if (enabled.method !== "totp") throw new Error("expected a TOTP enrolment");
  const { totpURI, backupCodes } = enabled;
  await auth.api.verifyTOTP({ body: { code: totpCode(totpURI) }, headers: session });
  return { totpURI, backupCodes };
};

describe("0025_two_factor", () => {
  it("matches what Better Auth and its twoFactor plugin expect: nothing to create or add", async () => {
    const { toBeCreated, toBeAdded } = await getMigrations({
      database: { db: t.db, type: t.dialect },
      secret: SECRET,
      baseURL: "http://localhost:3000",
      telemetry: { enabled: false },
      advanced: { database: { generateId: () => newId() } },
      emailAndPassword: { enabled: true },
      ...authSchema,
      plugins: [twoFactor({ schema: twoFactorSchema })],
    });
    expect(toBeCreated).toEqual([]);
    expect(toBeAdded).toEqual([]);
  });

  it("deletes a user's two-factor row with the user, on every database", async () => {
    // MySQL 8.4 silently ignores inline column REFERENCES, so this fails if one comes back.
    expect(await foreignKeys(t.db, t.dialect, ["two_factor"])).toEqual([
      { table: "two_factor", references: "user", onDelete: "CASCADE" },
    ]);
    const id = await createUser("gone@example.com");
    await enrol("gone@example.com");
    await t.db.deleteFrom("user").where("id", "=", id).execute();
    expect(await t.db.selectFrom("two_factor").select("id").execute()).toEqual([]);
  });

  it("keeps at most one row per user, on every database", async () => {
    const id = await createUser("once@example.com");
    const row = () => ({
      id: newId(),
      user_id: id,
      secret: "x",
      backup_codes: "y",
      lock_expires_at: null,
    });
    await t.db.insertInto("two_factor").values(row()).execute();
    const refused = await t.db
      .insertInto("two_factor")
      .values(row())
      .execute()
      .catch((error: unknown) => error);
    expect(isUniqueViolation(refused)).toBe(true);
    expect(await t.db.selectFrom("two_factor").select("id").execute()).toHaveLength(1);
  });

  it("leaves one row, whose code works, when enrolment starts several times at once", async () => {
    const id = await createUser("twice@example.com");
    const session = new Headers({ cookie: cookies((await signIn("twice@example.com")).headers) });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        auth.api.enableTwoFactor({
          body: { password: PASSWORD, method: "totp" },
          headers: session,
        }),
      ),
    );
    const rows = await t.db
      .selectFrom("two_factor")
      .selectAll()
      .where("user_id", "=", id)
      .execute();
    expect(rows).toHaveLength(1);
    // The row kept is one some request handed out: its secret verifies with that request's URI.
    const uris = results.flatMap((r) =>
      r.status === "fulfilled" && r.value.method === "totp" ? [r.value.totpURI] : [],
    );
    const raw = await symmetricDecrypt({ key: SECRET, data: rows[0]?.secret ?? "" });
    expect(uris.map((uri) => new URL(uri).searchParams.get("secret"))).toContain(base32(raw));
  });

  it("gives every user, old and new, two-factor off", async () => {
    const now = toDbDate(new Date(), t.dialect);
    await t.db
      .insertInto("user")
      .values({
        id: newId(),
        name: "Raw",
        email: "raw@example.com",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
        disabled_at: null,
      })
      .execute();
    await createUser("new@example.com");
    const rows = await t.db.selectFrom("user").select("two_factor_enabled").execute();
    expect(rows.map((r) => Boolean(r.two_factor_enabled))).toEqual([false, false]);
  });

  it("stores the secret and the backup codes encrypted, and turns the flag on at the first code", async () => {
    const id = await createUser("enrol@example.com");
    const { totpURI, backupCodes } = await enrol("enrol@example.com");
    const plainSecret = new URL(totpURI).searchParams.get("secret") ?? "";
    expect(totpURI).toMatch(/^otpauth:\/\/totp\/Ronne%20AI%20Marketplace:/);
    expect(backupCodes).toHaveLength(10);
    for (const code of backupCodes) expect(code).toMatch(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);

    const row = await t.db
      .selectFrom("two_factor")
      .selectAll()
      .where("user_id", "=", id)
      .executeTakeFirstOrThrow();
    expect(Boolean(row.verified)).toBe(true);
    expect(row.failed_verification_count).toBe(0);
    expect(row.lock_expires_at).toBeNull();
    // Stored as ciphertext: it decrypts with AUTH_SECRET to the secret the URI carries (base32).
    expect(row.secret).toMatch(/^[0-9a-f]+$/);
    const raw = await symmetricDecrypt({ key: SECRET, data: row.secret });
    expect(Buffer.from(raw).length).toBe(32);
    expect(base32(raw)).toBe(plainSecret);
    await expect(
      symmetricDecrypt({ key: "another-secret-another-secret-0000", data: row.secret }),
    ).rejects.toThrow();
    for (const code of backupCodes) expect(row.backup_codes).not.toContain(code);
    const user = await t.db
      .selectFrom("user")
      .select("two_factor_enabled")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(Boolean(user.two_factor_enabled)).toBe(true);
  });

  it("asks for a code at sign-in, and creates the session only with a right one", async () => {
    await createUser("signin@example.com");
    const { totpURI } = await enrol("signin@example.com");
    const before = await t.db.selectFrom("session").select("id").execute();

    const { headers, response } = await signIn("signin@example.com");
    expect(response).toMatchObject({ twoFactorRedirect: true, twoFactorMethods: ["totp"] });
    expect(await t.db.selectFrom("session").select("id").execute()).toHaveLength(before.length);
    const pending = new Headers({ cookie: cookies(headers) });

    await expect(
      auth.api.verifyTOTP({ body: { code: "000000" }, headers: pending }),
    ).rejects.toThrow();
    const failed = await t.db
      .selectFrom("two_factor")
      .select("failed_verification_count")
      .executeTakeFirstOrThrow();
    expect(failed.failed_verification_count).toBe(1);

    const verified = await auth.api.verifyTOTP({
      body: { code: totpCode(totpURI) },
      headers: pending,
      returnHeaders: true,
    });
    expect(verified.headers.get("set-cookie")).toMatch(/ronne\.session_token=/);
    expect(await t.db.selectFrom("session").select("id").execute()).toHaveLength(before.length + 1);
    const reset = await t.db
      .selectFrom("two_factor")
      .select("failed_verification_count")
      .executeTakeFirstOrThrow();
    expect(reset.failed_verification_count).toBe(0);
  });

  it("voids a challenge after five wrong codes, and locks the account after ten in a row", async () => {
    await createUser("lock@example.com");
    const { totpURI } = await enrol("lock@example.com");
    const wrong = (pending: Headers) =>
      auth.api.verifyTOTP({ body: { code: "000000" }, headers: pending });

    // One challenge: five wrong codes, then it's gone and the password step starts again.
    const first = new Headers({ cookie: cookies((await signIn("lock@example.com")).headers) });
    for (let i = 0; i < 5; i++)
      await expect(wrong(first)).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      auth.api.verifyTOTP({ body: { code: totpCode(totpURI) }, headers: first }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // A second challenge: five more, and the account's second step locks.
    const second = new Headers({ cookie: cookies((await signIn("lock@example.com")).headers) });
    for (let i = 0; i < 5; i++)
      await expect(wrong(second)).rejects.toMatchObject({ statusCode: 401 });
    const row = await t.db
      .selectFrom("two_factor")
      .select(["failed_verification_count", "lock_expires_at"])
      .executeTakeFirstOrThrow();
    expect(row.failed_verification_count).toBe(10);
    expect(row.lock_expires_at).not.toBeNull();

    // Locked: a new challenge refuses even the right code, with 429.
    const third = new Headers({ cookie: cookies((await signIn("lock@example.com")).headers) });
    await expect(
      auth.api.verifyTOTP({ body: { code: totpCode(totpURI) }, headers: third }),
    ).rejects.toMatchObject({ statusCode: 429 });
  });
});
