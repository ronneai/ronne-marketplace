import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AppConfig } from "../config";
import { createDb } from "../db/create-db";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { authenticateToken, exchangePassword } from "../domains/identity/actions/access-tokens";
import { signIn } from "../domains/identity/actions/session";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { createTestUser, testAppAuth } from "../domains/identity/testing/test-auth";
import { kyselyScopeRepository } from "../domains/items/repositories/kysely-scope-repository";
import { ProposalArtifactError } from "../domains/submissions/exceptions/errors";
import { UNFILTERED } from "../domains/workspaces/models/viewer";
import { GLOBAL_WORKSPACE_ID } from "../domains/workspaces/models/workspace";
import { apiRoute } from "../http/api-route";
import { postDraft } from "../http/drafts-api";
import { health } from "../http/health";
import { requireToken } from "../http/require-token";
import { createUploadLimiter } from "../http/upload-rate-limit";
import { prepareStart } from "../setup/prepare-start";
import { localStorage } from "../storage/local-storage";
import { logger, setLoggerForTests, withRequestContext } from "./index";

// Feature 100, task 4: the server's real flows, with the real logger writing to stdout at debug,
// and nothing secret or personal in what it wrote: no password, token, cookie, AUTH_SECRET,
// database password, email or IP address.
const EMAIL = "carol.secret@example.com";
const EMAIL_ACCENTED = "zoë.ånsen@bücher.de";
const PASSWORD = "correct horse battery staple";
const WRONG = "wrong horse battery staple";
// Ends in `)`, so the email rule can't take it for an address's local part: only the URL-password
// rule hides it.
const DB_PASSWORD = "Db-Pa55(w0rd)";
const IP = "203.0.113.77";
const AUTH_SECRET = "test-secret-test-secret-test-secret-00";

let t: TestDb;
let app: AppAuth;
let out: string[];
let storageRoot: string;

beforeEach(async () => {
  vi.stubEnv("LOG_LEVEL", "debug");
  vi.stubEnv("LOG_FORMAT", "json");
  out = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out.push(String(chunk));
    return true;
  });
  // The shared logger, as the server makes it, reading the stubbed settings.
  setLoggerForTests();
  t = await createTestDb();
  app = testAppAuth(t, { trustProxy: true });
  await createTestUser(app, { email: EMAIL, password: PASSWORD });
  await kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
    name: "team",
    description: "A team.",
    workspaceId: GLOBAL_WORKSPACE_ID,
    createdBy: null,
    createdAt: new Date(),
  });
  storageRoot = mkdtempSync(join(tmpdir(), "ronne-no-secrets-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setLoggerForTests();
  rmSync(storageRoot, { recursive: true, force: true });
  await t.cleanup();
});

const headers = (more: Record<string, string> = {}) =>
  new Headers({ "x-forwarded-for": IP, "user-agent": "rmk/1.0", ...more });

it("writes nothing secret or personal from sign-in, tokens, the API, uploads and a failed database", async () => {
  // Sign-in: wrong, then right; the session cookie is a secret too.
  const request = async (fn: () => Promise<unknown>) =>
    withRequestContext({ requestId: "01K7NOSECRETS" }, fn);
  await request(() => signIn(headers(), { email: EMAIL, password: WRONG, rememberMe: false }, app));
  const signedIn = await request(() =>
    signIn(headers(), { email: EMAIL, password: PASSWORD, rememberMe: true }, app),
  );
  if (!(signedIn as { ok: boolean }).ok) throw new Error("sign-in failed");
  const cookie = (signedIn as { headers: Headers }).headers.get("set-cookie") ?? "";
  const sessionToken = /session_token=([^;.]+)/.exec(cookie)?.[1] ?? "";
  expect(sessionToken.length).toBeGreaterThan(10);

  // The token exchange `rmk login` makes, right and wrong.
  await request(() => exchangePassword({ email: EMAIL, password: WRONG }, headers(), app));
  const exchanged = await request(() =>
    exchangePassword({ email: EMAIL, password: PASSWORD }, headers(), app),
  );
  if (!(exchanged as { ok: boolean }).ok) throw new Error("exchange failed");
  const token = (exchanged as { token: { token: string } }).token.token;

  // An authenticated API call, through apiRoute like every route.
  const guard = {
    ready: async () => true,
    authenticate: (value: string | null) => authenticateToken(value, app),
  };
  const me = apiRoute("/api/v1/me", async (req: Request) => {
    const result = await requireToken(req, guard);
    return result.ok ? Response.json({ id: result.auth.user.id }) : result.response;
  });
  expect(
    (
      await me(
        new Request("https://r.test/api/v1/me", {
          headers: headers({ authorization: `Bearer ${token}`, cookie }),
        }),
        {},
      )
    ).status,
  ).toBe(200);
  // And one with a wrong token.
  await me(
    new Request("https://r.test/api/v1/me", {
      headers: headers({ authorization: `Bearer rmk_${"z".repeat(43)}` }),
    }),
    {},
  );

  // A draft upload, through apiRoute.
  const drafts = apiRoute("/api/v1/drafts", (req: Request) =>
    postDraft(req, {
      app,
      guard,
      limiter: createUploadLimiter(),
      storage: localStorage(storageRoot),
      publicUrl: null,
    }),
  );
  const uploaded = await drafts(
    new Request("https://r.test/api/v1/drafts", {
      method: "POST",
      headers: headers({ "content-type": "application/json", authorization: `Bearer ${token}` }),
      body: JSON.stringify({
        name: "@team/secret-skill",
        type: "skill",
        files: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: 'name: "@team/secret-skill"\ntype: skill\ndescription: x\n',
          },
          { path: "SKILL.md", encoding: "utf8", content: "---\nname: secret-skill\n---\nx\n" },
        ],
      }),
    }),
    {},
  );
  expect(uploaded.status).toBe(201);

  // A database that refuses the connection, its password in the URL. The health check answers 503
  // and logs db.unavailable; a start logs the driver's real error.
  const url = `postgres://ronne:${DB_PASSWORD}@127.0.0.1:1/ronne`;
  const config: AppConfig = {
    envFile: "/nowhere/.env",
    databaseUrl: url,
    authSecret: AUTH_SECRET,
    storagePath: storageRoot,
    trustProxy: true,
  };
  const healthRoute = apiRoute("/api/health", () => health(config, (value) => createDb(value)));
  expect((await healthRoute(new Request("https://r.test/api/health"), {})).status).toBe(503);
  await expect(
    prepareStart({
      appDir: storageRoot,
      dataDir: storageRoot,
      env: { DATABASE_URL: url, AUTH_SECRET, RONNE_ENV_FILE: join(storageRoot, "none.env") },
    }),
  ).rejects.toThrow();
  // A database's duplicate-key error quotes the value it refused: an email, here, in two scripts.
  logger.error("Unexpected error", {
    err: new Error(`Duplicate entry '${EMAIL}' for key 'user.user_email_unique'`),
  });
  logger.error("Unexpected error", {
    err: new Error(`Duplicate entry '${EMAIL_ACCENTED}' for key 'user.user_email_unique'`),
  });
  // An email outside a duplicate-key error, as Better Auth's sign-up message writes one, and in a
  // field: only the email rule hides these.
  logger.info("Better Auth", { detail: `Sign-up attempt for existing email: ${EMAIL_ACCENTED}` });
  logger.warn("Unexpected error", { err: new Error(`No account for ${EMAIL}`), note: EMAIL });
  // A domain's error, whose message names an item for the person reading it (a proposal's files
  // that couldn't be read, logged as submission.checks_failed).
  logger.event("submission.checks_failed", {
    err: new ProposalArtifactError("@team/secret-skill", "1.0.0"),
  });
  // A duplicate-key error on an item's name (two releases racing on MySQL).
  logger.error("Unexpected error", {
    err: new Error(
      "Duplicate entry '01K7SCOPE-secret-skill' for key 'items.items_scope_name_unique'",
    ),
  });
  // A file system error under the storage folder, as Node writes one.
  await import("node:fs/promises")
    .then((fs) => fs.readFile(join(storageRoot, "team", "secret-skill", "9.9.9.tgz")))
    .catch((err: unknown) => logger.error("Unexpected error", { err }));
  // A storage key that isn't valid, naming an item.
  await localStorage(storageRoot)
    .put("../team/secret-skill/1.0.0.tgz", new Uint8Array([1]))
    .catch((err: unknown) => logger.error("Unexpected error", { err }));
  // A storage error on an item's key: different bytes for a stored artifact.
  const storage = localStorage(storageRoot);
  await storage.put("team/secret-skill/1.0.0.tgz", new Uint8Array([1]));
  await storage
    .put("team/secret-skill/1.0.0.tgz", new Uint8Array([2]))
    .catch((err: unknown) => logger.error("Unexpected error", { err }));

  // And everything passed straight to the logger: fields, nested, in errors and in strings.
  logger.error("Everything at once", {
    password: PASSWORD,
    token,
    cookie,
    authSecret: AUTH_SECRET,
    authorization: `Bearer ${token}`,
    nested: {
      headers: { Cookie: cookie, Authorization: `Bearer ${token}` },
      list: [{ secret: AUTH_SECRET }],
    },
    url,
    note: `connect to ${url} with ${token}`,
    err: new Error(`failed for ${url} using ${token}`),
  });

  const written = out.join("");
  // Lines were written, and each one is JSON.
  const lines = written.split("\n").filter(Boolean);
  expect(lines.length).toBeGreaterThan(10);
  for (const line of lines) expect(() => JSON.parse(line), line).not.toThrow();
  for (const event of [
    "auth.signed_in",
    "auth.sign_in_failed",
    "token.exchanged",
    "token.rejected",
    "http.request",
    "draft.uploaded",
    "db.unavailable",
  ])
    expect(written, event).toContain(`"event":"${event}"`);

  for (const [what, value] of [
    ["the password", PASSWORD],
    ["the wrong password", WRONG],
    ["the access token", token],
    ["the session cookie", sessionToken],
    ["AUTH_SECRET", AUTH_SECRET],
    ["the database password", DB_PASSWORD],
    ["the email", EMAIL],
    ["the email's local part", "carol.secret"],
    ["the accented email's local part", "ånsen"],
    ["the IP address", IP],
  ] as const)
    expect(written.includes(value), `${what} is in the output`).toBe(false);
  // The driver's error was logged (with the database's own address, not a client's).
  expect(written).toMatch(/"msg":"Migrations failed[^\n]*ECONNREFUSED/);
  // No email of any kind, whatever its value.
  expect(written).not.toMatch(
    /[^\s@"'<>]+@\p{L}[\p{L}\p{N}\p{M}-]*(?:\.[\p{L}\p{N}\p{M}-]+)*\.\p{L}{2,}/u,
  );
  // No token of any kind, whatever its value.
  expect(written).not.toMatch(/rmk_[A-Za-z0-9_-]{20,}/);
  // The item's name stays out too (093).
  expect(written).not.toContain("secret-skill");
});
