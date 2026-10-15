import { headers } from "next/headers";
import { withRequestContext } from "../log";
import { forwardedRequestId } from "./request-id";

/**
 * Every exported server action goes through this (feature 100; a guard test lists them). A server
 * action is one POST to its page, so `proxy.ts` has already given the request its ID: the action
 * runs in that context, and every line it, the services and the repositories write carries it.
 * There's no `http.request` line for an action, and its unexpected errors are logged once, by
 * `onRequestError` (instrumentation.ts), with the same ID.
 */
export const serverAction = <A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
): ((...args: A) => Promise<R>) => {
  const wrapped = async (...args: A): Promise<R> => {
    const requestId = forwardedRequestId(await requestHeaders());
    return withRequestContext({ requestId }, () => action(...args));
  };
  made.add(wrapped);
  return wrapped;
};

/** Every function serverAction made: the guard test checks each exported action is one. */
const made = new WeakSet<object>();

export const isServerAction = (value: unknown): boolean =>
  typeof value === "function" && made.has(value);

/** The request's headers; none outside a request (an action called from a script or a test). */
const requestHeaders = async (): Promise<{ get(name: string): string | null }> => {
  try {
    return await headers();
  } catch {
    return new Headers();
  }
};
