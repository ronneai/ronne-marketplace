import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Each case runs in its own process: the SDK registers itself globally, once.
const here = import.meta.dirname;
const run = (script: string, env: Record<string, string> = {}) => {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("OTEL_") && !/^VITEST/.test(key)),
  );
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      encoding: "utf8",
      cwd: join(here, "../../.."),
      env: {
        ...clean,
        NODE_ENV: "production",
        NEXT_RUNTIME: "nodejs",
        RONNE_ENV_FILE: "/nonexistent/.env",
        ...env,
      },
      timeout: 60_000,
    },
  );
  return { ...result, lines: result.stdout.split("\n").filter((line) => line.startsWith("{")) };
};
const telemetry = JSON.stringify(join(here, "index.ts"));

describe("telemetry at start", () => {
  it("imports nothing from OpenTelemetry without an endpoint", () => {
    const result = run(`
import { registerHooks } from "node:module";
const seen = [];
registerHooks({ resolve: (specifier, context, next) => { seen.push(specifier); return next(specifier, context); } });
const { startTelemetryIfSet, telemetryOn } = await import(${telemetry});
await startTelemetryIfSet();
console.log("ON", telemetryOn());
console.log("LOADED", JSON.stringify(seen.filter((s) => /opentelemetry|vercel\\/otel|telemetry\\/start/.test(s))));`);
    expect(result.stdout, result.stderr).toContain("ON false");
    expect(result.stdout).toContain("LOADED []");
  });

  it("warns once, stays off and starts nothing when the endpoint isn't a URL", () => {
    const result = run(
      `const { startTelemetryIfSet, telemetryOn } = await import(${telemetry});
await startTelemetryIfSet();
console.log("ON", telemetryOn());`,
      { OTEL_EXPORTER_OTLP_ENDPOINT: "collector:4318" },
    );
    expect(result.stdout, result.stderr).toContain("ON false");
    expect(result.lines.map((line) => JSON.parse(line).event)).toEqual([
      "telemetry.endpoint_invalid",
    ]);
    expect(result.stdout).not.toContain("collector:4318");
  });

  it("sends a span and a metric to the collector over OTLP/HTTP", () => {
    const result = run(
      `import { createServer } from "node:http";
const received = { traces: [], metrics: [] };
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (req.url === "/v1/traces") received.traces.push(body);
    if (req.url === "/v1/metrics") received.metrics.push(body);
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:" + server.address().port;
const { startTelemetryIfSet, telemetryOn } = await import(${telemetry});
await startTelemetryIfSet();
const { trace, metrics } = await import("@opentelemetry/api");
trace.getTracer("test").startActiveSpan("a request", (span) => {
  // Next.js sets the raw path on its request spans: it must never reach the collector.
  span.setAttribute("http.target", "/items/@team/secret-skill");
  span.end();
});
metrics.getMeter("test").createCounter("ronne.test").add(1);
for (let i = 0; i < 100 && !(received.traces.length && received.metrics.length); i++)
  await new Promise((ok) => setTimeout(ok, 100));
console.log("ON", telemetryOn());
console.log("TRACES", received.traces.some((b) => b.includes("a request")));
console.log("METRICS", received.metrics.some((b) => b.includes("ronne.test")));
console.log("SERVICE", received.traces.some((b) => b.includes("ronne-marketplace")));
console.log("ONCE", received.traces.join("").split('"a request"').length - 1);
console.log("RAW PATH", received.traces.some((b) => b.includes("secret-skill")));
const sent = received.traces.join("") + received.metrics.join("");
console.log("VERCEL", sent.includes("vercel"));
console.log("ENVIRONMENT", received.traces.some((b) => b.includes("deployment.environment")) && received.metrics.some((b) => b.includes("deployment.environment")));
process.exit(0);`,
      {
        OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
        OTEL_BSP_SCHEDULE_DELAY: "100",
        OTEL_METRIC_EXPORT_INTERVAL: "200",
        OTEL_RESOURCE_ATTRIBUTES: "deployment.environment=staging",
        // As compose.yaml passes the unset ones: empty.
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "",
        OTEL_TRACES_SAMPLER: "",
      },
    );
    expect(result.stdout, result.stderr).toContain("ON true");
    expect(result.stdout).toContain("TRACES true");
    expect(result.stdout).toContain("METRICS true");
    expect(result.stdout).toContain("SERVICE true");
    // Sent once, through our sanitizing exporter only.
    expect(result.stdout).toContain("ONCE 1");
    expect(result.stdout).toContain("RAW PATH false");
    // The resource: no Vercel attributes on a self-hosted server; the operator's own kept.
    expect(result.stdout).toContain("VERCEL false");
    expect(result.stdout).toContain("ENVIRONMENT true");
    expect(result.lines.map((line) => JSON.parse(line).event)).toContain("telemetry.started");
  });

  it("writes one export_failed when the collector isn't there, and goes on", () => {
    const result = run(
      `import { createServer } from "node:net";
// A port nothing listens on: taken, then freed.
const port = await new Promise((ok) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:" + port;
const { startTelemetryIfSet } = await import(${telemetry});
await startTelemetryIfSet();
const { trace } = await import("@opentelemetry/api");
for (let i = 0; i < 5; i++) {
  trace.getTracer("test").startActiveSpan("x" + i, (span) => span.end());
  await new Promise((ok) => setTimeout(ok, 400));
}
console.log("ALIVE");
process.exit(0);`,
      { OTEL_BSP_SCHEDULE_DELAY: "100", OTEL_EXPORTER_OTLP_TIMEOUT: "500" },
    );
    expect(result.stdout, result.stderr).toContain("ALIVE");
    const events = result.lines.map((line) => JSON.parse(line).event);
    expect(events.filter((event) => event === "telemetry.export_failed")).toHaveLength(1);
  });
});
