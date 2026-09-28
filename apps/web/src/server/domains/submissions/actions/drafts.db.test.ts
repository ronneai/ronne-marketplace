import { randomBytes } from "node:crypto";
import { ITEM_TYPES } from "@ronneai/core";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import {
  DraftLimitError,
  DraftScopeNotFoundError,
  FileTooLargeError,
  InvalidFileContentError,
  InvalidFilePathError,
  InvalidItemNameError,
  InvalidItemTypeError,
  ManifestRequiredError,
  StaleFilesError,
  SubmissionNotFoundError,
  ZipImportError,
} from "../exceptions/errors";
import { fileBytes, validateDraft } from "../models/submission";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as service from "../services/drafts";
import {
  createDraft,
  deleteDraft,
  getDraft,
  importZip,
  listMySubmissions,
  renameDraft,
  saveDraftFiles,
} from "./drafts";

let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asUser: Headers;
let asOther: Headers;
const password = "correct horse battery";

const headersFor = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "u@example.com", password });
  await createTestUser(app, { email: "other@example.com", password, role: "moderator" });
  asRoot = await headersFor("root@example.com");
  asUser = await headersFor("u@example.com");
  asOther = await headersFor("other@example.com");
  await createScope(asRoot, { name: "platform", description: "Shared tools." }, app);
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(() => t.cleanup());

const newAgent = () =>
  createDraft(asUser, { scope: "platform", name: "reviewer", type: "agent" }, app);

const manifestOf = (draft: { files: { path: string; content: string; updatedAt: Date }[] }) =>
  draft.files.find((file) => file.path === "ronne.yaml");

const text = (path: string, content: string, loadedAt: Date | null = null) => ({
  path,
  encoding: "utf8" as const,
  content,
  executable: false,
  loadedAt,
});

describe("createDraft", () => {
  it("creates a draft from the type's template, for anyone signed in", async () => {
    const draft = await createDraft(
      asUser,
      { scope: " @Platform ", name: " Reviewer ", type: "agent" },
      app,
    );
    expect(draft).toMatchObject({ scope: { name: "platform" }, name: "reviewer", type: "agent" });
    expect(draft.status).toBe("draft");
    const loaded = await getDraft(asUser, draft.id, app);
    const manifest = loaded.files.find((file) => file.path === "ronne.yaml");
    expect(manifest?.content).toContain('name: "@platform/reviewer"');
    expect(manifest?.content).toContain("type: agent");
  });

  it("creates a draft of each type, with its template's files and flags", async () => {
    for (const type of ITEM_TYPES) {
      const draft = await createDraft(asUser, { scope: "team", name: type, type }, app);
      const stored = await getDraft(asUser, draft.id, app);
      expect(stored.files, type).toEqual(draft.files);
      const issues = validateDraft(stored, stored.files);
      expect(
        issues.some((issue) => issue.path === "/description"),
        type,
      ).toBe(true);
    }
    const hook = (await listMySubmissions(asUser, app)).find((s) => s.type === "hook");
    const script = (await getDraft(asUser, hook?.id ?? "", app)).files.find(
      (f) => f.path === "hook.sh",
    );
    expect(script?.executable).toBe(true);
  });

  it("refuses a bad name, an unknown type or scope, and anyone signed out", async () => {
    await expect(
      createDraft(asUser, { scope: "platform", name: "no spaces", type: "agent" }, app),
    ).rejects.toThrow(InvalidItemNameError);
    await expect(
      createDraft(asUser, { scope: "platform", name: "ok", type: "agnet" }, app),
    ).rejects.toThrow(InvalidItemTypeError);
    await expect(
      createDraft(asUser, { scope: "nowhere", name: "ok", type: "agent" }, app),
    ).rejects.toThrow(DraftScopeNotFoundError);
    await expect(
      createDraft(new Headers(), { scope: "platform", name: "ok", type: "agent" }, app),
    ).rejects.toThrow(ForbiddenError);
    expect(await listMySubmissions(asUser, app)).toEqual([]);
  });

  it("allows two drafts with the same name: drafts don't reserve names", async () => {
    await newAgent();
    await newAgent();
    expect(await listMySubmissions(asUser, app)).toHaveLength(2);
  });
});

describe("listMySubmissions", () => {
  it("lists only your own, newest change first", async () => {
    const first = await newAgent();
    const second = await createDraft(asUser, { scope: "team", name: "style", type: "rule" }, app);
    await createDraft(asOther, { scope: "team", name: "theirs", type: "rule" }, app);
    await saveDraftFiles(asUser, first.id, { writes: [text("notes.md", "Hi")], deletes: [] }, app);
    expect((await listMySubmissions(asUser, app)).map((s) => s.id)).toEqual([first.id, second.id]);
  });
});

describe("privacy", () => {
  it("answers not found to anyone but the author, root included, for every operation", async () => {
    const draft = await newAgent();
    for (const headers of [asOther, asRoot]) {
      await expect(getDraft(headers, draft.id, app)).rejects.toThrow(SubmissionNotFoundError);
      await expect(
        saveDraftFiles(headers, draft.id, { writes: [text("x.md", "x")], deletes: [] }, app),
      ).rejects.toThrow(SubmissionNotFoundError);
      await expect(
        renameDraft(headers, draft.id, { scope: "team", name: "mine" }, app),
      ).rejects.toThrow(SubmissionNotFoundError);
      await expect(deleteDraft(headers, draft.id, app)).rejects.toThrow(SubmissionNotFoundError);
      expect(await listMySubmissions(headers, app)).toEqual([]);
    }
    await expect(getDraft(asUser, "not-an-id", app)).rejects.toThrow(SubmissionNotFoundError);
    expect((await getDraft(asUser, draft.id, app)).files.map((f) => f.path)).toEqual([
      "prompt.md",
      "ronne.yaml",
    ]);
  });
});

describe("saveDraftFiles", () => {
  it("writes and deletes files, keeps binary files byte for byte, and returns 011's issues", async () => {
    const draft = await newAgent();
    const image = randomBytes(2048);
    const saved = await saveDraftFiles(
      asUser,
      draft.id,
      {
        writes: [
          text("notes.md", "Review notes."),
          { ...text("bin/run.sh", "#!/bin/sh\necho hi\n"), executable: true },
          {
            path: "logo.png",
            encoding: "base64",
            content: image.toString("base64"),
            executable: false,
            loadedAt: null,
          },
        ],
        deletes: [],
      },
      app,
    );
    expect(saved.draft.files.map((f) => f.path)).toEqual([
      "bin/run.sh",
      "logo.png",
      "notes.md",
      "prompt.md",
      "ronne.yaml",
    ]);
    const loaded = await getDraft(asUser, draft.id, app);
    const logo = loaded.files.find((f) => f.path === "logo.png");
    expect(logo?.size).toBe(2048);
    expect(Buffer.from(fileBytes(logo ?? { encoding: "utf8", content: "" })).equals(image)).toBe(
      true,
    );
    expect(loaded.files.find((f) => f.path === "bin/run.sh")?.executable).toBe(true);
    // The template's empty description is flagged.
    expect(saved.issues).toMatchObject([{ code: "schema", path: "/description" }]);

    const notes = loaded.files.find((f) => f.path === "notes.md");
    await saveDraftFiles(
      asUser,
      draft.id,
      { writes: [], deletes: [{ path: "notes.md", loadedAt: notes?.updatedAt ?? null }] },
      app,
    );
    expect((await getDraft(asUser, draft.id, app)).files.map((f) => f.path)).not.toContain(
      "notes.md",
    );
  });

  it("flags a name or type in ronne.yaml that doesn't match the draft", async () => {
    const draft = await newAgent();
    const manifest = manifestOf(draft);
    const { issues } = await saveDraftFiles(
      asUser,
      draft.id,
      {
        writes: [
          text(
            "ronne.yaml",
            'name: "@platform/other"\ntype: rule\ndescription: Hi.\n',
            manifest?.updatedAt,
          ),
        ],
        deletes: [],
      },
      app,
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "name_mismatch", line: 1, file: "ronne.yaml" }),
        expect.objectContaining({ code: "type_mismatch", line: 2, file: "ronne.yaml" }),
      ]),
    );
  });

  it("refuses bad paths, deleting ronne.yaml, bad base64 and big files, changing nothing", async () => {
    const draft = await newAgent();
    const save = (changes: service.DraftChanges) => saveDraftFiles(asUser, draft.id, changes, app);
    await expect(save({ writes: [text("../x.md", "x")], deletes: [] })).rejects.toThrow(
      InvalidFilePathError,
    );
    await expect(
      save({ writes: [text("a.md", "1"), text("a.md", "2")], deletes: [] }),
    ).rejects.toThrow(InvalidFilePathError);
    await expect(
      save({ writes: [], deletes: [{ path: "ronne.yaml", loadedAt: draft.updatedAt }] }),
    ).rejects.toThrow(ManifestRequiredError);
    await expect(
      save({
        writes: [{ ...text("x.bin", "not base64!"), encoding: "base64" }],
        deletes: [],
      }),
    ).rejects.toThrow(InvalidFileContentError);
    await expect(
      save({
        writes: [text("ok.md", "fine"), text("big.md", "x".repeat(1024 * 1024 + 1))],
        deletes: [],
      }),
    ).rejects.toThrow(FileTooLargeError);
    expect((await getDraft(asUser, draft.id, app)).files.map((f) => f.path)).toEqual([
      "prompt.md",
      "ronne.yaml",
    ]);
  });

  it("holds the file count and total size, but lets a draft over them shrink", async () => {
    const user = await getCurrentUser(asUser, app);
    const deps = (limits: { maxFiles: number; maxTotalBytes: number }) => ({
      repo: kyselySubmissionRepository(t.db, t.dialect),
      limits: {
        maxFiles: limits.maxFiles,
        maxFileBytes: 1024,
        maxTotalBytes: limits.maxTotalBytes,
        maxPackedBytes: 1024,
      },
    });
    const draft = await newAgent();
    const roomy = deps({ maxFiles: 10, maxTotalBytes: 10_000 });
    await service.saveDraftFiles(roomy, { user }, draft.id, {
      writes: [text("a.md", "a".repeat(500)), text("b.md", "b".repeat(500))],
      deletes: [],
    });

    const tight = deps({ maxFiles: 3, maxTotalBytes: 1000 });
    await expect(
      service.saveDraftFiles(tight, { user }, draft.id, {
        writes: [text("c.md", "c")],
        deletes: [],
      }),
    ).rejects.toThrow(DraftLimitError);
    const files = (await getDraft(asUser, draft.id, app)).files;
    const b = files.find((f) => f.path === "b.md");
    const saved = await service.saveDraftFiles(tight, { user }, draft.id, {
      writes: [],
      deletes: [{ path: "b.md", loadedAt: b?.updatedAt ?? null }],
    });
    expect(saved.draft.files.map((f) => f.path)).toEqual(["a.md", "prompt.md", "ronne.yaml"]);
  });

  it("warns before overwriting a file that changed since it was loaded, and overwrites when asked", async () => {
    const draft = await newAgent();
    const loadedAt = manifestOf(draft)?.updatedAt ?? null;
    const later = { now: () => new Date(Date.now() + 1000) };
    const user = await getCurrentUser(asUser, app);
    const repo = kyselySubmissionRepository(t.db, t.dialect);
    // Another tab saves ronne.yaml and creates notes.md.
    await service.saveDraftFiles({ repo, ...later }, { user }, draft.id, {
      writes: [text("ronne.yaml", "name: one\n", loadedAt), text("notes.md", "theirs")],
      deletes: [],
    });
    // This tab still has the old ronne.yaml, and thinks notes.md is new.
    const mine = {
      writes: [text("ronne.yaml", "name: two\n", loadedAt), text("notes.md", "mine")],
      deletes: [],
    };
    await expect(saveDraftFiles(asUser, draft.id, mine, app)).rejects.toThrow(StaleFilesError);
    await expect(saveDraftFiles(asUser, draft.id, mine, app)).rejects.toThrow(
      "ronne.yaml, notes.md changed since you opened them.",
    );
    await saveDraftFiles(asUser, draft.id, { ...mine, overwrite: true }, app);
    const files = (await getDraft(asUser, draft.id, app)).files;
    expect(files.find((f) => f.path === "notes.md")?.content).toBe("mine");
  });
});

describe("renameDraft", () => {
  it("moves the draft and updates ronne.yaml's name, keeping its comments", async () => {
    const draft = await newAgent();
    await saveDraftFiles(
      asUser,
      draft.id,
      {
        writes: [
          text(
            "ronne.yaml",
            '# Our reviewer.\nname: "@platform/reviewer" # the item\ntype: agent\n',
            manifestOf(draft)?.updatedAt,
          ),
        ],
        deletes: [],
      },
      app,
    );
    const renamed = await renameDraft(asUser, draft.id, { scope: "@team", name: "Critic" }, app);
    expect(renamed).toMatchObject({ scope: { name: "team" }, name: "critic", type: "agent" });
    const manifest = manifestOf(await getDraft(asUser, draft.id, app))?.content;
    expect(manifest).toBe('# Our reviewer.\nname: "@team/critic" # the item\ntype: agent\n');
  });

  it("refuses an unknown scope or a bad name", async () => {
    const draft = await newAgent();
    await expect(
      renameDraft(asUser, draft.id, { scope: "nowhere", name: "x" }, app),
    ).rejects.toThrow(DraftScopeNotFoundError);
    await expect(renameDraft(asUser, draft.id, { scope: "team", name: "-x" }, app)).rejects.toThrow(
      InvalidItemNameError,
    );
  });
});

describe("deleteDraft", () => {
  it("removes the draft and its files", async () => {
    const draft = await newAgent();
    await deleteDraft(asUser, draft.id, app);
    await expect(getDraft(asUser, draft.id, app)).rejects.toThrow(SubmissionNotFoundError);
    const left = await t.db
      .selectFrom("submission_files")
      .select("path")
      .where("submission_id", "=", draft.id)
      .execute();
    expect(left).toEqual([]);
  });
});

describe("importZip", () => {
  const archive = zipSync({
    "reviewer/ronne.yaml": strToU8(
      'name: "@platform/reviewer"\ntype: agent\ndescription: Hi.\nagent:\n  prompt: prompt.md\n',
    ),
    "reviewer/prompt.md": strToU8("From the zip."),
    "reviewer/logo.png": new Uint8Array([137, 80, 78, 71, 0, 255]),
    "reviewer/run.sh": [strToU8("#!/bin/sh\n"), { os: 3, attrs: 0o100755 << 16 }],
  });
  const contents = async (id: string) =>
    Object.fromEntries(
      (await getDraft(asUser, id, app)).files.map((f) => [
        f.path,
        [f.encoding, f.content, f.executable],
      ]),
    );

  it("merges: the archive's files win, the draft's others stay", async () => {
    const draft = await newAgent();
    await saveDraftFiles(
      asUser,
      draft.id,
      { writes: [text("notes.md", "mine")], deletes: [] },
      app,
    );
    const { issues } = await importZip(asUser, draft.id, { archive, mode: "merge" }, app);
    expect(issues).toEqual([]);
    expect(await contents(draft.id)).toEqual({
      "logo.png": ["base64", "iVBORwD/", false],
      "notes.md": ["utf8", "mine", false],
      "prompt.md": ["utf8", "From the zip.", false],
      "ronne.yaml": ["utf8", expect.stringContaining("description: Hi."), false],
      "run.sh": ["utf8", "#!/bin/sh\n", true],
    });
  });

  it("replaces: only the archive's files are left", async () => {
    const draft = await newAgent();
    await saveDraftFiles(
      asUser,
      draft.id,
      { writes: [text("notes.md", "mine")], deletes: [] },
      app,
    );
    await importZip(asUser, draft.id, { archive, mode: "replace" }, app);
    expect(Object.keys(await contents(draft.id))).toEqual([
      "logo.png",
      "prompt.md",
      "ronne.yaml",
      "run.sh",
    ]);
  });

  it("refuses a bad archive, or replacing without ronne.yaml, changing nothing", async () => {
    const draft = await newAgent();
    const before = await contents(draft.id);
    await expect(
      importZip(
        asUser,
        draft.id,
        { archive: zipSync({ "../x.md": strToU8("x") }), mode: "merge" },
        app,
      ),
    ).rejects.toThrow(ZipImportError);
    await expect(
      importZip(
        asUser,
        draft.id,
        { archive: zipSync({ "a.md": strToU8("a") }), mode: "replace" },
        app,
      ),
    ).rejects.toThrow("it has no ronne.yaml");
    expect(await contents(draft.id)).toEqual(before);
    await expect(importZip(asOther, draft.id, { archive, mode: "merge" }, app)).rejects.toThrow(
      SubmissionNotFoundError,
    );
  });
});
