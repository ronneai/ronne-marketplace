import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot, findRoot, resetRootPassword } from "../actions/root-account";
import {
  InvalidEmailError,
  InvalidPasswordError,
  RootAlreadyExistsError,
  RootNotFoundError,
} from "../exceptions/errors";
import { createAuth } from "../repositories/better-auth";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const root = { email: "  Root@Example.com ", name: " Root ", password: "correct horse battery" };
const auth = () =>
  createAuth({
    db: t.db,
    dialect: t.dialect,
    secret: "test-secret-test-secret-test-secret-00",
    baseURL: "http://localhost:3000",
  });
const auditEvents = async () => (await listAuditEvents(t.db, t.dialect, {})).events;

const signIn = (password: string) =>
  auth().api.signInEmail({ body: { email: "root@example.com", password } });

describe("createRoot", () => {
  it("creates root with a normalized email and an argon2id hash, and Better Auth can sign in as it", async () => {
    const created = await createRoot(t.db, t.dialect, root);
    expect(created.email).toBe("root@example.com");

    const user = await t.db
      .selectFrom("user")
      .selectAll()
      .where("id", "=", created.id)
      .executeTakeFirstOrThrow();
    expect(user).toMatchObject({ role: "root", name: "Root", disabled_at: null });
    const account = await t.db
      .selectFrom("account")
      .selectAll()
      .where("user_id", "=", created.id)
      .executeTakeFirstOrThrow();
    expect(account.provider_id).toBe("credential");
    expect(account.password).toMatch(/^\$argon2id\$/);

    expect((await signIn(root.password)).user.id).toBe(created.id);
  });

  it("records instance.root_created, from the command line, without the password", async () => {
    const created = await createRoot(t.db, t.dialect, root);
    const events = await auditEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: null,
      action: "instance.root_created",
      targetType: "user",
      targetId: created.id,
      metadata: { via: "cli", email: "root@example.com" },
      ipAddress: null,
    });
    expect(JSON.stringify(events[0])).not.toContain(root.password);
  });

  it("refuses a second root and writes nothing", async () => {
    await createRoot(t.db, t.dialect, root);
    await expect(
      createRoot(t.db, t.dialect, { ...root, email: "other@example.com" }),
    ).rejects.toThrowError(RootAlreadyExistsError);
    const roots = await t.db.selectFrom("user").select("id").where("role", "=", "root").execute();
    expect(roots).toHaveLength(1);
    // The refused attempt's transaction rolled back, so only the first event exists.
    expect((await auditEvents()).map((e) => e.action)).toEqual(["instance.root_created"]);
  });

  it("validates before writing anything", async () => {
    await expect(createRoot(t.db, t.dialect, { ...root, password: "short" })).rejects.toThrowError(
      InvalidPasswordError,
    );
    await expect(
      createRoot(t.db, t.dialect, { ...root, email: "not-an-email" }),
    ).rejects.toThrowError(InvalidEmailError);
    expect(await t.db.selectFrom("user").select("id").execute()).toEqual([]);
    expect(await findRoot(t.db, t.dialect)).toBeNull();
  });
});

describe("resetRootPassword", () => {
  it("changes the password, ends root's sessions, revokes its tokens and re-enables it", async () => {
    const { id } = await createRoot(t.db, t.dialect, root);
    await signIn(root.password); // creates a session
    const now = toDbDate(new Date(), t.dialect);
    await t.db
      .insertInto("access_tokens")
      .values({
        id: newId(),
        user_id: id,
        name: "laptop",
        token_hash: "c".repeat(64),
        last_used_at: null,
        expires_at: null,
        revoked_at: null,
        created_at: now,
      })
      .execute();
    await t.db.updateTable("user").set({ disabled_at: now }).where("id", "=", id).execute();

    expect(await resetRootPassword(t.db, t.dialect, "a brand new passphrase")).toEqual({
      email: "root@example.com",
    });

    expect(
      await t.db.selectFrom("session").select("id").where("user_id", "=", id).execute(),
    ).toEqual([]);
    const token = await t.db
      .selectFrom("access_tokens")
      .select("revoked_at")
      .where("user_id", "=", id)
      .executeTakeFirstOrThrow();
    expect(token.revoked_at).not.toBeNull();
    const user = await t.db
      .selectFrom("user")
      .select("disabled_at")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(user.disabled_at).toBeNull();

    await expect(signIn(root.password)).rejects.toThrow();
    expect((await signIn("a brand new passphrase")).user.id).toBe(id);

    const [reset] = (await auditEvents()).filter((e) => e.action === "user.password_reset");
    expect(reset).toMatchObject({
      actorId: null,
      targetType: "user",
      targetId: id,
      metadata: { via: "cli", sessionsEnded: 1, tokensRevoked: 1 },
    });
  });

  it("fails when there's no root yet", async () => {
    await expect(resetRootPassword(t.db, t.dialect, "a brand new passphrase")).rejects.toThrowError(
      RootNotFoundError,
    );
    expect(await auditEvents()).toEqual([]);
  });

  it("rejects a too-short password before touching anything", async () => {
    await createRoot(t.db, t.dialect, root);
    await expect(resetRootPassword(t.db, t.dialect, "short")).rejects.toThrowError(
      InvalidPasswordError,
    );
    expect((await signIn(root.password)).user.email).toBe("root@example.com");
  });
});
