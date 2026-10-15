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
  for (const [what, value] of Object.entries(never ?? {}))
    expect(value && sent.includes(value), `${what} reached the collector`).toBeFalsy();
}, 150_000);
