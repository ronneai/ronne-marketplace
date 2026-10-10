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
import { createScope } from "../../items/actions/scopes";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { itemUsage, recordUsageAs } from "../../usage/actions/usage";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { dependencyReports, findDependencies } from "./composer";
import { createDraft, listMySubmissions, saveDraftFiles } from "./drafts";
import { getReview, listQueue } from "./reviews";
import { dependencyMarks, submitDraft, viewSubmission, withdrawSubmission } from "./submissions";

// A private workspace's submissions and usage (093): its members, moderators and root see them;
// anyone else gets what an unknown scope, submission or name gets. A removed member keeps their own.
let t: TestDb;
let app: AppAuth;
let acme: string;
let memberId: string;
let rootId: string;
let asRoot: Headers;
let asMember: Headers;
let asAcmeModerator: Headers;
let asOutsider: Headers;
let outsider: CurrentUser;
let member: CurrentUser;
let deployId: string;
let submissionId: string;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

/** A skill submitted for review by `headers` in `scope`. */
const submitted = async (headers: Headers, scope: string, name: string) => {
  const draft = await createDraft(headers, { scope, name, type: "rule" }, app);
  const manifest = draft.files.find((f) => f.path === "ronne.yaml");
  await saveDraftFiles(
    headers,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: (manifest?.content ?? "").replace('description: ""', "description: Private."),
          executable: false,
          loadedAt: manifest?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  await submitDraft(headers, draft.id, app);
  return draft.id;
};

/** A released skill, as 015 would leave it. */
const released = async (scopeName: string, name: string) => {
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
    description: name,
    ownerId: null,
    createdAt: new Date(),
  });
  const versionId = await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: { name: `@${scopeName}/${name}`, description: name },
    readme: null,
    files: [],
    notes: null,
    artifactPath: `${scopeName}/${name}.tgz`,
    sha256: "0".repeat(64),
    size: 1,
    publishedBy: rootId,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
  await items.setTag(itemId, "latest", versionId);
  return itemId;
};

/** An outcome to compare: "found", or the error with the asked-for names masked. */
const outcome = async (run: () => Promise<unknown>, ...names: string[]) => {
  try {
    await run();
    return "found";
  } catch (error) {
    let text = `${(error as Error).constructor.name}: ${(error as Error).message}`;
    for (const name of names) text = text.replaceAll(name, "X");
    return text;
  }
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  memberId = await createTestUser(app, { email: "m@example.com", password });
  const acmeModeratorId = await createTestUser(app, { email: "am@example.com", password });
  await createTestUser(app, { email: "o@example.com", password, role: "moderator" });
  acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name: "acme",
    description: "Acme.",
    visibility: "private",
    createdBy: null,
    createdAt: new Date(),
  });
  await setWorkspaceRole(app, memberId, "user", acme);
  await setWorkspaceRole(app, acmeModeratorId, "moderator", acme);
  asRoot = await signedIn("root@example.com");
  asMember = await signedIn("m@example.com");
  asAcmeModerator = await signedIn("am@example.com");
  asOutsider = await signedIn("o@example.com");
  await createScope(asRoot, { name: "team", description: "Public." }, app);
  await createScope(
    asRoot,
    { name: "acme-infra", description: "Private.", workspaceId: acme },
    app,
  );
  deployId = await released("acme-infra", "deploy");
  submissionId = await submitted(asMember, "@acme/acme-infra", "style");
  outsider = (await getCurrentUser(asOutsider, app)) as CurrentUser;
  member = (await getCurrentUser(asMember, app)) as CurrentUser;
});
afterEach(() => t.cleanup());

describe("a private workspace's submissions (093)", () => {
  it("refuse an outsider's draft in its scope exactly as an unknown scope does", async () => {
    const draft = (scope: string) => () =>
      createDraft(asOutsider, { scope, name: "mine", type: "rule" }, app);
    const hidden = await outcome(draft("@acme/acme-infra"), "acme/acme-infra");
    expect(hidden).toMatch(/^DraftScopeNotFoundError: There's no scope @X you can use/);
    expect(hidden).toBe(await outcome(draft("@acme/nowhere-here"), "acme/nowhere-here"));
    // An unknown workspace answers the same (118).
    expect(hidden).toBe(await outcome(draft("@nowhere/acme-infra"), "nowhere/acme-infra"));
    expect(await outcome(draft("@acme/acme-infra"))).toMatch(/no scope @acme\/acme-infra/);
    expect(
      await outcome(() =>
        createDraft(asMember, { scope: "@acme/acme-infra", name: "x", type: "rule" }, app),
      ),
    ).toBe("found");
  });

  it("aren't in an outsider's queue, though they moderate global; acme's moderator and root see them", async () => {
    const queued = async (headers: Headers) =>
      (await listQueue(headers, { tab: "needs" }, app)).rows.map((r) => r.id);
    expect(await queued(asOutsider)).toEqual([]);
    expect(await queued(asAcmeModerator)).toEqual([submissionId]);
    expect(await queued(asRoot)).toEqual([submissionId]);
    const workspaces = (await listQueue(asOutsider, { tab: "needs" }, app)).workspaces;
    expect(workspaces.map((w) => w.name)).not.toContain("acme");
  });

  it("answer an outsider's review page and view as an unknown id does", async () => {
    const unknown = "01K6BZ3W1D8J9Q2R4T6V8X0Y99";
    for (const [what, ask] of [
      ["review", (id: string) => () => getReview(asOutsider, id, app)],
      ["view", (id: string) => () => viewSubmission(asOutsider, id, app)],
    ] as const) {
      const hidden = await outcome(ask(submissionId), submissionId);
      expect(hidden, what).not.toBe("found");
      expect(hidden, what).toBe(await outcome(ask(unknown), unknown));
    }
    expect(await outcome(() => getReview(asAcmeModerator, submissionId, app))).toBe("found");
  });

  it("stay readable and withdrawable by their author once removed from the workspace (091)", async () => {
    await t.db
      .deleteFrom("workspace_members")
      .where("user_id", "=", memberId)
      .where("workspace_id", "=", acme)
      .execute();
    expect((await viewSubmission(asMember, submissionId, app)).id).toBe(submissionId);
    await withdrawSubmission(asMember, submissionId, app);
    const row = await t.db
      .selectFrom("submissions")
      .select("status")
      .where("id", "=", submissionId)
      .executeTakeFirst();
    expect(row?.status).not.toBe("submitted");
  });
});

describe("a private workspace's items, while composing and reporting usage (093)", () => {
  it("mark an outsider's dependencies on them exactly as on unknown names", async () => {
    const draft = await createDraft(
      asOutsider,
      { scope: "team", name: "mine", type: "agent" },
      app,
    );
    const manifest = draft.files.find((f) => f.path === "ronne.yaml");
    await saveDraftFiles(
      asOutsider,
      draft.id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `${manifest?.content ?? ""}\ndependencies:\n  "@acme/acme-infra/style": "^1.0.0"\n  "@acme/acme-infra/deploy": "^1.0.0"\n  "@acme/acme-infra/zzz": "^1.0.0"\n  "@acme/acme-infra/yyy": "^1.0.0"\n`,
            executable: false,
            loadedAt: manifest?.updatedAt ?? null,
          },
        ],
        deletes: [],
      },
      app,
    );
    const mine = await listMySubmissions(asOutsider, app);
    const marks = (await dependencyMarks(asOutsider, mine, app))[draft.id] ?? [];
    const of = (name: string) =>
      JSON.stringify(marks.find((m) => m.dependency === name) ?? null).replaceAll(name, "X");
    // style is submitted and deploy released in acme; zzz and yyy don't exist.
    expect(of("@acme/acme-infra/style")).toBe(of("@acme/acme-infra/zzz"));
    expect(of("@acme/acme-infra/deploy")).toBe(of("@acme/acme-infra/yyy"));
  });

  it("are an unknown name in an outsider's dependency reports, and not offered to pick", async () => {
    const reports = async (name: string) =>
      JSON.stringify(
        await dependencyReports(
          asOutsider,
          { itemName: "@team/mine", type: "agent", dependencies: { [name]: "^1.0.0" } },
          app,
        ),
      ).replaceAll(name, "X");
    expect(await reports("@acme/acme-infra/deploy")).toBe(
      await reports("@acme/acme-infra/nothing-here"),
    );
    const picked = await findDependencies(asOutsider, { type: "agent", q: "deploy" }, app);
    expect(JSON.stringify(picked)).not.toContain("deploy");
    const members = await findDependencies(
      asMember,
      { type: "agent", q: "deploy", itemName: "@acme/acme-infra/new" },
      app,
    );
    expect(JSON.stringify(members)).toContain("deploy");
  });

  it("count usage reported by a member, ignore an outsider's, and show it only to those who see it", async () => {
    await kyselySettingsRepository(t.db, t.dialect).set(
      "usage_policy",
      "required",
      rootId,
      new Date(),
    );
    const report = (user: CurrentUser) =>
      recordUsageAs(
        user,
        {
          events: [
            {
              day: new Date().toISOString().slice(0, 10),
              item: "@acme/acme-infra/deploy",
              version: "1.0.0",
              tool: "claude-code",
              event: "run",
              trigger: "user",
              outcome: "success",
              count: 1,
            },
          ],
        },
        app,
      );
    expect(await report(outsider)).toEqual({ accepted: 0, ignored: 1 });
    expect(await report(member)).toEqual({ accepted: 1, ignored: 0 });
    const seen = await itemUsage(asMember, { id: deployId, type: "skill" }, app);
    const unseen = await itemUsage(asOutsider, { id: deployId, type: "skill" }, app);
    expect(JSON.stringify(seen)).not.toBe(JSON.stringify(unseen));
    expect(unseen).toEqual(
      await itemUsage(asOutsider, { id: "01K6BZ3W1D8J9Q2R4T6V8X0Y98", type: "skill" }, app),
    );
  });
});
