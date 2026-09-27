import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { argon2PasswordHasher } from "./argon2-password-hasher";
import { type Auth, createAuth } from "./better-auth";

let t: TestDb;
let auth: Auth;

beforeAll(async () => {
  t = await createTestDb();
  auth = createAuth({
    db: t.db,
    dialect: t.dialect,
    secret: "test-secret-test-secret-test-secret-00",
    baseURL: "http://localhost:3000",
  });
});
afterAll(() => t.cleanup());

describe("argon2PasswordHasher", () => {
  it("hashes with argon2id and OWASP's minimum parameters, and verifies", async () => {
    const hash = await argon2PasswordHasher.hash("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await argon2PasswordHasher.verify(hash, "correct horse battery")).toBe(true);
    expect(await argon2PasswordHasher.verify(hash, "wrong horse battery")).toBe(false);
  });
});

describe("createAuth", () => {
  it("stores users with ULIDs and argon2id hashes in account, and signs them in", async () => {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser(
      { email: "someone@example.com", name: "Someone", emailVerified: false },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await ctx.password.hash("correct horse battery"),
    });

    expect(user.id).toHaveLength(26);
    const account = await t.db
      .selectFrom("account")
      .select("password")
      .where("user_id", "=", user.id)
      .executeTakeFirstOrThrow();
    expect(account.password).toMatch(/^\$argon2id\$/);

    const signedIn = await auth.api.signInEmail({
      body: { email: "someone@example.com", password: "correct horse battery" },
    });
    expect(signedIn.user.id).toBe(user.id);
    await expect(
      auth.api.signInEmail({
        body: { email: "someone@example.com", password: "wrong horse battery" },
      }),
    ).rejects.toThrow();
  });

  it("refuses public sign-up: only root creates users", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { email: "new@example.com", password: "correct horse battery", name: "New" },
      }),
    ).rejects.toThrow();
    const row = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "new@example.com")
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });
});
