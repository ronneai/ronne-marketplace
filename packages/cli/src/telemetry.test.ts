import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { readUserConfig, writeUserConfig } from "./config.js";
import {
  flushUsage,
  queuedUsage,
  queueUsage,
  refreshPolicy,
  reportingTo,
  type UsageLine,
  type UsagePolicy,
  usageNotice,
} from "./telemetry.js";
import { type FakeIo, fakeIo, identityRoutes, REGISTRY, type Route } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());

const TOKEN = "rmk_test_token";
const NOW = new Date("2026-10-05T12:00:00.000Z");

/** A registry with a usage policy; `posts` collects every report it accepts. */
const registry = (
  policy: UsagePolicy | "missing",
  options: { post?: Route; env?: Record<string, string> } = {},
) => {
  const posts: unknown[] = [];
  io?.cleanup();
  io = fakeIo(
    {
      ...identityRoutes(TOKEN),
      ...(policy === "missing"
        ? {}
        : { "GET /usage": () => ({ json: { policy, retentionDays: 90 } }) }),
      "POST /usage":
        options.post ??
        (({ body }) => {
          posts.push(body);
          return { status: 202, json: { accepted: 1, ignored: 0 } };
        }),
    },
    { env: options.env },
  );
  io.now = () => NOW;
  writeUserConfig(io, {
    version: 1,
    defaultRegistry: REGISTRY,
    registries: { [REGISTRY]: { token: TOKEN, email: "dev@example.com" } },
  });
  return posts;
};

const line = (extra: Partial<UsageLine> = {}): UsageLine => ({
  day: "2026-10-05",
  item: "@team/secure",
  version: "1.0.0",
  tool: "claude-code",
  event: "install",
  count: 1,
  ...extra,
});

const learn = () => refreshPolicy(io, REGISTRY, TOKEN, { force: true });
const queueDir = () => join(io.home, ".cache", "rmk", "usage");
const queueFiles = () =>
  existsSync(queueDir()) ? readdirSync(queueDir()).filter((f) => f.endsWith(".jsonl")) : [];

describe("whether rmk reports", () => {
  it("never while the policy is unknown or off", async () => {
    registry("off");
    expect(reportingTo(io, REGISTRY)).toMatchObject({ enabled: false, reason: "policy unknown" });
    await learn();
    expect(reportingTo(io, REGISTRY)).toEqual({
      enabled: false,
      policy: "off",
      reason: "policy off",
    });
    queueUsage(io, REGISTRY, [line()]);
    expect(queueFiles()).toEqual([]);
  });

  it("treats a registry without the usage endpoint as off", async () => {
    registry("missing");
    expect(await learn()).toBe("off");
  });

  it("by default where people choose, until they turn it off or set RMK_TELEMETRY=0", async () => {
    registry("choice");
    await learn();
    expect(reportingTo(io, REGISTRY)).toMatchObject({ enabled: true, reason: "on by default" });
    io.env.RMK_TELEMETRY = "0";
    expect(reportingTo(io, REGISTRY)).toMatchObject({ enabled: false, reason: "RMK_TELEMETRY=0" });
    delete io.env.RMK_TELEMETRY;
    await run(["telemetry", "off"], io);
    expect(readUserConfig(io).telemetry?.enabled).toBe(false);
    expect(reportingTo(io, REGISTRY)).toMatchObject({
      enabled: false,
      reason: "you turned it off",
    });
    await run(["telemetry", "on"], io);
    expect(reportingTo(io, REGISTRY)).toMatchObject({ enabled: true });
  });

  it("always where it's required, whatever the person or the environment says", async () => {
    registry("required", { env: { RMK_TELEMETRY: "0", DO_NOT_TRACK: "1", CI: "true" } });
    await learn();
    const off = await run(["telemetry", "off"], io);
    expect(off.stdout).toContain(
      `${REGISTRY} requires usage reporting, so rmk keeps reporting to it.`,
    );
    expect(reportingTo(io, REGISTRY)).toEqual({
      enabled: true,
      policy: "required",
      reason: "required",
    });
  });

  it("asks for the policy at most once a day, and keeps the last answer offline", async () => {
    registry("choice");
    await refreshPolicy(io, REGISTRY, TOKEN);
    await refreshPolicy(io, REGISTRY, TOKEN);
    expect(io.requests.filter((r) => r.path === "/api/v1/usage")).toHaveLength(1);
    io.now = () => new Date(NOW.getTime() + 86_400_001);
    io.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await refreshPolicy(io, REGISTRY, TOKEN)).toBe("choice");
  });
});

describe("the notice", () => {
  it("is printed once per registry and policy, and again when the policy changes", async () => {
    registry("choice");
    await learn();
    expect(usageNotice(io, REGISTRY)).toBe(
      `rmk reports usage counts (installs and runs of the items it installed) to ${REGISTRY}. To stop: rmk telemetry off. What's sent: ${REGISTRY}/docs/usage`,
    );
    expect(usageNotice(io, REGISTRY)).toBeNull();
    io.fetch = fakeIo({ "GET /usage": () => ({ json: { policy: "required" } }) }).fetch;
    await learn();
    expect(usageNotice(io, REGISTRY)).toBe(
      `${REGISTRY} requires usage reporting: rmk sends counts of installs and runs of the items it installed. What's sent: ${REGISTRY}/docs/usage`,
    );
  });

  it("is printed at login, and not at all where usage is off", async () => {
    registry("choice");
    io.answers.push("dev@example.com", "correct horse");
    expect((await run(["login", "--registry", REGISTRY], io)).stdout).toContain(
      "To stop: rmk telemetry off.",
    );
    registry("off");
    io.answers.push("dev@example.com", "correct horse");
    expect((await run(["login", "--registry", REGISTRY], io)).stdout).not.toContain("usage");
  });
});

describe("the queue", () => {
  it("sums lines per row, drops lines over 3 days old, and keeps the newest 1 MB", async () => {
    registry("choice");
    await learn();
    queueUsage(io, REGISTRY, [line(), line({ count: 2 }), line({ day: "2026-10-01" })]);
    queueUsage(io, REGISTRY, [line({ event: "run", trigger: "model", outcome: "success" })]);
    expect(queuedUsage(io)).toEqual([
      {
        registry: REGISTRY,
        events: [line({ count: 3 }), line({ event: "run", trigger: "model", outcome: "success" })],
      },
    ]);
    // Over 1 MB of old lines, then one new one: only the newest survive.
    const file = join(queueDir(), queueFiles()[0] ?? "");
    const filler = `${JSON.stringify(line({ item: "@team/old" }))}\n`.repeat(20_000);
    appendFileSync(file, filler);
    appendFileSync(file, `${JSON.stringify(line({ item: "@team/new" }))}\n`);
    const items = queuedUsage(io)[0]?.events.map((e) => e.item);
    expect(items).toContain("@team/new");
    expect(items).not.toContain("@team/secure");
  });

  it("is sent at the end of a command, and preview prints exactly what would be sent", async () => {
    const posts = registry("choice");
    await learn();
    queueUsage(io, REGISTRY, [line()]);
    const preview = await run(["telemetry", "preview"], io);
    expect(preview.stdout).toBe(
      `POST ${REGISTRY}/api/v1/usage\n${JSON.stringify({ events: [line()] }, null, 2)}\n`,
    );
    expect(posts).toEqual([]);
    await run(["whoami"], io);
    expect(posts).toEqual([{ events: [line()] }]);
    expect(queuedUsage(io)).toEqual([]);
  });

  it("keeps what couldn't be sent: offline, or a revoked token", async () => {
    registry("choice", {
      post: () => ({
        status: 401,
        json: { error: { code: "token_invalid", message: "The access token isn't valid." } },
      }),
    });
    await learn();
    queueUsage(io, REGISTRY, [line()]);
    expect(await flushUsage(io)).toMatchObject([{ outcome: "kept", kept: 1 }]);
    io.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await flushUsage(io)).toMatchObject([{ outcome: "kept", kept: 1 }]);
    expect(queuedUsage(io)[0]?.events).toEqual([line()]);
  });

  it("is dropped, and the policy learned, when the registry answers usage_disabled", async () => {
    registry("choice", {
      post: () => ({
        status: 403,
        json: {
          error: { code: "usage_disabled", message: "This instance doesn't collect usage." },
        },
      }),
    });
    await learn();
    queueUsage(io, REGISTRY, [line()]);
    expect(await flushUsage(io)).toMatchObject([{ outcome: "dropped" }]);
    expect(queueFiles()).toEqual([]);
    expect(reportingTo(io, REGISTRY).policy).toBe("off");
  });

  it("is deleted by rmk telemetry off where people choose", async () => {
    registry("choice");
    await learn();
    queueUsage(io, REGISTRY, [line()]);
    await run(["telemetry", "off"], io);
    expect(queueFiles()).toEqual([]);
  });

  it("never holds anything but the event fields", async () => {
    registry("choice");
    await learn();
    queueUsage(io, REGISTRY, [line({ event: "run", trigger: "user", outcome: "error" })]);
    const stored = readFileSync(join(queueDir(), queueFiles()[0] ?? ""), "utf8");
    expect(Object.keys(JSON.parse(stored.trim())).sort()).toEqual(
      ["count", "day", "event", "item", "outcome", "tool", "trigger", "version"].sort(),
    );
  });
});

describe("rmk telemetry status", () => {
  it("says, per registry, the policy, whether rmk reports and why", async () => {
    registry("choice");
    const result = await run(["telemetry", "status", "--json"], io);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      registries: [
        {
          registry: REGISTRY,
          policy: "choice",
          reporting: true,
          reason: "on by default",
          queued: 0,
        },
      ],
    });
    expect((await run(["telemetry"], io)).stdout).toContain(
      `${REGISTRY}: reporting (policy: people choose;`,
    );
    expect(await run(["telemetry", "maybe"], io)).toMatchObject({ exitCode: 2 });
  });
});
