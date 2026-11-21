import { isIP } from "node:net";
import { isInternalAddress, type Resolver } from "../../scans/models/endpoint";

export type SmtpHostProblem = "not a host" | "internal address" | "unresolved";

/**
 * An SMTP host as checked (189): the addresses to connect to and no others, or null for a host
 * the operator lists in `RONNE_MAIL_HOSTS`, which isn't checked.
 */
export type SmtpHostCheck =
  | { ok: true; host: string; addresses: readonly string[] | null }
  | { ok: false; problem: SmtpHostProblem };

// A host name or an address, nothing else: no scheme, port, path, user or space.
const HOST =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.?$/;

const normal = (host: string) =>
  host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");

/**
 * Checks the SMTP host root typed, as 136 checks an endpoint: every address it resolves to must be
 * public, so the setting can't be used to reach the server's own network. A host in the operator's
 * list skips the check (a relay on the same network). Run on save and before each connection, as
 * DNS can change; the caller connects to the addresses this returns.
 */
export const checkSmtpHost = async (
  value: string,
  options: { allowedHosts: ReadonlySet<string>; resolve: Resolver },
): Promise<SmtpHostCheck> => {
  const host = normal(value);
  if (host === "" || host.length > 253) return { ok: false, problem: "not a host" };
  const literal = isIP(host) !== 0;
  if (!literal && !HOST.test(host)) return { ok: false, problem: "not a host" };
  if (options.allowedHosts.has(host)) return { ok: true, host, addresses: null };
  if (literal)
    return isInternalAddress(host)
      ? { ok: false, problem: "internal address" }
      : { ok: true, host, addresses: [host] };
  if (host === "localhost" || host.endsWith(".localhost"))
    return { ok: false, problem: "internal address" };
  let addresses: readonly string[];
  try {
    addresses = await options.resolve(host);
  } catch {
    return { ok: false, problem: "unresolved" };
  }
  if (addresses.length === 0) return { ok: false, problem: "unresolved" };
  // Every address: a name with one public and one internal address could be given either.
  return addresses.some(isInternalAddress)
    ? { ok: false, problem: "internal address" }
    : { ok: true, host, addresses };
};
