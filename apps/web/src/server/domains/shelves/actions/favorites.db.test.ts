import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
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
import { createScope } from "../../items/actions/scopes";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { ShelfItemNotAvailableError } from "../exceptions/errors";
import { MAX_FAVORITES } from "../models/shelf";
import { seedReleasedItem } from "../repositories/test-seed";
import { addFavorite, favoritedAmong, listFavorites, removeFavorite } from "./favorites";

// Favorites (feature 125) through the actions: a person's own list, filtered by what they see now.
let t: TestDb;
let app: AppAuth;
let rootId: string;
let asRoot: Headers;
let asMember: Headers;
let asOutsider: Headers;
let asAnon: Headers;
let publicItem: string;
let privateItem: string;
let unreleased: string;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

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
  [asRoot, asMember, asOutsider] = await Promise.all([
    signedIn("root@example.com"),
    signedIn("m@example.com"),
    signedIn("o@example.com"),
  ]);
  asAnon = new Headers();
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
  publicItem = (await seedReleasedItem(t, "team", "base", rootId)).itemId;
  privateItem = (await seedReleasedItem(t, "acme-infra", "deploy", rootId)).itemId;
  // A name with no version yet: in no catalogue.
  const scope = await t.db
    .selectFrom("scopes")
    .select("id")
    .where("name", "=", "team")
    .executeTakeFirstOrThrow();
  unreleased = await kyselyItemRepository(t.db, t.dialect, UNFILTERED).insertItem({
    scopeId: scope.id,
    name: "draft-only",
    type: "skill",
    description: "No release.",
    ownerId: null,
    createdAt: new Date(),
  });
});
afterEach(() => t.cleanup());

describe("favorites (125)", () => {
  it("adds, says so the second time, lists newest first and removes", async () => {
    expect(await addFavorite(asMember, publicItem, app)).toBe("added");
    expect(await addFavorite(asMember, publicItem, app)).toBe("exists");
    expect(await addFavorite(asMember, privateItem, app)).toBe("added");
    expect(await listFavorites(asMember, app)).toEqual([privateItem, publicItem]);
    expect(await removeFavorite(asMember, publicItem, app)).toBe(true);
    expect(await removeFavorite(asMember, publicItem, app)).toBe(false);
    expect(await listFavorites(asMember, app)).toEqual([privateItem]);
  });

  it("takes an item id in any case or padded, as MySQL would match it", async () => {
    const odd = ` ${publicItem.toLowerCase()} `;
    expect(await addFavorite(asMember, odd, app)).toBe("added");
    expect(await addFavorite(asMember, publicItem, app)).toBe("exists");
    expect(await listFavorites(asMember, app)).toEqual([publicItem]);
    expect(await removeFavorite(asMember, odd, app)).toBe(true);
    expect(await listFavorites(asMember, app)).toEqual([]);
  });

  it("is one person's: nobody else, root included, reads or changes it", async () => {
    await addFavorite(asMember, publicItem, app);
    expect(await listFavorites(asRoot, app)).toEqual([]);
    expect(await listFavorites(asOutsider, app)).toEqual([]);
    expect(await removeFavorite(asRoot, publicItem, app)).toBe(false);
    expect([...(await favoritedAmong(asOutsider, [publicItem], app))]).toEqual([]);
    expect([...(await favoritedAmong(asMember, [publicItem, privateItem], app))]).toEqual([
      publicItem,
    ]);
    expect(await listFavorites(asMember, app)).toEqual([publicItem]);
  });

  it("refuses an item the person cannot see, as it would an unknown one", async () => {
    const refusal = async (run: () => Promise<unknown>) =>
      run().then(
        () => "ok",
        (e: Error) => `${e.constructor.name}: ${e.message}`,
      );
    expect(await refusal(() => addFavorite(asOutsider, privateItem, app))).toBe(
      await refusal(() => addFavorite(asOutsider, "0".repeat(26), app)),
    );
    await expect(addFavorite(asOutsider, privateItem, app)).rejects.toBeInstanceOf(
      ShelfItemNotAvailableError,
    );
    await expect(addFavorite(asMember, unreleased, app)).rejects.toBeInstanceOf(
      ShelfItemNotAvailableError,
    );
  });

  it("hides a favorite the person can no longer see, and shows it again when they can", async () => {
    await addFavorite(asMember, privateItem, app);
    const memberId = (
      await t.db
        .selectFrom("user")
        .select("id")
        .where("email", "=", "m@example.com")
        .executeTakeFirstOrThrow()
    ).id;
    await t.db.deleteFrom("workspace_members").where("user_id", "=", memberId).execute();
    expect(await listFavorites(asMember, app)).toEqual([]);
    const acme = await t.db
      .selectFrom("workspaces")
      .select("id")
      .where("name", "=", "acme")
      .executeTakeFirstOrThrow();
    await setWorkspaceRole(app, memberId, "user", acme.id);
    expect(await listFavorites(asMember, app)).toEqual([privateItem]);
  });

  it("hides a favorite of an item with no installable version, and keeps it", async () => {
    await addFavorite(asMember, publicItem, app);
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    const version = await t.db
      .selectFrom("item_versions")
      .select("id")
      .where("item_id", "=", publicItem)
      .executeTakeFirstOrThrow();
    await items.setYanked(version.id, { at: new Date(), reason: "bad" });
    expect(await listFavorites(asMember, app)).toEqual([]);
    await expect(addFavorite(asMember, publicItem, app)).rejects.toBeInstanceOf(
      ShelfItemNotAvailableError,
    );
    await items.setYanked(version.id, null);
    expect(await listFavorites(asMember, app)).toEqual([publicItem]);
  });

  it("stops at the limit, and a removal makes room", async () => {
    const memberId = (
      await t.db
        .selectFrom("user")
        .select("id")
        .where("email", "=", "m@example.com")
        .executeTakeFirstOrThrow()
    ).id;
    const scope = await t.db
      .selectFrom("scopes")
      .select("id")
      .where("name", "=", "team")
      .executeTakeFirstOrThrow();
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    // The limit counts rows, released or not: bare items fill the list faster than releasing 200.
    let last = "";
    for (let i = 0; i < MAX_FAVORITES; i++) {
      last = await items.insertItem({
        scopeId: scope.id,
        name: `bulk-${i}`,
        type: "skill",
        description: "x",
        ownerId: null,
        createdAt: new Date(),
      });
      await t.db
        .insertInto("item_favorites")
        .values({ user_id: memberId, item_id: last, created_at: toDbDate(new Date(), t.dialect) })
        .execute();
    }
    await expect(addFavorite(asMember, publicItem, app)).rejects.toMatchObject({
      name: "FavoriteLimitError",
      max: MAX_FAVORITES,
    });
    expect(await removeFavorite(asMember, last, app)).toBe(true);
    expect(await addFavorite(asMember, publicItem, app)).toBe("added");
  });

  it("is refused to someone signed out", async () => {
    await expect(addFavorite(asAnon, publicItem, app)).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    await expect(listFavorites(asAnon, app)).rejects.toMatchObject({ name: "ForbiddenError" });
    expect([...(await favoritedAmong(asAnon, [publicItem], app))]).toEqual([]);
  });
});
