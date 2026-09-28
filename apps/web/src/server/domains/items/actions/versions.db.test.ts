import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import {
  ItemNotFoundError,
  TagRuleError,
  VersionMessageError,
  VersionNotFoundError,
} from "../exceptions/errors";
import { kyselyItemRepository } from "../repositories/kysely-item-repository";
import { createScope } from "./scopes";
import { deprecate, moveTag, removeTag, undeprecate, unyank, yank } from "./versions";

let t: TestDb;
let app: AppAuth;
let asUser: Headers;
let asModerator: Headers;
let asModerator2: Headers;
let publisher: string;
const password = "correct horse battery";
const ref = { scope: "team", name: "github" };

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: publisher } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  await createTestUser(app, { email: "u@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  await createTestUser(app, { email: "mod2@example.com", password, role: "moderator" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  const asRoot = await signedIn("root@example.com");
  asUser = await signedIn("u@example.com");
  asModerator = await signedIn("mod@example.com");
  asModerator2 = await signedIn("mod2@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);

  // @team/github with 1.0.0, 1.1.0 (latest) and 2.0.0-beta.1 (next), as releases would leave it.
  const items = kyselyItemRepository(t.db, t.dialect);
  const scope = await t.db.selectFrom("scopes").select("id").executeTakeFirstOrThrow();
  const itemId = await items.insertItem({
    scopeId: scope.id,
    name: "github",
    type: "mcp-server",
    description: "GitHub.",
    ownerId: publisher,
    createdAt: new Date(),
  });
  const ids: Record<string, string> = {};
  for (const version of ["1.0.0", "1.1.0", "2.0.0-beta.1"])
    ids[version] = await items.insertVersion({
      itemId,
      version,
      manifest: {},
      readme: null,
      files: [],
      notes: null,
      artifactPath: `team/github/${version}.tgz`,
      sha256: "0".repeat(64),
      size: 1,
      publishedBy: publisher,
      publishedAt: new Date(),
      submissionId: null,
      dependencies: [],
    });
  await items.setTag(itemId, "latest", ids["1.1.0"] ?? "");
  await items.setTag(itemId, "next", ids["2.0.0-beta.1"] ?? "");
});
afterEach(() => t.cleanup());

const tags = async () => {
  const items = kyselyItemRepository(t.db, t.dialect);
  const item = await items.findByName("team", "github");
  const versions = await items.versions(item?.id ?? "");
  return Object.fromEntries(
    (await items.tags(item?.id ?? "")).map((tag) => [
      tag.tag,
      versions.find((v) => v.id === tag.versionId)?.version,
    ]),
  );
};
const version = async (v: string) =>
  (
    await kyselyItemRepository(t.db, t.dialect).versions(
      (await kyselyItemRepository(t.db, t.dialect).findByName("team", "github"))?.id ?? "",
    )
  ).find((row) => row.version === v);
const audited = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

describe("dist-tags", () => {
  it("moves latest back (a rollback), adds and removes tags, and audits each change", async () => {
    await moveTag(asModerator, ref, { tag: "latest", version: "1.0.0" }, app);
    await moveTag(asModerator, ref, { tag: "stable-1", version: "1.1.0" }, app);
    await removeTag(asModerator, ref, { tag: "next" }, app);
    expect(await tags()).toEqual({ latest: "1.0.0", "stable-1": "1.1.0" });
    expect(await audited("dist_tag.moved")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({ tag: "latest", from: "1.1.0", to: "1.0.0" }),
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({ tag: "stable-1", from: null, to: "1.1.0" }),
        }),
      ]),
    );
    expect(await audited("dist_tag.removed")).toMatchObject([
      { metadata: { tag: "next", was: "2.0.0-beta.1" } },
    ]);
  });

  it("refuses latest on a pre-release, tags that read as ranges, yanked targets, and removing latest", async () => {
    await expect(
      moveTag(asModerator, ref, { tag: "latest", version: "2.0.0-beta.1" }, app),
    ).rejects.toThrow("latest can only point to a stable version");
    await expect(moveTag(asModerator, ref, { tag: "x", version: "1.0.0" }, app)).rejects.toThrow(
      TagRuleError,
    );
    await yank(asModerator, ref, { version: "1.0.0", reason: "Broken." }, app);
    await expect(moveTag(asModerator, ref, { tag: "old", version: "1.0.0" }, app)).rejects.toThrow(
      "is yanked",
    );
    await expect(removeTag(asModerator, ref, { tag: "latest" }, app)).rejects.toThrow(
      "latest can't be removed",
    );
  });
});

describe("deprecate", () => {
  it("sets and clears a message, and keeps the version installable", async () => {
    await deprecate(asModerator, ref, { version: "1.0.0", message: "  Use 1.1.0.  " }, app);
    expect(await version("1.0.0")).toMatchObject({
      deprecatedMessage: "Use 1.1.0.",
      yankedAt: null,
    });
    await undeprecate(asModerator, ref, { version: "1.0.0" }, app);
    expect((await version("1.0.0"))?.deprecatedMessage).toBeNull();
    expect((await audited("version.deprecated"))[0]).toMatchObject({
      targetType: "item_version",
      metadata: { version: "1.0.0", message: "Use 1.1.0." },
    });
    expect(await audited("version.undeprecated")).toHaveLength(1);
    await expect(
      deprecate(asModerator, ref, { version: "1.0.0", message: " " }, app),
    ).rejects.toThrow(VersionMessageError);
  });
});

describe("yank", () => {
  it("moves latest back when the latest version is yanked, removes it when nothing is left, and keeps the reason", async () => {
    await yank(asModerator, ref, { version: "1.1.0", reason: "Leaks a token." }, app);
    expect(await tags()).toEqual({ latest: "1.0.0", next: "2.0.0-beta.1" });
    expect(await version("1.1.0")).toMatchObject({ yankReason: "Leaks a token." });
    expect((await version("1.1.0"))?.yankedAt).toBeInstanceOf(Date);
    expect((await audited("version.yanked"))[0]).toMatchObject({
      metadata: { version: "1.1.0", reason: "Leaks a token.", latest_moved_to: "1.0.0" },
    });

    await yank(asModerator, ref, { version: "1.0.0", reason: "Also broken." }, app);
    expect(await tags()).toEqual({ next: "2.0.0-beta.1" });

    // Unyanking makes it resolvable again, but doesn't move tags back.
    await unyank(asModerator, ref, { version: "1.1.0" }, app);
    expect(await version("1.1.0")).toMatchObject({ yankedAt: null, yankReason: null });
    expect(await tags()).toEqual({ next: "2.0.0-beta.1" });
    expect(await audited("version.unyanked")).toHaveLength(1);
  });

  it("leaves latest alone when an older version is yanked, and needs a reason", async () => {
    await yank(asModerator, ref, { version: "1.0.0", reason: "Old." }, app);
    expect((await tags()).latest).toBe("1.1.0");
    await expect(yank(asModerator, ref, { version: "1.1.0", reason: "" }, app)).rejects.toThrow(
      VersionMessageError,
    );
  });
});

describe("who and what", () => {
  it("is for moderators and root, on items and versions that exist", async () => {
    await expect(moveTag(asUser, ref, { tag: "latest", version: "1.0.0" }, app)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      yank(asModerator, { scope: "team", name: "nope" }, { version: "1.0.0", reason: "x" }, app),
    ).rejects.toThrow(ItemNotFoundError);
    await expect(yank(asModerator, ref, { version: "9.9.9", reason: "x" }, app)).rejects.toThrow(
      VersionNotFoundError,
    );
  });

  it("serialises concurrent changes to one item", async () => {
    await Promise.all([
      moveTag(asModerator, ref, { tag: "latest", version: "1.0.0" }, app),
      moveTag(asModerator2, ref, { tag: "latest", version: "1.1.0" }, app),
    ]);
    const final = (await tags()).latest;
    expect(["1.0.0", "1.1.0"]).toContain(final);
    // Each change saw the one before it: the audit trail ends where the tag is.
    const moves = (await audited("dist_tag.moved")).map((e) => e.metadata);
    expect(moves.some((m) => m.to === final)).toBe(true);
  });
});
