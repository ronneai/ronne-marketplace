import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { encryptSecret } from "../repositories/provider-secrets";
import { disableSso, markUnreadableProviderSecrets, ssoToDisable } from "./disable-sso";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
const KEY = "test-secret-test-secret-test-secret-00";

beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const insertProvider = async (id: string, enabled: boolean, secret: string | null = KEY) => {
  const now = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("identity_providers")
    .values({
      id,
      type: "oidc",
      preset: "okta",
      name: id,
      enabled: toDbBoolean(enabled, t.dialect),
      config: "{}",
      secret_enc: secret ? encryptSecret(secret, id, `${id}-secret`) : null,
      domains: "[]",
      groups_claim: null,
      tested_at: now,
      tested_by: null,
      last_signed_in_at: null,
      last_failure_at: null,
      last_failure_reason: null,
      created_by: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
};

describe("disable-sso (106)", () => {
  it("turns every provider off and password sign-in back to everyone, each audited from the command line", async () => {
    await insertProvider("acme", true);
    await insertProvider("beta", true);
    await insertProvider("gone", false);
    await t.db
      .insertInto("instance_settings")
      .values({
        key: "password_sign_in",
        value: "root_only",
        updated_by: null,
        updated_at: toDbDate(new Date(), t.dialect),
      })
      .execute();
    expect(await ssoToDisable(t.db, t.dialect)).toEqual({
      providers: ["acme", "beta"],
      policy: "root_only",
    });

    expect(await disableSso(t.db, t.dialect)).toEqual({
      providers: ["acme", "beta"],
      policyChanged: true,
    });
    expect(await ssoToDisable(t.db, t.dialect)).toEqual({ providers: [], policy: "everyone" });
    const events = (
      await listAuditEvents(t.db, t.dialect, { group: "instance", dir: "asc" })
    ).events.map((e) => [e.action, e.actorId, e.metadata]);
    expect(events).toEqual([
      ["instance.auth_provider_disabled", null, { provider: "acme", via: "cli" }],
      ["instance.auth_provider_disabled", null, { provider: "beta", via: "cli" }],
      [
        "instance.password_sign_in_changed",
        null,
        { from: "root_only", to: "everyone", via: "cli" },
      ],
    ]);
    // Nothing left: a second run changes nothing.
    expect(await disableSso(t.db, t.dialect)).toEqual({ providers: [], policyChanged: false });
  });
});

describe("after a restore (106)", () => {
  it("marks each provider whose client secret this AUTH_SECRET can't read, and leaves the others", async () => {
    await insertProvider("readable", true, KEY);
    await insertProvider("other-key", true, "another-secret-another-secret-0000");
    await insertProvider("no-secret", true, null);
    expect(await markUnreadableProviderSecrets(t.db, t.dialect, KEY)).toBe(1);
    const reasons = Object.fromEntries(
      (
        await t.db.selectFrom("identity_providers").select(["id", "last_failure_reason"]).execute()
      ).map((r) => [r.id, r.last_failure_reason]),
    );
    expect(reasons).toEqual({
      readable: null,
      "other-key": "secret_unreadable",
      "no-secret": null,
    });
    // With no AUTH_SECRET at all, none can be read.
    expect(await markUnreadableProviderSecrets(t.db, t.dialect, undefined)).toBe(2);
  });
});
