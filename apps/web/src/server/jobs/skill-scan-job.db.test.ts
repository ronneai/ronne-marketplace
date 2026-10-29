import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../db/dates";
import { newId } from "../db/ids";
import { GLOBAL_WORKSPACE_ID } from "../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import type { Resolver } from "../domains/scans/models/endpoint";
import { sealScanKey } from "../domains/settings/models/scan-key";
import { runSkillScansOn, SKILL_SCAN_JOB } from "./skill-scan-job";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let revisionId: string;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.cleanup());

const now = () => toDbDate(new Date(), t.dialect);

beforeEach(async () => {
  const userId = newId();
  await t.db
    .insertInto("user")
    .values({
      id: userId,
      name: "Author",
      email: `${userId}@example.com`,
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      disabled_at: null,
    })
    .execute();
  const scopeId = newId();
  await t.db
    .insertInto("scopes")
    .values({
      id: scopeId,
      name: `s${scopeId.slice(-6).toLowerCase()}`,
      description: "A scope.",
      created_by: null,
      created_at: now(),
      workspace_id: GLOBAL_WORKSPACE_ID,
    })
    .execute();
  const submissionId = newId();
  await t.db
    .insertInto("submissions")
    .values({
      id: submissionId,
      author_id: userId,
      scope_id: scopeId,
      name: "tidy",
      type: "skill",
      item_id: null,
      base_version_id: null,
      status: "submitted",
      created_at: now(),
      updated_at: now(),
      submitted_at: now(),
    })
    .execute();
  revisionId = newId();
  await t.db
    .insertInto("submission_revisions")
    .values({
      id: revisionId,
      submission_id: submissionId,
      number: 1,
      created_by: userId,
      created_at: now(),
    })
    .execute();
});

const scan = async (status: "queued" | "running", startedAgoMs: number | null = null) => {
  await t.db
    .insertInto("content_scans")
    .values({
      id: newId(),
      revision_id: revisionId,
      scanner: "skillspector",
      status,
      attempts: status === "running" ? 1 : 0,
      queued_at: now(),
      started_at:
        startedAgoMs === null ? null : toDbDate(new Date(Date.now() - startedAgoMs), t.dialect),
    })
    .execute();
};

const jobRuns = async () =>
  (await t.db.selectFrom("jobs").select("name").where("name", "=", SKILL_SCAN_JOB).execute())
    .length;

// No command: whatever runs fails `not configured`, which is enough to see that it ran.
const config = { env: {} };

describe("runSkillScansOn (135)", () => {
  it("takes no lease when nothing waits", async () => {
    await t.db.deleteFrom("content_scans").execute();
    expect(await runSkillScansOn({ db: t.db, dialect: t.dialect }, config)).toBeNull();
    expect(await jobRuns()).toBe(0);
  });

  it("runs the job when a scan waits", async () => {
    await t.db.deleteFrom("content_scans").execute();
    await scan("queued");
    expect(await runSkillScansOn({ db: t.db, dialect: t.dialect }, config)).toMatchObject({
      status: "done",
      counts: { failed: 1 },
    });
  });

  it("runs the job for a scan stuck since Ronne died, with nothing else waiting", async () => {
    await t.db.deleteFrom("content_scans").execute();
    // Twice the default 300-second timeout, and then some.
    await scan("running", 3 * 3_600_000);
    expect(await runSkillScansOn({ db: t.db, dialect: t.dialect }, config)).toMatchObject({
      status: "done",
    });
    const row = await t.db.selectFrom("content_scans").select("status").executeTakeFirstOrThrow();
    expect(row.status).not.toBe("running");
  });

  it("counts a scan running just past twice the timeout as stuck", async () => {
    await t.db.deleteFrom("content_scans").execute();
    await scan("running", 610_000);
    expect(await runSkillScansOn({ db: t.db, dialect: t.dialect }, config)).not.toBeNull();
  });

  it("leaves a scan running for less than twice the timeout alone", async () => {
    await t.db.deleteFrom("content_scans").execute();
    await scan("running", 590_000);
    expect(await runSkillScansOn({ db: t.db, dialect: t.dialect }, config)).toBeNull();
  });

  it("sweeps a folder a dead process left, even with nothing to scan", async () => {
    await t.db.deleteFrom("content_scans").execute();
    const name = `ronne-scan-${newId().slice(-6)}`;
    const folder = join(tmpdir(), name);
    mkdirSync(folder);
    const long = new Date(Date.now() - 3 * 3_600_000);
    utimesSync(folder, long, long);
    await runSkillScansOn({ db: t.db, dialect: t.dialect }, config);
    expect(readdirSync(tmpdir())).not.toContain(name);
  });
});

describe("the job with root's setup (136)", () => {
  const AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const COMPAT = { provider: "openai_compatible", endpoint: "https://llm.example.com/v1" };
  const fake = fileURLToPath(
    new URL("../domains/scans/services/testing/fake-scanner.mjs", import.meta.url),
  );
  let dir: string;
  let out: string;
  let commands: string;
  const resolveTo =
    (address: string): Resolver =>
    async () => [address];

  const settings = async (values: Record<string, string>) => {
    await t.db.deleteFrom("instance_settings").where("key", "like", "skill_scan%").execute();
    for (const [key, value] of Object.entries(values))
      await t.db
        .insertInto("instance_settings")
        .values({ key, value, updated_by: null, updated_at: now() })
        .execute();
  };
  const scanRow = () =>
    t.db
      .selectFrom("content_scans")
      .select(["status", "error", "llm_provider"])
      .executeTakeFirstOrThrow();
  const seen = () => JSON.parse(readFileSync(out, "utf8")).env as Record<string, string>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "ronne-136-job-"));
    out = join(dir, "env.json");
    commands = JSON.stringify([[process.execPath, fake, "env", out]]);
    await t.db.deleteFrom("content_scans").execute();
    await scan("queued");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("runs root's command and provider, the key opened for the scanner only", async () => {
    await settings({
      skill_scan_analysis: "semantic",
      skill_scan_provider: "anthropic",
      skill_scan_model: "claude-x",
      skill_scan_key_enc: sealScanKey(AUTH_SECRET, "sk-ant-SECRET", {
        provider: "anthropic",
        endpoint: null,
      }),
    });
    await runSkillScansOn(
      { db: t.db, dialect: t.dialect },
      { commands, env: {} },
      { authSecret: AUTH_SECRET },
    );
    expect(await scanRow()).toMatchObject({ status: "done", llm_provider: "anthropic" });
    expect(seen()).toMatchObject({
      SKILLSPECTOR_PROVIDER: "anthropic",
      SKILLSPECTOR_MODEL: "claude-x",
      ANTHROPIC_API_KEY: "sk-ant-SECRET",
    });
    expect(seen()).not.toHaveProperty("AUTH_SECRET");
  });

  it("runs static when the key no longer opens", async () => {
    await settings({
      skill_scan_analysis: "semantic",
      skill_scan_provider: "anthropic",
      skill_scan_key_enc: sealScanKey("another-secret-another-secret-0000", "sk-x", {
        provider: "anthropic",
        endpoint: null,
      }),
    });
    await runSkillScansOn(
      { db: t.db, dialect: t.dialect },
      { commands, env: {} },
      { authSecret: AUTH_SECRET },
    );
    expect(await scanRow()).toMatchObject({ status: "done", llm_provider: null });
    expect(seen()).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(seen()).not.toHaveProperty("SKILLSPECTOR_PROVIDER");
  });

  it("fails semantic scans `endpoint refused` when root's endpoint now resolves inside, without running the scanner", async () => {
    await settings({
      skill_scan_analysis: "semantic",
      skill_scan_provider: "openai_compatible",
      skill_scan_endpoint: "https://llm.example.com/v1",
      skill_scan_key_enc: sealScanKey(AUTH_SECRET, "sk-SECRET", COMPAT),
    });
    await runSkillScansOn(
      { db: t.db, dialect: t.dialect },
      { commands, env: {} },
      { authSecret: AUTH_SECRET, resolve: resolveTo("169.254.169.254") },
    );
    expect(await scanRow()).toMatchObject({ status: "failed", error: "endpoint refused" });
    expect(existsSync(out)).toBe(false);
    const last = await t.db
      .selectFrom("instance_settings")
      .select("value")
      .where("key", "=", "skill_scan_last_error")
      .executeTakeFirst();
    expect(last?.value).toBe("endpoint refused");
  });

  it("runs the scan when the endpoint still checks out", async () => {
    await settings({
      skill_scan_analysis: "semantic",
      skill_scan_provider: "openai_compatible",
      skill_scan_endpoint: "https://llm.example.com/v1",
      skill_scan_key_enc: sealScanKey(AUTH_SECRET, "sk-SECRET", COMPAT),
    });
    await runSkillScansOn(
      { db: t.db, dialect: t.dialect },
      { commands, env: {} },
      { authSecret: AUTH_SECRET, resolve: resolveTo("93.184.215.14") },
    );
    expect(await scanRow()).toMatchObject({ status: "done", llm_provider: "openai_compatible" });
    expect(seen().SKILLSPECTOR_COMPAT_BASE_URL).toBe("https://llm.example.com/v1");
  });

  it("leaves static scans alone: they send the endpoint nothing", async () => {
    await settings({
      skill_scan_analysis: "static",
      skill_scan_provider: "openai_compatible",
      skill_scan_endpoint: "https://llm.example.com/v1",
      skill_scan_key_enc: sealScanKey(AUTH_SECRET, "sk-SECRET", COMPAT),
    });
    await runSkillScansOn(
      { db: t.db, dialect: t.dialect },
      { commands, env: {} },
      { authSecret: AUTH_SECRET, resolve: resolveTo("10.0.0.1") },
    );
    expect(await scanRow()).toMatchObject({ status: "done", llm_provider: null });
  });

  it("uses root's timeout to tell a stuck scan", async () => {
    await t.db.deleteFrom("content_scans").execute();
    await settings({ skill_scan_timeout: "30" });
    // Past twice root's 30 seconds, well inside twice the default 300.
    await scan("running", 90_000);
    expect(
      await runSkillScansOn(
        { db: t.db, dialect: t.dialect },
        { commands, env: {} },
        { authSecret: AUTH_SECRET },
      ),
    ).not.toBeNull();
  });
});

describe("the job with the scanner service (156)", () => {
  const fake = fileURLToPath(
    new URL("../domains/scans/services/testing/fake-scanner.mjs", import.meta.url),
  );
  const REPORT = readFileSync(
    join(process.cwd(), "../../packages/core/src/skill-scan/fixtures/reports/secure-coding.json"),
    "utf8",
  );
  let server: Server;
  let url: string;
  let requests: { path: string; key: string | undefined }[];
  let dir: string;

  beforeEach(async () => {
    requests = [];
    dir = mkdtempSync(join(tmpdir(), "ronne-156-job-"));
    server = createServer((request, response) => {
      requests.push({
        path: request.url ?? "",
        key: request.headers["x-ronne-scan-key"] as string | undefined,
      });
      request.resume();
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ exit: 0, report: REPORT }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await t.db.deleteFrom("content_scans").execute();
    await scan("queued");
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  it("scans through the service, with the scan key, and never runs the command beside it", async () => {
    const out = join(dir, "env.json");
    await runSkillScansOn(
      { db: t.db, dialect: t.dialect },
      {
        url,
        scanKey: "k-156",
        command: JSON.stringify([process.execPath, fake, "env", out]),
        env: {},
      },
    );
    expect(requests).toEqual([{ path: "/scan", key: "k-156" }]);
    expect(existsSync(out)).toBe(false);
    expect(
      await t.db.selectFrom("content_scans").select(["status", "error"]).executeTakeFirstOrThrow(),
    ).toEqual({ status: "done", error: null });
  });

  it("fails the scan as unreachable when the service doesn't answer", async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await runSkillScansOn({ db: t.db, dialect: t.dialect }, { url, env: {} });
    expect(
      await t.db.selectFrom("content_scans").select(["status", "error"]).executeTakeFirstOrThrow(),
    ).toEqual({ status: "failed", error: "unreachable" });
    // The afterEach closes it again.
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });
});
