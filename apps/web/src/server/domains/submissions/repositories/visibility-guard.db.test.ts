import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { loadMemberships } from "../../identity/repositories/memberships";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { kyselyUsageRepository } from "../../usage/repositories/kysely-usage-repository";
import type { UsageRepository } from "../../usage/repositories/usage-repository";
import { UNFILTERED, type Viewer } from "../../workspaces/models/viewer";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { loadViewer } from "../../workspaces/repositories/viewer";
import { createDraft, saveDraftFiles } from "../actions/drafts";
import { submitDraft } from "../actions/submissions";
import { kyselyRegistryLookup } from "./kysely-registry-lookup";
import { kyselySubmissionRepository } from "./kysely-submission-repository";
import type { RegistryLookup } from "./registry-lookup";
import type { SubmissionRepository } from "./submission-repository";

// The guard of 093 for submissions, the registry lookup and usage: each method is a read, with a
// probe that finds the private workspace's data for a member and nothing for an outsider, or a write
// named with why it needn't filter. A new method that's neither fails the first test.
let t: TestDb;
let app: AppAuth;
let ids: { scope: string; submission: string; revision: string; item: string; author: string };
let member: Viewer;
let outsider: Viewer;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  const { id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  });
  const authorId = await createTestUser(app, { email: "m@example.com", password });
  const outsiderId = await createTestUser(app, {
    email: "o@example.com",
    password,
    role: "moderator",
  });
  const acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name: "acme",
    description: "Acme.",
    visibility: "private",
    createdBy: null,
    createdAt: new Date(),
  });
  await setWorkspaceRole(app, authorId, "user", acme);
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  const asRoot = await signedIn("root@example.com");
  const asAuthor = await signedIn("m@example.com");
  await createScope(
    asRoot,
    { name: "acme-infra", description: "Private.", workspaceId: acme },
    app,
  );
  // A submitted rule, a draft, and a released skill in acme; usage for the skill.
  const draft = await createDraft(
    asAuthor,
    { scope: "acme-infra", name: "style", type: "rule" },
    app,
  );
  const manifest = draft.files.find((f) => f.path === "ronne.yaml");
  await saveDraftFiles(
    asAuthor,
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
  await submitDraft(asAuthor, draft.id, app);
  await createDraft(asAuthor, { scope: "acme-infra", name: "later", type: "rule" }, app);
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const scope = await t.db
    .selectFrom("scopes")
    .select("id")
    .where("name", "=", "acme-infra")
    .executeTakeFirstOrThrow();
  const item = await items.insertItem({
    scopeId: scope.id,
    name: "deploy",
    type: "skill",
    description: "Deploy.",
    ownerId: null,
    createdAt: new Date(),
  });
  const version = await items.insertVersion({
    itemId: item,
    version: "1.0.0",
    manifest: { name: "@acme-infra/deploy", description: "Deploy." },
    readme: null,
    files: [],
    notes: null,
    artifactPath: "acme-infra/deploy.tgz",
    sha256: "0".repeat(64),
    size: 1,
    publishedBy: rootId,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
  await items.setTag(item, "latest", version);
  await kyselyUsageRepository(t.db, t.dialect, UNFILTERED).add([
    {
      itemId: item,
      day: "2026-10-01",
      version: "1.0.0",
      tool: "claude-code",
      event: "run",
      trigger: "user",
      outcome: "success",
      count: 1,
    },
  ]);
  const revision = await t.db
    .selectFrom("submission_revisions")
    .select("id")
    .where("submission_id", "=", draft.id)
    .executeTakeFirstOrThrow();
  ids = { scope: scope.id, submission: draft.id, revision: revision.id, item, author: authorId };
  const viewerOf = async (id: string) =>
    loadViewer(t.db, { id, role: "user", workspaces: await loadMemberships(t.db, id) });
  member = await viewerOf(authorId);
  outsider = await viewerOf(outsiderId);
});
afterEach(() => t.cleanup());

type Probe<R> = (repo: R) => Promise<boolean>;
const some = (value: unknown) =>
  Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
const REVIEW = { statuses: ["submitted" as const], workspaceIds: undefined };

const SUBMISSION_READS: Partial<Record<keyof SubmissionRepository, Probe<SubmissionRepository>>> = {
  findScope: async (repo) => some(await repo.findScope("acme-infra")),
  find: async (repo) => some(await repo.find(ids.submission)),
  listByAuthor: async (repo) => some(await repo.listByAuthor(ids.author)),
  listOwnUnreleased: async (repo) =>
    some(
      await repo.listOwnUnreleased({
        authorId: ids.author,
        types: ["rule"],
        search: "",
        limit: 10,
      }),
    ),
  listForReview: async (repo) =>
    some(await repo.listForReview({ statuses: ["submitted"], order: "oldest", limit: 10 })),
  pageByAuthor: async (repo) =>
    some(
      (
        await repo.pageByAuthor({
          authorId: ids.author,
          sort: "updated",
          dir: "desc",
          size: 10,
        } as never)
      ).rows,
    ),
  countByAuthor: async (repo) => (await repo.countByAuthor({ authorId: ids.author })).count > 0,
  statusCountsByAuthor: async (repo) =>
    Object.keys(await repo.statusCountsByAuthor(ids.author)).length > 0,
  pageForReview: async (repo) =>
    some(
      (await repo.pageForReview({ ...REVIEW, sort: "submitted", dir: "asc", size: 10 } as never))
        .rows,
    ),
  countForReview: async (repo) => (await repo.countForReview(REVIEW as never)).count > 0,
  workspacesNamed: async (repo) =>
    (await repo.workspacesNamed("all")).some((w) => w.name === "acme"),
  countByStatus: async (repo) => (await repo.countByStatus("submitted")) > 0,
  countDrafts: async (repo) => (await repo.countDrafts(ids.author)) > 0,
  isNameProposed: async (repo) => repo.isNameProposed(ids.scope, "style", ["submitted"], "none"),
  registry: async (repo) => some(await repo.registry().findItem("acme-infra", "deploy")),
  revisions: async (repo) => some(await repo.revisions(ids.submission)),
  revisionFiles: async (repo) => some(await repo.revisionFiles(ids.revision)),
  events: async (repo) => some(await repo.events(ids.submission)),
  latestEvents: async (repo) =>
    (await repo.latestEvents([ids.submission], ["submit", "resubmit"])).size > 0,
  files: async (repo) => some(await repo.files(ids.submission)),
};

const SUBMISSION_WRITES: Partial<Record<keyof SubmissionRepository, string>> = {
  transaction: "passes the same viewer to the repository it opens",
  insert: "a write",
  update: "a write, on a submission a read found",
  delete: "a write",
  setStatus: "a write",
  lockScope: "takes a lock, reads nothing back",
  lockSubmission: "takes a lock, reads nothing back",
  recordAudit: "a write to the audit log",
  setProposalBase: "a write",
  setConflicts: "a write",
  createRevision: "a write",
  addEvent: "a write",
  writeFile: "a write",
  deleteFile: "a write",
  userName: "a user's display name, not a workspace's data",
};

const REGISTRY_READS: Record<keyof RegistryLookup, Probe<RegistryLookup>> = {
  findItem: async (repo) => some(await repo.findItem("acme-infra", "deploy")),
  publishedVersions: async (repo) => some(await repo.publishedVersions(ids.item)),
  submissionsNamed: async (repo) => some(await repo.submissionsNamed("acme-infra", "style")),
};

const USAGE_READS: Partial<Record<keyof UsageRepository, Probe<UsageRepository>>> = {
  publishedVersions: async (repo) =>
    (await repo.publishedVersions(["@acme-infra/deploy"])).size > 0,
  rowsBetween: async (repo) => some(await repo.rowsBetween(ids.item, "2026-09-01", "2026-10-31")),
  hasAny: async (repo) => repo.hasAny(ids.item),
};
const USAGE_WRITES: Partial<Record<keyof UsageRepository, string>> = {
  add: "a write: what's counted was checked with publishedVersions",
  deleteBefore: "prunes old totals, reads nothing back",
};

const repos = (viewer: Viewer) => ({
  submissions: kyselySubmissionRepository(t.db, t.dialect, viewer),
  registry: kyselyRegistryLookup(t.db, t.dialect, viewer),
  usage: kyselyUsageRepository(t.db, t.dialect, viewer),
});

describe("every submissions, registry and usage read filters by the viewer (093)", () => {
  it("knows every method: each is a read with a probe, or a named write", () => {
    const { submissions, registry, usage } = repos(outsider);
    expect(Object.keys(submissions).sort()).toEqual(
      [...Object.keys(SUBMISSION_READS), ...Object.keys(SUBMISSION_WRITES)].sort(),
    );
    expect(Object.keys(registry).sort()).toEqual(Object.keys(REGISTRY_READS).sort());
    expect(Object.keys(usage).sort()).toEqual(
      [...Object.keys(USAGE_READS), ...Object.keys(USAGE_WRITES)].sort(),
    );
  });

  it("gives a member each read's private data, and an outsider none", async () => {
    const pairs: [string, Record<string, Probe<never>>, keyof ReturnType<typeof repos>][] = [
      ["submissions", SUBMISSION_READS as never, "submissions"],
      ["registry", REGISTRY_READS as never, "registry"],
      ["usage", USAGE_READS as never, "usage"],
    ];
    for (const [label, reads, key] of pairs)
      for (const [name, probe] of Object.entries(reads)) {
        expect(await probe(repos(member)[key] as never), `${label}.${name}`).toBe(true);
        expect(await probe(repos(outsider)[key] as never), `${label}.${name}`).toBe(false);
      }
  });

  it("filters inside a transaction too", async () => {
    const found = await kyselySubmissionRepository(t.db, t.dialect, outsider).transaction((repo) =>
      repo.find(ids.submission),
    );
    expect(found).toBeNull();
  });
});
