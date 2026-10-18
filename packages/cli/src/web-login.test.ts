import { readFileSync, statSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "./cli.js";
import { configPath } from "./config.js";
import { openCommand, waitFor } from "./io.js";
import { type FakeIo, fakeIo, identityRoutes, REGISTRY, type RouteAnswer } from "./testing.js";
import { canOpenBrowser } from "./web-login.js";

const posix = process.platform !== "win32";
const TOKEN = "rmk_from_the_browser";

let io: FakeIo;
afterEach(() => io?.cleanup());

const rmk = (...argv: string[]) => run(argv, io);

const CODE = {
  device_code: "dev-code",
  user_code: "WDJB-MJHT",
  verification_uri: `${REGISTRY}/device`,
  verification_uri_complete: `${REGISTRY}/device?user_code=WDJB-MJHT`,
  expires_in: 600,
  interval: 5,
};

const error = (code: string, message = code, details?: Record<string, unknown>): RouteAnswer => ({
  status: code === "rate_limited" ? 429 : 400,
  json: { error: { code, message, ...(details ? { details } : {}) } },
});
const granted: RouteAnswer = {
  json: { token: TOKEN, id: "t9", name: "rmk on laptop", expiresAt: "2027-01-15T00:00:00.000Z" },
};

/** A registry whose device flow answers each poll with the next of `polls`. */
const deviceIo = (
  polls: RouteAnswer[],
  options: Parameters<typeof fakeIo>[1] & { password?: RouteAnswer } = {},
) => {
  const routes = identityRoutes(TOKEN);
  return fakeIo(
    {
      ...routes,
      ...(options.password ? { "POST /auth/token": () => options.password as RouteAnswer } : {}),
      "POST /auth/device/code": () => ({ json: CODE }),
      "POST /auth/device/token": () => polls.shift() ?? error("expired_token"),
    },
    { env: { HOSTNAME: "laptop", DISPLAY: ":0" }, ...options },
  );
};

const polled = () => io.requests.filter((r) => r.path === "/api/v1/auth/device/token");

describe("rmk login --web", () => {
  it("prints the address and the code, opens the browser, waits, and saves the token", async () => {
    io = deviceIo([error("authorization_pending"), granted]);
    const result = await rmk("login", "--registry", REGISTRY, "--web");
    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).toContain(`Logged in to ${REGISTRY} as dev@example.com.`);
    expect(io.notices).toEqual(
      expect.arrayContaining([
        `To sign in, open  ${REGISTRY}/device`,
        "and enter the code  WDJB-MJHT   (it expires in 10 minutes)",
      ]),
    );
    expect(io.opened).toEqual([`${REGISTRY}/device?user_code=WDJB-MJHT`]);
    expect(io.requests.find((r) => r.path === "/api/v1/auth/device/code")?.body).toEqual({
      client_id: "rmk",
      name: "rmk on laptop",
    });
    expect(polled().map((r) => r.body)).toEqual([
      {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: "dev-code",
        client_id: "rmk",
      },
      expect.anything(),
    ]);
    expect(io.slept).toEqual([5000, 5000]);
    const saved = JSON.parse(readFileSync(configPath(io), "utf8"));
    expect(saved.registries[REGISTRY]).toEqual({ token: TOKEN, email: "dev@example.com" });
    if (posix) expect(statSync(configPath(io)).mode & 0o777).toBe(0o600);
  });

  it("takes --name, and doesn't open a browser with --no-browser, over SSH or without a display", async () => {
    io = deviceIo([granted]);
    await rmk("login", "--registry", REGISTRY, "--web", "--no-browser", "--name", "ci box");
    expect(io.opened).toEqual([]);
    expect(io.requests.find((r) => r.path === "/api/v1/auth/device/code")?.body).toMatchObject({
      name: "ci box",
    });
    expect(canOpenBrowser({ SSH_CONNECTION: "1 2 3 4" }, "darwin")).toBe(false);
    expect(canOpenBrowser({}, "linux")).toBe(false);
    expect(canOpenBrowser({ WAYLAND_DISPLAY: "wayland-0" }, "linux")).toBe(true);
    expect(canOpenBrowser({}, "darwin")).toBe(true);
    expect(canOpenBrowser({}, "win32")).toBe(true);
  });

  it("waits 5 seconds longer after each slow_down, and as long as the registry asks after a 429", async () => {
    io = deviceIo([
      error("slow_down"),
      error("slow_down"),
      error("rate_limited", "Polling too fast", { retryAfterSeconds: 60 }),
      granted,
    ]);
    expect(await rmk("login", "--registry", REGISTRY, "--web")).toMatchObject({ exitCode: 0 });
    expect(io.slept).toEqual([5000, 10000, 15000, 60000]);
  });

  it("waits a 429's time once, then goes back to the interval", async () => {
    io = deviceIo([
      error("slow_down"),
      error("rate_limited", "Polling too fast", { retryAfterSeconds: 60 }),
      error("authorization_pending"),
      granted,
    ]);
    expect(await rmk("login", "--registry", REGISTRY, "--web")).toMatchObject({ exitCode: 0 });
    expect(io.slept).toEqual([5000, 10000, 60000, 10000]);
  });

  it("polls every 5 seconds when the registry gives no interval", async () => {
    const routes = identityRoutes(TOKEN);
    const { interval: _none, ...withoutInterval } = CODE;
    io = fakeIo(
      {
        ...routes,
        "POST /auth/device/code": () => ({ json: withoutInterval }),
        "POST /auth/device/token": () => granted,
      },
      { env: { HOSTNAME: "laptop" } },
    );
    expect(await rmk("login", "--registry", REGISTRY, "--web")).toMatchObject({ exitCode: 0 });
    expect(io.slept).toEqual([5000]);
  });

  it("works without a terminal: someone else can approve the code", async () => {
    io = deviceIo([granted], { interactive: false });
    expect(await rmk("login", "--registry", REGISTRY, "--web")).toMatchObject({ exitCode: 0 });
    expect(io.questions).toEqual([]);
  });

  it.each([
    ["access_denied", "denied in the browser"],
    ["expired_token", "expired before it was approved"],
    ["invalid_grant", "no longer knows this code"],
    ["user_disabled", "account is disabled"],
  ])("stops on %s and says why", async (code, says) => {
    io = deviceIo([error("authorization_pending"), error(code)]);
    const result = await rmk("login", "--registry", REGISTRY, "--web");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(says);
    expect(() => readFileSync(configPath(io))).toThrow();
  });

  it("passes the registry's message on for the token limit", async () => {
    io = deviceIo([error("token_limit", "You have 50 active tokens, the most allowed.")]);
    const result = await rmk("login", "--registry", REGISTRY, "--web", "--json");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: "token_limit", message: "You have 50 active tokens, the most allowed." },
    });
  });

  it("stops at its own deadline, counted from when it got the code", async () => {
    let clock = Date.parse("2026-10-17T12:00:00Z");
    const pending = Array.from({ length: 500 }, () => error("authorization_pending"));
    io = deviceIo(pending, {
      onSleep: (fake) => {
        clock += fake.slept.at(-1) ?? 0;
      },
    });
    io.now = () => new Date(clock);
    const result = await rmk("login", "--registry", REGISTRY, "--web");
    expect(result.stderr).toContain("expired before it was approved");
    expect(polled()).toHaveLength(119);
  });

  it("saves nothing when Ctrl-C comes while the last poll is out, even if it brings the token", async () => {
    io = fakeIo(
      {
        ...identityRoutes(TOKEN),
        "POST /auth/device/code": () => ({ json: CODE }),
        "POST /auth/device/token": () => {
          io.interrupt();
          return granted;
        },
      },
      { env: { HOSTNAME: "laptop" } },
    );
    const result = await rmk("login", "--registry", REGISTRY, "--web");
    expect(result).toMatchObject({ exitCode: 1, stderr: "Stopped. Nothing was saved.\n" });
    expect(() => readFileSync(configPath(io))).toThrow();
  });

  it("stops on Ctrl-C and saves nothing", async () => {
    io = deviceIo([error("authorization_pending"), error("authorization_pending"), granted], {
      onSleep: (fake) => {
        if (fake.slept.length === 2) fake.interrupt();
      },
    });
    const result = await rmk("login", "--registry", REGISTRY, "--web");
    expect(result).toMatchObject({ exitCode: 1, stderr: "Stopped. Nothing was saved.\n" });
    expect(polled()).toHaveLength(1);
    expect(() => readFileSync(configPath(io))).toThrow();
  });
});

describe("waiting", () => {
  it("leaves no timer behind after Ctrl-C, so the process exits at once", async () => {
    vi.useFakeTimers();
    try {
      const interrupt = new AbortController();
      const waiting = waitFor(60_000, interrupt.signal);
      expect(vi.getTimerCount()).toBe(1);
      interrupt.abort();
      await waiting;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives every wait the signal that Ctrl-C aborts", async () => {
    io = deviceIo([error("authorization_pending"), granted]);
    await rmk("login", "--registry", REGISTRY, "--web");
    expect(io.sleepSignals).toHaveLength(2);
    expect(io.sleepSignals.every((signal) => signal instanceof AbortSignal)).toBe(true);

    io.cleanup();
    io = deviceIo([error("authorization_pending"), granted], {
      onSleep: (fake) => fake.interrupt(),
    });
    await rmk("login", "--registry", REGISTRY, "--web");
    expect(io.sleepSignals[0]?.aborted).toBe(true);
  });

  it("ends at once on Ctrl-C, and clears its timer so the process can exit", async () => {
    const interrupt = new AbortController();
    const started = Date.now();
    setTimeout(() => interrupt.abort(), 20);
    await waitFor(60_000, interrupt.signal);
    expect(Date.now() - started).toBeLessThan(1000);
    const before = Date.now();
    await waitFor(10, new AbortController().signal);
    expect(Date.now() - before).toBeGreaterThanOrEqual(5);
  });
});

describe("opening the browser", () => {
  it("uses the platform's own command, with no new dependency", () => {
    const url = `${REGISTRY}/device?user_code=WDJB-MJHT&x=1`;
    expect(openCommand("darwin", url)).toEqual({ command: "open", args: [url] });
    expect(openCommand("linux", url)).toEqual({ command: "xdg-open", args: [url] });
    expect(openCommand("win32", url)).toEqual({
      command: "rundll32",
      args: ["url.dll,FileProtocolHandler", url],
    });
  });
});

describe("rmk login, falling back to the browser", () => {
  it.each([
    ["two_factor_required", "uses two-factor sign-in"],
    ["password_sign_in_disabled", "company's identity provider"],
  ])("goes on in the browser after one Enter when the registry answers %s", async (code, says) => {
    io = deviceIo([granted], {
      password: { status: 401, json: { error: { code, message: code } } },
    });
    io.answers.push("ana@example.com", "correct horse", "");
    const result = await rmk("login", "--registry", REGISTRY);
    expect(result).toMatchObject({ exitCode: 0 });
    expect(io.notices[0]).toContain(says);
    expect(io.questions).toEqual([
      "Email: ",
      "Password: ",
      "Press Enter to sign in in the browser instead (Ctrl-C to stop) ",
    ]);
    expect(result.stdout).toContain("as dev@example.com.");
  });

  it("doesn't ask with --yes", async () => {
    io = deviceIo([granted], {
      password: { status: 401, json: { error: { code: "two_factor_required", message: "2fa" } } },
    });
    io.answers.push("ana@example.com", "correct horse");
    expect(await rmk("login", "--registry", REGISTRY, "--yes")).toMatchObject({ exitCode: 0 });
    expect(io.questions).toEqual(["Email: ", "Password: "]);
  });

  it("adds the company sign-in hint to a wrong password", async () => {
    io = deviceIo([]);
    io.answers.push("ana@example.com", "wrong");
    const result = await rmk("login", "--registry", REGISTRY);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      "Email or password is wrong. Signed up with your company? Use rmk login --web.\n",
    );
    expect(polled()).toEqual([]);
  });

  it("points at --web when there's no terminal for a password", async () => {
    io = deviceIo([], { interactive: false });
    expect((await rmk("login", "--registry", REGISTRY)).stderr).toContain("rmk login --web");
  });
});
