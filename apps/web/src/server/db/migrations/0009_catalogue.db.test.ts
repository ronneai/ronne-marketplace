import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot } from "../../domains/identity/actions/root-account";
import { signIn } from "../../domains/identity/actions/session";
import type { AppAuth } from "../../domains/identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  testAppAuth,
} from "../../domains/identity/testing/test-auth";
import { createScope } from "../../domains/items/actions/scopes";
import { createDraft, saveDraftFiles } from "../../domains/submissions/actions/drafts";
import { publishSubmission } from "../../domains/submissions/actions/publish";
import { decide } from "../../domains/submissions/actions/reviews";
import { submitDraft } from "../../domains/submissions/actions/submissions";
import { localStorage } from "../../storage/local-storage";
import { toDbBoolean } from "../dates";
import { createTestDb, type TestDb } from "../testing/test-db";
import { backfillCatalogue } from "./0009_catalogue";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-0009-"));
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

const listingColumns = async () => ({
  item: await t.db
    .selectFrom("items")
    .select(["listed_version_id", "installable", "last_published_at"])
    .executeTakeFirstOrThrow(),
  version: await t.db
    .selectFrom("item_versions")
    .select(["description", "keywords", "risk_flags"])
    .executeTakeFirstOrThrow(),
});

describe("0009_catalogue", () => {
  it("backfills what a release now writes, flags from the released files included", async () => {
    await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
    await createTestUser(app, { email: "author@example.com", password });
    await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
    const signedIn = async (email: string) => {
      const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
      if (!result.ok) throw new Error(result.error);
      return cookieHeaders(result.headers.get("set-cookie"));
    };
    const asAuthor = await signedIn("author@example.com");
    await createScope(
      await signedIn("root@example.com"),
      { name: "team", description: "A team." },
      app,
    );

    const draft = await createDraft(
      asAuthor,
      { scope: "team", name: "github", type: "mcp-server" },
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
            content:
              'name: "@team/github"\ntype: mcp-server\ndescription: GitHub tools.\nkeywords: [git, api]\nmcp-server:\n  transport: stdio\n  command: npx\n',
            executable: false,
            loadedAt: manifest?.updatedAt ?? null,
          },
          {
            path: "README.md",
            encoding: "utf8",
            content: "See https://api.github.com for the API.\n",
            executable: false,
            loadedAt: null,
          },
        ],
        deletes: [],
      },
      app,
    );
    await submitDraft(asAuthor, draft.id, app);
    await decide(await signedIn("mod@example.com"), draft.id, { decision: "approve" }, app);
    await publishSubmission(
      asAuthor,
      draft.id,
      { choice: { kind: "stable", bump: "patch" } },
      app,
      localStorage(storageRoot),
    );

    const released = await listingColumns();
    expect(released.version).toMatchObject({ description: "GitHub tools.", keywords: "git api" });
    const kinds = JSON.parse(released.version.risk_flags ?? "[]").map(
      (f: { kind: string }) => f.kind,
    );
    expect(kinds).toEqual(["mcp_server", "network"]);
    expect(released.item.listed_version_id).not.toBeNull();
    expect(Boolean(released.item.installable)).toBe(true);

    // As an instance released before 0009 would have them.
    await t.db
      .updateTable("items")
      .set({
        listed_version_id: null,
        installable: toDbBoolean(false, t.dialect),
        last_published_at: null,
      })
      .execute();
    await t.db
      .updateTable("item_versions")
      .set({ description: "", keywords: "", risk_flags: null })
      .execute();
    await backfillCatalogue(t.db, t.dialect);
    expect(await listingColumns()).toEqual(released);
  });
});
