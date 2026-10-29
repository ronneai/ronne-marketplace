import { describe, expect, it } from "vitest";
import { checkEndpoint, isInternalAddress, parseAllowedHosts, type Resolver } from "./endpoint";

const PUBLIC = "93.184.215.14";
const dns: Record<string, readonly string[]> = {
  "api.example.com": [PUBLIC, "2606:2800:21f:cb07:6820:80da:af6b:8b2c"],
  "internal.example.com": ["10.0.0.5"],
  "mixed.example.com": [PUBLIC, "192.168.1.10"],
  "v6-loopback.example.com": ["::1"],
  "mapped.example.com": ["::ffff:169.254.169.254"],
  "nothing.example.com": [],
};
const asked: string[] = [];
const resolve: Resolver = async (host) => {
  asked.push(host);
  const found = dns[host];
  if (!found) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  return found;
};
const check = (url: string, allowed = "") =>
  checkEndpoint(url, { allowedHosts: parseAllowedHosts(allowed), resolve });
const problem = async (url: string, allowed = "") => {
  const result = await check(url, allowed);
  return result.ok ? "ok" : result.problem;
};

describe("isInternalAddress (136)", () => {
  it.each([
    ["0.0.0.0", "this host"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["10.1.2.3", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.0.1", "private"],
    ["100.64.0.1", "shared (CGNAT)"],
    ["100.100.100.200", "a cloud's metadata, in shared space"],
    ["169.254.169.254", "link-local, cloud metadata"],
    ["192.0.0.1", "IETF assignments"],
    ["192.0.2.1", "documentation"],
    ["198.18.0.1", "benchmarking"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["::127.0.0.1", "IPv4-compatible"],
    ["::ffff:127.0.0.1", "mapped loopback"],
    ["::ffff:7f00:1", "mapped loopback, in hex"],
    ["::ffff:10.0.0.1", "mapped private"],
    ["::ffff:169.254.169.254", "mapped metadata"],
    ["64:ff9b::a9fe:a9fe", "NAT64 of the metadata address"],
    ["64:ff9b:1::1", "local NAT64"],
    ["2002:c0a8:0101::1", "6to4 of a private address"],
    ["fc00::1", "unique local"],
    ["fd00:ec2::254", "a cloud's IPv6 metadata"],
    ["fe80::1", "link-local"],
    ["fe80::1%en0", "link-local with a zone"],
    ["fec0::1", "site-local"],
    ["ff02::1", "multicast"],
    ["2001:db8::1", "documentation"],
    ["2001::1", "Teredo"],
    ["3fff::1", "documentation (RFC 9637)"],
    ["5f00::1", "SRv6 segment identifiers"],
    ["100::1", "discard-only"],
    ["::ffff:0:127.0.0.1", "translated loopback"],
    ["::ffff:0:a9fe:a9fe", "translated metadata"],
    ["192.88.99.1", "the old 6to4 relay"],
    ["198.51.100.1", "documentation"],
    ["203.0.113.1", "documentation"],
    ["240.0.0.1", "reserved"],
    ["[::1]", "in brackets"],
    ["not-an-address", "not an address at all"],
  ])("%s (%s) is internal", (address) => {
    expect(isInternalAddress(address)).toBe(true);
  });

  it.each([
    PUBLIC,
    "8.8.8.8",
    "172.32.0.1",
    "100.128.0.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
    "2002:0808:0808::1",
    "::ffff:0:808:808",
    "4000::1",
    "198.20.0.1",
  ])("%s is public", (address) => {
    expect(isInternalAddress(address)).toBe(false);
  });
});

describe("checkEndpoint (136)", () => {
  it("accepts an https endpoint whose every address is public", async () => {
    const result = await check("https://api.example.com/v1");
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.url.host).toBe("api.example.com");
  });

  it("refuses http, and anything that isn't http or https", async () => {
    expect(await problem("http://api.example.com/v1")).toBe("not https");
    for (const url of [
      "ftp://api.example.com",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:,x",
    ])
      expect(await problem(url)).toBe("not a url");
  });

  it("refuses what isn't a URL", async () => {
    for (const url of ["", "api.example.com", "https://", "https://[::1", "https://exa mple.com"])
      expect(await problem(url)).toBe("not a url");
  });

  it("refuses a user name or password in the URL, even on an allowed host", async () => {
    expect(await problem("https://user:secret@api.example.com/")).toBe("credentials in url");
    expect(await problem("https://user@api.example.com/")).toBe("credentials in url");
    expect(await problem("https://:secret@api.example.com/")).toBe("credentials in url");
    expect(await problem("http://user:pw@ollama.lan/", "ollama.lan")).toBe("credentials in url");
  });

  it("reads the host as the scanner will, not as it looks: `@`, `?` and `#`", async () => {
    // The host is what follows the `@`: internal.example.com, not api.example.com.
    expect(await problem("https://api.example.com@internal.example.com/")).toBe(
      "credentials in url",
    );
    expect(await problem("https://api.example.com#@internal.example.com/")).toBe("ok");
    expect(await problem("https://api.example.com?x=@internal.example.com/")).toBe("ok");
  });

  it("refuses backslashes, spaces and control characters, which other URL parsers read otherwise", async () => {
    // WHATWG reads the first as host 8.8.8.8; Python's parsers, as userinfo then 169.254.169.254.
    for (const url of [
      "https://8.8.8.8\\@169.254.169.254/",
      "https://internal.example.com\\@api.example.com/",
      "http://ollama.lan\\@10.0.0.1/",
      "https://api.example.com\t@127.0.0.1/",
      "https://api.example.com\n.evil/",
      "https://api.example.com/v1\u0000",
      "https://api.example.com/a b",
    ])
      expect(await problem(url, "ollama.lan"), JSON.stringify(url)).toBe("not a url");
    // Around the value is fine: it's trimmed.
    expect(await problem("  https://api.example.com/v1\n")).toBe("ok");
  });

  it("gives back the endpoint as checked, the form to store and pass on", async () => {
    const result = await check("HTTPS://API.Example.com:443/v1/../v2?q=1#frag");
    expect(result.ok && result.url.href).toBe("https://api.example.com/v2?q=1#frag");
    const literal = await check("https://0x08.8.8.8/");
    expect(literal.ok && literal.url.href).toBe("https://8.8.8.8/");
  });

  it("refuses an address literal that is internal, in any of its forms", async () => {
    asked.length = 0;
    for (const url of [
      "https://127.0.0.1/",
      "https://127.1/",
      "https://2130706433/",
      "https://0x7f.0.0.1/",
      "https://0177.0.0.1/",
      "https://169.254.169.254/latest/meta-data/",
      "https://[::1]/",
      "https://[::ffff:127.0.0.1]/",
      "https://[::ffff:a9fe:a9fe]/",
      "https://[fd00:ec2::254]/",
      "https://[0:0:0:0:0:0:0:1]/",
      "https://0.0.0.0/",
    ])
      expect(await problem(url), url).toBe("internal address");
    expect(asked).toEqual([]);
  });

  it("accepts a public address literal without resolving it", async () => {
    asked.length = 0;
    expect(await problem("https://8.8.8.8/")).toBe("ok");
    expect(await problem("https://[2606:4700:4700::1111]/")).toBe("ok");
    expect(asked).toEqual([]);
  });

  it("refuses localhost and its subdomains without asking DNS", async () => {
    asked.length = 0;
    for (const url of ["https://localhost/", "https://LOCALHOST./", "https://api.localhost/"])
      expect(await problem(url)).toBe("internal address");
    expect(asked).toEqual([]);
  });

  it("refuses a name that resolves to an internal address, or to any internal among public ones", async () => {
    expect(await problem("https://internal.example.com/")).toBe("internal address");
    expect(await problem("https://mixed.example.com/")).toBe("internal address");
    expect(await problem("https://v6-loopback.example.com/")).toBe("internal address");
    expect(await problem("https://mapped.example.com/")).toBe("internal address");
  });

  it("asks DNS for the name in lower case without its trailing dot", async () => {
    asked.length = 0;
    expect(await problem("https://API.Example.COM./v1")).toBe("ok");
    expect(asked).toEqual(["api.example.com"]);
  });

  it("refuses a name that doesn't resolve, or resolves to nothing", async () => {
    expect(await problem("https://missing.example.com/")).toBe("unresolved");
    expect(await problem("https://nothing.example.com/")).toBe("unresolved");
  });

  it("lets the operator's hosts through, with http too, and only those", async () => {
    const allowed = "ollama.lan, 10.0.0.5 [::1]";
    expect(await problem("http://ollama.lan:11434/", allowed)).toBe("ok");
    expect(await problem("https://OLLAMA.LAN./", allowed)).toBe("ok");
    expect(await problem("http://10.0.0.5:11434/", allowed)).toBe("ok");
    expect(await problem("http://[::1]:11434/", allowed)).toBe("ok");
    expect(await problem("http://127.0.0.1:11434/", allowed)).toBe("not https");
    expect(await problem("https://127.0.0.1/", allowed)).toBe("internal address");
    // A name's addresses are the operator's to allow by name: an allowed address isn't a pass for
    // a name that resolves to it.
    expect(await problem("https://internal.example.com/", allowed)).toBe("internal address");
    expect(await problem("ftp://ollama.lan/", allowed)).toBe("not a url");
  });

  it("parses the allowed hosts in any case, separated by commas or spaces", () => {
    expect([...parseAllowedHosts(" Ollama.LAN.,10.0.0.5  [FD00::1]\n,, ")]).toEqual([
      "ollama.lan",
      "10.0.0.5",
      "fd00::1",
    ]);
    expect(parseAllowedHosts(undefined).size).toBe(0);
  });
});
