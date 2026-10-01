import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import type { UsagePolicy } from "./telemetry.js";
import { buildRegistry, type FakeIo, fakeIo, REGISTRY } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());
const rmk = (...argv: string[]) => run(argv, io);
const NOW = new Date("2026-10-05T12:00:00.000Z");

/** A registry with buildRegistry's items and a usage policy; returns the reports it received. */
const start = async (initial: UsagePolicy) => {
  const { routes } = await buildRegistry();
  const registry = { policy: initial };
  const reports: { events: Record<string, unknown>[] }[] = [];
  io = fakeIo({
    ...routes,
    "GET /usage": () => ({ json: { policy: registry.policy, retentionDays: 90 } }),
    "POST /usage": ({ body }) => {
      reports.push(body as (typeof reports)[number]);
      return { status: 202, json: { accepted: 1, ignored: 0 } };
    },
  });
  io.now = () => NOW;
  const login = await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
  mkdirSync(join(io.cwd, ".claude"));
  return { reports, login, registry };
};

const line = (item: string, version: string, event: string) => ({
  day: "2026-10-05",
  item,
  version,
  tool: "claude-code",
  event,
  count: 1,
});

describe("usage from installs (046)", () => {
  it("reports each item installed, updated and removed, once per tool, at the end of the command", async () => {
    const { reports, login } = await start("choice");
    expect(login.stdout).toContain("To stop: rmk telemetry off.");

    expect((await rmk("install", "@team/secure@^1.0.0")).exitCode).toBe(0);
    expect(reports.pop()?.events).toEqual([
      line("@team/gh", "1.2.0", "install"),
      line("@team/secure", "1.1.0", "install"),
    ]);

    // Pinned back to 1.0.0 in the lockfile, as a teammate's older lock would be: an install that
    // writes what's locked already reports nothing new.
    const lock = JSON.parse(readFileSync(join(io.cwd, "rmk.lock"), "utf8"));
    lock.items["@team/secure"].version = "1.0.0";
    lock.items["@team/secure"].sha256 = (await buildRegistry()).packed["@team/secure@1.0.0"].sha256;
    writeFileSync(join(io.cwd, "rmk.lock"), JSON.stringify(lock));
    expect((await rmk("install")).exitCode).toBe(0);
    expect(reports).toEqual([]);

    expect((await rmk("update", "@team/secure")).exitCode).toBe(0);
    expect(reports.pop()?.events).toEqual([line("@team/secure", "1.1.0", "install")]);

    expect((await rmk("remove", "@team/secure")).exitCode).toBe(0);
    expect(reports.pop()?.events).toEqual([
      line("@team/gh", "1.2.0", "remove"),
      line("@team/secure", "1.1.0", "remove"),
    ]);
  });

  it("reports nothing, and says nothing about it, where usage is off", async () => {
    const { reports, login } = await start("off");
    expect(login.stdout).not.toContain("usage");
    const install = await rmk("install", "@team/secure");
    expect(install.exitCode).toBe(0);
    expect(install.stdout).not.toContain("usage");
    expect(reports).toEqual([]);
    expect(io.requests.some((r) => r.method === "POST" && r.path === "/api/v1/usage")).toBe(false);
  });

  it("prints the notice with the first install after root turns usage on", async () => {
    const { reports, login, registry } = await start("off");
    expect(login.stdout).not.toContain("usage");
    registry.policy = "required";
    // rmk checks the policy at most daily: the next day's install learns it.
    io.now = () => new Date(NOW.getTime() + 86_400_001);
    const install = await rmk("install", "@team/secure");
    expect(install.stdout).toContain(
      `Note: ${REGISTRY} requires usage reporting: rmk sends counts of installs and runs`,
    );
    expect(reports).toHaveLength(1);
    expect((await rmk("remove", "@team/secure")).stdout).not.toContain("requires usage reporting");
  });
});
