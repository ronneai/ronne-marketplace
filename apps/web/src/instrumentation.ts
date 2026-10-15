import type { Instrumentation } from "next";

/**
 * At start (101): telemetry, only when an OTLP endpoint is set. Without one this imports nothing
 * from OpenTelemetry, and Next.js emits no spans.
 */
export const register = async () => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startTelemetryIfSet } = await import("./server/telemetry");
  await startTelemetryIfSet();
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
