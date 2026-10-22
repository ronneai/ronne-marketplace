import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { withRequestContext } from "../log";
import { PASSWORD_PATH, passwordChangeHold } from "./password-change-hold";
import { requestHeaders as appRequestHeaders } from "./request-headers";
import { forwardedRequestId } from "./request-id";
import { SECURITY_PATH, twoFactorHold } from "./two-factor-hold";

/**
 * Every exported server action goes through this (feature 100; a guard test lists them). A server
 * action is one POST to its page, so `proxy.ts` has already given the request its ID: the action
 * runs in that context, and every line it, the services and the repositories write carries it.
 * There's no `http.request` line for an action, and its unexpected errors are logged once, by
 * `onRequestError` (instrumentation.ts), with the same ID.
 */
export const serverAction = <A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
  options: {
    /**
     * Runs for someone root requires to use two-factor who hasn't set it up yet (105): only the
     * enrolment page's actions and signing out. Every other action sends them there instead, so a
     * tab left open before the requirement can't act.
     */
    whileHeld?: boolean;
    /**
     * Runs for someone who must replace their password first (128): the change itself, signing in
     * and out, the language and the notice. Every other action sends them to the change page.
     */
    whilePasswordHeld?: boolean;
  } = {},
): ((...args: A) => Promise<R>) => {
  const wrapped = async (...args: A): Promise<R> => {
    const requestId = forwardedRequestId(await requestHeaders());
    return withRequestContext({ requestId }, async () => {
      const held = await heldNow();
      if (held === "password") {
        if (!options.whilePasswordHeld) redirect(PASSWORD_PATH);
      } else if (held === "two_factor" && !options.whileHeld) redirect(SECURITY_PATH);
      return action(...args);
    });
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

/**
 * Why the action's caller is held: the password change comes first (128), then two-factor (105).
 * Never held outside a request.
 */
const heldNow = async (): Promise<"password" | "two_factor" | null> => {
  let request: Headers;
  try {
    request = await appRequestHeaders();
  } catch {
    return null;
  }
  if (await passwordChangeHold(request)) return "password";
  return (await twoFactorHold(request)) !== null ? "two_factor" : null;
};
