import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { rollbackProbe, throwAfterNotify } from "../../notifications/testing/throw-after-notify";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { CurrentUser } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityProviderRepository } from "../repositories/kysely-identity-provider-repository";
import { PROVIDER_TYPES } from "../repositories/provider-type-registry";
import {
  createProvider,
  deleteProvider,
  enableProvider,
  getProvider,
  type IdentityProviderDeps,
  markProviderTested,
  updateProvider,
} from "../services/identity-providers";
import { type FakeOidc, followAuthorize, startFakeOidc } from "../testing/fake-oidc-server";
import { createTestUser, testAppAuth } from "../testing/test-auth";
import { completeSsoSignIn, SSO_STATE_COOKIE, startSsoSignIn } from "./sso";

vi.mock("../../notifications/services/notify", async (original) =>
  throwAfterNotify(await original<{ notify: (...a: never[]) => Promise<number> }>()),
);

// Atomicity of what the single sign-on mappings tell people (139, task 3): when a sign-in's group
// sync, or the deletion of a provider, fails right after a notification was written, the
// notification goes with the memberships and their audit events. The same call, unarmed, then runs.
let t: TestDb;
let app: AppAuth;
let fake: FakeOidc;
let root: CurrentUser;
let deps: IdentityProviderDeps;
let eng: string;
let ops: string;
const limiter = new LoginRateLimiter({ max: 10_000 });
const actor = () => ({ user: root, ip: null });

const insertWorkspace = async (name: string) => {
  const id = newId();
  const now = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("workspaces")
    .values({
      id,
      name,
      description: `${name}.`,
      visibility: "private",
      is_global: toDbBoolean(false, t.dialect),
      owner_id: null,
      created_by: null,
      created_at: now,
      updated_at: now,
    } as never)
    .execute();
  return id;
};

const providerInput = (mappings?: unknown) => ({
  preset: "okta",
  name: "Acme SSO",
  config: { issuer: fake.issuer, clientId: fake.clientId, scopes: "openid email profile groups" },
  domains: "acme.com",
  linkByEmail: true,
  groupsClaim: "groups",
  ...(mappings === undefined ? {} : { mappings }),
});

const setMappings = async (mappings: { group: string; workspaceId: string; role: string }[]) => {
  const p = await getProvider(deps, actor(), "acme");
  await updateProvider(deps, actor(), "acme", providerInput(mappings), p.updatedAt);
  const after = await getProvider(deps, actor(), "acme");
  if (!after.enabled) {
    await markProviderTested(deps, actor(), "acme", after.updatedAt);
    await enableProvider(deps, actor(), "acme");
  }
};

beforeEach(async () => {
  rollbackProbe.armed = false;
  t = await createTestDb();
  app = testAppAuth(t);
  fake = await startFakeOidc();
  const rootId = await createTestUser(app, {
    email: "root@acme.com",
    password: "correct horse battery",
    role: "root",
  });
  root = { id: rootId, email: "root@acme.com", name: "Root", role: "root", workspaces: {} };
  deps = {
    repo: kyselyIdentityProviderRepository(t.db, t.dialect),
    types: PROVIDER_TYPES,
    authSecret: "test-secret-test-secret-test-secret-00",
  };
  eng = await insertWorkspace("eng");
  ops = await insertWorkspace("ops");
  const created = await createProvider(deps, actor(), "acme", {
    type: "oidc",
    ...providerInput(),
    config: { ...providerInput().config, clientSecret: fake.clientSecret },
  });
  await markProviderTested(deps, actor(), "acme", created.updatedAt);
  await enableProvider(deps, actor(), "acme");
});
afterEach(async () => {
  rollbackProbe.armed = false;
  await fake.close();
  await t.cleanup();
});

const signIn = async () => {
  const started = await startSsoSignIn(new Headers(), { provider: "acme" }, app, { limiter });
  if (!started.ok) throw new Error(`not started: ${started.error}`);
  const back = await followAuthorize(started.url);
  return completeSsoSignIn(
    new Request(back.href, { headers: { cookie: `${SSO_STATE_COOKIE}=${started.cookie.value}` } }),
    "acme",
    app,
    { limiter },
  );
};

const count = async (table: "notifications" | "audit_log") =>
  Number(
    (
      await t.db
        .selectFrom(table)
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .executeTakeFirstOrThrow()
    ).n,
  );

const memberships = async () =>
  (
    await t.db
      .selectFrom("workspace_members as m")
      .innerJoin("workspaces as w", "w.id", "m.workspace_id")
      .select(["w.name", "m.role", "m.source"])
      .where("w.is_global", "=", toDbBoolean(false, t.dialect))
      .where("w.owner_id", "is", null)
      .orderBy("w.name")
      .execute()
  ).map((r) => `${r.name}:${r.role}:${r.source ?? ""}`);

describe("single sign-on groups", () => {
  it("a sign-in's group sync leaves no membership, audit event or notification when it fails after notifying", async () => {
    await setMappings([
      { group: "engineering", workspaceId: eng, role: "user" },
      { group: "ops", workspaceId: ops, role: "admin" },
    ]);
    // The person exists first (a sign-in with no groups), so the armed sign-in only syncs groups.
    fake.user = { ...fake.user, groups: [] };
    await signIn();
    await t.db.deleteFrom("notifications").execute();
    const [members, audits] = [await memberships(), await count("audit_log")];
    expect(members).toEqual([]);

    fake.user = { ...fake.user, groups: ["engineering", "ops"] };
    rollbackProbe.armed = true;
    rollbackProbe.fired = 0;
    try {
      // Whether the sign-in reports the failure or is refused, nothing of the sync may remain.
      await signIn().catch(() => undefined);
    } finally {
      rollbackProbe.armed = false;
    }
    expect(rollbackProbe.fired).toBeGreaterThan(0);
    expect(await count("notifications")).toBe(0);
    expect(await memberships()).toEqual(members);
    const afterFailed = await count("audit_log");
    // Only the sign-in's own events may have been added, never a membership event.
    const memberAudits = await t.db
      .selectFrom("audit_log")
      .select("action")
      .where("action", "like", "workspace.member%")
      .execute();
    expect(memberAudits).toEqual([]);
    expect(afterFailed).toBeGreaterThanOrEqual(audits);

    // The control: unarmed, the sync stands and the person is told of each membership.
    await signIn();
    expect(await memberships()).toEqual(["eng:user:acme", "ops:admin:acme"]);
    expect(
      (await t.db.selectFrom("notifications").select("kind").execute()).map((n) => n.kind),
    ).toEqual(["membership.added", "membership.added"]);
  });

  it("deleting a provider leaves it and the memberships it gave, and tells nobody", async () => {
    await setMappings([{ group: "engineering", workspaceId: eng, role: "user" }]);
    fake.user = { ...fake.user, groups: ["engineering"] };
    await signIn();
    await t.db.deleteFrom("notifications").execute();
    const [members, audits] = [await memberships(), await count("audit_log")];
    expect(members).toEqual(["eng:user:acme"]);

    rollbackProbe.armed = true;
    try {
      await expect(deleteProvider(deps, actor(), "acme")).rejects.toThrow("failed after notify");
    } finally {
      rollbackProbe.armed = false;
    }
    expect(await count("notifications")).toBe(0);
    expect(await count("audit_log")).toBe(audits);
    expect(await memberships()).toEqual(members);
    await expect(getProvider(deps, actor(), "acme")).resolves.toBeTruthy();

    // The control: unarmed, it goes, taking the memberships, and the person is told.
    await expect(deleteProvider(deps, actor(), "acme")).resolves.toEqual({ membershipsRemoved: 1 });
    expect(await memberships()).toEqual([]);
    expect(
      (await t.db.selectFrom("notifications").select("kind").execute()).map((n) => n.kind),
    ).toEqual(["membership.removed"]);
  });
});
