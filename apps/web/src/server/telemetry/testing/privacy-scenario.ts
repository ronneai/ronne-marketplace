// Task 5 of 101: the server's flows with telemetry on, everything an OTLP receiver gets printed
// with every value that must never be in it. Run in a child process by privacy.db.test.ts: the SDK
// registers itself globally, once.

import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTraceState, ROOT_CONTEXT, trace } from "@opentelemetry/api";
import { createTestDb } from "../../db/testing/test-db";
import { marketplaceAs } from "../../domains/feeds/actions/feeds";
import { authenticateToken, exchangePassword } from "../../domains/identity/actions/access-tokens";
import { deviceDeps } from "../../domains/identity/actions/device-grants";
import { createRoot } from "../../domains/identity/actions/root-account";
import { getCurrentUser, signIn } from "../../domains/identity/actions/session";
import { adminCreateUser } from "../../domains/identity/actions/user-admin";
import type { CurrentUser } from "../../domains/identity/models/user";
import { approveDeviceGrant } from "../../domains/identity/services/device-grants";
import { cookieHeaders, testAppAuth } from "../../domains/identity/testing/test-auth";
import { createScope } from "../../domains/items/actions/scopes";
import { createDraft, saveDraftFiles } from "../../domains/submissions/actions/drafts";
import { publishSubmission, releaseMany } from "../../domains/submissions/actions/publish";
import { submitDraft } from "../../domains/submissions/actions/submissions";
import { apiRoute } from "../../http/api-route";
import { postDeviceCode, postDeviceToken } from "../../http/device-api";
import { postDraft } from "../../http/drafts-api";
import { requireToken } from "../../http/require-token";
import { createUploadLimiter } from "../../http/upload-rate-limit";
import { setLoggerForTests } from "../../log";
import { localStorage } from "../../storage/local-storage";
import { hooks } from "../hooks";
import { startTelemetryIfSet } from "../index";

const PASSWORD = "correct horse battery staple";
const WRONG = "wrong horse battery staple";
const IP = "198.51.100.42";
const EMAIL = "privacy-ana@example.com";

export const run = async () => {
  const bodies: string[] = [];
  const receiver = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      bodies.push(`${req.url} ${body}`);
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  await new Promise<void>((ok) => receiver.listen(0, "127.0.0.1", ok));
  const address = receiver.address();
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  setLoggerForTests({ level: "error", format: "json", write: () => {} });
  await startTelemetryIfSet();
  const tracer = trace.getTracer("privacy-test");
  // Each flow as a request: under a span, as Next.js's request span would be.
  // Each request's span carries what Next.js's request spans carry: the filled-in path (naming the
  // workspace, scope and item, with an email in its query), the client's address and user agent.
  // Only the sanitizer keeps them from the collector.
  let workspace = "";
  // And a client's `traceparent` and `tracestate`, which it can fill with anything: an email here.
  const incoming = trace.setSpanContext(ROOT_CONTEXT, {
    traceId: "0af7651916cd43dd8448eb211c80319d",
    spanId: "b7ad6b7169203331",
    traceFlags: 1,
    isRemote: true,
    traceState: createTraceState(`ronne=${EMAIL}`),
  });
  const request = <T>(name: string, work: () => Promise<T>) =>
    tracer.startActiveSpan(name, {}, incoming, async (span) => {
      const path = `/workspaces/${workspace}/items/@privscope/privitem?ref=${EMAIL}`;
      span.setAttributes({
        "http.target": path,
        "url.full": `https://r.example${path}`,
        "url.path": path,
        "http.client_ip": IP,
        "client.address": IP,
        "user_agent.original": "privacy-agent/1.0",
        "http.user_agent": "privacy-agent/1.0",
        // And the same in keys that are sent, with no email to give them away: a path, a query, a
        // fragment, an address with a port; and a key that's a name.
        "next.route": `/workspaces/${workspace}/items/@privscope/privitem`,
        "next.span_name": `GET /catalogue?q=${workspace}`,
        "next.segment": `/reviews#${workspace}`,
        "operation.name": `?a&q=${workspace}`,
        // A URL with a user name, the account's email, and an item's reference.
        "error.type": `http://x@${workspace}@localhost/x`,
        "next.fetch.cache_status": EMAIL,
        "next.fetch.cache_reason": "@privscope/privitem",
        // A URL with a private path, in a value and in an array.
        "better_auth.context": `https://r.example/workspaces/${workspace}/items?x=1`,
        "next.bubble": [
          `https://r.example/workspaces/${workspace}`,
          `/workspaces/${workspace}`,
          // Past the first 100 items, which are all that is sent.
          ...Array.from({ length: 150 }, (_, i) => (i === 120 ? workspace : "x")),
        ],
        "resource.name": `${IP}:4318`,
        [workspace || "privacy-ana"]: 1,
      });
      // And a span named for an address and an email, as a library might name one.
      tracer.startSpan(`peer ${IP}:5432 for ${EMAIL}`).end();
      // And an error whose message names the workspace, as one might.
      span.recordException(new Error(`no such workspace ${workspace} for ${EMAIL}`));
      try {
        return await work();
      } finally {
        span.end();
      }
    });
  const headers = (more: Record<string, string> = {}) =>
    new Headers({ "x-forwarded-for": IP, "user-agent": "privacy-agent/1.0", ...more });

  const t = await createTestDb();
  const app = testAppAuth(t, { trustProxy: true });
  const storage = hooks().tracedStorage(
    localStorage(mkdtempSync(join(tmpdir(), "ronne-privacy-"))),
  );
  await createRoot(t.db, t.dialect, {
    email: "privacy-root@example.com",
    name: "Root Person",
    password: PASSWORD,
  });

  // Sign-in, wrong and right.
  await request("POST /sign-in", () =>
    signIn(
      headers(),
      { email: "privacy-root@example.com", password: WRONG, rememberMe: false },
      app,
    ),
  );
  const rootIn = await request("POST /sign-in", () =>
    signIn(
      headers(),
      { email: "privacy-root@example.com", password: PASSWORD, rememberMe: false },
      app,
    ),
  );
  if (!rootIn.ok) throw new Error("sign-in failed");
  const asRoot = cookieHeaders(rootIn.headers.get("set-cookie"));
  const sessionToken =
    /session_token=([^;.]+)/.exec(rootIn.headers.get("set-cookie") ?? "")?.[1] ?? "";
  await adminCreateUser(
    asRoot,
    { email: EMAIL, name: "Ana Privacy", role: "user", password: PASSWORD },
    app,
  );
  const anaIn = await signIn(
    headers(),
    { email: EMAIL, password: PASSWORD, rememberMe: false },
    app,
  );
  if (!anaIn.ok) throw new Error("sign-in failed");
  const asAna = cookieHeaders(anaIn.headers.get("set-cookie"));
  const ana = (await getCurrentUser(asAna, app)) as CurrentUser;
  const root = (await getCurrentUser(asRoot, app)) as CurrentUser;
  const personal = (
    await t.db
      .selectFrom("workspaces")
      .select("name")
      .where("id", "=", ana.personal ?? "")
      .executeTakeFirstOrThrow()
  ).name;
  workspace = personal;

  // The token exchange `rmk login` makes, wrong and right.
  await request("POST /api/v1/auth/token", () =>
    exchangePassword({ email: EMAIL, password: WRONG }, headers(), app),
  );
  const exchanged = await request("POST /api/v1/auth/token", () =>
    exchangePassword({ email: EMAIL, password: PASSWORD }, headers(), app),
  );
  if (!exchanged.ok) throw new Error("exchange failed");
  const token = exchanged.token.token;

  // A release in Ana's personal workspace: private, its names hers.
  await createScope(
    asAna,
    { name: "privscope", description: "Ana's.", workspaceId: ana.personal ?? "" },
    app,
  );
  /** A skill by Ana in her private scope, submitted (approved at once: her own workspace). */
  const submitted = async (name: string) => {
    const draft = await createDraft(
      asAna,
      { scope: `@${personal}/privscope`, name, type: "skill" },
      app,
    );
    const loadedAt = (path: string) => draft.files.find((f) => f.path === path)?.updatedAt ?? null;
    await saveDraftFiles(
      asAna,
      draft.id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `name: "@${personal}/privscope/${name}"\ntype: skill\ndescription: A private skill.\n`,
            executable: false,
            loadedAt: loadedAt("ronne.yaml"),
          },
          {
            path: "SKILL.md",
            encoding: "utf8",
            content: `---\nname: ${name}\ndescription: A private skill.\n---\nDo it.\n`,
            executable: false,
            loadedAt: loadedAt("SKILL.md"),
          },
        ],
        deletes: [],
      },
      app,
    );
    await request("POST /submissions", () => submitDraft(asAna, draft.id, app, storage));
    return draft.id;
  };
  const single = await submitted("privitem");
  await request("POST /reviews/[id]", () =>
    publishSubmission(asAna, single, { choice: { kind: "stable", bump: "minor" } }, app, storage),
  );
  // A bulk release of two more: one ronne.release for both.
  const bulk = [await submitted("privbulka"), await submitted("privbulkb")];
  await request("POST /reviews", () =>
    releaseMany(
      asAna,
      { ids: bulk, settings: { kind: "stable", bump: "suggested" } },
      app,
      storage,
    ),
  );

  // A feed build, by Ana, whose feed holds her private skills.
  await request("GET /api/v1/feeds/[tool]/marketplace.json", () =>
    marketplaceAs(ana, "claude-code", "https://r.example", null, app, storage),
  );
  // Again: from the cache, when nothing changed.
  await request("GET /api/v1/feeds/[tool]/marketplace.json", () =>
    marketplaceAs(ana, "claude-code", "https://r.example", null, app, storage),
  );

  // A draft upload with her token, through apiRoute.
  const guard = {
    ready: async () => true,
    authenticate: (value: string | null) => authenticateToken(value, app),
  };
  const drafts = apiRoute("/api/v1/drafts", (req: Request) =>
    postDraft(req, { app, guard, limiter: createUploadLimiter(), storage, publicUrl: null }),
  );
  await request("POST /api/v1/drafts", () =>
    drafts(
      new Request("https://r.example/api/v1/drafts", {
        method: "POST",
        headers: headers({ "content-type": "application/json", authorization: `Bearer ${token}` }),
        body: JSON.stringify({
          name: `@${personal}/privscope/privupload`,
          type: "skill",
          files: [
            {
              path: "ronne.yaml",
              encoding: "utf8",
              content: `name: "@${personal}/privscope/privupload"\ntype: skill\ndescription: x\n`,
            },
            { path: "SKILL.md", encoding: "utf8", content: "---\nname: privupload\n---\nx\n" },
          ],
        }),
      }),
      {},
    ),
  );
  // An authenticated API call, the token in its header.
  const me = apiRoute("/api/v1/me", async (req: Request) => {
    const result = await requireToken(req, guard);
    return result.ok ? Response.json({ id: result.auth.user.id }) : result.response;
  });
  await request("GET /api/v1/me", () =>
    me(
      new Request("https://r.example/api/v1/me", {
        headers: headers({ authorization: `Bearer ${token}` }),
      }),
      {},
    ),
  );

  // `rmk login --web` (107): a code, approved by Ana, exchanged for a token.
  const deviceRequest = (path: string, body: unknown) =>
    new Request(`https://r.example${path}`, {
      method: "POST",
      headers: headers({ "content-type": "application/json" }),
      body: JSON.stringify(body),
    });
  const codeRoute = apiRoute("/api/v1/auth/device/code", (req: Request) =>
    postDeviceCode(req, app),
  );
  const started = (await (
    await codeRoute(deviceRequest("/api/v1/auth/device/code", { client_id: "rmk" }), {})
  ).json()) as { device_code: string; user_code: string };
  await approveDeviceGrant(deviceDeps(app), { user: ana, ip: IP }, started.user_code);
  const tokenRoute = apiRoute("/api/v1/auth/device/token", (req: Request) =>
    postDeviceToken(req, app),
  );
  const poll = {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: started.device_code,
    client_id: "rmk",
  };
  const deviceToken = (
    (await (await tokenRoute(deviceRequest("/api/v1/auth/device/token", poll), {})).json()) as {
      token: string;
    }
  ).token;
  if (!deviceToken) throw new Error("device exchange failed");

  // Let the batch and the metric reader send.
  for (let i = 0; i < 40 && !bodies.some((b) => b.startsWith("/v1/metrics")); i++)
    await new Promise((ok) => setTimeout(ok, 100));
  await new Promise((ok) => setTimeout(ok, 800));
  const never = {
    personal,
    scope: "privscope",
    item: "privitem",
    upload: "privupload",
    bulkA: "privbulka",
    bulkB: "privbulkb",
    email: EMAIL,
    rootEmail: "privacy-root@example.com",
    anaId: ana.id,
    rootId: root.id,
    name: "Ana Privacy",
    password: PASSWORD,
    wrong: WRONG,
    ip: IP,
    agent: "privacy-agent",
    token,
    tokenBody: token.slice(4),
    sessionToken,
    deviceCode: started.device_code,
    userCode: started.user_code.replace("-", ""),
    formattedUserCode: started.user_code,
    deviceToken,
    deviceTokenBody: deviceToken.slice(4),
  };
  // To a file: a large write to a pipe can be cut off by the exit below.
  writeFileSync(process.env.PRIVACY_OUT ?? "privacy-out.json", JSON.stringify({ never, bodies }));
  await t.cleanup();
  process.exit(0);
};
