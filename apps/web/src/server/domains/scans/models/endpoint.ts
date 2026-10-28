import { BlockList, isIP, isIPv4, isIPv6 } from "node:net";

/**
 * The checks on an LLM endpoint root sets in the web (136), so the field can't be used to reach
 * the server's own network: `https://` only, no user name or password in it, and every address the
 * host resolves to public. A host in the operator's `RONNE_SKILL_SCANNER_HTTP_HOSTS` skips them
 * (a local Ollama, say) and may use `http://`. Checked on save and again when a scan starts, as DNS
 * can change.
 */
export type EndpointProblem =
  | "not a url"
  | "not https"
  | "credentials in url"
  | "internal address"
  | "unresolved";

/**
 * `url` is the endpoint as checked, which is what is stored and passed on (`url.href`), never what
 * was typed: other URL parsers may read a typed value's host differently.
 */
export type EndpointCheck = { ok: true; url: URL } | { ok: false; problem: EndpointProblem };

// Backslashes, spaces and control characters: WHATWG URL reads or drops them where Python's
// parsers (the scanner's) read them otherwise, so `https://a.com\@10.0.0.1/` could be two hosts.
const AMBIGUOUS = /[\\\s\p{Cc}]/u;

/** Every address a host name resolves to; a name that doesn't resolve gives none, or throws. */
export type Resolver = (hostname: string) => Promise<readonly string[]>;

/** A host as compared: lower case, without a trailing dot or an IPv6 address's brackets. */
const normalHost = (host: string): string =>
  host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");

/** The operator's hosts: comma- or space-separated names or addresses, any case. */
export const parseAllowedHosts = (value: string | undefined): ReadonlySet<string> =>
  new Set(
    (value ?? "")
      .split(/[\s,]+/)
      .map(normalHost)
      .filter((host) => host !== ""),
  );

// Not public: this host, private networks, shared and link-local (cloud metadata) addresses,
// documentation, benchmarking, multicast and reserved ranges.
const INTERNAL_V4: readonly [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const INTERNAL_V6: readonly [string, number][] = [
  // Unspecified, loopback and the old IPv4-compatible form.
  ["::", 96],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

const internal = new BlockList();
for (const [network, prefix] of INTERNAL_V4) internal.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of INTERNAL_V6) internal.addSubnet(network, prefix, "ipv6");

/** An IPv6 address's 16 bytes; it must be one (`isIPv6`). */
const ipv6Bytes = (address: string): number[] => {
  let text = address;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted?.[1]) {
    const [a, b, c, d] = dotted[1].split(".").map(Number) as [number, number, number, number];
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", tail] = text.split("::");
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const left = groups(head);
  const right = tail === undefined ? [] : groups(tail);
  const all = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return all.flatMap((group) => {
    const value = Number.parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
};

const v4 = (bytes: number[], at: number) => bytes.slice(at, at + 4).join(".");

/** The IPv4 address an IPv6 one carries (mapped, NAT64 or 6to4), when it carries one. */
const embeddedV4 = (address: string): string | null => {
  const bytes = ipv6Bytes(address);
  const zeros = (from: number, to: number) => bytes.slice(from, to).every((b) => b === 0);
  // ::ffff:a.b.c.d, mapped, and ::ffff:0:a.b.c.d, translated.
  if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return v4(bytes, 12);
  if (zeros(0, 8) && bytes[8] === 0xff && bytes[9] === 0xff && zeros(10, 12)) return v4(bytes, 12);
  // 64:ff9b::a.b.c.d, NAT64, and 64:ff9b:1::/48, its local form.
  if (bytes[0] === 0 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) {
    if (zeros(4, 12)) return v4(bytes, 12);
    if (bytes[4] === 0 && bytes[5] === 1) return "0.0.0.0";
  }
  // 2002:aabb:ccdd::, 6to4.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return v4(bytes, 2);
  return null;
};

/** Whether an address (IPv4 or IPv6, any form) is one the endpoint may not reach. */
export const isInternalAddress = (address: string): boolean => {
  const plain = normalHost(address).replace(/%.*$/, "");
  if (isIPv4(plain)) return internal.check(plain, "ipv4");
  if (!isIPv6(plain)) return true;
  const carried = embeddedV4(plain);
  if (carried !== null) return internal.check(carried, "ipv4");
  return internal.check(plain, "ipv6");
};

/**
 * Checks an endpoint: refused unless `https://`, with no user name or password, on a host that
 * isn't named for this machine and resolves only to public addresses. The operator's allowed hosts
 * pass with `http://` too.
 */
export const checkEndpoint = async (
  value: string,
  options: { allowedHosts: ReadonlySet<string>; resolve: Resolver },
): Promise<EndpointCheck> => {
  const typed = value.trim();
  if (AMBIGUOUS.test(typed)) return { ok: false, problem: "not a url" };
  let url: URL;
  try {
    url = new URL(typed);
  } catch {
    return { ok: false, problem: "not a url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return { ok: false, problem: "not a url" };
  const host = normalHost(url.hostname);
  if (host === "") return { ok: false, problem: "not a url" };
  // Never allowed, as they'd be a secret kept in a plain setting and the audit's host.
  if (url.username !== "" || url.password !== "")
    return { ok: false, problem: "credentials in url" };
  if (options.allowedHosts.has(host)) return { ok: true, url };
  if (url.protocol !== "https:") return { ok: false, problem: "not https" };
  if (isIP(host) !== 0)
    return isInternalAddress(host) ? { ok: false, problem: "internal address" } : { ok: true, url };
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
    : { ok: true, url };
};
