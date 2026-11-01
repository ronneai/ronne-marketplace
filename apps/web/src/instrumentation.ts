import type { Instrumentation } from "next";

/**
 * At start: the refusal of BETTER_AUTH_SECRETS (105), then telemetry (101), only when an OTLP
 * endpoint is set (without one this imports nothing from OpenTelemetry, and Next.js emits no
 * spans), then the scheduled jobs (102), unless RONNE_JOBS turns them off. Before setup, the setup
 * code (161), when the start script hasn't shown it already.
 */
export const register = async () => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Refuses to start with BETTER_AUTH_SECRETS set (105), however it's started (pnpm dev too).
  const { refuseConflictingSecrets } = await import("./server/refuse-conflicts");
  refuseConflictingSecrets();
  const { startTelemetryIfSet } = await import("./server/telemetry");
  await startTelemetryIfSet();
  const { startJobsIfOn } = await import("./server/jobs/scheduler");
  startJobsIfOn();
  // Not awaited: a database that doesn't answer would hold the start for the state check's timeout.
  const { announceSetupCodeAtStart } = await import("./server/setup/announce-at-start");
  void announceSetupCodeAtStart().catch(() => {});
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
