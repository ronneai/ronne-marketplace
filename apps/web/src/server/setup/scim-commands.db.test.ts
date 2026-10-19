import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/create-db";
import { toDbDate } from "../db/dates";
import { migrateToLatest } from "../db/migrate";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { createRoot } from "../domains/identity/actions/root-account";
import { kyselyScimTokenRepository } from "../domains/identity/repositories/kysely-scim-token-repository";
import {
  checkScimToken,
  createScimToken,
  enableScim,
  rotateScimToken,
} from "../domains/identity/services/scim-tokens";
import { runDisableSso } from "./disable-sso";
import { runRevokeAccess } from "./revoke-access";
import { scriptedPrompts } from "./testing/scripted-prompts";

// The terminal commands and SCIM (108): what `revoke-access` and `disable-sso` ask and say about
// it. Each opens its own connection from a URL, so SQLite uses a file here.
const onServer = Boolean(process.env.TEST_DATABASE_URL);
let appDir: string;
let t: Pick<TestDb, "db" | "dialect" | "url" | "cleanup">;

beforeEach(async () => {
  appDir = mkdtempSync(join(tmpdir(), "ronne-scim-commands-"));
  if (onServer) t = await createTestDb();
  else {
    const url = `file:${join(appDir, "scim.db")}`;
    const { db, dialect } = createDb(url);
    await migrateToLatest(db, dialect);
    t = { db, dialect, url, cleanup: () => db.destroy() };
  }
});
afterEach(async () => {
  await t.cleanup();
  rmSync(appDir, { recursive: true, force: true });
});

/** A provider with SCIM on and its token rotated: two SCIM tokens that work. */
const scimOn = async () => {
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  const root = {
    id,
    email: "root@example.com",
    name: "Root",
    role: "root" as const,
    workspaces: {},
  };
  const at = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("identity_providers")
    .values({
      id: "acme",
      type: "oidc",
      preset: "entra",
      name: "Acme",
      config: "{}",
      secret_enc: null,
      domains: "[]",
      groups_claim: null,
      tested_at: null,
      tested_by: null,
      last_signed_in_at: null,
      last_failure_at: null,
      last_failure_reason: null,
      created_by: null,
      created_at: at,
      updated_at: at,
    })
    .execute();
  const deps = { repo: kyselyScimTokenRepository(t.db, t.dialect) };
  await enableScim(deps, { user: root, ip: null }, "acme");
  const first = await createScimToken(deps, { user: root, ip: null }, "acme");
  const second = await rotateScimToken(deps, { user: root, ip: null }, "acme");
  return { deps, tokens: [first.token, second.token] };
};

/** Scripted answers, recording each question's words too. */
const prompts = (answers: Record<string, boolean>) => {
  const scripted = scriptedPrompts(answers);
  const questions: string[] = [];
  const confirm = scripted.prompts.confirm;
  scripted.prompts.confirm = async (q) => {
    questions.push(q.message);
    return confirm(q);
  };
  return { ...scripted, questions };
};

describe("revoke-access (108)", () => {
  it("asks about the SCIM tokens too, revokes them with everyone's tokens, and says what that means", async () => {
    const { deps, tokens } = await scimOn();
    const run = prompts({ "revoke.confirm": true });
    const result = await runRevokeAccess({
      appDir,
      envPath: join(appDir, ".env"),
      prompts: run.prompts,
      yes: false,
      target: { kind: "everyone" },
      kinds: { sessions: true, tokens: true },
      databaseUrl: t.url,
    });
    expect(result).toEqual({ sessions: 0, tokens: 0, scimTokens: 2 });
    expect(run.questions).toEqual([
      "End 0 sessions and revoke 0 access tokens and 2 SCIM tokens for every account, root's included?",
    ]);
    const said = run.logs.map((l) => l.message).join("\n");
    expect(said).toContain("revoked 0 access tokens and 2 SCIM tokens");
    expect(said).toContain("SCIM provisioning stops until root generates a new token");
    for (const token of tokens)
      expect(await checkScimToken(deps, token)).toMatchObject({ ok: false, reason: "revoked" });
  });

  it("has nothing to do when SCIM tokens are all that's left and only sessions are asked for", async () => {
    await scimOn();
    const run = prompts({});
    const result = await runRevokeAccess({
      appDir,
      envPath: join(appDir, ".env"),
      prompts: run.prompts,
      yes: false,
      target: { kind: "everyone" },
      kinds: { sessions: true, tokens: false },
      databaseUrl: t.url,
    });
    expect(result).toEqual({ sessions: 0, tokens: 0, scimTokens: 0 });
    expect(run.questions).toEqual([]);
  });
});

describe("disable-sso (108)", () => {
  it("asks to turn SCIM off too, turns it off, and says requests are refused until it's back", async () => {
    const { deps, tokens } = await scimOn();
    const run = prompts({ "disable-sso.confirm": true });
    const result = await runDisableSso({
      appDir,
      envPath: join(appDir, ".env"),
      prompts: run.prompts,
      yes: false,
      databaseUrl: t.url,
    });
    expect(result).toEqual({ providers: [], scim: ["acme"], policyChanged: false });
    expect(run.questions).toEqual(["Turn off SCIM for acme?"]);
    expect(run.logs.map((l) => l.message).join("\n")).toContain(
      "Turned off SCIM for acme: its requests are refused until root turns it on again.",
    );
    // The token stays, refused while SCIM is off.
    for (const token of tokens)
      expect(await checkScimToken(deps, token)).toMatchObject({ ok: false });
    expect(await checkScimToken(deps, tokens[1] ?? "")).toMatchObject({ reason: "scim_off" });
  });
});
