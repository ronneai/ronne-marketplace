import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { type FakeIo, fakeIo, identityRoutes, REGISTRY } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());

const rmk = (...argv: string[]) => run(argv, io);

describe("rmk auth headers (077)", () => {
  it("prints only the Authorization header as JSON, for the saved token", async () => {
    io = fakeIo(identityRoutes("rmk_saved"));
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_saved");
    const requests = io.requests.length;
    expect(await rmk("auth", "headers", "--registry", REGISTRY)).toEqual({
      exitCode: 0,
      stdout: '{"Authorization":"Bearer rmk_saved"}\n',
      stderr: "",
    });
    // No request: it answers from the saved token, fast.
    expect(io.requests.length).toBe(requests);
    // The default registry when none is named.
    expect((await rmk("auth", "headers")).stdout).toBe('{"Authorization":"Bearer rmk_saved"}\n');
  });

  it("uses RMK_TOKEN over the saved token", async () => {
    io = fakeIo(identityRoutes("rmk_saved"));
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_saved");
    io.env.RMK_TOKEN = "rmk_env";
    expect((await rmk("auth", "headers")).stdout).toBe('{"Authorization":"Bearer rmk_env"}\n');
  });

  it("ignores the project's registry: Claude Code runs it from ~/.claude", async () => {
    io = fakeIo(identityRoutes("rmk_saved"));
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_saved");
    writeFileSync(
      join(io.cwd, "rmk.config.json"),
      JSON.stringify({ version: 1, registry: "https://other.example", dependencies: {} }),
    );
    expect((await rmk("auth", "headers")).stdout).toBe('{"Authorization":"Bearer rmk_saved"}\n');
  });

  it("exits 1 without a token, with the reason on stderr and nothing on stdout", async () => {
    io = fakeIo(identityRoutes());
    const result = await rmk("auth", "headers", "--registry", REGISTRY);
    expect(result).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: `You're not logged in to ${REGISTRY}. Run \`rmk login\`.\n`,
    });
  });

  it("refuses anything but `headers`", async () => {
    io = fakeIo(identityRoutes());
    expect(await rmk("auth")).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("rmk auth headers"),
    });
    expect(await rmk("auth", "token")).toMatchObject({ exitCode: 2 });
  });
});
