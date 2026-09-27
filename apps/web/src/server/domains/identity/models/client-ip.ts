import { isIP } from "node:net";

/**
 * The client's IP address, or null when it can't be trusted.
 *
 * Next.js only fills X-Forwarded-For with the socket address when the request doesn't already have
 * one, so without a reverse proxy anyone can put any address there. The header is read only with
 * TRUST_PROXY=true, and then the rightmost entry is used: the one the proxy in front of Ronne
 * appended. Entries further left came from the client.
 */
export const clientIp = (
  headers: { get(name: string): string | null },
  trustProxy: boolean,
): string | null => {
  if (!trustProxy) return null;
  const last = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return last && isIP(last) ? last : null;
};
