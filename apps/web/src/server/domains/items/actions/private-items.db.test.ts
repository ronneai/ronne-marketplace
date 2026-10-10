import { formatItemName } from "@ronneai/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { kyselyItemRepository } from "../repositories/kysely-item-repository";
import { browseCatalogue, dependencyFacts, homeLists, searchCatalogueAs } from "./catalogue";
import { createScope } from "./scopes";
import {
  findDownloadAs,
  itemPage,
  itemPageAs,
  listVersions,
  resolveAs,
  versionContents,
} from "./versions";

// A private workspace's items (093): its members and root see them; to anyone else they're an
// unknown name, everywhere the items domain answers.
let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asMember: Headers;
let asOutsider: Headers;
let member: CurrentUser;
let outsider: CurrentUser;
let rootId: string;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const release = async (scopeName: string, name: string, dependsOn?: string) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const scope = await t.db
    .selectFrom("scopes")
    .select("id")
    .where("name", "=", scopeName)
    .executeTakeFirstOrThrow();
  const itemId = await items.insertItem({
    scopeId: scope.id,
    name,
    type: "skill",
    description: `The ${name} item.`,
    ownerId: null,
    createdAt: new Date(),
  });
  const versionId = await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: { name: `@${scopeName}/${name}`, description: `The ${name} item.` },
    readme: "# Read me",
    files: [],
    notes: null,
    artifactPath: `${scopeName}/${name}/1.0.0.tgz`,
    sha256: "0".repeat(64),
    size: 1,
    publishedBy: rootId,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: dependsOn ? [{ itemId: dependsOn, range: "^1.0.0" }] : [],
    riskFlags: [],
  });
  await items.setTag(itemId, "latest", versionId);
  await t.db.updateTable("items").set({ download_count: 3 }).where("id", "=", itemId).execute();
  return itemId;
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
  await createTestUser(app, { email: "o@example.com", password, role: "moderator" });
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
  const base = await release("team", "base");
  await release("acme-infra", "deploy", base);
  member = (await getCurrentUser(asMember, app)) as CurrentUser;
  outsider = (await getCurrentUser(asOutsider, app)) as CurrentUser;
});
afterEach(() => t.cleanup());

const names = (entries: { scope: string; name: string }[]) =>
  entries.map((e) => formatItemName(e)).sort();
const DEPLOY = { workspace: "acme", scope: "acme-infra", name: "deploy" };
const UNKNOWN = { workspace: "acme", scope: "acme-infra", name: "nothing-here" };

/** What an outsider gets for `ref`, error or value, comparable with an unknown name's. */
const outcome = async (run: () => Promise<unknown>) => {
  try {
    await run();
    return "found";
  } catch (error) {
    return `${(error as Error).constructor.name}: ${(error as Error).message.replace("deploy", "X").replace("nothing-here", "X")}`;
  }
};

describe("a private workspace's items (093)", () => {
  it("are in the catalogue, its search, counts and filters for members and root only", async () => {
    for (const [who, headers] of [
      ["member", asMember],
      ["root", asRoot],
    ] as const) {
      const page = await browseCatalogue(headers, {}, app);
      expect(names(page.entries), who).toEqual(["@acme/acme-infra/deploy", "@team/base"]);
      expect(page.workspaces, who).toEqual(["global", "acme"]);
      expect(page.scopes, who).toContain("acme-infra");
      // The card's lock label (task 8).
      expect(
        page.entries.map((e) => [e.workspace, e.privateWorkspace]),
        who,
      ).toEqual([
        ["acme", true],
        ["global", false],
      ]);
    }
    const page = await browseCatalogue(asOutsider, {}, app);
    expect(names(page.entries)).toEqual(["@team/base"]);
    expect(page.workspaces).toEqual(["global"]);
    expect(page.scopes).not.toContain("acme-infra");
    expect(page.typeCounts.find((c) => c.type === "skill")?.count).toBe(1);
    expect(names((await browseCatalogue(asOutsider, { q: "deploy" }, app)).entries)).toEqual([]);
    expect(names((await browseCatalogue(asOutsider, { workspace: "acme" }, app)).entries)).toEqual(
      [],
    );
    expect(names((await searchCatalogueAs(outsider, { q: "deploy" }, app)).entries)).toEqual([]);
    expect(names((await searchCatalogueAs(member, { q: "deploy" }, app)).entries)).toEqual([
      "@acme/acme-infra/deploy",
    ]);
  });

  it("aren't on an outsider's home page", async () => {
    const outsiders = await homeLists(asOutsider, app);
    expect(names([...outsiders.recent, ...outsiders.mostUsed])).not.toContain(
      "@acme/acme-infra/deploy",
    );
    const members = await homeLists(asMember, app);
    expect(names(members.mostUsed)).toContain("@acme/acme-infra/deploy");
  });

  it("answer an outsider exactly as an unknown name does: page, versions, contents, API, download", async () => {
    const asks: [string, (ref: typeof DEPLOY) => Promise<unknown>][] = [
      ["item page", (ref) => itemPage(asOutsider, ref, undefined, app)],
      ["versions", (ref) => listVersions(asOutsider, ref, app)],
      ["contents", (ref) => versionContents(asOutsider, ref, "1.0.0", app)],
      ["API item", (ref) => itemPageAs(outsider, ref, undefined, app)],
      ["download", (ref) => findDownloadAs(outsider, ref, "1.0.0", app)],
    ];
    for (const [what, ask] of asks) {
      const hidden = await outcome(() => ask(DEPLOY));
      expect(hidden, what).not.toBe("found");
      expect(hidden, what).toBe(await outcome(() => ask(UNKNOWN)));
    }
    // A member and root get them.
    expect((await itemPage(asMember, DEPLOY, undefined, app)).item).toMatchObject({
      name: "deploy",
      privateWorkspace: true,
    });
    expect((await itemPage(asRoot, DEPLOY, undefined, app)).item.name).toBe("deploy");
    expect(await outcome(() => findDownloadAs(member, DEPLOY, "1.0.0", app))).toBe("found");
  });

  it("resolve as unknown for an outsider, and resolve for a member", async () => {
    const ask = (user: CurrentUser, name: string) => () =>
      resolveAs(user, { dependencies: { [`@acme/acme-infra/${name}`]: "^1" } }, app);
    const hidden = await outcome(ask(outsider, "deploy"));
    expect(hidden).toMatch(/^ResolveError: /);
    expect(hidden).toBe(await outcome(ask(outsider, "nothing-here")));
    expect(JSON.stringify(await ask(member, "deploy")())).toContain("1.0.0");
  });

  it("aren't in a public item's Used by, nor the canvas's facts, for an outsider", async () => {
    const outsiders = await itemPage(asOutsider, { scope: "team", name: "base" }, undefined, app);
    expect(outsiders.usedBy).toEqual([]);
    const members = await itemPage(asMember, { scope: "team", name: "base" }, undefined, app);
    expect(members.usedBy.map((d) => formatItemName(d))).toEqual(["@acme/acme-infra/deploy"]);
    const facts = await dependencyFacts(asOutsider, ["@acme/acme-infra/deploy", "@team/base"], app);
    expect(JSON.stringify(facts)).not.toContain("deploy");
    expect(
      JSON.stringify(await dependencyFacts(asMember, ["@acme/acme-infra/deploy"], app)),
    ).toContain("deploy");
  });
});
