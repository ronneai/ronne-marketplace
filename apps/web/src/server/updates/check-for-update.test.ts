import { describe, expect, it, vi } from "vitest";
import { checkForUpdate, MAX_BYTES, RELEASE_URL, TIMEOUT_MS, USER_AGENT } from "./check-for-update";

const release = (tag: unknown, extra: object = {}) =>
  new Response(JSON.stringify({ tag_name: tag, ...extra }), { status: 200 });

const run = (response: Response | (() => Response | Promise<Response>), current = "0.8.2") =>
  checkForUpdate({
    fetch: vi.fn(async () => (typeof response === "function" ? response() : response)) as never,
    current,
  });

describe("checkForUpdate", () => {
  it("says a newer stable release is newer, with its notes", async () => {
    const result = await run(release("v0.9.0"));
    expect(result).toEqual({
      ok: true,
      latest: "0.9.0",
      url: "https://github.com/ronneai/ronne-marketplace/releases/tag/v0.9.0",
      newer: true,
    });
  });

  it("builds the notes link from the version, whatever html_url says", async () => {
    for (const html_url of [
      "https://evil.example/x",
      "https://github.com/ronneai/ronne-marketplace/releases/tag/..",
      "https://github.com/ronneai/ronne-marketplace/releases/tag/v1.0.0",
    ]) {
      expect(await run(release("v0.9.0", { html_url }))).toMatchObject({
        url: "https://github.com/ronneai/ronne-marketplace/releases/tag/v0.9.0",
      });
    }
  });

  it("reports a running version that isn't semver instead of saying it is up to date", async () => {
    for (const current of ["", "0.8", "garbage"]) {
      expect(await run(release("v0.9.0"), current)).toEqual({ ok: false, reason: "bad_answer" });
    }
    expect(await run(release("v0.9.0"), "0.8.2+build")).toMatchObject({ newer: true });
  });

  it("is not newer when equal or older", async () => {
    expect(await run(release("v0.8.2"))).toMatchObject({ ok: true, newer: false });
    expect(await run(release("v0.8.1"))).toMatchObject({ ok: true, latest: "0.8.1", newer: false });
  });

  it("tells a running pre-release about the stable one that follows it", async () => {
    expect(await run(release("v1.0.0"), "1.0.0-rc.1")).toMatchObject({ newer: true });
    expect(await run(release("v1.0.0"), "1.0.0")).toMatchObject({ newer: false });
  });

  it("never announces a pre-release", async () => {
    expect(await run(release("v1.0.0-rc.2"), "1.0.0-rc.1")).toMatchObject({ newer: false });
  });

  it.each([
    ["no tag_name", release(undefined)],
    ["a number", release(9)],
    ["no v", release("0.9.0")],
    ["not semver", release("v0.9")],
    ["a leading zero", release("v01.2.3")],
    ["build metadata", release("v1.2.3+build")],
    ["an empty pre-release identifier", release("v1.0.0-rc..1")],
    ["a numeric identifier with a leading zero", release("v1.0.0-rc.01")],
    ["a huge number", release("v99999999999999999999.0.0")],
    ["a tag of 100 000 characters", release(`v1.0.0-${"a".repeat(100_000)}`)],
    ["a trailing newline", release("v1.0.0\n")],
    ["not JSON", new Response("<html>", { status: 200 })],
  ])("treats %s as a bad answer", async (_name, response) => {
    expect(await run(response)).toEqual({ ok: false, reason: "bad_answer" });
  });

  it("maps 403 and 429 to rate limited, other errors to unreachable", async () => {
    expect(await run(new Response("", { status: 403 }))).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(await run(new Response("", { status: 429 }))).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(await run(new Response("", { status: 503 }))).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("fails as unreachable on a network error or a timeout", async () => {
    expect(
      await run(() => {
        throw new TypeError("fetch failed");
      }),
    ).toEqual({ ok: false, reason: "unreachable" });
    expect(
      await run(() => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    ).toEqual({ ok: false, reason: "unreachable" });
  });

  it("sends the fixed request: no credentials, a User-Agent without a version, a timeout", async () => {
    const fetchMock = vi.fn(async () => release("v0.9.0"));
    await checkForUpdate({ fetch: fetchMock as never, current: "0.8.2" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RELEASE_URL);
    expect(init.headers).toMatchObject({ "User-Agent": USER_AGENT });
    expect(USER_AGENT).not.toMatch(/\d/);
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(Object.keys(init.headers as object).sort()).toEqual(["Accept", "User-Agent"]);
  });

  it("follows a redirect within api.github.com and no further", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(url);
      return calls.length === 1
        ? new Response("", {
            status: 301,
            headers: { location: "https://api.github.com/repositories/1/releases/latest" },
          })
        : release("v0.9.0");
    });
    expect(await checkForUpdate({ fetch: fetchMock as never, current: "0.8.2" })).toMatchObject({
      newer: true,
    });
    expect(calls[1]).toBe("https://api.github.com/repositories/1/releases/latest");
  });

  it("refuses a redirect to another host, or to http, without following it", async () => {
    for (const location of ["https://evil.example/x", "http://api.github.com/x"]) {
      const fetchMock = vi.fn(async () => new Response("", { status: 302, headers: { location } }));
      expect(await checkForUpdate({ fetch: fetchMock as never, current: "0.8.2" })).toEqual({
        ok: false,
        reason: "bad_answer",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("gives up on a loop of redirects", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("", { status: 302, headers: { location: "https://api.github.com/again" } }),
    );
    expect(await checkForUpdate({ fetch: fetchMock as never, current: "0.8.2" })).toEqual({
      ok: false,
      reason: "bad_answer",
    });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("refuses a body over 1 MiB, declared or streamed", async () => {
    const big = "x".repeat(MAX_BYTES + 1);
    expect(await run(new Response(big, { status: 200 }))).toEqual({
      ok: false,
      reason: "bad_answer",
    });
    expect(
      await run(
        new Response("{}", { status: 200, headers: { "content-length": String(MAX_BYTES + 1) } }),
      ),
    ).toEqual({ ok: false, reason: "bad_answer" });
    // A valid answer that only the streamed limit refuses (no content-length).
    const validButHuge = JSON.stringify({ tag_name: "v0.9.0", pad: "x".repeat(MAX_BYTES) });
    expect(await run(new Response(validButHuge, { status: 200 }))).toEqual({
      ok: false,
      reason: "bad_answer",
    });
    const padded = JSON.stringify({ tag_name: "v0.9.0", pad: "x".repeat(MAX_BYTES - 100) });
    expect(await run(new Response(padded, { status: 200 }))).toMatchObject({ ok: true });
  });

  it("gives up on a fetch that hangs until its 10 second signal aborts", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    try {
      const hanging = (async (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        })) as never;
      const pending = checkForUpdate({ fetch: hanging, current: "0.8.2" });
      controller.abort(new DOMException("timed out", "TimeoutError"));
      expect(await pending).toEqual({ ok: false, reason: "unreachable" });
      expect(timeout).toHaveBeenCalledWith(TIMEOUT_MS);
      expect(TIMEOUT_MS).toBe(10_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it("gives up on a body that stalls, under the same deadline", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    try {
      const stalled = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('{"tag_name":'));
        },
      });
      const pending = run(new Response(stalled, { status: 200 }));
      await new Promise((r) => setTimeout(r, 20));
      controller.abort(new DOMException("timed out", "TimeoutError"));
      expect(await pending).toEqual({ ok: false, reason: "unreachable" });
    } finally {
      timeout.mockRestore();
    }
  });

  it("uses one deadline for every redirect hop", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response("", { status: 302, headers: { location: "https://api.github.com/a" } }),
        )
        .mockResolvedValueOnce(release("v0.9.0"));
      await checkForUpdate({ fetch: fetchMock as never, current: "0.8.2" });
      expect(timeout).toHaveBeenCalledTimes(1);
      const signals = fetchMock.mock.calls.map((c) => (c[1] as RequestInit).signal);
      expect(signals[0]).toBe(signals[1]);
    } finally {
      timeout.mockRestore();
    }
  });

  it("cancels a redirect's body", async () => {
    const cancel = vi.fn(async () => undefined);
    const response = {
      status: 302,
      headers: new Headers({ location: "https://evil.example/x" }),
      body: { cancel },
    };
    await checkForUpdate({ fetch: (async () => response) as never, current: "0.8.2" });
    expect(cancel).toHaveBeenCalled();
  });
});
