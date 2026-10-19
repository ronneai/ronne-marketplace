import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { isUniqueViolation } from "../locks";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
const now = () => toDbDate(new Date(), t.dialect);

beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const insertUser = async (email: string) => {
  const id = newId();
  await t.db
    .insertInto("user")
    .values({
      id,
      name: email,
      email,
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      role: "user",
      disabled_at: null,
    })
    .execute();
  return id;
};

const insertProvider = (id: string) =>
  t.db
    .insertInto("identity_providers")
    .values({
      id,
      type: "oidc",
      preset: "okta",
      name: "Acme",
      config: "{}",
      secret_enc: null,
      domains: "[]",
      groups_claim: null,
      tested_at: null,
      tested_by: null,
      last_signed_in_at: null,
      last_failure_at: null,
      last_failure_reason: null,
      created_by: null,
      created_at: now(),
      updated_at: now(),
    })
    .execute();

const insertLink = async (
  providerId: string,
  userId: string,
  fields: { userName: string; externalId?: string | null },
) => {
  const id = newId();
  await t.db
    .insertInto("scim_users")
    .values({
      id,
      provider_id: providerId,
      user_id: userId,
      external_id: fields.externalId ?? null,
      user_name: fields.userName,
      given_name: null,
      family_name: null,
      display_name: null,
      active: 1,
      created_at: now(),
      updated_at: now(),
      deleted_at: null,
    })
    .execute();
  return id;
};

const insertGroup = async (providerId: string, displayName: string, externalId?: string) => {
  const id = newId();
  await t.db
    .insertInto("scim_groups")
    .values({
      id,
      provider_id: providerId,
      display_name: displayName,
      external_id: externalId ?? null,
      created_at: now(),
      updated_at: now(),
    })
    .execute();
  return id;
};

const refused = (write: Promise<unknown>) =>
  write.then(
    () => false,
    (error) => isUniqueViolation(error),
  );

describe("0028_scim", () => {
  it("declares its foreign keys on every database", async () => {
    const keys = await foreignKeys(t.db, t.dialect, [
      "scim_tokens",
      "scim_users",
      "scim_groups",
      "scim_group_members",
    ]);
    expect(keys).toEqual(
      expect.arrayContaining([
        { table: "scim_tokens", references: "identity_providers", onDelete: "CASCADE" },
        { table: "scim_tokens", references: "user", onDelete: "SET NULL" },
        { table: "scim_users", references: "identity_providers", onDelete: "CASCADE" },
        { table: "scim_users", references: "user", onDelete: "CASCADE" },
        { table: "scim_groups", references: "identity_providers", onDelete: "CASCADE" },
        { table: "scim_group_members", references: "scim_groups", onDelete: "CASCADE" },
        { table: "scim_group_members", references: "user", onDelete: "CASCADE" },
      ]),
    );
    expect(keys).toHaveLength(7);
  });

  it("leaves SCIM off for every provider", async () => {
    await insertProvider("acme");
    const row = await t.db
      .selectFrom("identity_providers")
      .select("scim_enabled_at")
      .executeTakeFirstOrThrow();
    expect(row.scim_enabled_at).toBeNull();
  });

  it("keeps token hashes unique", async () => {
    await insertProvider("acme");
    const token = () =>
      t.db
        .insertInto("scim_tokens")
        .values({
          id: newId(),
          provider_id: "acme",
          token_hash: "a".repeat(64),
          created_by: null,
          created_at: now(),
          expires_at: null,
          revoked_at: null,
          last_used_at: null,
        })
        .execute();
    await token();
    expect(await refused(token())).toBe(true);
  });

  it("links an account once per provider, by user name and external id, byte for byte", async () => {
    await insertProvider("acme");
    await insertProvider("other");
    const ann = await insertUser("ann@example.com");
    const ben = await insertUser("ben@example.com");
    await insertLink("acme", ann, { userName: "ann@example.com", externalId: "E-1" });

    expect(await refused(insertLink("acme", ann, { userName: "ann2@example.com" }))).toBe(true);
    expect(await refused(insertLink("acme", ben, { userName: "ann@example.com" }))).toBe(true);
    expect(
      await refused(insertLink("acme", ben, { userName: "ben@example.com", externalId: "E-1" })),
    ).toBe(true);
    // Another provider may link the same account, with the same ids.
    expect(
      await refused(insertLink("other", ann, { userName: "ann@example.com", externalId: "E-1" })),
    ).toBe(false);
    // Differing only in case or accents is another value, MySQL included.
    expect(
      await refused(insertLink("acme", ben, { userName: "ånn@example.com", externalId: "e-1" })),
    ).toBe(false);
    // Links without an external id don't collide.
    const cy = await insertUser("cy@example.com");
    const di = await insertUser("di@example.com");
    await insertLink("other", cy, { userName: "cy@example.com" });
    expect(await refused(insertLink("other", di, { userName: "di@example.com" }))).toBe(false);
  });

  it("lets a tombstone hold only its external id: the email is free, a new link replaces it", async () => {
    await insertProvider("acme");
    const ann = await insertUser("ann@example.com");
    const ben = await insertUser("ben@example.com");
    const link = await insertLink("acme", ann, { userName: "ann@example.com", externalId: "E-1" });
    // A deprovisioning DELETE, as task 4 writes it.
    await t.db
      .updateTable("scim_users")
      .set({ deleted_at: now(), user_name: null, active: 0 })
      .where("id", "=", link)
      .execute();

    // Another account may now be linked under that email (the old account's own email, not the
    // tombstone, is what still holds it).
    expect(await refused(insertLink("acme", ben, { userName: "ann@example.com" }))).toBe(false);
    // The external id still means the old account: no other link can take it.
    const cy = await insertUser("cy@example.com");
    expect(
      await refused(insertLink("acme", cy, { userName: "cy@example.com", externalId: "E-1" })),
    ).toBe(true);

    // Coming back: the tombstone goes and a new link, with a new id, takes its place.
    await t.db.deleteFrom("scim_users").where("id", "=", link).execute();
    const again = await insertLink("acme", ann, {
      userName: "ann2@example.com",
      externalId: "E-1",
    });
    expect(again).not.toBe(link);
  });

  it("keeps group external ids unique per provider, and names byte for byte", async () => {
    await insertProvider("acme");
    await insertGroup("acme", "Engineers", "G-1");
    expect(await refused(insertGroup("acme", "Other", "G-1"))).toBe(true);
    // Two groups may share a name (providers allow it); not an external id.
    expect(await refused(insertGroup("acme", "Engineers", "G-2"))).toBe(false);
    const exact = await t.db
      .selectFrom("scim_groups")
      .select("display_name")
      .where("display_name", "=", "engineers")
      .execute();
    expect(exact).toEqual([]);
  });

  it("puts a member in a group once", async () => {
    await insertProvider("acme");
    const ann = await insertUser("ann@example.com");
    const group = await insertGroup("acme", "Engineers");
    const member = () =>
      t.db
        .insertInto("scim_group_members")
        .values({ group_id: group, user_id: ann, created_at: now() })
        .execute();
    await member();
    expect(await refused(member())).toBe(true);
  });

  it("removes a provider's tokens, links and groups with it, and a user's links and memberships with them", async () => {
    await insertProvider("acme");
    const ann = await insertUser("ann@example.com");
    const ben = await insertUser("ben@example.com");
    await insertLink("acme", ann, { userName: "ann@example.com" });
    await insertLink("acme", ben, { userName: "ben@example.com" });
    const group = await insertGroup("acme", "Engineers");
    for (const user of [ann, ben])
      await t.db
        .insertInto("scim_group_members")
        .values({ group_id: group, user_id: user, created_at: now() })
        .execute();
    await t.db
      .insertInto("scim_tokens")
      .values({
        id: newId(),
        provider_id: "acme",
        token_hash: "b".repeat(64),
        created_by: ann,
        created_at: now(),
        expires_at: null,
        revoked_at: null,
        last_used_at: null,
      })
      .execute();

    await t.db.deleteFrom("user").where("id", "=", ann).execute();
    expect(await t.db.selectFrom("scim_users").select("user_id").execute()).toEqual([
      { user_id: ben },
    ]);
    expect(await t.db.selectFrom("scim_group_members").select("user_id").execute()).toEqual([
      { user_id: ben },
    ]);
    expect(await t.db.selectFrom("scim_tokens").select("created_by").execute()).toEqual([
      { created_by: null },
    ]);

    await t.db.deleteFrom("identity_providers").where("id", "=", "acme").execute();
    for (const table of ["scim_tokens", "scim_users", "scim_groups", "scim_group_members"] as const)
      expect(await t.db.selectFrom(table).selectAll().execute()).toEqual([]);
    // The accounts stay.
    expect(await t.db.selectFrom("user").select("id").execute()).toEqual([{ id: ben }]);
  });
});
