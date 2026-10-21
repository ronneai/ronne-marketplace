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
import { createScope } from "../../items/actions/scopes";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import {
  PinLimitError,
  PinNeedsPublicWorkspaceError,
  ShelfItemNotAvailableError,
} from "../exceptions/errors";
import { INSTANCE_SHELF, MAX_PINS, type Shelf } from "../models/shelf";
import { seedReleasedItem } from "../repositories/test-seed";
import { listPins, movePin, pinItem, unpinItem } from "./pins";

// The pin shelves (feature 125) through the actions: who may pin, what is visible, the limits.
let t: TestDb;
let app: AppAuth;
let rootId: string;
let acme: string;
let beta: string;
let asRoot: Headers;
let asAdmin: Headers; // admin of acme (private)
let asBetaAdmin: Headers; // admin of beta (public), member of nothing else
let asModerator: Headers; // moderator of acme
let asMember: Headers; // user in acme
let asOutsider: Headers; // in no private workspace
let asAnon: Headers;
let publicItem: string;
let publicItem2: string;
let acmeItem: string;
let betaItem: string;
let acmeShelf: Shelf;
let betaShelf: Shelf;
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

const audits = async () =>
  (
    await t.db
      .selectFrom("audit_log")
      .select(["action", "target_type", "target_id", "metadata", "actor_id"])
      .where("action", "like", "pin.%")
      .orderBy("id", "asc")
      .execute()
  ).map((row) => ({ ...row, metadata: JSON.parse(row.metadata as string) }));

const order = async (headers: Headers, shelf: Shelf, include: "available" | "all" = "all") =>
  (await listPins(headers, shelf, include, app)).map((e) => e.itemId);

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  // One after the other: concurrent sign-ins and inserts deadlock on MySQL.
  const adminId = await createTestUser(app, { email: "a@example.com", password });
  const betaAdminId = await createTestUser(app, { email: "b@example.com", password });
  const moderatorId = await createTestUser(app, { email: "mod@example.com", password });
  const memberId = await createTestUser(app, { email: "m@example.com", password });
  await createTestUser(app, { email: "o@example.com", password });

  acme = await workspace("acme", "private");
  beta = await workspace("beta", "public");
  await setWorkspaceRole(app, adminId, "admin", acme);
  await setWorkspaceRole(app, moderatorId, "moderator", acme);
  await setWorkspaceRole(app, memberId, "user", acme);
  await setWorkspaceRole(app, betaAdminId, "admin", beta);
  asRoot = await signedIn("root@example.com");
  asAdmin = await signedIn("a@example.com");
  asBetaAdmin = await signedIn("b@example.com");
  asModerator = await signedIn("mod@example.com");
  asMember = await signedIn("m@example.com");
  asOutsider = await signedIn("o@example.com");

  asAnon = new Headers();
  acmeShelf = { kind: "workspace", workspaceId: acme };
  betaShelf = { kind: "workspace", workspaceId: beta };
  const root = asRoot;
  await createScope(root, { name: "team", description: "Public." }, app);
  await createScope(root, { name: "acme-infra", description: "Private.", workspaceId: acme }, app);
  await createScope(root, { name: "beta-tools", description: "Beta.", workspaceId: beta }, app);
  publicItem = (await seedReleasedItem(t, "team", "base", rootId)).itemId;
  publicItem2 = (await seedReleasedItem(t, "team", "extra", rootId)).itemId;
  acmeItem = (await seedReleasedItem(t, "acme-infra", "deploy", rootId)).itemId;
  betaItem = (await seedReleasedItem(t, "beta-tools", "lint", rootId)).itemId;
});
afterEach(() => t.cleanup());

const refused = (promise: Promise<unknown>) =>
  expect(promise).rejects.toMatchObject({ name: "ForbiddenError" });

describe("who may pin (125)", () => {
  it("only root pins to Start here: admins, moderators, members and others are refused", async () => {
    for (const who of [asAdmin, asBetaAdmin, asModerator, asMember, asOutsider, asAnon])
      await refused(pinItem(who, INSTANCE_SHELF, publicItem, app));
    expect(await pinItem(asRoot, INSTANCE_SHELF, publicItem, app)).toBe("added");
    expect(await order(asRoot, INSTANCE_SHELF)).toEqual([publicItem]);
    for (const who of [asAdmin, asModerator, asMember])
      await refused(unpinItem(who, INSTANCE_SHELF, publicItem, app));
    for (const who of [asAdmin, asModerator, asMember])
      await refused(movePin(who, INSTANCE_SHELF, publicItem, "down", app));
    expect(await order(asRoot, INSTANCE_SHELF)).toEqual([publicItem]);
  });

  it("a workspace's admins and root pin to its shelf; moderators, members, other admins are refused", async () => {
    for (const who of [asModerator, asMember, asOutsider, asBetaAdmin, asAnon])
      await refused(pinItem(who, acmeShelf, acmeItem, app));
    expect(await pinItem(asAdmin, acmeShelf, acmeItem, app)).toBe("added");
    expect(await pinItem(asRoot, acmeShelf, publicItem, app)).toBe("added");
    // The admin of acme has no say on beta's shelf.
    await refused(pinItem(asAdmin, betaShelf, betaItem, app));
    expect(await pinItem(asBetaAdmin, betaShelf, betaItem, app)).toBe("added");
    for (const who of [asModerator, asMember, asBetaAdmin])
      await refused(unpinItem(who, acmeShelf, acmeItem, app));
    for (const who of [asModerator, asMember, asBetaAdmin])
      await refused(movePin(who, acmeShelf, acmeItem, "down", app));
  });

  it("a refusal says the same for a workspace that does not exist", async () => {
    const nowhere: Shelf = { kind: "workspace", workspaceId: "1".repeat(26) };
    await refused(pinItem(asModerator, nowhere, publicItem, app));
    await expect(pinItem(asRoot, nowhere, publicItem, app)).rejects.toMatchObject({
      name: "WorkspaceNotFoundError",
    });
  });
});

describe("ids as MySQL would match them (125)", () => {
  it("an admin's padded, lower-case workspace id is the same shelf, audited under the canonical id", async () => {
    const odd: Shelf = { kind: "workspace", workspaceId: ` ${acme.toLowerCase()} ` };
    expect(await pinItem(asAdmin, odd, ` ${acmeItem.toLowerCase()} `, app)).toBe("added");
    expect(await pinItem(asAdmin, acmeShelf, acmeItem, app)).toBe("exists");
    expect(await order(asAdmin, acmeShelf)).toEqual([acmeItem]);
    expect((await audits()).map((a) => a.target_id)).toEqual([acme]);
    await refused(pinItem(asModerator, odd, acmeItem, app));
  });
});

describe("what can be pinned (125)", () => {
  it("Start here takes only items of a public workspace", async () => {
    await expect(pinItem(asRoot, INSTANCE_SHELF, acmeItem, app)).rejects.toBeInstanceOf(
      PinNeedsPublicWorkspaceError,
    );
    expect(await pinItem(asRoot, INSTANCE_SHELF, betaItem, app)).toBe("added");
  });

  it("a workspace's shelf takes any item its admin sees, including another workspace's public one", async () => {
    expect(await pinItem(asAdmin, acmeShelf, publicItem, app)).toBe("added");
    expect(await pinItem(asAdmin, acmeShelf, acmeItem, app)).toBe("added");
    // beta's admin cannot see acme's private item, so cannot pin it, nor learn it exists.
    await expect(pinItem(asBetaAdmin, betaShelf, acmeItem, app)).rejects.toBeInstanceOf(
      ShelfItemNotAvailableError,
    );
  });

  it("only released items: an unreleased or yanked-only item is refused", async () => {
    const scope = await t.db
      .selectFrom("scopes")
      .select("id")
      .where("name", "=", "team")
      .executeTakeFirstOrThrow();
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    const draftOnly = await items.insertItem({
      scopeId: scope.id,
      name: "draft-only",
      type: "skill",
      description: "x",
      ownerId: null,
      createdAt: new Date(),
    });
    await expect(pinItem(asRoot, INSTANCE_SHELF, draftOnly, app)).rejects.toBeInstanceOf(
      ShelfItemNotAvailableError,
    );
    await expect(pinItem(asRoot, INSTANCE_SHELF, "0".repeat(26), app)).rejects.toBeInstanceOf(
      ShelfItemNotAvailableError,
    );
  });

  it("pinning twice is a no-op", async () => {
    expect(await pinItem(asRoot, INSTANCE_SHELF, publicItem, app)).toBe("added");
    expect(await pinItem(asRoot, INSTANCE_SHELF, publicItem, app)).toBe("exists");
    expect(await order(asRoot, INSTANCE_SHELF)).toEqual([publicItem]);
    expect((await audits()).map((a) => a.action)).toEqual(["pin.added"]);
  });
});

describe("the limit (125)", () => {
  it("refuses a 13th pin on a shelf, naming it, and a removal makes room", async () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_PINS; i++) {
      const id = (await seedReleasedItem(t, "team", `bulk-${i}`, rootId)).itemId;
      ids.push(id);
      await pinItem(asRoot, INSTANCE_SHELF, id, app);
      await pinItem(asAdmin, acmeShelf, id, app);
    }
    await expect(pinItem(asRoot, INSTANCE_SHELF, publicItem, app)).rejects.toMatchObject({
      name: "PinLimitError",
      workspace: null,
      max: MAX_PINS,
    });
    const error = await pinItem(asAdmin, acmeShelf, publicItem, app).catch((e) => e);
    expect(error).toBeInstanceOf(PinLimitError);
    expect(error.workspace).toBe("acme");
    expect(await unpinItem(asRoot, INSTANCE_SHELF, ids[0] as string, app)).toBe(true);
    expect(await pinItem(asRoot, INSTANCE_SHELF, publicItem, app)).toBe("added");
    // Each shelf has its own twelve.
    expect(await order(asAdmin, acmeShelf)).toHaveLength(MAX_PINS);
  });
});

describe("order (125)", () => {
  it("new pins go last, and moving up and down persists", async () => {
    await pinItem(asRoot, INSTANCE_SHELF, publicItem, app);
    await pinItem(asRoot, INSTANCE_SHELF, publicItem2, app);
    await pinItem(asRoot, INSTANCE_SHELF, betaItem, app);
    expect(await order(asRoot, INSTANCE_SHELF)).toEqual([publicItem, publicItem2, betaItem]);
    expect(await movePin(asRoot, INSTANCE_SHELF, betaItem, "up", app)).toBe("moved");
    expect(await movePin(asRoot, INSTANCE_SHELF, publicItem, "up", app)).toBe("edge");
    expect(await movePin(asRoot, INSTANCE_SHELF, "0".repeat(26), "up", app)).toBe("missing");
    expect(await order(asRoot, INSTANCE_SHELF)).toEqual([publicItem, betaItem, publicItem2]);
    expect(await unpinItem(asRoot, INSTANCE_SHELF, publicItem, app)).toBe(true);
    expect(await unpinItem(asRoot, INSTANCE_SHELF, publicItem, app)).toBe(false);
    expect((await listPins(asRoot, INSTANCE_SHELF, "all", app)).map((e) => e.position)).toEqual([
      1, 2,
    ]);
  });
});

describe("visibility at read (125)", () => {
  beforeEach(async () => {
    await pinItem(asAdmin, acmeShelf, acmeItem, app);
    await pinItem(asAdmin, acmeShelf, publicItem, app);
  });

  it("a member sees an acme pin; an outsider sees none of the shelf of a private workspace", async () => {
    expect(await order(asMember, acmeShelf, "available")).toEqual([acmeItem, publicItem]);
    expect(await order(asOutsider, acmeShelf, "available")).toEqual([]);
    expect(await order(asBetaAdmin, acmeShelf, "available")).toEqual([]);
  });

  it("a pin of an item the viewer cannot see is left out of a shelf they can read", async () => {
    // acme's private item pinned on the shelf of a public workspace, by root.
    await pinItem(asRoot, betaShelf, acmeItem, app);
    await pinItem(asRoot, betaShelf, betaItem, app);
    expect(await order(asRoot, betaShelf)).toEqual([acmeItem, betaItem]);
    expect(await order(asOutsider, betaShelf, "available")).toEqual([betaItem]);
    expect(await order(asMember, betaShelf, "available")).toEqual([acmeItem, betaItem]);
  });

  it("losing sight of an item hides the pin and gaining it back shows it", async () => {
    const memberId = (
      await t.db
        .selectFrom("user")
        .select("id")
        .where("email", "=", "m@example.com")
        .executeTakeFirstOrThrow()
    ).id;
    await t.db.deleteFrom("workspace_members").where("user_id", "=", memberId).execute();
    expect(await order(asMember, acmeShelf, "available")).toEqual([]);
    await setWorkspaceRole(app, memberId, "user", acme);
    expect(await order(asMember, acmeShelf, "available")).toEqual([acmeItem, publicItem]);
  });

  it("a yanked-only item drops out of the shelf, stays in Manage as not available, and returns", async () => {
    const version = await t.db
      .selectFrom("item_versions")
      .select("id")
      .where("item_id", "=", acmeItem)
      .executeTakeFirstOrThrow();
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    await items.setYanked(version.id, { at: new Date(), reason: "bad" });
    expect(await order(asMember, acmeShelf, "available")).toEqual([publicItem]);
    expect(await listPins(asAdmin, acmeShelf, "all", app)).toEqual([
      { itemId: acmeItem, position: 1, availability: "unavailable" },
      { itemId: publicItem, position: 2, availability: "available" },
    ]);
    expect(await unpinItem(asAdmin, acmeShelf, acmeItem, app)).toBe(true);
    expect(await order(asAdmin, acmeShelf)).toEqual([publicItem]);
  });

  it("an item the admin cannot see answers as an unknown one does, on unpin and move too", async () => {
    // Root pins acme's private item on beta's shelf; beta's admin cannot see that item.
    await pinItem(asRoot, betaShelf, acmeItem, app);
    await pinItem(asRoot, betaShelf, betaItem, app);
    const unknown = "1".repeat(26);
    expect(await movePin(asBetaAdmin, betaShelf, acmeItem, "up", app)).toBe(
      await movePin(asBetaAdmin, betaShelf, unknown, "up", app),
    );
    expect(await unpinItem(asBetaAdmin, betaShelf, acmeItem, app)).toBe(
      await unpinItem(asBetaAdmin, betaShelf, unknown, app),
    );
    expect(await order(asRoot, betaShelf)).toEqual([acmeItem, betaItem]);
    expect(await audits()).toHaveLength(4); // the two in this block's setup, the two just now
  });

  it("Manage lists need the permission, reading the shelf does not", async () => {
    await refused(listPins(asMember, acmeShelf, "all", app));
    await refused(listPins(asAnon, acmeShelf, "available", app));
  });
});

describe("the audit (125)", () => {
  it("records each change in the same step, on the shelf's workspace or the instance", async () => {
    await pinItem(asRoot, INSTANCE_SHELF, publicItem, app);
    await pinItem(asRoot, INSTANCE_SHELF, publicItem2, app);
    await movePin(asRoot, INSTANCE_SHELF, publicItem2, "up", app);
    await movePin(asRoot, INSTANCE_SHELF, publicItem2, "up", app); // already first: nothing recorded
    await unpinItem(asRoot, INSTANCE_SHELF, publicItem, app);
    await unpinItem(asRoot, INSTANCE_SHELF, publicItem, app); // not there: nothing recorded
    await pinItem(asAdmin, acmeShelf, acmeItem, app);
    const rows = await audits();
    expect(rows.map((r) => r.action)).toEqual([
      "pin.added",
      "pin.added",
      "pin.reordered",
      "pin.removed",
      "pin.added",
    ]);
    expect(rows[0]).toMatchObject({
      target_type: "instance",
      metadata: { itemId: publicItem, name: "@team/base" },
    });
    expect(rows[2]?.metadata).toMatchObject({ direction: "up", name: "@team/extra" });
    expect(rows[4]).toMatchObject({
      target_type: "workspace",
      target_id: acme,
      metadata: { workspace: "acme", name: "@acme/acme-infra/deploy" },
    });
    expect(rows[4]?.actor_id).not.toBe(rows[0]?.actor_id);
  });

  it("a refused change records nothing", async () => {
    await refused(pinItem(asModerator, acmeShelf, acmeItem, app));
    await expect(pinItem(asRoot, INSTANCE_SHELF, acmeItem, app)).rejects.toBeInstanceOf(
      PinNeedsPublicWorkspaceError,
    );
    expect(await audits()).toEqual([]);
  });
});
