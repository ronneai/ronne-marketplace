import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScanFile, ScanProvider } from "../models/scan";
import {
  checkScanService,
  HEALTH_TIMEOUT_MS,
  httpSkillScanner,
  outcomeOf,
  SCAN_KEY_HEADER,
  scannerServices,
  serviceHealth,
} from "./http-scanner";

type Seen = { request: IncomingMessage; body: string };
type Reply =
  | { status: number; body: string; headers?: Record<string, string> }
  | "hang"
  | "drop"
  /** Headers, then a first byte of the body, then nothing. */
  | "stall"
  /** Headers, then a byte of the body every 100 ms, for ever. */
  | "drip";

const drips: NodeJS.Timeout[] = [];

let server: Server;
let port: number;
let seen: Seen[];
let reply: (path: string) => Reply;

beforeEach(async () => {
  seen = [];
  reply = () => ({ status: 200, body: "{}" });
  server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      seen.push({ request, body });
      const answer = reply(request.url ?? "");
      if (answer === "hang") return;
      if (answer === "drop") return request.socket.destroy();
      if (answer === "stall" || answer === "drip") {
        response.writeHead(200, { "content-type": "application/json" });
        response.write("{");
        if (answer === "drip") drips.push(setInterval(() => response.write(" "), 100));
        return;
      }
      response.writeHead(answer.status, {
        "content-type": "application/json",
        ...answer.headers,
      });
      response.end(answer.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterEach(async () => {
  for (const drip of drips.splice(0)) clearInterval(drip);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const base = () => new URL(`http://127.0.0.1:${port}/`);

/** A real static report of SkillSpector 2.13.2 (135's fixtures). */
const REPORT = readFileSync(
  join(process.cwd(), "../../packages/core/src/skill-scan/fixtures/reports/secure-coding.json"),
  "utf8",
);
const report = () => REPORT;

const FILES: ScanFile[] = [
  { path: "SKILL.md", bytes: new TextEncoder().encode("# hi"), executable: false },
  { path: "bin/run.sh", bytes: new Uint8Array([0, 255, 10]), executable: true },
];

const PROVIDER: ScanProvider = {
  name: "openai",
  model: "gpt-x",
  host: "api.openai.com",
  variables: { SKILLSPECTOR_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" },
};

const scanner = (overrides: Partial<Parameters<typeof httpSkillScanner>[0]> = {}) =>
  httpSkillScanner({
    url: base(),
    semanticUrl: null,
    key: "the-key",
    timeoutSeconds: 30,
    provider: null,
    ...overrides,
  });

describe("httpSkillScanner (156)", () => {
  it("posts the files, base64, with the scan key, and reads the report", async () => {
    reply = () => ({ status: 200, body: JSON.stringify({ exit: 0, report: report() }) });
    const outcome = await scanner().scan(FILES);
    expect(outcome).toMatchObject({ ok: true, result: { scannerVersion: expect.any(String) } });
    expect(seen).toHaveLength(1);
    const [{ request, body }] = seen as [Seen];
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/scan");
    expect(request.headers[SCAN_KEY_HEADER.toLowerCase()]).toBe("the-key");
    expect(JSON.parse(body)).toEqual({
      files: [
        { path: "SKILL.md", content: Buffer.from("# hi").toString("base64"), executable: false },
        { path: "bin/run.sh", content: "AP8K", executable: true },
      ],
      semantic: false,
      timeoutSeconds: 30,
    });
  });

  it("sends no key header when none is set", async () => {
    reply = () => ({ status: 200, body: JSON.stringify({ exit: 1, report: report() }) });
    expect((await scanner({ key: null }).scan(FILES)).ok).toBe(true);
    expect(seen[0]?.request.headers[SCAN_KEY_HEADER.toLowerCase()]).toBeUndefined();
  });

  it("sends a semantic scan to the semantic address only, with the provider's variables", async () => {
    const semanticUrl = new URL(`http://localhost:${port}/`);
    reply = () => ({ status: 200, body: JSON.stringify({ exit: 0, report: report() }) });
    await scanner({ semanticUrl, provider: PROVIDER }).scan(FILES, { semantic: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.request.headers.host).toBe(`localhost:${port}`);
    expect(JSON.parse(seen[0]?.body ?? "")).toMatchObject({
      semantic: true,
      provider: PROVIDER.variables,
    });
  });

  it("never sends the provider on a static scan", async () => {
    reply = () => ({ status: 200, body: JSON.stringify({ exit: 0, report: report() }) });
    await scanner({ provider: PROVIDER }).scan(FILES);
    expect(JSON.parse(seen[0]?.body ?? "")).not.toHaveProperty("provider");
    expect(seen[0]?.body).not.toContain("sk-test");
  });

  it("fails a semantic scan as not configured without a semantic address, sending nothing", async () => {
    expect(await scanner({ provider: PROVIDER }).scan(FILES, { semantic: true })).toEqual({
      ok: false,
      error: "not configured",
    });
    expect(seen).toHaveLength(0);
  });

  it("tells busy from any other 503 by the service's own body", async () => {
    reply = () => ({ status: 503, body: '{"error": "busy"}' });
    expect(await scanner().scan(FILES)).toEqual({ ok: false, error: "busy" });
    reply = () => ({ status: 503, body: "<html>Service Unavailable</html>" });
    expect(await scanner().scan(FILES)).toEqual({ ok: false, error: "unreachable" });
  });

  it("takes busy only from a 503, and the scan key only from a 403", async () => {
    for (const [status, error] of [
      [500, "busy"],
      [502, "busy"],
      [404, "scan key"],
      [500, "not set up"],
    ] as const) {
      reply = () => ({ status, body: JSON.stringify({ error }) });
      expect(await scanner().scan(FILES), `${status} ${error}`).toEqual({
        ok: false,
        error: "refused",
      });
    }
  });

  it("knows only its own error names, never an object's built-in keys", async () => {
    for (const error of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      reply = () => ({ status: 500, body: JSON.stringify({ error }) });
      expect(await scanner().scan(FILES), error).toEqual({ ok: false, error: "refused" });
    }
  });

  it("says the proxy refused the scan key, whether it was wrong or the proxy has none", async () => {
    for (const error of ["scan key", "not set up"]) {
      reply = () => ({ status: 403, body: JSON.stringify({ error }) });
      expect(await scanner().scan(FILES)).toEqual({ ok: false, error: "scan key refused" });
    }
  });

  it("is unreachable with no answer, a dropped connection, or the proxy's 502 and 504", async () => {
    for (const answer of [
      "drop" as const,
      { status: 502, body: "" },
      { status: 504, body: "Gateway Timeout" },
    ]) {
      reply = () => answer;
      expect(await scanner().scan(FILES)).toEqual({ ok: false, error: "unreachable" });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
    expect(await scanner().scan(FILES)).toEqual({ ok: false, error: "unreachable" });
    // The afterEach closes it again: listen on a fresh one so that close succeeds.
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  it("stops waiting even when the fetch ignores its abort signal", async () => {
    // A body that never ends and never errors: only Ronne's own deadline can end the read.
    const deaf: typeof fetch = async () =>
      new Response(new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode("{")) }), {
        status: 200,
      });
    const started = Date.now();
    const outcome = await scanner({ timeoutSeconds: 0.3, graceSeconds: 0.2, fetch: deaf }).scan(
      FILES,
    );
    expect(outcome).toEqual({ ok: false, error: "unreachable" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("stops waiting for headers that never come, from a fetch that ignores its signal", async () => {
    const never: typeof fetch = () => new Promise<Response>(() => {});
    const started = Date.now();
    const outcome = await scanner({ timeoutSeconds: 0.3, graceSeconds: 0.2, fetch: never }).scan(
      FILES,
    );
    expect(outcome).toEqual({ ok: false, error: "unreachable" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("takes a 3xx as no answer whatever its body says, without reading on", async () => {
    // A service-looking body on a redirect is not the service's answer: any status from 300 to 399.
    for (const status of [300, 301, 302, 303, 305, 307, 308, 399]) {
      for (const body of ['{"error": "timeout"}', JSON.stringify({ exit: 0, report: report() })]) {
        reply = () => ({ status, body, headers: { location: "/elsewhere" } });
        expect(await scanner().scan(FILES), `${status} ${body.slice(0, 20)}`).toEqual({
          ok: false,
          error: "unreachable",
        });
      }
    }
    // The statuses either side of the range are answers, not redirects.
    reply = () => ({ status: 299, body: '{"error": "timeout"}' });
    expect(await scanner().scan(FILES)).toEqual({ ok: false, error: "timeout" });
    reply = () => ({ status: 400, body: '{"error": "timeout"}' });
    expect(await scanner().scan(FILES)).toEqual({ ok: false, error: "timeout" });
    // The redirect's body is let go, not left open.
    let cancelled = false;
    const watched: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start: (c) => c.enqueue(new TextEncoder().encode("{")),
          cancel: () => {
            cancelled = true;
          },
        }),
        { status: 302 },
      );
    expect(await scanner({ fetch: watched }).scan(FILES)).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(cancelled).toBe(true);
    // A 3xx with a body that never ends: no answer at once, not at the deadline.
    const endless: typeof fetch = async () =>
      new Response(new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode("{")) }), {
        status: 307,
      });
    const started = Date.now();
    expect(await scanner({ fetch: endless }).scan(FILES)).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("leaves no timer behind once a scan is answered", async () => {
    reply = () => ({ status: 200, body: JSON.stringify({ exit: 0, report: report() }) });
    const timers = new Set<unknown>();
    const set = globalThis.setTimeout;
    const clear = globalThis.clearTimeout;
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      const timer = set(...args);
      if ((args[1] ?? 0) >= 30_000) timers.add(timer);
      return timer;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((timer: Parameters<typeof clearTimeout>[0]) => {
      timers.delete(timer);
      clear(timer);
    }) as typeof clearTimeout;
    try {
      expect((await scanner().scan(FILES)).ok).toBe(true);
    } finally {
      globalThis.setTimeout = set;
      globalThis.clearTimeout = clear;
    }
    // The deadline (the scan's timeout plus 30 s) was set, and cleared.
    expect(timers.size).toBe(0);
  });

  it("stops reading an answer past its cap, with or without a length", async () => {
    const huge = `{"exit": 0, "report": "${"x".repeat(17 * 1024 * 1024)}"}`;
    reply = () => ({ status: 200, body: huge });
    expect(await scanner().scan(FILES)).toEqual({ ok: false, error: "unreachable" });
    reply = () => ({ status: 200, body: huge, headers: { "transfer-encoding": "chunked" } });
    expect(await scanner().scan(FILES)).toEqual({ ok: false, error: "unreachable" });
  });

  it("never follows a redirect", async () => {
    reply = (path) =>
      path === "/scan"
        ? { status: 307, body: "", headers: { location: "/elsewhere" } }
        : { status: 200, body: JSON.stringify({ exit: 0, report: report() }) };
    expect(await scanner().scan(FILES)).toEqual({ ok: false, error: "unreachable" });
    expect(seen.map((s) => s.request.url)).toEqual(["/scan"]);
  });

  it("keeps the service's own errors", async () => {
    for (const [status, error, expected] of [
      [504, "timeout", "timeout"],
      [502, "output too large", "output too large"],
      [502, "signal", "signal"],
      [400, "bad file path", "bad file path"],
      [500, "write failed", "write failed"],
      [500, "not found", "not found"],
      [500, "not runnable", "not runnable"],
      [413, "too large", "refused"],
      [400, "bad request", "refused"],
      [500, "internal", "refused"],
      [500, "something new", "refused"],
    ] as const) {
      reply = () => ({ status, body: JSON.stringify({ error }) });
      expect(await scanner().scan(FILES), error).toEqual({ ok: false, error: expected });
    }
  });

  it("stops waiting past the scan's timeout and its grace, wherever the answer stops", async () => {
    // No answer, headers then nothing, and an answer that never ends (one byte at a time).
    for (const answer of ["hang", "stall", "drip"] as const) {
      reply = () => answer;
      const started = Date.now();
      const outcome = await scanner({ timeoutSeconds: 0.3, graceSeconds: 0.2 }).scan(FILES);
      expect(outcome, answer).toEqual({ ok: false, error: "unreachable" });
      expect(Date.now() - started, answer).toBeLessThan(2000);
    }
  });
});

describe("outcomeOf (156)", () => {
  it("reads exits 0 and 1 as reports, others by their code", () => {
    expect(outcomeOf(200, { exit: 0, report: report() }, false).ok).toBe(true);
    expect(outcomeOf(200, { exit: 1, report: report() }, false).ok).toBe(true);
    expect(outcomeOf(200, { exit: 2, report: report() }, false)).toEqual({
      ok: false,
      error: "exit 2",
    });
  });

  it("refuses a 200 that isn't the service's answer, or a report it can't read", () => {
    for (const body of [
      { exit: "0", report: report() },
      { exit: 0.5, report: report() },
      { exit: 0 },
      { exit: 0, report: "not json" },
      { exit: 0, report: `${report()}x` },
    ])
      expect(outcomeOf(200, body, false), JSON.stringify(body)).toEqual({
        ok: false,
        error: "invalid report",
      });
    expect(outcomeOf(200, null, false)).toEqual({ ok: false, error: "unreachable" });
  });
});

describe("serviceHealth (156)", () => {
  it("is ready with the scanner's version, sending the key", async () => {
    reply = () => ({ status: 200, body: '{"scanner": "skillspector", "version": "2.13.2"}' });
    expect(await serviceHealth(base(), "k")).toEqual({ state: "ready", version: "2.13.2" });
    expect(seen[0]?.request.url).toBe("/health");
    expect(seen[0]?.request.headers[SCAN_KEY_HEADER.toLowerCase()]).toBe("k");
  });

  it("is ready without a version when the service has none", async () => {
    reply = () => ({ status: 200, body: '{"scanner": "skillspector", "version": null}' });
    expect(await serviceHealth(base(), null)).toEqual({ state: "ready", version: null });
  });

  it("says the scan key was refused on the proxy's 403", async () => {
    reply = () => ({ status: 403, body: '{"error": "scan key"}' });
    expect(await serviceHealth(base(), "wrong")).toEqual({ state: "scan key refused" });
    reply = () => ({ status: 403, body: '{"error": "not set up"}' });
    expect(await serviceHealth(base(), null)).toEqual({ state: "scan key refused" });
  });

  it("waits three seconds at most by default, in the tab's call too", async () => {
    expect(HEALTH_TIMEOUT_MS).toBe(3000);
    reply = () => ({ status: 200, body: '{"scanner": "skillspector", "version": "2.13.2"}' });
    // The longest timer a call sets: its deadline, which is the only one of seconds to ask for.
    const deadline = async (work: () => Promise<unknown>) => {
      const delays: number[] = [];
      const set = globalThis.setTimeout;
      globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
        if (typeof args[1] === "number" && args[1] >= 1000) delays.push(args[1]);
        return set(...args);
      }) as typeof setTimeout;
      try {
        await work();
      } finally {
        globalThis.setTimeout = set;
      }
      return Math.max(0, ...delays);
    };
    expect(await deadline(() => serviceHealth(base(), null))).toBe(3000);
    expect(
      await deadline(() =>
        scannerServices({
          url: base(),
          semanticUrl: new URL(`http://localhost:${port}/`),
          key: null,
        }),
      ),
    ).toBe(3000);
  });

  it("gives up after its short timeout, wherever the answer stops", async () => {
    for (const answer of ["hang", "stall", "drip"] as const) {
      reply = () => answer;
      const started = Date.now();
      expect(await serviceHealth(base(), null, fetch, 300), answer).toEqual({
        state: "unreachable",
      });
      expect(Date.now() - started, answer).toBeLessThan(2000);
    }
  });

  it("is ready only as the scan service says it, and takes only a version's characters", async () => {
    reply = () => ({
      status: 200,
      body: `{"scanner": "skillspector", "version": "${"9".repeat(33)}"}`,
    });
    expect(await serviceHealth(base(), null)).toEqual({ state: "ready", version: null });
    reply = () => ({ status: 200, body: '{"scanner": "skillspector", "version": "<b>2</b>"}' });
    expect(await serviceHealth(base(), null)).toEqual({ state: "ready", version: null });
    for (const body of ["{}", "[]", '{"scanner": "other", "version": "1"}']) {
      reply = () => ({ status: 200, body });
      expect(await serviceHealth(base(), null), body).toEqual({ state: "unreachable" });
    }
  });

  it("is unreachable otherwise: a 502, a page, an error body, no answer", async () => {
    for (const answer of [
      { status: 502, body: "" },
      { status: 200, body: "<html></html>" },
      { status: 200, body: '{"error": "x"}' },
      { status: 403, body: "Forbidden" },
      "drop" as const,
    ]) {
      reply = () => answer;
      expect(await serviceHealth(base(), null), JSON.stringify(answer)).toEqual({
        state: "unreachable",
      });
    }
  });
});

describe("scannerServices (156)", () => {
  it("asks each service set, static first, and says which are compose's", async () => {
    reply = () => ({ status: 200, body: '{"scanner": "skillspector", "version": "2.13.2"}' });
    const fetcher: typeof fetch = (input, init) => {
      // Compose's names, answered by the local server.
      const url = new URL(String(input));
      url.hostname = "127.0.0.1";
      url.port = String(port);
      return fetch(url, init);
    };
    expect(
      await scannerServices(
        {
          url: new URL("http://proxy:8081/"),
          semanticUrl: new URL("http://scan.example:9/"),
          key: "k",
        },
        fetcher,
      ),
    ).toEqual([
      {
        kind: "static",
        address: "http://proxy:8081",
        compose: true,
        health: { state: "ready", version: "2.13.2" },
      },
      {
        kind: "semantic",
        address: "http://scan.example:9",
        compose: false,
        health: { state: "ready", version: "2.13.2" },
      },
    ]);
    expect(seen.map((s) => s.request.headers[SCAN_KEY_HEADER.toLowerCase()])).toEqual(["k", "k"]);
  });

  it("asks only the static service when no semantic one is set", async () => {
    expect(await scannerServices({ url: base(), semanticUrl: null, key: null })).toHaveLength(1);
  });
});

describe("checkScanService (156, decision 7)", () => {
  const HEALTH = '{"scanner": "skillspector", "version": "2.13.2"}';
  const keyHeader = SCAN_KEY_HEADER.toLowerCase();
  /** The key each request carried, in order. */
  const keysSeen = () => seen.map((s) => s.request.headers[keyHeader]);
  const gate = (right: string): ((path: string) => Reply) => {
    return () => {
      const last = seen.at(-1)?.request.headers[keyHeader];
      return last === right
        ? { status: 200, body: HEALTH }
        : { status: 403, body: '{"error": "scan key"}' };
    };
  };

  it("takes the scan service itself, without ever sending the key", async () => {
    reply = () => ({ status: 200, body: HEALTH });
    expect(await checkScanService(base().href, "the-key")).toEqual({
      ok: true,
      url: base(),
      gated: false,
      version: "2.13.2",
    });
    expect(keysSeen()).toEqual([undefined]);
  });

  it("takes Ronne's proxy that accepts the key, asking first without it", async () => {
    reply = gate("the-key");
    expect(await checkScanService(base().href, "the-key")).toMatchObject({
      ok: true,
      gated: true,
      version: "2.13.2",
    });
    expect(keysSeen()).toEqual([undefined, "the-key"]);
  });

  it("refuses the proxy when its key is wrong, or Ronne has none", async () => {
    reply = gate("another-key");
    expect(await checkScanService(base().href, "the-key")).toEqual({
      ok: false,
      problem: "scan key refused",
    });
    reply = () => ({ status: 403, body: '{"error": "not set up"}' });
    seen = [];
    expect(await checkScanService(base().href, null)).toEqual({
      ok: false,
      problem: "scan key refused",
    });
    // With no key to send, nothing was sent beyond the first question.
    expect(keysSeen()).toEqual([undefined]);
  });

  it("never sends the key to a server that is neither the service nor the proxy", async () => {
    for (const answer of [
      { status: 200, body: "<html>hello</html>" },
      { status: 200, body: '{"scanner": "other"}' },
      { status: 404, body: "" },
      { status: 500, body: '{"error": "scan key"}' },
      { status: 403, body: "Forbidden" },
      { status: 302, body: "", headers: { location: "/elsewhere" } },
    ]) {
      seen = [];
      reply = () => answer;
      const result = await checkScanService(base().href, "the-key");
      expect(result.ok, JSON.stringify(answer)).toBe(false);
      expect(keysSeen(), JSON.stringify(answer)).toEqual([undefined]);
    }
  });

  it("says which problem: not an address, no answer, not the scanner", async () => {
    for (const text of ["", "nope", "ftp://x", `http://u:p@127.0.0.1:${port}/`, `${base()}scan`]) {
      expect(await checkScanService(text, null), text).toEqual({ ok: false, problem: "not a url" });
    }
    reply = () => ({ status: 200, body: "<html></html>" });
    expect(await checkScanService(base().href, null)).toEqual({
      ok: false,
      problem: "not the scanner",
    });
    // A port nothing listens on.
    const closed = new URL("http://127.0.0.1:1/");
    expect(await checkScanService(closed.href, null)).toEqual({
      ok: false,
      problem: "unreachable",
    });
  });

  it("gives up on a server that stalls, with the short timeout", async () => {
    for (const answer of ["hang", "stall", "drip"] as const) {
      reply = () => answer;
      const started = Date.now();
      expect(await checkScanService(base().href, "the-key", fetch, 300), answer).toEqual({
        ok: false,
        problem: "unreachable",
      });
      expect(Date.now() - started, answer).toBeLessThan(2000);
    }
  });
});

describe("the scan key per address (156)", () => {
  it("sends the semantic address its own key, and none when it has none", async () => {
    const keyOf = () => seen.at(-1)?.request.headers[SCAN_KEY_HEADER.toLowerCase()];
    reply = () => ({ status: 200, body: JSON.stringify({ exit: 0, report: report() }) });
    const both = scanner({
      semanticUrl: new URL(`http://localhost:${port}/`),
      provider: PROVIDER,
      key: "static-key",
      semanticKey: "semantic-key",
    });
    await both.scan(FILES);
    expect(keyOf()).toBe("static-key");
    await both.scan(FILES, { semantic: true });
    expect(keyOf()).toBe("semantic-key");
    const noSemanticKey = scanner({
      semanticUrl: new URL(`http://localhost:${port}/`),
      provider: PROVIDER,
      key: "static-key",
      semanticKey: null,
    });
    await noSemanticKey.scan(FILES, { semantic: true });
    expect(keyOf()).toBeUndefined();
    // Without a separate semantic key, the static one is used for both (the operator's setup).
    const shared = scanner({
      semanticUrl: new URL(`http://localhost:${port}/`),
      provider: PROVIDER,
      key: "static-key",
    });
    await shared.scan(FILES, { semantic: true });
    expect(keyOf()).toBe("static-key");
  });
});
