import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

// Task 5 of 101: with tracing and metrics on, sign-in, the token exchange, a release in a private
// workspace, a feed build, a draft upload and an authenticated API call send the collector nothing
// personal: no parameter value, user id, email, IP address, user agent, token, or item, scope or
// workspace name. The flows run in a child process (testing/privacy-scenario.ts).
const here = import.meta.dirname;

const scenario = () => {
  const dir = mkdtempSync(join(tmpdir(), "ronne-privacy-out-"));
  const out = join(dir, "out.json");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("OTEL_") && !/^VITEST/.test(key)),
  );
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `const { run } = await import(${JSON.stringify(join(here, "testing/privacy-scenario.ts"))}); await run();`,
    ],
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
        OTEL_BSP_SCHEDULE_DELAY: "100",
        OTEL_METRIC_EXPORT_INTERVAL: "300",
        PRIVACY_OUT: out,
      },
      timeout: 120_000,
    },
  );
  const written = existsSync(out)
    ? (JSON.parse(readFileSync(out, "utf8")) as { never: Record<string, string>; bodies: string[] })
    : null;
  rmSync(dir, { recursive: true, force: true });
  return { never: written?.never ?? null, bodies: written?.bodies ?? null, stderr: result.stderr };
};

it("sends the collector nothing personal from the server's flows", () => {
  const { never, bodies, stderr } = scenario();
  expect(never, stderr).not.toBeNull();
  expect(bodies?.some((body) => body.startsWith("/v1/traces"))).toBe(true);
  expect(bodies?.some((body) => body.startsWith("/v1/metrics"))).toBe(true);
  const sent = (bodies ?? []).join("\n");
  // The flows were traced: the release, the feed build and the upload are there.
  for (const span of ["ronne.release", "ronne.feed.build", "ronne.draft.upload", "db select"])
    expect(sent, span).toContain(span);
  for (const [what, value] of Object.entries(never ?? {})) {
    expect(value, `${what} is empty: the search would prove nothing`).toBeTruthy();
    expect(sent.includes(value), `${what} reached the collector`).toBe(false);
  }

  // Each domain span under its request's span, with its attributes (task 3).
  type Span = {
    name: string;
    spanId: string;
    parentSpanId?: string;
    attributes: { key: string; value: Record<string, unknown> }[];
  };
  const spans: Span[] = (bodies ?? [])
    .filter((body) => body.startsWith("/v1/traces "))
    .flatMap((body) =>
      (
        JSON.parse(body.slice("/v1/traces ".length)) as {
          resourceSpans: { scopeSpans: { spans: Span[] }[] }[];
        }
      ).resourceSpans.flatMap((r) => r.scopeSpans.flatMap((s) => s.spans)),
    );
  const attr = (span: Span | undefined, key: string) =>
    Object.values(span?.attributes.find((a) => a.key === key)?.value ?? {})[0];
  const parentsOf = (child: string) =>
    spans
      .filter((span) => span.name === child)
      .map((span) => spans.find((p) => p.spanId === span.parentSpanId)?.name);
  // A single release, then a bulk one of two: each under its request.
  expect(parentsOf("ronne.release"), "ronne.release's parents").toEqual([
    "POST /release",
    "POST /reviews",
  ]);
  expect(parentsOf("ronne.draft.upload"), "ronne.draft.upload's parent").toEqual([
    "POST /api/v1/drafts",
  ]);
  expect(parentsOf("ronne.feed.build"), "ronne.feed.build's parents").toEqual([
    "GET /api/v1/feeds/[tool]/marketplace.json",
    "GET /api/v1/feeds/[tool]/marketplace.json",
  ]);
  expect(
    spans.filter((s) => s.name === "ronne.release").map((s) => attr(s, "ronne.items")),
  ).toEqual([1, 2]);
  const builds = spans.filter((s) => s.name === "ronne.feed.build");
  expect(builds.map((s) => attr(s, "ronne.tool"))).toEqual(["claude-code", "claude-code"]);
  expect(builds.map((s) => attr(s, "ronne.feed.cached")).sort()).toEqual([false, true]);
  // The fresh build holds Ana's private skills: their names were in it, and stayed out.
  expect(
    attr(
      builds.find((s) => attr(s, "ronne.feed.cached") === false),
      "ronne.feed.plugins",
    ),
  ).toBe(3);
}, 150_000);
