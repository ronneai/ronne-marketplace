import { afterEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({
  lookup:
    vi.fn<(host: string, options: unknown) => Promise<{ address: string; family: number }[]>>(),
}));
vi.mock("node:dns/promises", () => ({ lookup: dns.lookup }));

const { systemResolver } = await import("./system-resolver");

afterEach(() => {
  dns.lookup.mockReset();
  vi.useRealTimers();
});

describe("systemResolver (136)", () => {
  it("asks for every address, IPv4 and IPv6, as the system orders them", async () => {
    dns.lookup.mockResolvedValue([
      { address: "2606:2800::1", family: 6 },
      { address: "93.184.215.14", family: 4 },
    ]);
    expect(await systemResolver()("api.example.com")).toEqual(["2606:2800::1", "93.184.215.14"]);
    expect(dns.lookup).toHaveBeenCalledWith("api.example.com", { all: true, verbatim: true });
  });

  it("gives up after its timeout, so a slow DNS server can't hold a save or a scan", async () => {
    vi.useFakeTimers();
    dns.lookup.mockReturnValue(new Promise(() => {}));
    const lookup = systemResolver(5000)("slow.example.com");
    const settled = expect(lookup).rejects.toThrow("lookup timed out");
    await vi.advanceTimersByTimeAsync(5000);
    await settled;
  });
});
