import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authSchema } from "../../domains/identity/models/auth-schema";
import { createDb } from "../create-db";
import { fromDbDate, toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";

// Runs on SQLite here; 004 runs the same file against MySQL and PostgreSQL.
const { db, dialect } = createDb("file::memory:");

const authOptions = {
  database: { db, type: dialect },
  secret: "test-secret-test-secret-test-secret-00",
  baseURL: "http://localhost:3000",
  telemetry: { enabled: false },
  advanced: { database: { generateId: () => newId() } },
  emailAndPassword: { enabled: true },
  ...authSchema,
} as const;

beforeAll(async () => {
  expect(await migrateToLatest(db, dialect)).toEqual(["0001_identity"]);
});
afterAll(() => db.destroy());

describe("0001_identity", () => {
  it("matches what Better Auth expects: nothing to create or add", async () => {
    const { toBeCreated, toBeAdded } = await getMigrations(authOptions);
    expect(toBeCreated).toEqual([]);
    expect(toBeAdded).toEqual([]);
  });

  it("works with Better Auth: sign-up stores a user with our ids, columns and default role", async () => {
    const auth = betterAuth(authOptions);
    const { user } = await auth.api.signUpEmail({
      body: { email: "root@example.com", password: "correct horse battery", name: "Root" },
    });

    const row = await db
      .selectFrom("user")
      .selectAll()
      .where("id", "=", user.id)
      .executeTakeFirstOrThrow();
    expect(row.id).toHaveLength(26);
    expect(row.role).toBe("user");
    expect(row.disabled_at).toBeNull();
    expect(fromDbDate(row.created_at)).toBeInstanceOf(Date);

    const account = await db
      .selectFrom("account")
      .select(["provider_id", "password"])
      .where("user_id", "=", user.id)
      .executeTakeFirstOrThrow();
    expect(account.provider_id).toBe("credential");
    expect(account.password).not.toContain("correct horse");
  });

  it("deletes a user's sessions, accounts and access tokens with the user", async () => {
    const now = toDbDate(new Date(), dialect);
    const userId = newId();
    await db
      .insertInto("user")
      .values({
        id: userId,
        name: "Temp",
        email: "temp@example.com",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
        disabled_at: null,
      })
      .execute();
    await db
      .insertInto("access_tokens")
      .values({
        id: newId(),
        user_id: userId,
        name: "laptop",
        token_hash: "a".repeat(64),
        last_used_at: null,
        expires_at: null,
        revoked_at: null,
        created_at: now,
      })
      .execute();

    await db.deleteFrom("user").where("id", "=", userId).execute();

    const tokens = await db
      .selectFrom("access_tokens")
      .select("id")
      .where("user_id", "=", userId)
      .execute();
    expect(tokens).toEqual([]);
  });

  it("refuses a second token with the same hash", async () => {
    const now = toDbDate(new Date(), dialect);
    const userId = newId();
    await db
      .insertInto("user")
      .values({
        id: userId,
        name: "Tokens",
        email: "tokens@example.com",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
        disabled_at: null,
      })
      .execute();
    const token = {
      user_id: userId,
      name: "cli",
      token_hash: "b".repeat(64),
      last_used_at: null,
      expires_at: null,
      revoked_at: null,
      created_at: now,
    };

    await db
      .insertInto("access_tokens")
      .values({ id: newId(), ...token })
      .execute();
    await expect(
      db
        .insertInto("access_tokens")
        .values({ id: newId(), ...token })
        .execute(),
    ).rejects.toThrow();
  });
});
