import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packItem } from "@ronneai/core/pack";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { ArtifactUnavailableError, VersionNotFoundError } from "../exceptions/errors";
import { SHOWN_TEXT_MAX } from "../models/contents";
import { kyselyItemRepository } from "../repositories/kysely-item-repository";
import { createScope } from "./scopes";
import { versionContents, yank } from "./versions";

let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
let asUser: Headers;
let asModerator: Headers;
let itemId: string;
const password = "correct horse battery";
const ref = { scope: "team", name: "reviewer" };
const text = (value: string) => new TextEncoder().encode(value);

const MANIFEST = [
  'name: "@team/reviewer"',
  "type: agent",
  "description: Reviews diffs.",
  "agent:",
  "  prompt: prompt.md",
  "",
].join("\n");

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-contents-"));
  storage = localStorage(storageRoot);
  const { id: publisher } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  });
  await createTestUser(app, { email: "u@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  const asRoot = await signedIn("root@example.com");
  asUser = await signedIn("u@example.com");
  asModerator = await signedIn("mod@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);

  // @team/reviewer 1.0.0 and 1.1.0 (latest), packed and stored as a release leaves them.
  const items = kyselyItemRepository(t.db, t.dialect);
  const scope = await t.db.selectFrom("scopes").select("id").executeTakeFirstOrThrow();
  itemId = await items.insertItem({
    scopeId: scope.id,
    name: "reviewer",
    type: "agent",
    description: "Reviews diffs.",
    ownerId: publisher,
    createdAt: new Date(),
  });
  for (const version of ["1.0.0", "1.1.0"]) {
    const files = [
      { path: "ronne.yaml", bytes: text(MANIFEST) },
      { path: "prompt.md", bytes: text(`You review diffs (${version}).\n`) },
      { path: "run.sh", bytes: text("#!/bin/sh\necho hi\n"), executable: true },
      { path: "logo.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]) },
      { path: "big.txt", bytes: text("x".repeat(SHOWN_TEXT_MAX + 1)) },
    ];
    const packed = await packItem(files, { version });
    await storage.put(`team/reviewer/${version}.tgz`, packed.tgz);
    const versionId = await items.insertVersion({
      itemId,
      version,
      manifest: { name: "@team/reviewer", type: "agent", description: "Reviews diffs.", version },
      readme: null,
      files: files.map((f) => ({ path: f.path, size: f.bytes.length, executable: !!f.executable })),
      notes: null,
      artifactPath: `team/reviewer/${version}.tgz`,
      sha256: packed.sha256,
      size: packed.size,
      publishedBy: publisher,
      publishedAt: new Date(),
      submissionId: null,
      dependencies: [],
      riskFlags: [],
    });
    await items.setTag(itemId, "latest", versionId);
  }
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

const downloads = async () =>
  (await kyselyItemRepository(t.db, t.dialect).findByName("team", "reviewer"))?.downloadCount;

describe("a version's contents (044)", () => {
  it("are the released files, sorted, ronne.yaml as released, and not counted as a download", async () => {
    const files = await versionContents(asUser, ref, "1.1.0", app, storage);
    expect(files.map((f) => f.path)).toEqual([
      "big.txt",
      "logo.png",
      "prompt.md",
      "ronne.yaml",
      "run.sh",
    ]);
    expect(files.find((f) => f.path === "prompt.md")).toEqual({
      path: "prompt.md",
      size: 26,
      executable: false,
      kind: "text",
      text: "You review diffs (1.1.0).\n",
    });
    const manifest = files.find((f) => f.path === "ronne.yaml");
    expect(manifest?.kind === "text" && manifest.text).toContain("version: 1.1.0");
    expect(files.find((f) => f.path === "run.sh")).toMatchObject({
      kind: "text",
      executable: true,
    });
    expect(files.find((f) => f.path === "logo.png")).toEqual({
      path: "logo.png",
      size: 7,
      executable: false,
      kind: "binary",
    });
    expect(files.find((f) => f.path === "big.txt")).toMatchObject({
      kind: "large",
      size: SHOWN_TEXT_MAX + 1,
    });
    expect(await downloads()).toBe(0);
  });

  it("can be read for a yanked version", async () => {
    await yank(asModerator, ref, { version: "1.0.0", reason: "Broken." }, app);
    const files = await versionContents(asUser, ref, "1.0.0", app, storage);
    const prompt = files.find((f) => f.path === "prompt.md");
    expect(prompt?.kind === "text" && prompt.text).toBe("You review diffs (1.0.0).\n");
  });

  it("refuses a missing artifact, a checksum mismatch, an unknown version and signed-out visitors", async () => {
    await expect(
      versionContents(asUser, ref, "1.1.0", app, localStorage(join(storageRoot, "empty"))),
    ).rejects.toThrow(ArtifactUnavailableError);
    // Different bytes under the same key, as a corrupted disk would leave them.
    const other = localStorage(join(storageRoot, "other"));
    await other.put(
      "team/reviewer/1.1.0.tgz",
      (await packItem([{ path: "ronne.yaml", bytes: text(MANIFEST) }], { version: "1.1.0" })).tgz,
    );
    await expect(versionContents(asUser, ref, "1.1.0", app, other)).rejects.toThrow(
      ArtifactUnavailableError,
    );
    await expect(versionContents(asUser, ref, "9.9.9", app, storage)).rejects.toThrow(
      VersionNotFoundError,
    );
    await expect(versionContents(new Headers(), ref, "1.1.0", app, storage)).rejects.toThrow(
      ForbiddenError,
    );
    expect(await downloads()).toBe(0);
  });
});
