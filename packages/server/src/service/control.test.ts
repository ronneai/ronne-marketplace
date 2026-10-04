import { describe, expect, it } from "vitest";
import {
  controlService,
  STATUS_NOT_INSTALLED,
  STATUS_RUNNING,
  STATUS_STOPPED,
  scriptForService,
  serviceLogs,
  serviceStatus,
} from "./control.js";
import { type FakeSystem, fakeSystem } from "./fake-system.js";
import { installService, readState } from "./install.js";
import { serviceLayout } from "./layout.js";
import { linuxBackend } from "./linux.js";
import { macBackend } from "./macos.js";

const NODE = "/usr/bin/node";
const ENTRY = "/usr/lib/node_modules/@ronneai/marketplace/dist/bin.js";
const PACKAGE = "/usr/lib/node_modules/@ronneai/marketplace/package.json";
const layout = serviceLayout({ platform: "linux" });
const context = { layout, node: NODE, entry: ENTRY, version: "0.3.0" };
const defaults = { port: 7650, host: "127.0.0.1", tls: "auto" as const, user: false };

/** A Linux machine with the service installed (and Caddy, for --domain). */
const installed = async (options: { domain?: string } = {}): Promise<FakeSystem> => {
  const sys = fakeSystem();
  sys.dirs.set("/run/systemd/system", 0o755);
  sys.answers.set("getent", { code: 2 });
  sys.answers.set("systemctl is-active", { code: 3 });
  sys.answers.set("selinuxenabled", { code: 1 });
  sys.files.set("/usr/bin/caddy", { content: "", mode: 0o755 });
  sys.answers.set("/usr/bin/caddy version", { stdout: "v2.11.6 h1:x" });
  sys.files.set(NODE, { content: "", mode: 0o755 });
  sys.files.set(ENTRY, { content: "", mode: 0o755 });
  sys.files.set(PACKAGE, { content: '{"version":"0.3.0"}', mode: 0o644 });
  sys.answers.set("systemctl is-active --quiet rmk-server-proxy", { code: 0 });
  await installService(sys, linuxBackend(sys), context, { ...defaults, ...options });
  sys.answers.set("systemctl is-active --quiet rmk-server", { code: 0 });
  sys.commands.length = 0;
  sys.output.length = 0;
  sys.errors.length = 0;
  return sys;
};

describe("service status (083)", () => {
  it("says what's installed, where, and that it waits for the setup", async () => {
    const sys = await installed();
    expect(await serviceStatus(sys, linuxBackend(sys), context)).toBe(STATUS_RUNNING);
    expect(sys.output.join("")).toBe(
      [
        "rmk-server service: installed, running",
        "  Version:   0.3.0",
        "  Address:   http://localhost:7650 (not set up yet: open it, or run sudo rmk-server setup)",
        "  Listens:   127.0.0.1:7650",
        "  Account:   rmk-server",
        "  Data:      /var/lib/rmk-server",
        "  Settings:  /etc/rmk-server/env",
        "  Logs:      journalctl -u rmk-server",
        "  Proxy:     none (no --domain)",
        "",
      ].join("\n"),
    );
  });

  it("shows the proxy, a stopped server, a newer version and a moved install", async () => {
    const sys = await installed({ domain: "r.example.com" });
    sys.answers.set("systemctl is-active --quiet rmk-server", { code: 3 });
    sys.files.set(PACKAGE, { content: '{"version":"0.4.0"}', mode: 0o644 });
    sys.files.delete(NODE);
    expect(await serviceStatus(sys, linuxBackend(sys), context)).toBe(STATUS_STOPPED);
    const out = sys.output.join("");
    expect(out).toContain("installed, stopped");
    expect(out).toContain(
      "Version:   0.4.0 (it was 0.3.0 at the last install or restart: sudo rmk-server service restart runs 0.4.0)",
    );
    expect(out).toContain("Address:   https://r.example.com\n");
    expect(out).toContain("Proxy:     rmk-server-proxy, running (Caddy, auto certificates)");
    expect(out).toContain("It runs /usr/bin/node, which isn't there any more");
  });

  it("says when it isn't installed, without needing root", async () => {
    const sys = fakeSystem({ root: false });
    expect(await serviceStatus(sys, linuxBackend(sys), context)).toBe(STATUS_NOT_INSTALLED);
    expect(sys.output.join("")).toContain("isn't installed here");
  });
});

describe("service start, stop, restart and logs (083)", () => {
  it("needs root", async () => {
    const sys = fakeSystem({ root: false });
    expect(await controlService(sys, linuxBackend(sys), context, "restart")).toBe(1);
    expect(sys.errors.join("")).toContain("sudo rmk-server service restart");
  });

  it("Linux: systemctl for both services, the proxy stopped first", async () => {
    const sys = await installed({ domain: "r.example.com" });
    expect(await controlService(sys, linuxBackend(sys), context, "stop")).toBe(0);
    expect(sys.commands).toEqual(["systemctl stop rmk-server-proxy", "systemctl stop rmk-server"]);
    expect(sys.output.join("")).toContain("starts again at the next boot");
    sys.commands.length = 0;
    expect(await controlService(sys, linuxBackend(sys), context, "start")).toBe(0);
    expect(sys.commands).toEqual([
      "systemctl start rmk-server",
      "systemctl start rmk-server-proxy",
    ]);
  });

  it("restart records the version npm put there, for status", async () => {
    const sys = await installed();
    sys.files.set(PACKAGE, { content: '{"version":"0.4.0"}', mode: 0o644 });
    expect(await controlService(sys, linuxBackend(sys), context, "restart")).toBe(0);
    expect(sys.commands).toContain("systemctl restart rmk-server");
    expect(readState(sys, layout)?.version).toBe("0.4.0");
    expect(sys.output.join("")).toContain("Restarted the rmk-server service (0.4.0).");
  });

  it("shows the log when a restart doesn't answer", async () => {
    const sys = await installed();
    sys.statuses = [undefined];
    sys.answers.set("journalctl", { stdout: "boom\n" });
    expect(await controlService(sys, linuxBackend(sys), context, "restart")).toBe(1);
    expect(sys.errors.join("")).toContain("boom");
  });

  it("macOS: kickstart to restart, bootout to stop, bootstrap to start again", async () => {
    const mac = serviceLayout({ platform: "darwin", prefix: "/opt/homebrew" });
    const macContext = { ...context, layout: mac };
    const sys = fakeSystem({ platform: "darwin" });
    sys.files.set(mac.definition, { content: "<plist/>", mode: 0o644 });
    sys.files.set(`${mac.settingsDir}/service.json`, {
      content: JSON.stringify({
        version: "0.3.0",
        node: NODE,
        entry: ENTRY,
        port: 7650,
        host: "127.0.0.1",
        user: "_rmkserver",
        createdAccounts: [],
      }),
      mode: 0o644,
    });
    expect(await controlService(sys, macBackend(sys), macContext, "restart")).toBe(0);
    expect(sys.commands).toContain("launchctl kickstart -k system/ai.ronne.rmk-server");
    sys.commands.length = 0;
    expect(await controlService(sys, macBackend(sys), macContext, "stop")).toBe(0);
    expect(sys.commands).toEqual(["launchctl bootout system/ai.ronne.rmk-server"]);
    sys.commands.length = 0;
    sys.answers.set("launchctl print", { code: 113 });
    expect(await controlService(sys, macBackend(sys), macContext, "start")).toBe(0);
    expect(sys.commands).toContain(`launchctl bootstrap system ${mac.definition}`);
    sys.commands.length = 0;
    expect(await serviceLogs(sys, macBackend(sys), macContext)).toBe(0);
    expect(sys.commands).toEqual(["tail -n 50 -F /Library/Logs/rmk-server/server.log"]);
  });

  it("Linux logs follow both units", async () => {
    const sys = await installed({ domain: "r.example.com" });
    expect(await serviceLogs(sys, linuxBackend(sys), context)).toBe(0);
    expect(sys.commands).toEqual([
      "journalctl --follow --lines 50 --unit rmk-server --unit rmk-server-proxy",
    ]);
  });
});

describe("the scripts with the service installed (083)", () => {
  it("run as the service's account on its data, with its domain's address", async () => {
    const sys = await installed({ domain: "r.example.com" });
    sys.answers.set("id -u rmk-server", { stdout: "995\n" });
    sys.answers.set("id -g rmk-server", { stdout: "995\n" });
    sys.env.RONNE_ROOT_PASSWORD = "Correct-horse-42!";
    expect(await scriptForService(sys, context, "setup", ["--yes"])).toBe(0);
    expect(sys.commands).toContain(`${NODE} ${ENTRY} setup --yes`);
    expect(sys.attached[0]).toMatchObject({
      cwd: "/",
      uid: 995,
      gid: 995,
      env: {
        RONNE_DATA_DIR: "/var/lib/rmk-server",
        RONNE_ENV_FILE: "/etc/rmk-server/env",
        PORT: "7650",
        PUBLIC_URL: "https://r.example.com",
        RONNE_SERVICE: "1",
        RONNE_ROOT_PASSWORD: "Correct-horse-42!",
      },
    });
    // The password isn't on a command line.
    expect(sys.commands.join(" ")).not.toContain("Correct-horse");
  });

  it("trust nothing in service.json to choose the program or the account (it's the service's file)", async () => {
    const sys = await installed();
    const path = "/etc/rmk-server/service.json";
    const state = JSON.parse(sys.files.get(path)?.content ?? "{}");
    // What the witness did as rmk-server: run touch as root.
    sys.files.set(path, {
      content: JSON.stringify({
        ...state,
        user: "root",
        node: "/usr/bin/touch",
        entry: "/root/pwned",
      }),
      mode: 0o644,
    });
    sys.answers.set("id -u root", { stdout: "0\n" });
    sys.answers.set("id -g root", { stdout: "0\n" });
    expect(await scriptForService(sys, context, "reset-root-password", [])).toBe(1);
    expect(sys.errors.join("")).toContain("isn't one it may use here");
    expect(sys.attached).toEqual([]);

    // The right account, but other programs: the ones running now are used.
    sys.files.set(path, {
      content: JSON.stringify({ ...state, node: "/usr/bin/touch", entry: "/root/pwned" }),
      mode: 0o644,
    });
    sys.answers.set("id -u rmk-server", { stdout: "995\n" });
    sys.answers.set("id -g rmk-server", { stdout: "995\n" });
    expect(await scriptForService(sys, context, "migrate", [])).toBe(0);
    expect(sys.commands).toContain(`${NODE} ${ENTRY} migrate`);
    expect(sys.commands.join(" ")).not.toContain("touch");
  });

  it("refuse an account whose uid is 0, and --user's only when it ran sudo", async () => {
    const sys = await installed();
    sys.answers.set("id -u rmk-server", { stdout: "0\n" });
    sys.answers.set("id -g rmk-server", { stdout: "0\n" });
    expect(await scriptForService(sys, context, "migrate", [])).toBe(1);

    const mac = serviceLayout({
      platform: "darwin",
      prefix: "/opt/homebrew",
      user: { name: "ana", group: "staff" },
    });
    const user = fakeSystem({ platform: "darwin" });
    user.files.set(`${mac.settingsDir}/service.json`, {
      content: JSON.stringify({
        version: "0.3.0",
        node: NODE,
        entry: ENTRY,
        port: 7650,
        host: "127.0.0.1",
        user: "ana",
        createdAccounts: [],
      }),
      mode: 0o644,
    });
    user.answers.set("id -u ana", { stdout: "501\n" });
    user.answers.set("id -g ana", { stdout: "20\n" });
    const macContext = {
      ...context,
      layout: serviceLayout({ platform: "darwin", prefix: "/opt/homebrew" }),
    };
    user.env.SUDO_USER = "bob";
    expect(await scriptForService(user, macContext, "migrate", [])).toBe(1);
    user.env.SUDO_USER = "ana";
    expect(await scriptForService(user, macContext, "migrate", [])).toBe(0);
    expect(user.attached[0]).toMatchObject({ uid: 501, gid: 20 });
  });

  it("on Linux never run as the person running sudo, even if service.json names them", async () => {
    const sys = await installed();
    const path = "/etc/rmk-server/service.json";
    const state = JSON.parse(sys.files.get(path)?.content ?? "{}");
    sys.files.set(path, { content: JSON.stringify({ ...state, user: "tester" }), mode: 0o644 });
    sys.env.SUDO_USER = "tester";
    sys.answers.set("id -u tester", { stdout: "1000\n" });
    sys.answers.set("id -g tester", { stdout: "1000\n" });
    expect(await scriptForService(sys, context, "migrate", [])).toBe(1);
    expect(sys.attached).toEqual([]);
  });

  it("refuse to read or write the settings folder's files through a link", async () => {
    const sys = await installed();
    sys.links.add("/etc/rmk-server/env");
    expect(await scriptForService(sys, context, "setup", [])).toBe(1);
    expect(await controlService(sys, linuxBackend(sys), context, "restart")).toBe(1);
    expect(await installService(sys, linuxBackend(sys), context, defaults)).toBe(1);
    expect(sys.errors.join("")).toContain("/etc/rmk-server/env is a link");
    expect(sys.commands).toEqual([]);
  });

  it("stop when the service's account is gone", async () => {
    const sys = await installed();
    sys.answers.set("id -u rmk-server", { code: 1, stdout: "" });
    expect(await scriptForService(sys, context, "migrate", [])).toBe(1);
    expect(sys.errors.join("")).toContain("isn't there");
  });

  it("without root, say to use sudo (or RONNE_DATA_DIR for an instance of one's own)", async () => {
    const sys = await installed();
    sys.isRoot = () => false;
    expect(await scriptForService(sys, context, "reset-root-password", [])).toBe(1);
    expect(sys.errors.join("")).toContain(
      "To reset its root password, run: sudo rmk-server reset-root-password",
    );
    expect(sys.errors.join("")).toContain("set RONNE_DATA_DIR first");
  });

  it("run as usual without a service, or with RONNE_DATA_DIR chosen", async () => {
    const none = fakeSystem();
    expect(await scriptForService(none, context, "setup", [])).toBeUndefined();
    const sys = await installed();
    sys.env.RONNE_DATA_DIR = "/srv/mine";
    expect(await scriptForService(sys, context, "migrate", [])).toBeUndefined();
    expect(sys.commands).toEqual([]);
  });
});
