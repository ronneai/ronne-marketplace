import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultDataPath,
  defaultPublicUrl,
  hostCommand,
  restartHint,
  runtimeOf,
  scriptCommand,
  setupCommand,
  updatePlans,
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

  it("names a command typed on the host for each runtime (#147)", () => {
    expect(hostCommand("reset-root-password", { RONNE_RUNTIME: "npm" })).toBe(
      "rmk-server reset-root-password",
    );
    expect(hostCommand("reset-root-password", { RONNE_RUNTIME: "docker" })).toBe(
      "docker compose exec web pnpm run reset-root-password",
    );
    expect(hostCommand("reset-root-password", {})).toBe("pnpm run reset-root-password");
    expect(hostCommand("reset-root-password", { RONNE_RUNTIME: "other" })).toBe(
      "pnpm run reset-root-password",
    );
  });

  it("says how to restart for each runtime (098)", () => {
    expect(restartHint({ RONNE_RUNTIME: "docker" })).toBe("docker compose restart web");
    expect(restartHint({ RONNE_RUNTIME: "npm", RONNE_SERVICE: "1" })).toBe(
      "sudo rmk-server service restart",
    );
    expect(restartHint({ RONNE_RUNTIME: "npm" })).toBe("stop rmk-server and start it again");
    expect(restartHint({})).toContain("pnpm dev or pnpm start");
  });

  it("names the setup command for each runtime", () => {
    expect(setupCommand({ RONNE_RUNTIME: "docker" })).toBe(
      "docker compose exec web pnpm run setup",
    );
    expect(setupCommand({ RONNE_RUNTIME: "npm" })).toBe("rmk-server setup");
    expect(setupCommand({})).toBe("pnpm run setup");
  });
});

describe("updatePlans (140)", () => {
  const order = (env: Record<string, string>) => updatePlans(env).map((plan) => plan.kind);
  const plan = (env: Record<string, string>, kind: string) =>
    updatePlans(env).find((one) => one.kind === kind);

  it("lists every way to update, the one this instance runs by first and the only one marked", () => {
    expect(order({ RONNE_RUNTIME: "docker" })).toEqual([
      "docker",
      "npm",
      "service",
      "package",
      "clone",
    ]);
    expect(order({ RONNE_RUNTIME: "npm" })[0]).toBe("npm");
    expect(order({ RONNE_RUNTIME: "npm", RONNE_SERVICE: "1" })[0]).toBe("service");
    expect(order({})[0]).toBe("clone");
    for (const env of [{ RONNE_RUNTIME: "docker" }, { RONNE_RUNTIME: "npm" }, {}] as Record<
      string,
      string
    >[]) {
      expect(updatePlans(env).filter((one) => one.current)).toHaveLength(1);
      expect(updatePlans(env)[0]?.current).toBe(true);
      expect(order(env).slice().sort()).toEqual(["clone", "docker", "npm", "package", "service"]);
    }
  });

  it("pulls the image for Docker, after a backup inside the container", () => {
    expect(plan({}, "docker")).toMatchObject({
      backup: "docker compose exec web pnpm run backup",
      commands: ["docker compose pull", "docker compose up -d"],
    });
  });

  it("installs the npm package, and restarts the service when there is one", () => {
    expect(plan({}, "npm")).toMatchObject({
      backup: "rmk-server backup",
      commands: ["npm install --global @ronneai/marketplace@latest"],
    });
    expect(plan({}, "service")).toMatchObject({
      backup: "sudo rmk-server backup",
      commands: [
        "npm install --global @ronneai/marketplace@latest",
        "sudo rmk-server service restart",
      ],
    });
  });

  it("installs the new .deb or .rpm, and pulls and rebuilds a clone", () => {
    expect(plan({}, "package")).toMatchObject({
      backup: "sudo rmk-server backup",
      commands: ["sudo apt install ./rmk-server_*.deb", "sudo dnf install ./rmk-server-*.rpm"],
    });
    expect(plan({}, "clone")).toMatchObject({
      backup: "pnpm run backup",
      commands: ["git pull", "pnpm install", "pnpm build"],
    });
  });

  it("lists the same commands wherever it runs: a service flag outside npm changes nothing", () => {
    expect(updatePlans({ RONNE_RUNTIME: "docker", RONNE_SERVICE: "1" })[0]?.kind).toBe("docker");
    expect(plan({ RONNE_RUNTIME: "docker" }, "clone")).toMatchObject({
      commands: plan({}, "clone")?.commands,
      backup: plan({}, "clone")?.backup,
    });
  });
});
