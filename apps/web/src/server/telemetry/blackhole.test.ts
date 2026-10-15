import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { expect, it } from "vitest";

// Task 5 of 101: a collector that accepts and never answers leaves request times as they are
// without telemetry. The same timed requests in two child processes: telemetry off, and on with an
// endpoint that's a black hole.
const here = import.meta.dirname;
const from = (path: string) => JSON.stringify(join(here, path));

const timed = (blackHole: boolean) => {
  const script = `
import { createServer } from "node:net";
const sockets = [];
if (${blackHole}) {
  const hole = createServer((socket) => sockets.push(socket));
  await new Promise((ok) => hole.listen(0, "127.0.0.1", ok));
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:" + hole.address().port;
}
const { setLoggerForTests } = await import(${from("../log/index.ts")});
setLoggerForTests({ level: "error", format: "json", write: () => {} });
const { startTelemetryIfSet, telemetryOn } = await import(${from("index.ts")});
await startTelemetryIfSet();
const { createDb } = await import(${from("../db/create-db.ts")});
const { sql } = await import("kysely");
const { apiRoute } = await import(${from("../http/api-route.ts")});
const { db } = createDb("file::memory:");
const route = apiRoute("/api/x", async () => { await sql\`select 1\`.execute(db); return Response.json({}); });
const times = [];
for (let i = 0; i < 200; i++) {
  const started = performance.now();
  await route(new Request("http://localhost/api/x"), {});
  times.push(performance.now() - started);
  if (i % 20 === 0) await new Promise((ok) => setTimeout(ok, 30));
}
times.sort((a, b) => a - b);
console.log("RESULT " + JSON.stringify({ on: telemetryOn(), median: times[100], max: times[199] }));
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
        OTEL_BSP_SCHEDULE_DELAY: "50",
        OTEL_METRIC_EXPORT_INTERVAL: "100",
        OTEL_EXPORTER_OTLP_TIMEOUT: "60000",
      },
      timeout: 120_000,
    },
  );
  const line = result.stdout.split("\n").find((l) => l.startsWith("RESULT "));
  expect(line, result.stderr).toBeTruthy();
  return JSON.parse(line?.slice(7) ?? "{}") as { on: boolean; median: number; max: number };
};

it("leaves request times unchanged when the collector never answers", () => {
  const off = timed(false);
  const hole = timed(true);
  expect(off.on).toBe(false);
  expect(hole.on).toBe(true);
  // Exports wait in the background; a request never does. A few milliseconds' slack for the spans
  // themselves, and no request held anywhere near the export timeout.
  expect(hole.median).toBeLessThan(off.median + 5);
  expect(hole.max).toBeLessThan(1_000);
}, 150_000);
