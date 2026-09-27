import { cookies, headers } from "next/headers";

/**
 * The request's headers, with the Cookie header taken from `cookies()`.
 *
 * After a server action, Next.js re-renders the page with the cookies the action set, but only
 * through `cookies()`: `headers()` still has the original Cookie header. Changing the password
 * replaces the session cookie, so a layout reading `headers()` would see the old, deleted session
 * and send the user to sign-in.
 */
export async function requestHeaders(): Promise<Headers> {
  const merged = new Headers(await headers());
  const cookieHeader = (await cookies()).toString();
  if (cookieHeader) merged.set("cookie", cookieHeader);
  else merged.delete("cookie");
  return merged;
}
