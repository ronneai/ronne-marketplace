import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { expect, it } from "vitest";

// In a child process (the SDK registers itself globally): telemetry on, an in-process OTLP/HTTP
// receiver in JSON, then a request through apiRoute that queries the database, writes and reads
// storage and logs a line. What arrived is checked here.
it("traces a request: its query and storage spans under it, the log line carrying its IDs", () => {
  const here = import.meta.dirname;
  const from = (path: string) => JSON.stringify(join(here, path));
  const script = `
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const bodies = [];
const server = createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { if (req.url === "/v1/traces") bodies.push(JSON.parse(b)); res.writeHead(200, { "content-type": "application/json" }).end("{}"); }); });
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:" + server.address().port;
const lines = [];
const { setLoggerForTests, logger } = await import(${from("../log/index.ts")});
setLoggerForTests({ level: "info", format: "json", write: (line) => lines.push(JSON.parse(line)) });
const { startTelemetryIfSet } = await import(${from("index.ts")});
await startTelemetryIfSet();
const { trace } = await import("@opentelemetry/api");
const { createDb } = await import(${from("../db/create-db.ts")});
const { sql } = await import("kysely");
const { apiRoute } = await import(${from("../http/api-route.ts")});
const { localStorage } = await import(${from("../storage/local-storage.ts")});
const { hooks } = await import(${from("hooks.ts")});
const { db } = createDb("file::memory:");
const storage = hooks().tracedStorage(localStorage(mkdtempSync(join(tmpdir(), "ronne-spans-"))));
const route = apiRoute("/api/v1/items/[scope]/[name]", async () => {
  await sql\`select \${"secret-param@example.com"} as v\`.execute(db);
  await storage.put("team/secret-skill/1.0.0.tgz", new Uint8Array([1, 2, 3]));
  await storage.get("team/secret-skill/1.0.0.tgz");
  logger.info("Inside the request");
  return Response.json({ ok: true });
});
await trace.getTracer("test").startActiveSpan("GET /api/v1/items/[scope]/[name]", async (span) => {
  await route(new Request("http://localhost/api/v1/items/team/secret-skill"), {});
  span.end();
});
for (let i = 0; i < 100 && bodies.length === 0; i++) await new Promise((ok) => setTimeout(ok, 100));
await new Promise((ok) => setTimeout(ok, 500));
const spans = bodies.flatMap((b) => b.resourceSpans.flatMap((r) => r.scopeSpans.flatMap((s) => s.spans)));
console.log("SPANS " + JSON.stringify(spans));
console.log("LINES " + JSON.stringify(lines));
process.exit(0);`;
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("OTEL_") && !/^VITEST/.test(key)),
  );
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      encoding: "utf8",
      cwd: join(here, "../../.."),
      env: {
        ...env,
        NODE_ENV: "production",
        NEXT_RUNTIME: "nodejs",
        RONNE_ENV_FILE: "/nonexistent/.env",
        OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
        OTEL_BSP_SCHEDULE_DELAY: "100",
      },
      timeout: 60_000,
    },
  );
  const read = (tag: string) =>
    JSON.parse(
      result.stdout
        .split("\n")
        .find((line) => line.startsWith(`${tag} `))
        ?.slice(tag.length + 1) ?? "[]",
    );
  const spans: {
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    attributes: { key: string; value: Record<string, unknown> }[];
  }[] = read("SPANS");
  const lines: Record<string, unknown>[] = read("LINES");
  expect(spans.length, result.stderr).toBeGreaterThan(0);
  const attr = (span: (typeof spans)[number], key: string) =>
    Object.values(span.attributes.find((a) => a.key === key)?.value ?? {})[0];
  const root = spans.find((span) => span.name === "GET /api/v1/items/[scope]/[name]");
  const query = spans.find((span) => span.name === "db select");
  const put = spans.find((span) => span.name === "storage.put");
  const get = spans.find((span) => span.name === "storage.get");
  expect(root && query && put && get, JSON.stringify(spans.map((s) => s.name))).toBeTruthy();
  if (!root || !query || !put || !get) return;
  // One trace, each span under the request's.
  for (const span of [query, put, get]) {
    expect(span.traceId).toBe(root.traceId);
    expect(span.parentSpanId).toBe(root.spanId);
  }
  // The request's ID on its span; the query's text with its placeholder, never its parameter.
  expect(attr(root, "ronne.request_id")).toMatch(/^[0-9A-Z]{26}$/);
  expect(attr(query, "db.system.name")).toBe("sqlite");
  expect(attr(query, "db.operation.name")).toBe("select");
  expect(attr(query, "db.query.text")).toBe("select ? as v");
  // Storage: the bytes, never the key.
  expect(attr(put, "ronne.storage.bytes")).toBe(3);
  expect(attr(get, "ronne.storage.bytes")).toBe(3);
  expect(JSON.stringify(spans)).not.toMatch(/secret-param|secret-skill/);
  // The log line written inside the request carries the request span's IDs.
  const line = lines.find((l) => l.msg === "Inside the request");
  expect(line).toMatchObject({ traceId: root.traceId, spanId: root.spanId });
});
