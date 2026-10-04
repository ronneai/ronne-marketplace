import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultDataPath,
  defaultPublicUrl,
  runtimeOf,
  scriptCommand,
  setupCommand,
} from "./runtime";

describe("runtime (082)", () => {
  it("reads RONNE_RUNTIME, and anything else is a clone", () => {
    expect(runtimeOf({ RONNE_RUNTIME: "docker" })).toBe("docker");
    expect(runtimeOf({ RONNE_RUNTIME: "npm" })).toBe("npm");
    expect(runtimeOf({ RONNE_RUNTIME: "other" })).toBe("node");
    expect(runtimeOf({})).toBe("node");
  });

  it("puts the npm package's data files in its data folder, and keeps ./data elsewhere", () => {
    const dir = join("/home", "me", ".local", "share", "rmk-server");
    expect(defaultDataPath("ronne.db", { RONNE_RUNTIME: "npm", RONNE_DATA_DIR: dir })).toBe(
      join(dir, "ronne.db"),
    );
    expect(defaultDataPath("storage", { RONNE_RUNTIME: "npm" })).toBe("./data/storage");
    expect(
      defaultDataPath("ronne.db", { RONNE_RUNTIME: "docker", RONNE_DATA_DIR: "/app/data" }),
    ).toBe("./data/ronne.db");
    expect(defaultDataPath("ronne.db", {})).toBe("./data/ronne.db");
  });

  it("suggests this machine on the server's port", () => {
    expect(defaultPublicUrl({ PORT: "7650" })).toBe("http://localhost:7650");
    expect(defaultPublicUrl({})).toBe("http://localhost:3000");
  });

  it("names a script's command: rmk-server for npm, pnpm run elsewhere", () => {
    expect(scriptCommand("migrate", { RONNE_RUNTIME: "npm" })).toBe("rmk-server migrate");
    expect(scriptCommand("migrate", { RONNE_RUNTIME: "docker" })).toBe("pnpm run migrate");
    expect(scriptCommand("reset-root-password", {})).toBe("pnpm run reset-root-password");
  });

  it("names the setup command for each runtime", () => {
    expect(setupCommand({ RONNE_RUNTIME: "docker" })).toBe(
      "docker compose exec web pnpm run setup",
    );
    expect(setupCommand({ RONNE_RUNTIME: "npm" })).toBe("rmk-server setup");
    expect(setupCommand({})).toBe("pnpm run setup");
  });
});
