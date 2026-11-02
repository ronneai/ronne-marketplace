import { loadConfig } from "../config";
import { newId } from "../db/ids";
import { isRequestId } from "../log/request-id";

/** The header that carries a request's ID, in and out (feature 100). */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * This request's ID: the incoming `X-Request-Id` when the reverse proxy in front of Ronne is trusted
 * (TRUST_PROXY=true) and the ID is well formed, so one ID follows the request through Caddy or a
 * load balancer; a new ULID otherwise. Without a trusted proxy, anyone could pick their ID.
 */
export const requestIdFor = (
  headers: { get(name: string): string | null },
  trustProxy: boolean,
): string => {
  const incoming = headers.get(REQUEST_ID_HEADER);
  return trustProxy && incoming !== null && isRequestId(incoming) ? incoming : newId();
};

/** An ID the proxy already set (pages, server actions), or a new one when it's missing or odd. */
export const forwardedRequestId = (headers: { get(name: string): string | null }): string =>
  requestIdFor(headers, true);

/** TRUST_PROXY as the settings say; false when they can't be read. */
export const trustsProxy = (): boolean => {
  try {
    return loadConfig().trustProxy;
  } catch {
    return false;
  }
};
