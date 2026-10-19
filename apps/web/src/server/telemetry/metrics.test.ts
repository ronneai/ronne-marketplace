import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { expect, it } from "vitest";

// The spec's instruments (101), each with exactly its listed attributes, from the events the
// server logs, a query and the health checks. In a child process: the SDK registers globally.
const SPEC: Record<string, string[]> = {
  "http.server.request.duration": [
    "http.request.method",
    "http.response.status_code",
    "http.route",
  ],
  "ronne.db.query.duration": ["db.operation.name", "db.system.name"],
  "ronne.sign_ins": ["outcome"],
  "ronne.tokens.exchanged": ["outcome"],
  "ronne.releases": [],
  "ronne.feed.builds": ["cached", "tool"],
  "ronne.feed.build.duration": ["tool"],
  "ronne.drafts.uploaded": ["outcome"],
  "ronne.rate_limited": ["limit"],
  "ronne.health": ["check"],
  "ronne.job.duration": ["job", "result"],
};

// Each instrument's kind and unit: durations are histograms in seconds, counts monotonic sums.
const KINDS: Record<string, string> = {
  "http.server.request.duration": "histogram s",
  "ronne.db.query.duration": "histogram s",
  "ronne.feed.build.duration": "histogram s",
  "ronne.job.duration": "histogram s",
  "ronne.health": "gauge ",
};
const kind = (name: string) => KINDS[name] ?? "sum ";

it("records every instrument with exactly its listed attributes", () => {
  const here = import.meta.dirname;
  const from = (path: string) => JSON.stringify(join(here, path));
  const script = `
import { createServer } from "node:http";
const bodies = [];
const server = createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { if (req.url === "/v1/metrics") bodies.push(JSON.parse(b)); res.writeHead(200, { "content-type": "application/json" }).end("{}"); }); });
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:" + server.address().port;
const { setLoggerForTests, logger } = await import(${from("../log/index.ts")});
setLoggerForTests({ level: "error", format: "json", write: () => {} });
const { startTelemetryIfSet } = await import(${from("index.ts")});
await startTelemetryIfSet();
const { createDb } = await import(${from("../db/create-db.ts")});
const { sql } = await import("kysely");
const { hooks } = await import(${from("hooks.ts")});
const log = logger.child({ domain: "test" });
log.event("http.request", { method: "GET", route: "/api/v1/items/[scope]/[name]", status: 200, ms: 12 });
log.event("auth.signed_in", { userId: "01J9USER" });
log.event("auth.sign_in_failed", { reason: "invalid" });
log.event("auth.sign_in_failed", { reason: "invalid", via: "cli" });
log.event("token.exchanged", { userId: "01J9USER" });
log.event("auth.rate_limited", { limit: "sign_in" });
log.event("auth.rate_limited", { limit: "token_exchange" });
log.event("upload.rate_limited", { limit: "uploads" });
log.event("usage.rate_limited", { limit: "usage_reports" });
log.event("version.released", { count: 3, userId: "01J9USER" });
log.event("feed.built", { tool: "claude-code", plugins: 4, ms: 250, bytes: 1000 });
log.event("feed.built", { tool: "claude-code", bytes: 1000, cached: true }, "debug");
log.event("job.finished", { job: "retention_purge", ms: 1500, ipsCleared: 3, emailsCleared: 0, sessionsDeleted: 1, grantsDeleted: 0 });
log.event("job.failed", { job: "retention_purge", ms: 20, err: new Error("x") });
log.event("draft.uploaded", { files: 2, bytes: 83 });
log.event("draft.upload_refused", { reason: "invalid_body" });
const { db } = createDb("file::memory:");
await sql\`select 1\`.execute(db);
hooks().health("database", true);
hooks().health("storage", false);
for (let i = 0; i < 50 && bodies.length === 0; i++) await new Promise((ok) => setTimeout(ok, 100));
const points = bodies.flatMap((b) => b.resourceMetrics.flatMap((r) => r.scopeMetrics.flatMap((s) => s.metrics.flatMap((m) => {
  const data = m.sum ?? m.histogram ?? m.gauge;
  const kind = (m.sum ? (m.sum.isMonotonic ? "sum" : "updown") : m.histogram ? "histogram" : "gauge") + " " + (m.unit ?? "");
  return (data?.dataPoints ?? []).map((p) => ({ name: m.name, kind, keys: p.attributes.map((a) => a.key).sort(), attributes: Object.fromEntries(p.attributes.map((a) => [a.key, Object.values(a.value)[0]])), value: p.asInt ?? p.asDouble ?? p.count }));
}))));
console.log("POINTS " + JSON.stringify(points));
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
        OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: "http/json",
        OTEL_METRIC_EXPORT_INTERVAL: "300",
      },
      timeout: 60_000,
    },
  );
  const line = result.stdout.split("\n").find((l) => l.startsWith("POINTS "));
  const points: {
    name: string;
    kind: string;
    keys: string[];
    attributes: Record<string, unknown>;
    value: number;
  }[] = JSON.parse(line?.slice(7) ?? "[]");
  expect(points.length, result.stderr).toBeGreaterThan(0);
  for (const [name, keys] of Object.entries(SPEC)) {
    const found = points.filter((point) => point.name === name);
    expect(found.length, `${name} recorded`).toBeGreaterThan(0);
    for (const point of found) {
      expect(point.keys, name).toEqual(keys);
      expect(point.kind, name).toBe(kind(name));
    }
  }
  // No other instrument, and the values each event should give.
  expect([...new Set(points.map((point) => point.name))].sort()).toEqual(Object.keys(SPEC).sort());
  const value = (name: string, attributes: Record<string, unknown> = {}) =>
    points.find(
      (point) =>
        point.name === name &&
        Object.entries(attributes).every(([key, wanted]) => point.attributes[key] === wanted),
    )?.value;
  expect(value("ronne.sign_ins", { outcome: "success" })).toBe(1);
  expect(value("ronne.sign_ins", { outcome: "failure" })).toBe(1);
  expect(value("ronne.sign_ins", { outcome: "rate_limited" })).toBe(1);
  expect(value("ronne.tokens.exchanged", { outcome: "failure" })).toBe(1);
  expect(value("ronne.tokens.exchanged", { outcome: "rate_limited" })).toBe(1);
  expect(value("ronne.releases")).toBe(3);
  expect(value("ronne.rate_limited", { limit: "upload" })).toBe(1);
  expect(value("ronne.rate_limited", { limit: "usage" })).toBe(1);
  expect(value("ronne.feed.builds", { cached: true })).toBe(1);
  expect(value("ronne.feed.builds", { cached: false })).toBe(1);
  // A cache hit is counted, never timed: one build, one duration.
  expect(value("ronne.feed.build.duration")).toBe(1);
  expect(value("ronne.drafts.uploaded", { outcome: "refused" })).toBe(1);
  expect(value("ronne.job.duration", { result: "ok" })).toBe(1);
  expect(value("ronne.job.duration", { result: "failed" })).toBe(1);
  expect(value("ronne.health", { check: "storage" })).toBe(0);
  expect(value("ronne.health", { check: "database" })).toBe(1);
  expect(JSON.stringify(points)).not.toContain("01J9USER");
});
