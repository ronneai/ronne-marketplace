import { chmodSync, existsSync, readFileSync, statSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { configPath } from "./config.js";
import { type FakeIo, fakeIo, identityRoutes, REGISTRY } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());

const rmk = (...argv: string[]) => run(argv, io);
const config = () => JSON.parse(readFileSync(configPath(io), "utf8"));

describe("rmk basics", () => {
  it("prints the version and usage (help with exit 0), and refuses unknown commands and options with exit 2", async () => {
    io = fakeIo({});
    expect((await rmk("--version")).stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect(await rmk()).toMatchObject({ exitCode: 2 });
    expect((await rmk()).stdout).toContain("Usage: rmk");
    expect(await rmk("--help")).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("Usage: rmk"),
    });
    expect(await rmk("fly")).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("`fly`"),
    });
    expect(await rmk("--nope")).toMatchObject({ exitCode: 2 });
    const json = await rmk("fly", "--json");
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, error: { code: "usage" } });
    expect(json.stderr).toBe("");
  });
});

describe("rmk login", () => {
  it("asks for the email and password, stores the token with mode 0600, and makes the registry the default", async () => {
    io = fakeIo(identityRoutes("rmk_secret"));
    io.answers.push("dev@example.com", "correct horse");
    const result = await rmk("login", "--registry", `${REGISTRY}/`);
    expect(result).toEqual({
      exitCode: 0,
      stdout: `Logged in to ${REGISTRY} as dev@example.com.\n`,
      stderr: "",
    });
    expect(io.requests[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/auth/token",
      body: {
        email: "dev@example.com",
        password: "correct horse",
        name: expect.stringContaining("rmk on "),
      },
    });
    expect(io.requests[0]?.headers["user-agent"]).toMatch(/^rmk\//);
    expect(config()).toEqual({
      defaultRegistry: REGISTRY,
      registries: { [REGISTRY]: { email: "dev@example.com", token: "rmk_secret" } },
      version: 1,
    });
    expect(statSync(configPath(io)).mode & 0o777).toBe(0o600);
  });

  it("takes a token made in the web app, after checking it", async () => {
    io = fakeIo(identityRoutes("rmk_web"));
    expect(
      await rmk("login", "--registry", REGISTRY, "--token", "rmk_web", "--json"),
    ).toMatchObject({ exitCode: 0 });
    expect(config().registries[REGISTRY]).toEqual({ email: "dev@example.com", token: "rmk_web" });
    const wrong = await rmk("login", "--registry", REGISTRY, "--token", "rmk_nope");
    expect(wrong).toMatchObject({ exitCode: 1, stderr: "The access token isn't valid.\n" });
  });

  it("says when the password is wrong, and refuses to ask without a terminal", async () => {
    io = fakeIo(identityRoutes());
    io.answers.push("dev@example.com", "wrong");
    expect(await rmk("login", "--registry", REGISTRY)).toMatchObject({
      exitCode: 1,
      stderr: "Email or password is wrong.\n",
    });
    expect(existsSync(configPath(io))).toBe(false);
    io.interactive = false;
    expect(await rmk("login", "--registry", REGISTRY)).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("--token"),
    });
  });

  it("refuses http registries except localhost, unless --insecure", async () => {
    io = fakeIo(identityRoutes());
    expect(await rmk("login", "--registry", "http://ronne.example", "--token", "x")).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("--insecure"),
    });
    io = fakeIo(identityRoutes("x"));
    expect(await rmk("login", "--registry", "http://localhost:3000", "--token", "x")).toMatchObject(
      { exitCode: 0 },
    );
    expect(
      await rmk("login", "--registry", "http://ronne.example", "--token", "x", "--insecure"),
    ).toMatchObject({ exitCode: 0 });
    expect(await rmk("login", "--registry", "not a url", "--token", "x")).toMatchObject({
      exitCode: 2,
    });
  });
});

describe("rmk whoami and logout", () => {
  it("uses the stored token, or RMK_TOKEN and RMK_REGISTRY over it", async () => {
    io = fakeIo(identityRoutes("rmk_stored"));
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_stored");
    expect((await rmk("whoami")).stdout).toBe(
      `Dev <dev@example.com> (user) at ${REGISTRY}, with the token "rmk on laptop".\n`,
    );
    const json = JSON.parse((await rmk("whoami", "--json")).stdout);
    expect(json).toMatchObject({
      ok: true,
      registry: REGISTRY,
      user: { email: "dev@example.com" },
    });
    io.env.RMK_TOKEN = "rmk_env";
    expect(await rmk("whoami")).toMatchObject({
      exitCode: 1,
      stderr: "The access token isn't valid.\n",
    });
    expect(io.requests.at(-1)?.headers.authorization).toBe("Bearer rmk_env");
  });

  it("needs a login first, and refuses a config other users can read", async () => {
    io = fakeIo(identityRoutes());
    expect(await rmk("whoami")).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("rmk login"),
    });
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
    chmodSync(configPath(io), 0o644);
    expect(await rmk("whoami")).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("chmod 600"),
    });
  });

  it("revokes the token on the server and removes it locally, even when the server can't be reached", async () => {
    io = fakeIo(identityRoutes("rmk_a"));
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_a");
    expect((await rmk("logout")).stdout).toBe(`Logged out of ${REGISTRY}.\n`);
    expect(io.requests.at(-1)).toMatchObject({ method: "DELETE", path: "/api/v1/auth/token" });
    expect(config()).toEqual({ registries: {}, version: 1 });
    expect(await rmk("whoami")).toMatchObject({ exitCode: 2 });

    io = fakeIo({
      ...identityRoutes("rmk_b"),
      "DELETE /auth/token": () => {
        throw new TypeError("fetch failed");
      },
    });
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_b");
    const offline = await rmk("logout");
    expect(offline.exitCode).toBe(0);
    expect(offline.stdout).toContain("removed here anyway");
    expect(config().registries).toEqual({});
  });
});
