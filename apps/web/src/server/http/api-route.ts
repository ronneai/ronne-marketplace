import { unstable_rethrow } from "next/navigation";
import { logger, withRequestContext } from "../log";
import { errorResponse } from "./errors";
import { REQUEST_ID_HEADER, requestIdFor, trustsProxy } from "./request-id";

const log = logger.child({ domain: "http" });

/**
 * Every route handler in `app/api/**` goes through this (feature 100; a guard test lists them). It
 * gives the request its ID and runs the handler in that context, so every line the handler, the
 * services and the repositories write carries it; writes `http.request` with the route's pattern
 * (never the filled-in path: private names don't reach the logs), the status and the time; sets
 * `X-Request-Id` on the response, the ID someone quotes when they report a problem; and turns an
 * unexpected error into one `http.error` line and a 500 in the API's one error shape (MVP §11).
 */
export const apiRoute =
  <C>(route: string, handler: (request: Request, context: C) => Promise<Response>) =>
  (request: Request, context: C): Promise<Response> => {
    const requestId = requestIdFor(request.headers, trustsProxy());
    const started = performance.now();
    return withRequestContext({ requestId }, async () => {
      let response: Response;
      try {
        response = await handler(request, context);
      } catch (error) {
        // Next's own signals (a prerender bailing out, a redirect) aren't errors: they go on.
        unstable_rethrow(error);
        log.event("http.error", { err: error, route });
        response = errorResponse(
          500,
          "internal_error",
          `Something went wrong on the server. Quote request ${requestId} to report it.`,
        );
      }
      response = withHeader(response, requestId);
      const status = response.status;
      log.event(
        "http.request",
        { method: request.method, route, status, ms: Math.round(performance.now() - started) },
        status >= 500 ? "error" : status === 429 ? "warn" : undefined,
      );
      return response;
    });
  };

/** The response with `X-Request-Id`; a copy when its headers can't be changed (a fetched body). */
const withHeader = (response: Response, requestId: string): Response => {
  try {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.set(REQUEST_ID_HEADER, requestId);
    return copy;
  }
};
