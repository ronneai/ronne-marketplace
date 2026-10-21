import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { adminEraseUser } from "../../identity/actions/erase-user";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { exportUserData } from "../../identity/actions/user-data";
import { erasedEmail } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { setWorkspaceVisibility, visibilityImpact } from "../../workspaces/actions/workspaces";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { INSTANCE_SHELF } from "../models/shelf";
import { kyselyPinRepository } from "../repositories/kysely-pin-repository";
import { seedReleasedItem } from "../repositories/test-seed";
import { addFavorite } from "./favorites";
import { listPins, pinItem } from "./pins";

// A pin's audit can be made to fail (the atomicity test); every other audit is the real one.
const failing = vi.hoisted(() => ({ on: false }));
vi.mock("../../audit/actions/audit", async (original) => {
  const real = await original<typeof import("../../audit/actions/audit")>();
  return {
    ...real,
    recordAudit: (...args: Parameters<typeof real.recordAudit>) => {
      if (failing.on && args[2].action === "pin.removed") throw new Error("the audit log is down");
      return real.recordAudit(...args);
    },
  };
});

// Pins and favorites meet privacy (feature 125): the data file, erasing an account, deleting an
// item, and a workspace turning private.
let t: TestDb;
let app: AppAuth;
let rootId: string;
let memberId: string;
let adminId: string;
let acme: string;
let beta: string;
let asRoot: Headers;
let asMember: Headers;
let asAdmin: Headers;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const workspace = (name: string, visibility: "public" | "private") =>
  kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name,
    description: name,
    visibility,
    createdBy: null,
    createdAt: new Date(),
  });

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  memberId = await createTestUser(app, { email: "m@example.com", password });
  adminId = await createTestUser(app, { email: "a@example.com", password });
  asRoot = await signedIn("root@example.com");
  asMember = await signedIn("m@example.com");
  asAdmin = await signedIn("a@example.com");
  acme = await workspace("acme", "private");
  beta = await workspace("beta", "public");
  await setWorkspaceRole(app, memberId, "user", acme);
  await setWorkspaceRole(app, adminId, "admin", acme);
  await createScope(asRoot, { name: "team", description: "Public." }, app);
  await createScope(
    asRoot,
    { name: "acme-infra", description: "Private.", workspaceId: acme },
    app,
  );
  await createScope(asRoot, { name: "beta-tools", description: "Beta.", workspaceId: beta }, app);
});
afterEach(() => t.cleanup());

const favoriteRows = (userId?: string) => {
  const query = t.db.selectFrom("item_favorites").selectAll();
  return (userId ? query.where("user_id", "=", userId) : query).execute();
};
const pinRows = () => t.db.selectFrom("item_pins").selectAll().orderBy("position").execute();

describe("the data file (104)", () => {
  it("lists the person's favorites by full name, the ones they no longer see too, and nobody else's", async () => {
    const base = (await seedReleasedItem(t, "team", "base", rootId)).itemId;
    const deploy = (await seedReleasedItem(t, "acme-infra", "deploy", rootId)).itemId;
    const other = (await seedReleasedItem(t, "beta-tools", "lint", rootId)).itemId;
    await addFavorite(asMember, base, app);
    await addFavorite(asMember, deploy, app);
    await addFavorite(asAdmin, other, app);
    // The member leaves acme: the favorite is hidden from them but still theirs.
    await t.db.deleteFrom("workspace_members").where("user_id", "=", memberId).execute();
    const { data, rows } = await exportUserData(asMember, memberId, app);
    expect(data.favorites.map((f) => f.item).sort()).toEqual([
      "@acme/acme-infra/deploy",
      "@team/base",
    ]);
    expect(data.favorites[0]?.addedAt).toBeInstanceOf(Date);
    expect(rows.favorites).toBe(2);
    expect(JSON.stringify(data)).not.toContain("lint");
  });

  it("has an empty list for someone with none", async () => {
    const { data, rows } = await exportUserData(asAdmin, adminId, app);
    expect(data.favorites).toEqual([]);
    expect(rows.favorites).toBe(0);
  });

  it("root's download for the person has them too", async () => {
    const base = (await seedReleasedItem(t, "team", "base", rootId)).itemId;
    await addFavorite(asMember, base, app);
    expect((await exportUserData(asRoot, memberId, app)).data.favorites).toHaveLength(1);
  });
});

describe("erasing an account (103)", () => {
  it("deletes the person's favorites, counts them, and leaves everyone else's", async () => {
    const base = (await seedReleasedItem(t, "team", "base", rootId)).itemId;
    const lint = (await seedReleasedItem(t, "beta-tools", "lint", rootId)).itemId;
    await addFavorite(asAdmin, base, app);
    await addFavorite(asAdmin, lint, app);
    await addFavorite(asMember, base, app);
    const result = await adminEraseUser(asRoot, adminId, "a@example.com", app);
    expect(result).toMatchObject({ favoritesDeleted: 2 });
    expect(await favoriteRows(adminId)).toEqual([]);
    expect((await favoriteRows(memberId)).map((r) => r.item_id)).toEqual([base]);
    const erased = (await listAuditEvents(t.db, t.dialect, {})).events.find(
      (e) => e.action === "user.erased",
    );
    expect(erased?.metadata).toMatchObject({ favoritesDeleted: 2 });
  });

  it("says nothing of favorites when there were none", async () => {
    const result = await adminEraseUser(asRoot, adminId, "a@example.com", app);
    expect(result).not.toHaveProperty("favoritesDeleted");
  });

  it("keeps a pin they made, under their pseudonym", async () => {
    const deploy = (await seedReleasedItem(t, "acme-infra", "deploy", rootId)).itemId;
    await pinItem(asAdmin, { kind: "workspace", workspaceId: acme }, deploy, app);
    await adminEraseUser(asRoot, adminId, "a@example.com", app);
    const [pin] = await pinRows();
    expect(pin).toMatchObject({ item_id: deploy, created_by: adminId });
    // The row `created_by` points at is the pseudonym: no name or address is left behind.
    const author = await t.db
      .selectFrom("user")
      .select(["email", "name"])
      .where("id", "=", adminId)
      .executeTakeFirstOrThrow();
    expect(author.email).toBe(erasedEmail(adminId));
    expect(JSON.stringify(author)).not.toContain("a@example.com");
    expect(
      await listPins(asMember, { kind: "workspace", workspaceId: acme }, "available", app),
    ).toHaveLength(1);
  });
});

describe("deleting an item (125)", () => {
  it("deletes its pins and favorites with it", async () => {
    const base = (await seedReleasedItem(t, "team", "base", rootId)).itemId;
    const keep = (await seedReleasedItem(t, "team", "keep", rootId)).itemId;
    for (const id of [base, keep]) {
      await addFavorite(asMember, id, app);
      await pinItem(asRoot, INSTANCE_SHELF, id, app);
    }
    // Items are never deleted in the app; a removal (a restore, a test database) takes the pins and
    // favorites with it. The item's versions go first, as its own keys require.
    await t.db
      .updateTable("items")
      .set({ listed_version_id: null })
      .where("id", "=", base)
      .execute();
    await t.db.deleteFrom("dist_tags").where("item_id", "=", base).execute();
    await t.db.deleteFrom("item_versions").where("item_id", "=", base).execute();
    await t.db.deleteFrom("items").where("id", "=", base).execute();
    expect((await favoriteRows()).map((r) => r.item_id)).toEqual([keep]);
    expect((await pinRows()).map((r) => r.item_id)).toEqual([keep]);
  });
});

describe("making a workspace private (093)", () => {
  const startHere = async () =>
    (await listPins(asRoot, INSTANCE_SHELF, "all", app)).map((e) => e.name);

  beforeEach(async () => {
    const a = (await seedReleasedItem(t, "team", "one", rootId)).itemId;
    const b = (await seedReleasedItem(t, "beta-tools", "lint", rootId)).itemId;
    const c = (await seedReleasedItem(t, "team", "three", rootId)).itemId;
    const d = (await seedReleasedItem(t, "beta-tools", "fmt", rootId)).itemId;
    for (const id of [a, b, c, d]) await pinItem(asRoot, INSTANCE_SHELF, id, app);
  });

  it("says beforehand which of its items come off Start here", async () => {
    expect(await visibilityImpact(asRoot, "beta", app)).toEqual({
      dependents: [],
      openDependents: [],
      startHere: ["@beta/beta-tools/lint", "@beta/beta-tools/fmt"],
    });
    expect((await visibilityImpact(asRoot, "acme", app)).startHere).toEqual([]);
  });

  it("takes them off in the same step, keeps the others in order, and audits each", async () => {
    await setWorkspaceVisibility(asRoot, { name: "beta", visibility: "private" }, app);
    expect(await startHere()).toEqual(["@team/one", "@team/three"]);
    const events = (await listAuditEvents(t.db, t.dialect, {})).events;
    const removed = events.filter((e) => e.action === "pin.removed");
    expect(removed.map((e) => e.metadata.name).sort()).toEqual([
      "@beta/beta-tools/fmt",
      "@beta/beta-tools/lint",
    ]);
    expect(removed[0]?.metadata).toMatchObject({ reason: "workspace_private" });
    expect(removed[0]?.actorId).toBe(rootId);
    expect(
      events.find((e) => e.action === "workspace.updated" && e.metadata.visibility === "private")
        ?.metadata,
    ).toMatchObject({ startHerePinsRemoved: 2 });
  });

  it("leaves positions that still take a new pin and move", async () => {
    await setWorkspaceVisibility(asRoot, { name: "beta", visibility: "private" }, app);
    const more = (await seedReleasedItem(t, "team", "more", rootId)).itemId;
    await pinItem(asRoot, INSTANCE_SHELF, more, app);
    expect((await pinRows()).map((r) => r.position)).toEqual([1, 2, 3]);
    expect(await startHere()).toEqual(["@team/one", "@team/three", "@team/more"]);
  });

  it("does not put them back when it is made public again, and a workspace turned private with none changes nothing", async () => {
    await setWorkspaceVisibility(asRoot, { name: "beta", visibility: "private" }, app);
    await setWorkspaceVisibility(asRoot, { name: "beta", visibility: "public" }, app);
    expect(await startHere()).toEqual(["@team/one", "@team/three"]);
    const before = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "pin.removed",
    ).length;
    await setWorkspaceVisibility(asRoot, { name: "acme", visibility: "public" }, app);
    await setWorkspaceVisibility(asRoot, { name: "acme", visibility: "private" }, app);
    expect(
      (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === "pin.removed"),
    ).toHaveLength(before);
  });

  it("does not touch a workspace's own shelf: its pins stay, the visibility rule is applied when they are read", async () => {
    const own = (await seedReleasedItem(t, "beta-tools", "own", rootId)).itemId;
    await pinItem(asRoot, { kind: "workspace", workspaceId: beta }, own, app);
    await setWorkspaceVisibility(asRoot, { name: "beta", visibility: "private" }, app);
    expect(await pinRows().then((rows) => rows.filter((r) => r.shelf === beta))).toHaveLength(1);
  });

  it("is one step: an audit that fails puts the pins back and leaves the workspace public", async () => {
    failing.on = true;
    try {
      await expect(
        setWorkspaceVisibility(asRoot, { name: "beta", visibility: "private" }, app),
      ).rejects.toThrow("the audit log is down");
    } finally {
      failing.on = false;
    }
    expect(await startHere()).toEqual([
      "@team/one",
      "@beta/beta-tools/lint",
      "@team/three",
      "@beta/beta-tools/fmt",
    ]);
    const row = await t.db
      .selectFrom("workspaces")
      .select("visibility")
      .where("name", "=", "beta")
      .executeTakeFirstOrThrow();
    expect(row.visibility).toBe("public");
    expect(
      (await listAuditEvents(t.db, t.dialect, {})).events.filter(
        (e) =>
          e.action === "pin.removed" ||
          (e.action === "workspace.updated" && e.metadata.visibility === "private"),
      ),
    ).toEqual([]);
  });

  it("a pin that comes second is refused: no private workspace's item is left on Start here", async () => {
    await setWorkspaceVisibility(asRoot, { name: "beta", visibility: "private" }, app);
    const kept = await kyselyPinRepository(t.db, t.dialect).add(
      INSTANCE_SHELF,
      (
        await t.db
          .selectFrom("items")
          .select("id")
          .where("name", "=", "lint")
          .executeTakeFirstOrThrow()
      ).id,
      { by: rootId, at: new Date(), limit: 12, requirePublicWorkspace: true },
    );
    expect(kept).toBe("private");
    expect(await startHere()).toEqual(["@team/one", "@team/three"]);
  });

  it("a pin racing Make private ends on one side of it: pinned and then taken off, or refused", async () => {
    // Each round a fresh public workspace with an item, pinned and turned private at the same time.
    // Whoever goes first, the item must not be left on Start here (the databases only show the race
    // when the two really overlap, so it is run several times).
    for (let round = 0; round < 6; round++) {
      const name = `race-${round}`;
      const id = await workspace(name, "public");
      await createScope(asRoot, { name: `${name}-tools`, description: name, workspaceId: id }, app);
      const item = (await seedReleasedItem(t, `${name}-tools`, "thing", rootId)).itemId;
      await Promise.allSettled([
        pinItem(asRoot, INSTANCE_SHELF, item, app),
        setWorkspaceVisibility(asRoot, { name, visibility: "private" }, app),
      ]);
      const left = (await pinRows()).filter((r) => r.item_id === item);
      expect(left, `round ${round}`).toEqual([]);
    }
  });
});
