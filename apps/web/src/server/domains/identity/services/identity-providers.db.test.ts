import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { logger, setLoggerForTests } from "../../../log";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../actions/root-account";
import {
  ForbiddenError,
  InvalidProviderConfigError,
  InvalidProviderDomainsError,
  InvalidProviderIdError,
  InvalidProviderNameError,
  ProviderIdTakenError,
  ProviderNotFoundError,
  ProviderNotTestedError,
  StaleProviderError,
  UnknownProviderTypeError,
} from "../exceptions/errors";
import { providerTypeRegistry } from "../models/provider-types";
import type { CurrentUser } from "../models/user";
import { kyselyIdentityProviderRepository } from "../repositories/kysely-identity-provider-repository";
import { decryptSecret } from "../repositories/provider-secrets";
import { fakeProviderType } from "../testing/fake-provider-type";
import {
  createProvider,
  deleteProvider,
  disableProvider,
  enableProvider,
  getProvider,
  type IdentityProviderDeps,
  listProviders,
  markProviderTested,
  type ProviderInput,
  updateProvider,
} from "./identity-providers";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let root: CurrentUser;
let otherRoot: CurrentUser;
let deps: IdentityProviderDeps;
let clock: Date;

const AUTH_SECRET = "test-secret-test-secret-test-secret-00";
const SECRET = "Sup3r-client-secret-value";
const NEW_SECRET = "An0ther-client-secret-value";
const IP = "203.0.113.9";

const input = (overrides: Partial<ProviderInput> = {}): ProviderInput => ({
  type: "fake",
  preset: "okta",
  name: "Acme SSO",
  config: { issuer: "https://idp.acme.com", clientId: "ronne", clientSecret: SECRET },
  domains: "acme.com, Example.org",
  linkByEmail: true,
  groupsClaim: "groups",
  ...overrides,
});

const actor = (user: CurrentUser | null = root) => ({ user, ip: IP });
/** The provider's version now, as a form or a test would have it. */
const version = async (id = "acme") => (await getProvider(deps, actor(), id)).updatedAt;
const tick = () => {
  clock = new Date(clock.getTime() + 1000);
};

beforeEach(async () => {
  t = await createTestDb();
  const a = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  root = { id: a.id, email: "root@example.com", name: "Root", role: "root", workspaces: {} };
  const b = newId();
  const now = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("user")
    .values({
      id: b,
      name: "Other",
      email: "other@example.com",
      email_verified: 0,
      image: null,
      created_at: now,
      updated_at: now,
      role: "root",
      disabled_at: null,
    })
    .execute();
  otherRoot = { id: b, email: "other@example.com", name: "Other", role: "root", workspaces: {} };
  clock = new Date("2026-10-16T12:00:00.000Z");
  deps = {
    repo: kyselyIdentityProviderRepository(t.db, t.dialect),
    types: providerTypeRegistry([fakeProviderType()]),
    authSecret: AUTH_SECRET,
    now: () => clock,
  };
});
afterEach(() => t.cleanup());

const events = async () =>
  (await listAuditEvents(t.db, t.dialect, { group: "instance", dir: "asc" })).events
    .filter((e) => e.action.startsWith("instance.auth_provider_"))
    .map((e) => ({
      action: e.action,
      actor: e.actorId,
      ...e.metadata,
    }));

describe("creating a provider", () => {
  it("stores it off and untested, with the secret encrypted, and audits it", async () => {
    const created = await createProvider(deps, actor(), "acme", input());
    expect(created).toMatchObject({
      id: "acme",
      type: "fake",
      preset: "okta",
      name: "Acme SSO",
      enabled: false,
      config: { issuer: "https://idp.acme.com", clientId: "ronne" },
      hasSecret: true,
      domains: ["acme.com", "example.org"],
      linkByEmail: true,
      groupsClaim: "groups",
      testedAt: null,
    });
    expect(JSON.stringify(created)).not.toContain(SECRET);

    const row = await t.db
      .selectFrom("identity_providers")
      .selectAll()
      .where("id", "=", "acme")
      .executeTakeFirstOrThrow();
    expect(row.config).not.toContain(SECRET);
    expect(row.secret_enc).not.toContain(SECRET);
    expect(decryptSecret(AUTH_SECRET, "acme", row.secret_enc as string)).toBe(SECRET);

    expect(await events()).toEqual([
      { action: "instance.auth_provider_created", actor: root.id, provider: "acme", type: "fake" },
    ]);
  });

  it.each(["ab", "Acme", "credential", "-x-", "a_b"])("refuses the id %s", async (id) => {
    await expect(createProvider(deps, actor(), id, input())).rejects.toThrow(
      InvalidProviderIdError,
    );
    expect(await t.db.selectFrom("identity_providers").selectAll().execute()).toEqual([]);
  });

  it("refuses an id another provider has", async () => {
    await createProvider(deps, actor(), "acme", input());
    await expect(createProvider(deps, actor(), "acme", input({ name: "Again" }))).rejects.toThrow(
      ProviderIdTakenError,
    );
  });

  it("refuses an unknown type, a bad name, bad domains and a missing secret", async () => {
    await expect(createProvider(deps, actor(), "acme", input({ type: "saml" }))).rejects.toThrow(
      UnknownProviderTypeError,
    );
    await expect(createProvider(deps, actor(), "acme", input({ name: "  " }))).rejects.toThrow(
      InvalidProviderNameError,
    );
    await expect(createProvider(deps, actor(), "acme", input({ domains: "acme" }))).rejects.toThrow(
      InvalidProviderDomainsError,
    );
    await expect(
      createProvider(
        deps,
        actor(),
        "acme",
        input({ config: { issuer: "https://idp.acme.com", clientId: "ronne" } }),
      ),
    ).rejects.toThrow(InvalidProviderConfigError);
    expect(await events()).toEqual([]);
  });

  it("is root's only", async () => {
    const user: CurrentUser = {
      ...root,
      role: "user",
      workspaces: { [GLOBAL_WORKSPACE_ID]: "admin" },
    };
    await expect(createProvider(deps, actor(user), "acme", input())).rejects.toThrow(
      ForbiddenError,
    );
    await expect(createProvider(deps, actor(null), "acme", input())).rejects.toThrow(
      ForbiddenError,
    );
    await expect(listProviders(deps, actor(user))).rejects.toThrow(ForbiddenError);
  });
});

describe("editing a provider", () => {
  it("keeps the stored secret when none is typed, and names what changed (never the values)", async () => {
    const created = await createProvider(deps, actor(), "acme", input());
    tick();
    const updated = await updateProvider(
      deps,
      actor(),
      "acme",
      input({
        name: "Acme",
        config: { issuer: "https://idp.acme.com", clientId: "ronne", clientSecret: "" },
        domains: "acme.com",
      }),
      created.updatedAt,
    );
    expect(updated).toMatchObject({ name: "Acme", domains: ["acme.com"], hasSecret: true });
    const row = await t.db
      .selectFrom("identity_providers")
      .select("secret_enc")
      .executeTakeFirstOrThrow();
    expect(decryptSecret(AUTH_SECRET, "acme", row.secret_enc as string)).toBe(SECRET);
    expect((await events()).at(-1)).toEqual({
      action: "instance.auth_provider_updated",
      actor: root.id,
      provider: "acme",
      changed: ["name", "domains"],
    });
  });

  it("replaces the secret, says only that it changed, and needs a new test", async () => {
    await createProvider(deps, actor(), "acme", input());
    await markProviderTested(deps, actor(), "acme", await version());
    await enableProvider(deps, actor(), "acme");
    const before = await getProvider(deps, actor(), "acme");
    tick();
    const updated = await updateProvider(
      deps,
      actor(),
      "acme",
      input({
        config: { issuer: "https://idp.acme.com", clientId: "ronne", clientSecret: NEW_SECRET },
      }),
      before.updatedAt,
    );
    expect(updated).toMatchObject({ enabled: false, testedAt: null, testedBy: null });
    const row = await t.db
      .selectFrom("identity_providers")
      .select("secret_enc")
      .executeTakeFirstOrThrow();
    expect(decryptSecret(AUTH_SECRET, "acme", row.secret_enc as string)).toBe(NEW_SECRET);
    expect((await events()).slice(-2)).toEqual([
      {
        action: "instance.auth_provider_updated",
        actor: root.id,
        provider: "acme",
        changed: ["client secret"],
      },
      {
        action: "instance.auth_provider_disabled",
        actor: root.id,
        provider: "acme",
        reason: "retest",
      },
    ]);
  });

  it("clears the test when the issuer or client changes, but not for the name", async () => {
    await createProvider(deps, actor(), "acme", input());
    await markProviderTested(deps, actor(), "acme", await version());
    let p = await getProvider(deps, actor(), "acme");
    tick();
    p = await updateProvider(
      deps,
      actor(),
      "acme",
      input({ name: "Renamed", config: { issuer: "https://idp.acme.com", clientId: "ronne" } }),
      p.updatedAt,
    );
    expect(p.testedAt).not.toBeNull();
    tick();
    p = await updateProvider(
      deps,
      actor(),
      "acme",
      input({ config: { issuer: "https://login.acme.com", clientId: "ronne" } }),
      p.updatedAt,
    );
    expect(p.testedAt).toBeNull();
  });

  it("refuses a stale form (someone saved since it was opened)", async () => {
    const created = await createProvider(deps, actor(), "acme", input());
    tick();
    await updateProvider(
      deps,
      actor(otherRoot),
      "acme",
      input({ name: "Theirs" }),
      created.updatedAt,
    );
    tick();
    await expect(
      updateProvider(deps, actor(), "acme", input({ name: "Mine" }), created.updatedAt),
    ).rejects.toThrow(StaleProviderError);
    expect((await getProvider(deps, actor(), "acme")).name).toBe("Theirs");
  });

  it("gives a second save in the same millisecond a new time, so the form after it isn't stale by mistake", async () => {
    const created = await createProvider(deps, actor(), "acme", input());
    const one = await updateProvider(
      deps,
      actor(),
      "acme",
      input({ name: "One" }),
      created.updatedAt,
    );
    expect(one.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
    await expect(
      updateProvider(deps, actor(), "acme", input({ name: "Two" }), created.updatedAt),
    ).rejects.toThrow(StaleProviderError);
    const two = await updateProvider(deps, actor(), "acme", input({ name: "Two" }), one.updatedAt);
    expect(two.name).toBe("Two");
  });

  it("lets only one of two saves of the same form land, on every database", async () => {
    const created = await createProvider(deps, actor(), "acme", input());
    tick();
    const results = await Promise.allSettled(
      ["Mine", "Theirs"].map((name) =>
        updateProvider(deps, actor(), "acme", input({ name }), created.updatedAt),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.filter((r) => r.status === "rejected");
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(StaleProviderError);
    expect(
      (await events()).filter((e) => e.action === "instance.auth_provider_updated"),
    ).toHaveLength(1);
  });

  it("makes a form stale when the provider was turned on or off since, even in the same millisecond", async () => {
    await createProvider(deps, actor(), "acme", input());
    await markProviderTested(deps, actor(), "acme", await version());
    const opened = await version();
    await enableProvider(deps, actor(), "acme");
    expect((await version()).getTime()).toBeGreaterThan(opened.getTime());
    await expect(
      updateProvider(deps, actor(), "acme", input({ name: "Stale" }), opened),
    ).rejects.toThrow(StaleProviderError);
    const on = await version();
    await disableProvider(deps, actor(), "acme");
    expect((await version()).getTime()).toBeGreaterThan(on.getTime());
  });

  it("refuses a provider that doesn't exist", async () => {
    await expect(updateProvider(deps, actor(), "nope", input(), new Date())).rejects.toThrow(
      ProviderNotFoundError,
    );
  });
});

describe("turning a provider on and off", () => {
  it("needs a passing test, by the root who turns it on", async () => {
    await createProvider(deps, actor(), "acme", input());
    await expect(enableProvider(deps, actor(), "acme")).rejects.toThrow(ProviderNotTestedError);
    await markProviderTested(deps, actor(otherRoot), "acme", await version());
    await expect(enableProvider(deps, actor(), "acme")).rejects.toThrow(ProviderNotTestedError);
    await markProviderTested(deps, actor(), "acme", await version());
    expect(await enableProvider(deps, actor(), "acme")).toEqual({ changed: true });
    expect(await enableProvider(deps, actor(), "acme")).toEqual({ changed: false });
    expect(await disableProvider(deps, actor(), "acme")).toEqual({ changed: true });
    expect(await disableProvider(deps, actor(), "acme")).toEqual({ changed: false });
    expect((await events()).map((e) => e.action)).toEqual([
      "instance.auth_provider_created",
      "instance.auth_provider_enabled",
      "instance.auth_provider_disabled",
    ]);
  });
});

describe("turning on a provider while someone saves it", () => {
  it("refuses to turn on settings a save since has cleared the test of", async () => {
    await createProvider(deps, actor(), "acme", input());
    await markProviderTested(deps, actor(), "acme", await version());
    // What enable reads, before the other root's save lands between its read and its write.
    const snapshot = await deps.repo.find("acme");
    await updateProvider(
      deps,
      actor(otherRoot),
      "acme",
      input({ config: { issuer: "https://other.example", clientId: "ronne" } }),
      await version(),
    );
    const racing: IdentityProviderDeps = {
      ...deps,
      repo: {
        ...deps.repo,
        transaction: (work) =>
          deps.repo.transaction((repo) => work({ ...repo, find: async () => snapshot })),
      },
    };
    await expect(enableProvider(racing, actor(), "acme")).rejects.toThrow(StaleProviderError);
    const after = await getProvider(deps, actor(), "acme");
    expect(after).toMatchObject({ enabled: false, testedAt: null });
    await expect(disableProvider(racing, actor(), "acme")).resolves.toEqual({ changed: false });
  });
});

describe("recording a test", () => {
  it("refuses a test of settings saved over since it started", async () => {
    const created = await createProvider(deps, actor(), "acme", input());
    tick();
    await updateProvider(
      deps,
      actor(),
      "acme",
      input({ config: { issuer: "https://evil.example", clientId: "ronne" } }),
      created.updatedAt,
    );
    await expect(markProviderTested(deps, actor(), "acme", created.updatedAt)).rejects.toThrow(
      StaleProviderError,
    );
    await expect(enableProvider(deps, actor(), "acme")).rejects.toThrow(ProviderNotTestedError);
  });
});

describe("deleting a provider", () => {
  const addMember = async (
    email: string,
    source: string | null,
    role: "user" | "admin" = "user",
  ) => {
    const id = newId();
    const now = toDbDate(new Date(), t.dialect);
    await t.db
      .insertInto("user")
      .values({
        id,
        name: email,
        email,
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
        role: "user",
        disabled_at: null,
      })
      .execute();
    const ws = newId();
    await t.db
      .insertInto("workspaces")
      .values({
        id: ws,
        name: `ws-${email.slice(0, 3)}`,
        description: "A team.",
        visibility: "public",
        is_global: 0,
        owner_id: null,
        created_by: null,
        created_at: now,
        updated_at: now,
      } as never)
      .execute();
    await t.db
      .insertInto("workspace_members")
      .values({
        workspace_id: ws,
        user_id: id,
        role,
        added_by: null,
        source,
        created_at: now,
        updated_at: now,
      })
      .execute();
    return { id, ws };
  };

  it("removes only the memberships its groups gave, audits each, and keeps linked accounts", async () => {
    await createProvider(deps, actor(), "acme", input());
    await createProvider(deps, actor(), "other", input());
    const given = await addMember("ann@acme.com", "acme", "admin");
    const byHand = await addMember("bob@acme.com", null);
    const otherProvider = await addMember("cat@acme.com", "other");
    await t.db
      .insertInto("account")
      .values({
        id: newId(),
        account_id: "sub-ann",
        provider_id: "acme",
        user_id: given.id,
        created_at: toDbDate(new Date(), t.dialect),
        updated_at: toDbDate(new Date(), t.dialect),
      } as never)
      .execute();

    expect(await deleteProvider(deps, actor(), "acme")).toEqual({ membershipsRemoved: 1 });

    const members = await t.db
      .selectFrom("workspace_members")
      .select(["user_id", "source"])
      .where("user_id", "in", [given.id, byHand.id, otherProvider.id])
      .execute();
    expect(members.map((m) => m.user_id).sort()).toEqual([byHand.id, otherProvider.id].sort());
    expect(
      await t.db
        .selectFrom("account")
        .select("provider_id")
        .where("user_id", "=", given.id)
        .execute(),
    ).toEqual([{ provider_id: "acme" }]);
    await expect(getProvider(deps, actor(), "acme")).rejects.toThrow(ProviderNotFoundError);

    const all = (await listAuditEvents(t.db, t.dialect, { dir: "asc" })).events;
    expect(all.find((e) => e.action === "workspace.member_removed")).toMatchObject({
      targetId: given.id,
      metadata: { email: "ann@acme.com", role: "admin", via: "sso", provider: "acme" },
    });
    expect(all.at(-1)).toMatchObject({
      action: "instance.auth_provider_deleted",
      metadata: { provider: "acme", membershipsRemoved: 1 },
    });
    // The one who lost a membership is told (139), by the root who deleted the provider; those
    // whose memberships stayed are told nothing.
    const told = await t.db.selectFrom("notifications").selectAll().execute();
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({
      user_id: given.id,
      kind: "membership.removed",
      actor_id: root.id,
      subject_type: "workspace",
      subject_id: given.ws,
    });
    expect(JSON.parse(told[0]?.params ?? "{}")).toEqual({ workspace: "ws-ann" });
  });
});

describe("deleting a provider that gave a global role", () => {
  it("never removes anyone from global: the role goes back to a hand-set user", async () => {
    await createProvider(deps, actor(), "acme", input());
    const id = newId();
    const now = toDbDate(new Date(), t.dialect);
    await t.db
      .insertInto("user")
      .values({
        id,
        name: "Dee",
        email: "dee@acme.com",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
        role: "user",
        disabled_at: null,
      })
      .execute();
    await t.db
      .insertInto("workspace_members")
      .values({
        workspace_id: GLOBAL_WORKSPACE_ID,
        user_id: id,
        role: "moderator",
        added_by: null,
        source: "acme",
        created_at: now,
        updated_at: now,
      })
      .execute();

    expect(await deleteProvider(deps, actor(), "acme")).toEqual({ membershipsRemoved: 0 });
    expect(
      await t.db
        .selectFrom("workspace_members")
        .select(["role", "source"])
        .where("user_id", "=", id)
        .execute(),
    ).toEqual([{ role: "user", source: null }]);
    const changed = (await listAuditEvents(t.db, t.dialect, { dir: "asc" })).events.find(
      (e) => e.action === "workspace.member_role_changed",
    );
    expect(changed).toMatchObject({
      targetId: id,
      metadata: { from: "moderator", to: "user", via: "sso", provider: "acme" },
    });
    expect(
      (await t.db.selectFrom("notifications").selectAll().execute()).map((n) => [
        n.user_id,
        n.kind,
      ]),
    ).toEqual([[id, "membership.role_changed"]]);
  });
});

describe("the client secret", () => {
  it("is never in a log line, an audit row or a returned value", async () => {
    vi.stubEnv("LOG_LEVEL", "debug");
    vi.stubEnv("LOG_FORMAT", "json");
    const out: string[] = [];
    const write = (chunk: unknown) => {
      out.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, "write").mockImplementation(write);
    vi.spyOn(process.stderr, "write").mockImplementation(write);
    setLoggerForTests();
    try {
      const returned: unknown[] = [];
      returned.push(await createProvider(deps, actor(), "acme", input()));
      tick();
      const p = await getProvider(deps, actor(), "acme");
      returned.push(p);
      returned.push(
        await updateProvider(
          deps,
          actor(),
          "acme",
          input({
            config: { issuer: "https://idp.acme.com", clientId: "ronne", clientSecret: NEW_SECRET },
          }),
          p.updatedAt,
        ),
      );
      returned.push(await listProviders(deps, actor()));
      // A failed save logs nothing secret either.
      await expect(
        createProvider(deps, actor(), "Bad Id", input({ config: { clientSecret: SECRET } })),
      ).rejects.toThrow();
      logger.info("auth.sign_in_failed", { reason: "probe" });
      returned.push(await deleteProvider(deps, actor(), "acme"));

      const audit = await t.db.selectFrom("audit_log").selectAll().execute();
      for (const text of [JSON.stringify(returned), JSON.stringify(audit), out.join("")]) {
        expect(text).not.toContain(SECRET);
        expect(text).not.toContain(NEW_SECRET);
      }
      expect(out.join("")).toContain("probe");
    } finally {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      setLoggerForTests();
    }
  });
});
