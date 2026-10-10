import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { kyselyItemRepository } from "../repositories/kysely-item-repository";
import { createScope } from "./scopes";
import { itemPage } from "./versions";

let t: TestDb;
let app: AppAuth;
let asUser: Headers;
let rootId: string;
let moderatorId: string;
let scopeId: string;
const password = "correct horse battery";

let clock = Date.UTC(2026, 8, 1);
const tick = () => {
  clock += 60_000;
  return new Date(clock);
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  await createTestUser(app, { email: "u@example.com", password });
  await createTestUser(app, {
    email: "mod@example.com",
    password,
    role: "moderator",
    name: "Mo Moderator",
  });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  asUser = await signedIn("u@example.com");
  await createScope(
    await signedIn("root@example.com"),
    { name: "team", description: "A team." },
    app,
  );
  scopeId = (await t.db.selectFrom("scopes").select("id").executeTakeFirstOrThrow()).id;
  moderatorId = (
    await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "mod@example.com")
      .executeTakeFirstOrThrow()
  ).id;
});
afterEach(() => t.cleanup());

/** A submission with review events, as 013 and 014 leave one: `[kind, actor]` in order. */
const submission = async (name: string, events: ["approve" | "override" | "comment", string][]) => {
  const id = newId();
  const at = tick();
  await t.db
    .insertInto("submissions")
    .values({
      id,
      author_id: rootId,
      scope_id: scopeId,
      name,
      type: "skill",
      item_id: null,
      base_version_id: null,
      status: "published",
      created_at: toDbDate(at, t.dialect),
      updated_at: toDbDate(at, t.dialect),
      submitted_at: toDbDate(at, t.dialect),
    })
    .execute();
  for (const [kind, actor] of events)
    await t.db
      .insertInto("review_events")
      .values({
        id: newId(),
        submission_id: id,
        actor_id: actor,
        kind,
        body: null,
        revision: 1,
        created_at: toDbDate(tick(), t.dialect),
      })
      .execute();
  return id;
};

/** Releases versions of an item through the repository, `latest` on the last. */
const release = async (
  name: string,
  versions: { version: string; dependsOn?: Record<string, string>; submissionId?: string }[],
) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const itemId =
    (await items.findByName({ scope: "team", name: name }))?.id ??
    (await items.insertItem({
      scopeId,
      name,
      type: name.endsWith("kit") ? "bundle" : "skill",
      description: `The ${name} item.`,
      ownerId: rootId,
      createdAt: tick(),
    }));
  for (const v of versions) {
    const id = await items.insertVersion({
      itemId,
      version: v.version,
      manifest: { name: `@team/${name}` },
      readme: null,
      files: [],
      notes: null,
      artifactPath: `team/${name}/${v.version}.tgz`,
      sha256: "0".repeat(64),
      size: 1,
      publishedBy: rootId,
      publishedAt: tick(),
      submissionId: v.submissionId ?? null,
      dependencies: await Promise.all(
        Object.entries(v.dependsOn ?? {}).map(async ([dependency, range]) => ({
          itemId: (await items.findByName({ scope: "team", name: dependency }))?.id ?? "",
          range,
        })),
      ),
      riskFlags: [],
    });
    await items.setTag(itemId, "latest", id);
  }
};

const page = (name: string, version?: string) =>
  itemPage(asUser, { scope: "team", name }, version, app);

describe("used by (045)", () => {
  it("lists the items whose listed version depends on this one, by name, with their ranges", async () => {
    await release("lint", [{ version: "1.0.0" }]);
    await release("starter-kit", [{ version: "1.0.0", dependsOn: { lint: "^1.0.0" } }]);
    await release("alpha-kit", [{ version: "2.0.0", dependsOn: { lint: "~1.0.0" } }]);
    // An older version depended on it; the listed one doesn't, so it isn't listed.
    await release("old-kit", [
      { version: "1.0.0", dependsOn: { lint: "^1.0.0" } },
      { version: "2.0.0" },
    ]);
    expect((await page("lint")).usedBy).toEqual([
      {
        workspace: "global",
        scope: "team",
        name: "alpha-kit",
        type: "bundle",
        version: "2.0.0",
        range: "~1.0.0",
      },
      {
        workspace: "global",
        scope: "team",
        name: "starter-kit",
        type: "bundle",
        version: "1.0.0",
        range: "^1.0.0",
      },
    ]);
    expect((await page("starter-kit")).usedBy).toEqual([]);
  });
});

describe("approval (045)", () => {
  it("is the latest approval or override of the version's submission, or none without review", async () => {
    const reviewed = await submission("lint", [
      ["comment", moderatorId],
      ["approve", moderatorId],
    ]);
    const overridden = await submission("lint", [["override", rootId]]);
    await release("lint", [
      { version: "1.0.0" },
      { version: "1.1.0", submissionId: reviewed },
      { version: "1.2.0", submissionId: overridden },
    ]);
    expect((await page("lint", "1.0.0")).shown.approval).toBeNull();
    expect((await page("lint", "1.1.0")).shown.approval).toEqual({
      by: "Mo Moderator",
      at: expect.any(Date),
      override: false,
    });
    expect((await page("lint", "1.2.0")).shown.approval).toMatchObject({
      by: "Root",
      override: true,
    });
  });
});
