import { type Kysely, sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { kyselyIdentityProviderRepository } from "../../domains/identity/repositories/kysely-identity-provider-repository";
import { kyselyIdentityRepository } from "../../domains/identity/repositories/kysely-identity-repository";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { createTestDb, type TestDb } from "../testing/test-db";
import { accountRules } from "./0047_account_rules";
import { migrations } from "./index";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
// Each test starts from an instance migrated up to 0046, as an instance upgrading to 191 would be.
let t: TestDb;
const before = Object.fromEntries(
  Object.entries(migrations).filter(([name]) => name < "0047_account_rules"),
);
const raw = () => t.db as unknown as Kysely<unknown>;
const at = (minute: number) =>
  toDbDate(new Date(Date.UTC(2026, 10, 1, 12, minute)), t.dialect) as unknown as string;

beforeEach(async () => {
  t = await createTestDb({ migrate: false });
  await migrateToLatest(t.db, t.dialect, before);
});
afterEach(() => t.cleanup());

const addProvider = async (id: string, domains: string[], linkByEmail = true) => {
  await sql`insert into identity_providers
    (id, type, preset, name, config, domains, link_by_email, created_at, updated_at)
    values (${id}, 'oidc', 'okta', ${id}, '{}', ${JSON.stringify(domains)},
      ${t.dialect === "sqlite" ? Number(linkByEmail) : linkByEmail}, ${at(0)}, ${at(0)})`.execute(
    raw(),
  );
};

const addUser = async (
  email: string,
  options: { role?: "root" | "user"; signedUp?: boolean } = {},
) => {
  const id = newId();
  await sql`insert into ${sql.table("user")}
    (id, name, email, email_verified, created_at, updated_at, role, signed_up_at)
    values (${id}, ${email}, ${email}, ${t.dialect === "sqlite" ? 0 : false}, ${at(1)}, ${at(1)},
      ${options.role ?? "user"}, ${options.signedUp ? at(1) : null})`.execute(raw());
  return id;
};

const link = async (userId: string, providerId: string, minute: number) => {
  await sql`insert into account (id, account_id, provider_id, user_id, created_at, updated_at)
    values (${newId()}, ${newId()}, ${providerId}, ${userId}, ${at(minute)}, ${at(minute)})`.execute(
    raw(),
  );
};

const scim = async (userId: string, providerId: string) => {
  await sql`insert into scim_users
    (id, provider_id, user_id, user_name, active, created_at, updated_at)
    values (${newId()}, ${providerId}, ${userId}, ${newId()},
      ${t.dialect === "sqlite" ? 1 : true}, ${at(2)}, ${at(2)})`.execute(raw());
};

const createdVia = async (id: string) =>
  (
    await t.db
      .selectFrom("user")
      .select("created_via")
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
  ).created_via;

describe("migration 0047_account_rules (191)", () => {
  it("keeps every provider's behaviour: creating for its listed domains, or none, no approval", async () => {
    await addProvider("entra", ["acme.com", "acme.org"]);
    await addProvider("okta", [], false);
    await migrateToLatest(t.db, t.dialect);

    const repo = kyselyIdentityProviderRepository(t.db, t.dialect);
    const entra = (await repo.find("entra"))?.provider;
    const okta = (await repo.find("okta"))?.provider;
    expect(entra).toMatchObject({
      domains: ["acme.com", "acme.org"],
      linkByEmail: true,
      createsAccounts: true,
      anyDomain: false,
      needsApproval: false,
    });
    expect(okta).toMatchObject({
      domains: [],
      linkByEmail: false,
      createsAccounts: false,
      anyDomain: false,
      needsApproval: false,
    });
  });

  it("backfills created_via from the surest evidence: sign-up, SCIM, the earliest link, else unknown", async () => {
    await addProvider("entra", ["acme.com"]);
    await addProvider("google", []);
    const root = await addUser("root@acme.com", { role: "root" });
    const made = await addUser("made@acme.com");
    const signedUp = await addUser("sam@gmail.com", { signedUp: true });
    const signedUpLinked = await addUser("sue@gmail.com", { signedUp: true });
    await link(signedUpLinked, "google", 5);
    const linked = await addUser("ana@acme.com");
    await link(linked, "google", 9);
    await link(linked, "entra", 3);
    const provisioned = await addUser("bob@acme.com");
    await scim(provisioned, "entra");
    await link(provisioned, "entra", 4);
    await migrateToLatest(t.db, t.dialect);

    expect(await createdVia(root)).toBe("unknown");
    expect(await createdVia(made)).toBe("unknown");
    expect(await createdVia(signedUp)).toBe("sign_up");
    expect(await createdVia(signedUpLinked)).toBe("sign_up");
    expect(await createdVia(linked)).toBe("provider:entra");
    expect(await createdVia(provisioned)).toBe("scim");
  });

  it("an account made after it with no way named stays null, which reads as unknown", async () => {
    await migrateToLatest(t.db, t.dialect);
    // Better Auth's own insert (tests only) names no way in; every app path does.
    const id = await addUser("later@acme.com");
    expect(await createdVia(id)).toBeNull();
    expect((await kyselyIdentityRepository(t.db, t.dialect).findUser(id))?.createdVia).toBe(
      "unknown",
    );
  });

  it("a rerun after a run that stopped part-way finishes the backfill", async () => {
    await addProvider("entra", ["acme.com"]);
    await addProvider("okta", []);
    const signedUp = await addUser("sam@gmail.com", { signedUp: true });
    // As MySQL leaves a failed run: each DDL statement committed, so some columns are there, with
    // nothing backfilled; here every column, and one provider and no user done.
    for (const column of ["any_domain", "needs_approval"])
      await raw()
        .schema.alterTable("identity_providers")
        .addColumn(column, t.dialect === "sqlite" ? "integer" : "boolean", (c) =>
          c.notNull().defaultTo(false),
        )
        .execute();
    await raw()
      .schema.alterTable("identity_providers")
      .addColumn("creates_accounts", t.dialect === "sqlite" ? "integer" : "boolean")
      .execute();
    await sql`update identity_providers set creates_accounts = ${t.dialect === "sqlite" ? 0 : false}
      where id = 'okta'`.execute(raw());
    await raw().schema.alterTable("user").addColumn("created_via", "varchar(48)").execute();
    await migrateToLatest(t.db, t.dialect);

    const repo = kyselyIdentityProviderRepository(t.db, t.dialect);
    expect((await repo.find("entra"))?.provider.createsAccounts).toBe(true);
    expect((await repo.find("okta"))?.provider.createsAccounts).toBe(false);
    expect(await createdVia(signedUp)).toBe("sign_up");
  });

  it("can run again over itself, and never overwrites what was saved since", async () => {
    await addProvider("entra", ["acme.com"]);
    const signedUp = await addUser("sam@gmail.com", { signedUp: true });
    await migrateToLatest(t.db, t.dialect);
    // Root turns creating off, and a provider makes an account, after the migration.
    await sql`update identity_providers set creates_accounts = ${t.dialect === "sqlite" ? 0 : false}`.execute(
      raw(),
    );
    const viaEntra = await addUser("new@acme.com");
    await sql`update ${sql.table("user")} set created_via = 'provider:entra' where id = ${viaEntra}`.execute(
      raw(),
    );
    // Even with evidence the backfill would rank higher: SCIM adopts that account since.
    await scim(viaEntra, "entra");
    await accountRules(t.dialect).up(raw());

    const repo = kyselyIdentityProviderRepository(t.db, t.dialect);
    expect((await repo.find("entra"))?.provider.createsAccounts).toBe(false);
    expect(await createdVia(signedUp)).toBe("sign_up");
    expect(await createdVia(viaEntra)).toBe("provider:entra");
  });
});
