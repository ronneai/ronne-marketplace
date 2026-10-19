import type { Instrumentation } from "next";

/**
 * At start: the refusal of BETTER_AUTH_SECRETS (105), then telemetry (101), only when an OTLP
 * endpoint is set (without one this imports nothing from OpenTelemetry, and Next.js emits no
 * spans), then the scheduled jobs (102), unless RONNE_JOBS turns them off.
 */
export const register = async () => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Refuses to start with BETTER_AUTH_SECRETS set (105), however it's started (pnpm dev too).
  const { secretsConflict } = await import("./server/config");
  const conflict = secretsConflict();
  if (conflict) {
    console.error(`✗ ${conflict}`);
    process.exit(1);
  }
  const { startTelemetryIfSet } = await import("./server/telemetry");
  await startTelemetryIfSet();
  const { startJobsIfOn } = await import("./server/jobs/scheduler");
  startJobsIfOn();
};

/**
 * An unexpected error Next.js caught (feature 100): one `http.error` line, with the request's ID
 * that `proxy.ts` set and the route's pattern (never the filled-in path). Pages, server actions and
 * the proxy come here; API routes don't: `apiRoute` catches and logs their errors itself, with a
 * 500 in the API's shape, so each error is logged once.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // The logger is Node.js only; the import keeps it out of any other runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logRequestError } = await import("./server/http/request-error");
  logRequestError(error, request.headers, context.routePath);
};
