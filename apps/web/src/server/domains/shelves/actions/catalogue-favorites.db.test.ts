import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { browseCatalogue } from "../../items/actions/catalogue";
import { createScope } from "../../items/actions/scopes";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { CATALOGUE_PAGE_SIZE } from "../../items/services/catalogue";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { seedReleasedItem } from "../repositories/test-seed";
import { addFavorite } from "./favorites";

// The catalogue's Favorites filter (feature 125): the reader's own favorites, with the catalogue's
// search, filters, sort and paging, and only what they see now.
let t: TestDb;
let app: AppAuth;
let rootId: string;
let asRoot: Headers;
let asMember: Headers;
let asOutsider: Headers;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const names = async (headers: Headers, query: Parameters<typeof browseCatalogue>[1] = {}) =>
  (await browseCatalogue(headers, { favorites: "1", ...query }, app)).entries
    .map((e) => e.name)
    .sort();

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  const memberId = await createTestUser(app, { email: "m@example.com", password });
  await createTestUser(app, { email: "o@example.com", password });
  asRoot = await signedIn("root@example.com");
  asMember = await signedIn("m@example.com");
  asOutsider = await signedIn("o@example.com");
  const acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name: "acme",
    description: "Acme.",
    visibility: "private",
    createdBy: null,
    createdAt: new Date(),
  });
  await setWorkspaceRole(app, memberId, "user", acme);
  await createScope(asRoot, { name: "team", description: "Public." }, app);
  await createScope(
    asRoot,
    { name: "acme-infra", description: "Private.", workspaceId: acme },
    app,
  );
});
afterEach(() => t.cleanup());

describe("the catalogue's Favorites filter (125)", () => {
  it("lists only the reader's own favorites, and everything without the filter", async () => {
    const alpha = (await seedReleasedItem(t, "team", "alpha", rootId)).itemId;
    await seedReleasedItem(t, "team", "beta", rootId);
    await addFavorite(asMember, alpha, app);
    expect(await names(asMember)).toEqual(["alpha"]);
    // Nobody else's: the outsider and root have none, and the member's list is not theirs.
    expect(await names(asOutsider)).toEqual([]);
    expect(await names(asRoot)).toEqual([]);
    const all = await browseCatalogue(asMember, {}, app);
    expect(all.entries.map((e) => e.name).sort()).toEqual(["alpha", "beta"]);
    expect(all.query.favorites).toBe(false);
    expect((await browseCatalogue(asMember, { favorites: "1" }, app)).query.favorites).toBe(true);
  });

  it("only means 1: anything else lists everything", async () => {
    const alpha = (await seedReleasedItem(t, "team", "alpha", rootId)).itemId;
    await seedReleasedItem(t, "team", "beta", rootId);
    await addFavorite(asMember, alpha, app);
    for (const favorites of ["0", "true", "", undefined])
      expect(await names(asMember, { favorites })).toEqual(["alpha", "beta"]);
  });

  it("works with search, type, scope and sort", async () => {
    const [a, b, c] = [
      (await seedReleasedItem(t, "team", "alpha-lint", rootId)).itemId,
      (await seedReleasedItem(t, "team", "alpha-fmt", rootId)).itemId,
      (await seedReleasedItem(t, "acme-infra", "deploy", rootId)).itemId,
    ];
    for (const id of [a, b, c]) await addFavorite(asMember, id, app);
    await seedReleasedItem(t, "team", "alpha-other", rootId);
    expect(await names(asMember, { q: "alpha" })).toEqual(["alpha-fmt", "alpha-lint"]);
    expect(await names(asMember, { q: "lint" })).toEqual(["alpha-lint"]);
    expect(await names(asMember, { scope: "acme-infra" })).toEqual(["deploy"]);
    expect(await names(asMember, { type: "skill" })).toEqual(["alpha-fmt", "alpha-lint", "deploy"]);
    expect(await names(asMember, { type: "hook" })).toEqual([]);
    const byName = await browseCatalogue(asMember, { favorites: "1", sort: "name" }, app);
    expect(byName.entries.map((e) => e.name)).toEqual(["deploy", "alpha-fmt", "alpha-lint"]);
    // The type counts are the favorites': three skills, not four.
    expect(byName.typeCounts.find((c) => c.type === "skill")?.count).toBe(3);
    // A favorite with no installable version is not counted.
    const yanked = await seedReleasedItem(t, "team", "alpha-yanked", rootId);
    await addFavorite(asMember, yanked.itemId, app);
    await kyselyItemRepository(t.db, t.dialect, UNFILTERED).setYanked(yanked.versionId, {
      at: new Date(),
      reason: "bad",
    });
    const after = await browseCatalogue(asMember, { favorites: "1" }, app);
    expect(after.typeCounts.find((c) => c.type === "skill")?.count).toBe(3);
    expect(after.entries.map((e) => e.name)).not.toContain("alpha-yanked");
  });

  it("pages through the favorites, and nothing else", async () => {
    const total = CATALOGUE_PAGE_SIZE + 2;
    for (let i = 0; i < total; i++) {
      const id = (await seedReleasedItem(t, "team", `fav-${String(i).padStart(2, "0")}`, rootId))
        .itemId;
      await addFavorite(asMember, id, app);
    }
    await seedReleasedItem(t, "team", "not-a-favorite", rootId);
    const first = await browseCatalogue(asMember, { favorites: "1", sort: "name" }, app);
    expect(first.entries).toHaveLength(CATALOGUE_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();
    const second = await browseCatalogue(
      asMember,
      { favorites: "1", sort: "name", cursor: first.nextCursor ?? undefined },
      app,
    );
    expect(second.entries.map((e) => e.name)).toEqual(["fav-24", "fav-25"]);
    expect(second.nextCursor).toBeNull();
  });

  it("leaves out a favorite the reader no longer sees, and brings it back with the access", async () => {
    const deploy = (await seedReleasedItem(t, "acme-infra", "deploy", rootId)).itemId;
    await addFavorite(asMember, deploy, app);
    expect(await names(asMember)).toEqual(["deploy"]);
    const memberId = (
      await t.db
        .selectFrom("user")
        .select("id")
        .where("email", "=", "m@example.com")
        .executeTakeFirstOrThrow()
    ).id;
    await t.db.deleteFrom("workspace_members").where("user_id", "=", memberId).execute();
    expect(await names(asMember)).toEqual([]);
    const acme = await t.db
      .selectFrom("workspaces")
      .select("id")
      .where("name", "=", "acme")
      .executeTakeFirstOrThrow();
    await setWorkspaceRole(app, memberId, "user", acme.id);
    expect(await names(asMember)).toEqual(["deploy"]);
  });

  it("leaves out a favorite with no installable version, and keeps it", async () => {
    const alpha = await seedReleasedItem(t, "team", "alpha", rootId);
    await addFavorite(asMember, alpha.itemId, app);
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    await items.setYanked(alpha.versionId, { at: new Date(), reason: "bad" });
    expect(await names(asMember)).toEqual([]);
    await items.setYanked(alpha.versionId, null);
    expect(await names(asMember)).toEqual(["alpha"]);
  });
});
