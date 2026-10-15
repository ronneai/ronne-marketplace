import { logger, withRequestContext } from "../log";
import { forwardedRequestId } from "./request-id";

const log = logger.child({ domain: "http" });

/**
 * Logs an error Next.js caught, outside `apiRoute` (instrumentation.ts): one `http.error` line in
 * the request's context, its ID from the header `proxy.ts` set (a new one when it's missing).
 */
export const logRequestError = (
  error: unknown,
  headers: Record<string, string | string[] | undefined>,
  route: string,
): void => {
  const header = headers["x-request-id"];
  const requestId = forwardedRequestId({
    get: () => (typeof header === "string" ? header : null),
  });
  withRequestContext({ requestId }, () => log.event("http.error", { err: error, route }));
};
