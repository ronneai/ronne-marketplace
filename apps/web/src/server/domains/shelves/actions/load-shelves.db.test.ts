import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HOME_FAVORITES, loadFavoritesShelf, loadPinnedShelf } from "@/features/pins/load-shelves";
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
import { INSTANCE_SHELF } from "../models/shelf";
import { seedReleasedItem } from "../repositories/test-seed";
import { addFavorite } from "./favorites";
import { pinItem, workspaceNamed } from "./pins";

// What Home and a workspace's page load (feature 125): the shelves' cards, for the reader.
let t: TestDb;
let app: AppAuth;
let rootId: string;
let acme: string;
let asRoot: Headers;
let asMember: Headers;
let asOutsider: Headers;
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
  asRoot = await signedIn("root@example.com");
  asMember = await signedIn("m@example.com");
  asOutsider = await signedIn("o@example.com");
  acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
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

const names = (shelf: { entries: { name: string }[] }) => shelf.entries.map((e) => e.name);

describe("Home's favorites (125)", () => {
  it("are the latest six that show, newest first, each starred", async () => {
    const made: { itemId: string; versionId: string }[] = [];
    for (let i = 0; i < HOME_FAVORITES + 4; i++) {
      made.push(await seedReleasedItem(t, "team", `fav-${i}`, rootId));
      await addFavorite(asMember, made[i]?.itemId as string, app);
    }
    const shelf = await loadFavoritesShelf(asMember, app);
    expect(names(shelf)).toEqual(["fav-9", "fav-8", "fav-7", "fav-6", "fav-5", "fav-4"]);
    expect(shelf.starred).toHaveLength(HOME_FAVORITES);
  });

  it("skip the newest ones that are yanked or out of sight, and still fill the six", async () => {
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    const made: { itemId: string; versionId: string }[] = [];
    for (let i = 0; i < HOME_FAVORITES + 4; i++) {
      made.push(await seedReleasedItem(t, "team", `fav-${i}`, rootId));
      await addFavorite(asMember, made[i]?.itemId as string, app);
    }
    for (const gone of made.slice(-3))
      await items.setYanked(gone.versionId, { at: new Date(), reason: "bad" });
    expect(names(await loadFavoritesShelf(asMember, app))).toEqual([
      "fav-6",
      "fav-5",
      "fav-4",
      "fav-3",
      "fav-2",
      "fav-1",
    ]);
  });

  it("are the reader's own, and only what they see", async () => {
    const mine = (await seedReleasedItem(t, "team", "mine", rootId)).itemId;
    const secret = (await seedReleasedItem(t, "acme-infra", "deploy", rootId)).itemId;
    await addFavorite(asMember, mine, app);
    await addFavorite(asMember, secret, app);
    expect(names(await loadFavoritesShelf(asMember, app))).toEqual(["deploy", "mine"]);
    expect(names(await loadFavoritesShelf(asOutsider, app))).toEqual([]);
    expect(names(await loadFavoritesShelf(asRoot, app))).toEqual([]);
  });
});

describe("a pin shelf's cards (125)", () => {
  it("are in the shelf's order, with the ones that are not available left out", async () => {
    const a = (await seedReleasedItem(t, "team", "a", rootId)).itemId;
    const b = await seedReleasedItem(t, "team", "b", rootId);
    const c = (await seedReleasedItem(t, "team", "c", rootId)).itemId;
    for (const id of [c, b.itemId, a]) await pinItem(asRoot, INSTANCE_SHELF, id, app);
    expect(names(await loadPinnedShelf(asMember, INSTANCE_SHELF, app))).toEqual(["c", "b", "a"]);
    await kyselyItemRepository(t.db, t.dialect, UNFILTERED).setYanked(b.versionId, {
      at: new Date(),
      reason: "bad",
    });
    expect(names(await loadPinnedShelf(asMember, INSTANCE_SHELF, app))).toEqual(["c", "a"]);
  });

  it("show a private workspace's pins to its members and not to anyone else", async () => {
    const deploy = (await seedReleasedItem(t, "acme-infra", "deploy", rootId)).itemId;
    await pinItem(asRoot, { kind: "workspace", workspaceId: acme }, deploy, app);
    const shelf = { kind: "workspace" as const, workspaceId: acme };
    expect(names(await loadPinnedShelf(asMember, shelf, app))).toEqual(["deploy"]);
    expect(names(await loadPinnedShelf(asOutsider, shelf, app))).toEqual([]);
  });
});

describe("the workspace under a name (125)", () => {
  it("is found by who sees it, and by no one else", async () => {
    expect(await workspaceNamed(asMember, "acme", app)).toEqual({ id: acme, name: "acme" });
    expect(await workspaceNamed(asRoot, "acme", app)).toEqual({ id: acme, name: "acme" });
    // A private workspace is the same as a name no workspace has.
    expect(await workspaceNamed(asOutsider, "acme", app)).toBeNull();
    expect(await workspaceNamed(asOutsider, "nowhere", app)).toBeNull();
    expect(await workspaceNamed(asOutsider, "global", app)).toMatchObject({ name: "global" });
  });
});
