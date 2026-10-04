import { describe, expect, it } from "vitest";
import { type FakeSystem, fakeSystem } from "./fake-system.js";
import { runService } from "./index.js";
import { installService, readState, uninstallService } from "./install.js";
import { serviceLayout } from "./layout.js";
import { freeSystemId, macBackend, macPrefix, stableNodePath } from "./macos.js";

const NODE = "/opt/homebrew/bin/node";
const ENTRY = "/opt/homebrew/lib/node_modules/@ronneai/marketplace/dist/bin.js";
const program = { node: NODE, entry: ENTRY, version: "0.3.0" };
const layout = serviceLayout({ platform: "darwin", prefix: "/opt/homebrew" });
const context = { layout, ...program };
const defaults = { port: 7650, host: "127.0.0.1", tls: "auto" as const, user: false };

/** A Mac with nothing installed: no _rmkserver, nothing loaded. */
const mac = (): FakeSystem => {
  const sys = fakeSystem({ platform: "darwin" });
  sys.answers.set("dscl . -read", { code: 56 });
  sys.answers.set("dscl . -list /Users UniqueID", {
    stdout: "root 0\n_www 70\n_mysql 74\nana 501\n",
  });
  sys.answers.set("dscl . -list /Groups PrimaryGroupID", {
    stdout: "wheel 0\n_www 70\n_rmk 200\n",
  });
  sys.answers.set("launchctl print", { code: 113 });
  return sys;
};

describe("the macOS backend (083)", () => {
  it("takes Homebrew's prefix from where rmk-server is", () => {
    expect(macPrefix(ENTRY)).toBe("/opt/homebrew");
    expect(macPrefix("/usr/local/lib/node_modules/@ronneai/marketplace/dist/bin.js")).toBe(
      "/usr/local",
    );
    expect(macPrefix("/Users/ana/.nvm/versions/node/v24/lib/node_modules/x/dist/bin.js")).toBe(
      "/usr/local",
    );
  });

  it("uses Homebrew's opt link for Node, which survives brew upgrade", () => {
    expect(stableNodePath("/opt/homebrew/Cellar/node@24/24.21.0/bin/node")).toBe(
      "/opt/homebrew/opt/node@24/bin/node",
    );
    expect(stableNodePath("/home/linuxbrew/.linuxbrew/Cellar/node/24.21.0/bin/node")).toBe(
      "/home/linuxbrew/.linuxbrew/opt/node/bin/node",
    );
    expect(stableNodePath("/usr/bin/node")).toBe("/usr/bin/node");
    expect(stableNodePath("/x/Cellar/node")).toBe("/x/Cellar/node");
  });

  it("finds a free id in the system range", () => {
    expect(freeSystemId(["root 0\n_www 70\n", "wheel 0\n_x 499\n_y 498\n"])).toBe(497);
    expect(freeSystemId([""])).toBe(499);
  });

  it("creates the hidden _rmkserver account and group with dscl", () => {
    const sys = mac();
    expect(macBackend(sys).ensureAccount("_rmkserver", "_rmkserver", "/var/empty")).toBe(true);
    for (const line of [
      "dscl . -create /Groups/_rmkserver PrimaryGroupID 499",
      "dscl . -create /Users/_rmkserver UniqueID 499",
      "dscl . -create /Users/_rmkserver PrimaryGroupID 499",
      "dscl . -create /Users/_rmkserver UserShell /usr/bin/false",
      "dscl . -create /Users/_rmkserver NFSHomeDirectory /var/empty",
      "dscl . -create /Users/_rmkserver IsHidden 1",
    ])
      expect(sys.commands).toContain(line);
    sys.answers.set("dscl . -read /Users/_rmkserver", { code: 0 });
    expect(macBackend(sys).ensureAccount("_rmkserver", "_rmkserver", "/var/empty")).toBe(false);
    // Any other failure of dscl isn't "missing": it stops rather than recreate the account.
    sys.answers.set("dscl . -read /Users/_rmkserver", { code: 1, stderr: "eDSNodeNotFound" });
    expect(() => macBackend(sys).ensureAccount("_rmkserver", "_rmkserver", "/var/empty")).toThrow(
      "Couldn't check for the _rmkserver account",
    );
    sys.answers.set("dscl . -read /Users/_rmkserver", { code: 56 });
    sys.answers.set("dscl . -read /Groups/_rmkserver", { code: 1, stderr: "eDSNodeNotFound" });
    expect(() => macBackend(sys).ensureAccount("_rmkserver", "_rmkserver", "/var/empty")).toThrow(
      "Couldn't check for the _rmkserver group",
    );
  });

  it("reads launchd's state, and retries a bootstrap launchd isn't ready for", () => {
    const sys = mac();
    const backend = macBackend(sys);
    const app = {
      name: "rmk-server",
      label: "ai.ronne.rmk-server",
    } as Parameters<typeof backend.isActive>[0];
    expect(backend.isActive(app)).toBe(false);
    sys.answers.set("launchctl print system/ai.ronne.rmk-server", {
      stdout: "\tstate = running\n",
    });
    expect(backend.isActive(app)).toBe(true);

    let calls = 0;
    const run = sys.run;
    sys.run = (command, args) => {
      if (command === "launchctl" && args[0] === "bootstrap" && ++calls < 3)
        return { code: 5, stdout: "", stderr: "Bootstrap failed: 5: Input/output error" };
      return run(command, args);
    };
    expect(backend.activate(app, layout.definition)).toBeUndefined();
    expect(calls).toBe(3);
    expect(sys.commands).toContain("launchctl bootout system/ai.ronne.rmk-server");
    const order = sys.commands.filter((c) => c.startsWith("launchctl") && !c.includes("print"));
    expect(order.slice(0, 3)).toEqual([
      "launchctl bootout system/ai.ronne.rmk-server",
      "launchctl enable system/ai.ronne.rmk-server",
      `launchctl bootstrap system ${layout.definition}`,
    ]);
  });

  it("names the program holding a port from lsof", () => {
    const sys = mac();
    sys.answers.set("lsof", { stdout: "p812\ncnginx\n" });
    expect(macBackend(sys).portHolder(80)).toBe("nginx (pid 812)");
  });
});

describe("service install on macOS (083)", () => {
  const install = (sys: FakeSystem, options = {}) =>
    installService(sys, macBackend(sys), context, { ...defaults, ...options });

  it("installs a LaunchDaemon as _rmkserver, with its log files", async () => {
    const sys = mac();
    expect(await install(sys)).toBe(0);
    const plist = sys.files.get("/Library/LaunchDaemons/ai.ronne.rmk-server.plist");
    expect(plist?.mode).toBe(0o644);
    expect(plist?.content).toContain("<string>_rmkserver</string>");
    expect(sys.dirs.get("/opt/homebrew/var/rmk-server")).toBe(0o750);
    expect(sys.files.get("/opt/homebrew/etc/rmk-server/env")?.mode).toBe(0o600);
    expect(sys.dirs.get("/Library/Logs/rmk-server")).toBe(0o755);
    expect(sys.files.has("/Library/Logs/rmk-server/server.log")).toBe(true);
    expect(sys.commands).toContain(
      "chown -R _rmkserver:_rmkserver /Library/Logs/rmk-server/server.log",
    );
    expect(sys.commands).toContain(`sudo -u _rmkserver ${NODE} ${ENTRY} --version`);
    expect(sys.commands).toContain(
      "launchctl bootstrap system /Library/LaunchDaemons/ai.ronne.rmk-server.plist",
    );
    expect(sys.output.join("")).toContain("Logs:      tail -f /Library/Logs/rmk-server/server.log");
    expect(readState(sys, layout)?.createdAccounts).toEqual(["_rmkserver"]);
  });

  it("adds a root proxy with --domain, its own log and no certificate group", async () => {
    const sys = mac();
    sys.files.set("/usr/bin/caddy", { content: "", mode: 0o755 });
    sys.answers.set("/usr/bin/caddy version", { stdout: "v2.11.6 h1:x" });
    sys.answers.set("launchctl print system/ai.ronne.rmk-server-proxy", {
      stdout: "state = running",
    });
    expect(await install(sys, { domain: "r.example.com" })).toBe(0);
    const plist = sys.files.get("/Library/LaunchDaemons/ai.ronne.rmk-server-proxy.plist")?.content;
    expect(plist).toContain("<string>root</string>");
    expect(plist).toContain("<string>/opt/homebrew/etc/rmk-server-proxy/Caddyfile</string>");
    expect(sys.files.has("/Library/Logs/rmk-server/proxy.log")).toBe(true);
    expect(sys.commands.some((c) => c.startsWith("chgrp"))).toBe(false);
    expect(readState(sys, layout)?.createdAccounts).toEqual(["_rmkserver"]);
  });

  it("uninstall boots both out and removes _rmkserver", async () => {
    const sys = mac();
    await install(sys);
    sys.commands.length = 0;
    expect(await uninstallService(sys, macBackend(sys), context, false)).toBe(0);
    expect(sys.commands).toContain("launchctl bootout system/ai.ronne.rmk-server");
    expect(sys.commands).toContain("dscl . -delete /Users/_rmkserver");
    expect(sys.files.has("/Library/LaunchDaemons/ai.ronne.rmk-server.plist")).toBe(false);
    expect(sys.files.has("/opt/homebrew/etc/rmk-server/env")).toBe(true);
  });

  it("never removes root, whatever service.json says", async () => {
    const sys = mac();
    await install(sys);
    const path = "/opt/homebrew/etc/rmk-server/service.json";
    const state = JSON.parse(sys.files.get(path)?.content ?? "{}");
    state.createdAccounts.push("root");
    sys.files.set(path, { content: JSON.stringify(state), mode: 0o644 });
    expect(await uninstallService(sys, macBackend(sys), context, false)).toBe(0);
    expect(sys.commands).not.toContain("dscl . -delete /Users/root");
    expect(sys.commands).toContain("dscl . -delete /Users/_rmkserver");
  });

  it("--user runs it as the account that ran sudo, and never removes that account", async () => {
    const sys = mac();
    sys.env.SUDO_USER = "ana";
    sys.answers.set("id -gn ana", { stdout: "staff\n" });
    const command = {
      kind: "service",
      action: "install",
      options: { ...defaults, user: true },
    } as const;
    expect(await runService(sys, command, program)).toBe(0);
    expect(sys.files.get("/Library/LaunchDaemons/ai.ronne.rmk-server.plist")?.content).toContain(
      "<key>UserName</key>\n  <string>ana</string>",
    );
    expect(sys.commands.some((c) => c.startsWith("dscl . -create"))).toBe(false);
    expect(sys.commands).toContain("chown -R ana:staff /opt/homebrew/var/rmk-server");

    sys.commands.length = 0;
    expect(
      await runService(sys, { kind: "service", action: "uninstall", deleteData: false }, program),
    ).toBe(0);
    expect(sys.commands.some((c) => c.startsWith("dscl . -delete"))).toBe(false);
  });

  it("--user needs sudo from a signed-in account, and is macOS only", async () => {
    const sys = mac();
    const command = {
      kind: "service",
      action: "install",
      options: { ...defaults, user: true },
    } as const;
    expect(await runService(sys, command, program)).toBe(1);
    expect(sys.errors.join("")).toContain("run it with sudo from your own account");

    const linux = fakeSystem();
    expect(await runService(linux, command, program)).toBe(1);
    expect(linux.errors.join("")).toContain("--user is for macOS");
  });
});
