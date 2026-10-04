import { describe, expect, it } from "vitest";
import { parseArgs } from "../cli.js";
import { isDomain, parseServiceArgs } from "./args.js";
import { type FakeSystem, fakeSystem } from "./fake-system.js";
import {
  caddyVersion,
  fromTemporaryCache,
  installService,
  readState,
  statePath,
  uninstallService,
} from "./install.js";
import { serviceLayout } from "./layout.js";
import { caddyHintFor, linuxBackend, osFamily } from "./linux.js";
import { settingValue, updateSettings } from "./settings.js";

const layout = serviceLayout({ platform: "linux" });
const NODE = "/usr/bin/node";
const ENTRY = "/usr/lib/node_modules/@ronneai/marketplace/dist/bin.js";
const context = { layout, node: NODE, entry: ENTRY, version: "0.3.0" };
const defaults = { port: 7650, host: "127.0.0.1", tls: "auto" as const, user: false };

/** A Linux machine with systemd running and nothing installed yet. */
const machine = (): FakeSystem => {
  const sys = fakeSystem();
  sys.dirs.set("/run/systemd/system", 0o755);
  sys.files.set("/usr/sbin/nologin", { content: "", mode: 0o755 });
  // No accounts yet; and nothing is active.
  sys.answers.set("getent", { code: 2 });
  sys.answers.set("systemctl is-active", { code: 3 });
  sys.answers.set("selinuxenabled", { code: 1 });
  return sys;
};

const install = (
  sys: FakeSystem,
  options: Partial<typeof defaults> & { domain?: string; email?: string } = {},
) => installService(sys, linuxBackend(sys), context, { ...defaults, ...options });

const withCaddy = (sys: FakeSystem, version = "v2.11.6 h1:abc"): FakeSystem => {
  sys.files.set("/usr/bin/caddy", { content: "", mode: 0o755 });
  sys.answers.set("/usr/bin/caddy version", { stdout: version });
  return sys;
};

describe("service arguments (083)", () => {
  it("parses install's options", () => {
    expect(
      parseServiceArgs([
        "install",
        "--port",
        "7700",
        "--domain",
        "Ronne.Example.com",
        "--tls=internal",
        "--email",
        "ops@example.com",
      ]),
    ).toEqual({
      kind: "service",
      action: "install",
      options: {
        port: 7700,
        host: "127.0.0.1",
        domain: "ronne.example.com",
        tls: "internal",
        email: "ops@example.com",
        user: false,
      },
    });
    expect(parseArgs(["service", "uninstall", "--delete-data"], {})).toEqual({
      kind: "service",
      action: "uninstall",
      deleteData: true,
    });
    expect(parseArgs(["service"], {})).toEqual({ kind: "service-help" });
    expect(parseArgs(["service", "status"], {})).toEqual({ kind: "service", action: "status" });
  });

  it("refuses what would break the Caddyfile or isn't an option", () => {
    for (const bad of ["ronne.example.com {", "a b", "-x.com", "x-.com", "a..b", "", "é.com"])
      expect(isDomain(bad), bad).toBe(false);
    expect(isDomain("localhost")).toBe(true);
    expect(isDomain("a.b-c.example")).toBe(true);
    expect(parseServiceArgs(["install", "--domain", "x.com\n}"])).toMatchObject({ kind: "error" });
    expect(parseServiceArgs(["install", "--tls", "files"])).toMatchObject({
      kind: "error",
      message: expect.stringContaining("go with --domain"),
    });
    expect(parseServiceArgs(["install", "--domain", "x.com", "--tls", "self"])).toMatchObject({
      kind: "error",
    });
    expect(parseServiceArgs(["install", "--email", "a b@c"])).toMatchObject({ kind: "error" });
    expect(parseServiceArgs(["uninstall", "--port", "1"])).toMatchObject({ kind: "error" });
    expect(parseServiceArgs(["reinstall"])).toMatchObject({ kind: "error" });
  });

  it("checks a long domain quickly", () => {
    const started = performance.now();
    expect(isDomain(`${"a-".repeat(100_000)}!`)).toBe(false);
    expect(isDomain(`${"a.".repeat(100_000)}`)).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("the settings file (083)", () => {
  it("sets, replaces and removes keys and keeps the rest", () => {
    const text =
      "# mine\nDATABASE_URL=file:/x.db\nPUBLIC_URL=http://localhost:7650\nTRUST_PROXY=true\n";
    expect(updateSettings(text, { PUBLIC_URL: "https://r.example.com" })).toBe(
      "# mine\nDATABASE_URL=file:/x.db\nPUBLIC_URL=https://r.example.com\nTRUST_PROXY=true\n",
    );
    expect(updateSettings(text, {}, ["TRUST_PROXY", "PUBLIC_URL"])).toBe(
      "# mine\nDATABASE_URL=file:/x.db\n",
    );
    expect(updateSettings("", { TRUST_PROXY: "true" })).toBe("TRUST_PROXY=true\n");
    expect(updateSettings("", {})).toBe("");
    expect(settingValue("PUBLIC_URL='https://a b'\n", "PUBLIC_URL")).toBe("https://a b");
  });
});

describe("service install on Linux (083)", () => {
  it("refuses without root, from npx's cache, and without systemd", async () => {
    const user = fakeSystem({ root: false });
    expect(await install(user)).toBe(1);
    expect(user.errors.join("")).toContain("sudo rmk-server service install");

    const npx = machine();
    const fromNpx = {
      ...context,
      entry: "/root/.npm/_npx/1a2b/node_modules/@ronneai/marketplace/dist/bin.js",
    };
    expect(await installService(npx, linuxBackend(npx), fromNpx, defaults)).toBe(1);
    expect(npx.errors.join("")).toContain("npm install --global @ronneai/marketplace");
    expect(fromTemporaryCache("/home/a/.cache/pnpm/dlx/x/node_modules/y/dist/bin.js")).toBe(true);
    expect(fromTemporaryCache(ENTRY)).toBe(false);

    const container = machine();
    container.dirs.delete("/run/systemd/system");
    expect(await install(container)).toBe(1);
    expect(container.errors.join("")).toContain("systemd isn't running");
    expect(container.files.size).toBe(1); // only the fake nologin
  });

  it("stops before writing anything when the port is taken", async () => {
    const sys = machine();
    sys.busy.add(7650);
    sys.answers.set("ss", {
      stdout: 'LISTEN 0 511 127.0.0.1:7650 0.0.0.0:* users:(("node",pid=42,fd=20))',
    });
    sys.files.set("/proc/42/cmdline", {
      content: "/usr/local/bin/node\0/srv/app.js\0",
      mode: 0o444,
    });
    expect(await install(sys)).toBe(1);
    expect(sys.errors.join("")).toContain("port 7650 is in use on 127.0.0.1 by node (pid 42)");
    expect(sys.commands.some((c) => c.startsWith("useradd"))).toBe(false);
    expect([...sys.files.keys()].filter((path) => !path.startsWith("/proc/"))).toEqual([
      "/usr/sbin/nologin",
    ]);
  });

  it("creates the account, folders, settings, unit and starts it", async () => {
    const sys = machine();
    expect(await install(sys)).toBe(0);
    expect(sys.commands).toContain(
      "useradd --system --user-group --home-dir /var/lib/rmk-server --no-create-home --shell /usr/sbin/nologin --comment Ronne AI Marketplace rmk-server",
    );
    expect(sys.commands).toContain(`runuser -u rmk-server -- ${NODE} ${ENTRY} --version`);
    expect(sys.dirs.get("/var/lib/rmk-server")).toBe(0o750);
    expect(sys.dirs.get("/etc/rmk-server")).toBe(0o755);
    expect(sys.files.get("/etc/rmk-server/env")?.mode).toBe(0o600);
    expect(sys.commands).toContain("chown -R rmk-server:rmk-server /var/lib/rmk-server");
    expect(sys.commands).toContain("chown -R rmk-server:rmk-server /etc/rmk-server");
    const unit = sys.files.get("/etc/systemd/system/rmk-server.service");
    expect(unit?.mode).toBe(0o644);
    expect(unit?.content).toContain(`ExecStart=${NODE} ${ENTRY} start --no-open --port 7650`);
    const order = [
      "systemctl daemon-reload",
      "systemctl enable rmk-server",
      "systemctl restart rmk-server",
    ];
    expect(sys.commands.filter((c) => order.includes(c))).toEqual(order);
    expect(readState(sys, layout)).toEqual({
      version: "0.3.0",
      node: NODE,
      entry: ENTRY,
      port: 7650,
      host: "127.0.0.1",
      user: "rmk-server",
      createdAccounts: ["rmk-server"],
    });
    const out = sys.output.join("");
    expect(out).toContain("Address:   http://localhost:7650");
    expect(out).toContain("Logs:      journalctl -u rmk-server");
    expect(out).toContain("Next: open http://localhost:7650 and finish the setup.");
    expect(sys.errors).toEqual([]);
  });

  it("keeps an existing account, and refuses one that can't run the program", async () => {
    const sys = machine();
    sys.answers.set("getent passwd rmk-server", { code: 0 });
    sys.answers.set("runuser", { code: 1 });
    expect(await install(sys)).toBe(1);
    expect(sys.commands.some((c) => c.startsWith("useradd"))).toBe(false);
    expect(sys.commands.some((c) => c.startsWith("userdel"))).toBe(false);
    expect(sys.errors.join("")).toContain("Install Node.js for the whole machine");
    expect(sys.files.has("/etc/systemd/system/rmk-server.service")).toBe(false);
  });

  it("removes an account it just made when that account can't run the program", async () => {
    const sys = machine();
    sys.answers.set("runuser", { code: 1 });
    expect(await install(sys)).toBe(1);
    expect(sys.commands).toContain("userdel rmk-server");
    expect(readState(sys, layout)).toBeUndefined();
  });

  it("labels the folders for SELinux where it's on", async () => {
    const sys = machine();
    sys.answers.set("selinuxenabled", { code: 0 });
    expect(await install(sys)).toBe(0);
    expect(sys.commands).toContain("restorecon -R /var/lib/rmk-server /etc/rmk-server");
  });

  it("warns when it listens on the network over HTTP, and says when it's already set up", async () => {
    const sys = machine();
    sys.statuses = [undefined, undefined, 200];
    expect(await install(sys, { host: "0.0.0.0" })).toBe(0);
    expect(sys.output.join("")).toContain("It's set up: open http://localhost:7650.");
    expect(sys.errors.join("")).toContain("Warning: it listens on 0.0.0.0:7650 over plain HTTP");
  });

  it("shows the log when the server never answers", async () => {
    const sys = machine();
    sys.statuses = [undefined];
    sys.answers.set("journalctl", { stdout: "Error: boom\n" });
    let now = 0;
    const realNow = Date.now;
    Date.now = () => (now += 10_000);
    try {
      expect(await install(sys)).toBe(1);
    } finally {
      Date.now = realNow;
    }
    expect(sys.errors.join("")).toContain("Error: boom");
    expect(sys.errors.join("")).toContain("didn't answer at http://127.0.0.1:7650/api/health");
  });

  it("runs again over its own running service without a port error", async () => {
    const sys = machine();
    expect(await install(sys)).toBe(0);
    sys.answers.set("systemctl is-active", { code: 0 });
    sys.busy.add(7650);
    sys.answers.set("getent passwd rmk-server", { code: 0 });
    expect(await install(sys)).toBe(0);
    expect(readState(sys, layout)?.createdAccounts).toEqual(["rmk-server"]);
  });
});

describe("service install --domain on Linux (083)", () => {
  it("needs a recent Caddy on PATH, and says how to get one", async () => {
    const none = machine();
    none.files.set("/etc/os-release", { content: 'ID=ubuntu\nID_LIKE="debian"\n', mode: 0o644 });
    expect(await install(none, { domain: "r.example.com" })).toBe(1);
    expect(none.errors.join("")).toContain("caddyserver.com/docs/install#debian-ubuntu-raspbian");

    const old = withCaddy(machine(), "v2.6.2 h1:x");
    expect(await install(old, { domain: "r.example.com" })).toBe(1);
    expect(old.errors.join("")).toContain("needs Caddy 2.7 or later; /usr/bin/caddy is 2.6");
    expect(caddyVersion("v2.11.6 h1:abc")).toEqual([2, 11]);
    expect(caddyVersion("nonsense")).toBeUndefined();
  });

  it("stops when something holds 80 or 443", async () => {
    const sys = withCaddy(machine());
    sys.busy.add(443);
    sys.answers.set("ss -Hltnp sport = :443", {
      stdout: 'LISTEN 0 4096 *:443 *:* users:(("caddy",pid=9,fd=7))',
    });
    expect(await install(sys, { domain: "r.example.com" })).toBe(1);
    expect(sys.errors.join("")).toContain("port 443 is in use by caddy (pid 9)");
    expect(sys.errors.join("")).toContain("sudo systemctl disable --now caddy");
    expect(sys.files.has("/etc/rmk-server/env")).toBe(false);
  });

  it("needs the certificate files first with --tls files", async () => {
    const sys = withCaddy(machine());
    expect(await install(sys, { domain: "r.example.com", tls: "files" } as never)).toBe(1);
    expect(sys.errors.join("")).toContain("/etc/rmk-server-proxy/certs/cert.pem");
  });

  it("refuses certificate files that are links, before writing anything", async () => {
    const certs = "/etc/rmk-server-proxy/certs";
    const sys = withCaddy(machine());
    sys.files.set(`${certs}/cert.pem`, { content: "c", mode: 0o644 });
    sys.files.set(`${certs}/key.pem`, { content: "k", mode: 0o600 });
    sys.links.add(`${certs}/key.pem`);
    expect(await install(sys, { domain: "r.example.com", tls: "files" } as never)).toBe(1);
    expect(sys.errors.join("")).toContain(`${certs}/key.pem is a link`);
    expect(sys.errors.join("")).toContain("sudo cp -L");
    expect(sys.commands.some((c) => /^(useradd|chgrp|chmod|chown)/.test(c))).toBe(false);
  });

  it("with --tls files, lets the caddy group read the certificates, and stops if it still can't", async () => {
    const certs = "/etc/rmk-server-proxy/certs";
    const sys = withCaddy(machine());
    sys.files.set(`${certs}/cert.pem`, { content: "c", mode: 0o644 });
    sys.files.set(`${certs}/key.pem`, { content: "k", mode: 0o600 });
    sys.answers.set(`runuser -u caddy -- test -r ${certs}/key.pem`, { code: 1 });
    expect(await install(sys, { domain: "r.example.com", tls: "files" } as never)).toBe(1);
    expect(sys.commands).toContain(`chgrp caddy ${certs} ${certs}/cert.pem ${certs}/key.pem`);
    expect(sys.commands).toContain(`chmod g+rX ${certs} ${certs}/cert.pem ${certs}/key.pem`);
    expect(sys.errors.join("")).toContain(`still can't read ${certs}/key.pem`);
    // The accounts it had just made are gone again, and nothing was written.
    expect(sys.commands).toContain("userdel rmk-server");
    expect(sys.commands).toContain("userdel caddy");
    expect(sys.files.has("/etc/rmk-server/env")).toBe(false);

    sys.answers.delete(`runuser -u caddy -- test -r ${certs}/key.pem`);
    sys.answers.set("systemctl is-active --quiet rmk-server-proxy", { code: 0 });
    sys.commands.length = 0;
    expect(await install(sys, { domain: "r.example.com", tls: "files" } as never)).toBe(0);
    // Only the group and its read bit change: never the owner.
    expect(sys.commands.filter((c) => c.includes(certs))).toEqual([
      `chgrp caddy ${certs} ${certs}/cert.pem ${certs}/key.pem`,
      `chmod g+rX ${certs} ${certs}/cert.pem ${certs}/key.pem`,
      `runuser -u caddy -- test -r ${certs}/cert.pem`,
      `runuser -u caddy -- test -r ${certs}/key.pem`,
    ]);
    expect(sys.files.get("/etc/rmk-server-proxy/Caddyfile")?.content).toContain(
      `tls ${certs}/cert.pem ${certs}/key.pem`,
    );

    // Uninstall removes caddy and gives the kept certificates back to root's group.
    sys.commands.length = 0;
    expect(await uninstallService(sys, linuxBackend(sys), context, false)).toBe(0);
    expect(sys.commands).toContain("userdel caddy");
    expect(sys.commands).toContain(`chown -R root:root ${certs}`);
    expect(sys.files.has(`${certs}/key.pem`)).toBe(true);
  });

  it("adds the proxy service, the Caddyfile and the HTTPS settings", async () => {
    const sys = withCaddy(machine());
    sys.answers.set("systemctl is-active --quiet rmk-server-proxy", { code: 0 });
    expect(await install(sys, { domain: "r.example.com", email: "ops@example.com" })).toBe(0);
    expect(sys.commands).toContain(
      "useradd --system --user-group --home-dir /var/lib/rmk-server-proxy --no-create-home --shell /usr/sbin/nologin --comment Ronne AI Marketplace caddy",
    );
    expect(sys.dirs.get("/var/lib/rmk-server-proxy")).toBe(0o700);
    expect(sys.commands).toContain("chown -R caddy:caddy /var/lib/rmk-server-proxy");
    // The proxy's folder stays root's; its certificates folder is for the caddy group.
    expect(sys.dirs.get("/etc/rmk-server-proxy")).toBe(0o755);
    expect(
      sys.commands.some((c) => c.startsWith("chown") && c.endsWith(" /etc/rmk-server-proxy")),
    ).toBe(false);
    expect(sys.dirs.get("/etc/rmk-server-proxy/certs")).toBe(0o750);
    expect(sys.commands).toContain("chown -R root:caddy /etc/rmk-server-proxy/certs");
    expect(sys.files.get("/etc/rmk-server-proxy/Caddyfile")?.mode).toBe(0o644);
    const caddyfile = sys.files.get("/etc/rmk-server-proxy/Caddyfile")?.content ?? "";
    expect(caddyfile).toContain("r.example.com {");
    expect(caddyfile).toContain("reverse_proxy 127.0.0.1:7650 {");
    expect(caddyfile).toContain("email ops@example.com");
    expect(sys.files.get("/etc/systemd/system/rmk-server-proxy.service")?.content).toContain(
      "ExecStart=/usr/bin/caddy run --config /etc/rmk-server-proxy/Caddyfile --adapter caddyfile",
    );
    expect(sys.files.get("/etc/rmk-server/env")?.content).toBe(
      "PUBLIC_URL=https://r.example.com\nTRUST_PROXY=true\n",
    );
    expect(sys.commands).toContain("systemctl restart rmk-server-proxy");
    expect(readState(sys, layout)?.createdAccounts).toEqual(["rmk-server", "caddy"]);
    expect(sys.output.join("")).toContain("Address:   https://r.example.com");
  });

  it("removes the proxy and its settings when installed again without a domain", async () => {
    const sys = withCaddy(machine());
    sys.answers.set("systemctl is-active --quiet rmk-server-proxy", { code: 0 });
    expect(await install(sys, { domain: "r.example.com" })).toBe(0);
    sys.files.set("/etc/rmk-server/env", {
      content:
        "DATABASE_URL=file:/var/lib/rmk-server/ronne.db\nPUBLIC_URL=https://r.example.com\nTRUST_PROXY=true\n",
      mode: 0o600,
    });
    expect(await install(sys)).toBe(0);
    expect(sys.commands).toContain("systemctl disable --now rmk-server-proxy");
    expect(sys.files.has("/etc/systemd/system/rmk-server-proxy.service")).toBe(false);
    expect(sys.files.has("/etc/rmk-server-proxy/Caddyfile")).toBe(false);
    expect(sys.files.get("/etc/rmk-server/env")?.content).toBe(
      "DATABASE_URL=file:/var/lib/rmk-server/ronne.db\n",
    );
  });

  it("tells Caddy apart from the system's", () => {
    expect(osFamily("ID=fedora\nVERSION_ID=41\n")).toEqual(["fedora"]);
    expect(caddyHintFor(["fedora"])).toContain("dnf install caddy");
    expect(caddyHintFor(["arch"])).toContain("pacman");
    expect(caddyHintFor([])).toContain("caddyserver.com/docs/install");
  });
});

describe("service uninstall on Linux (083)", () => {
  const installed = async (): Promise<FakeSystem> => {
    const sys = withCaddy(machine());
    sys.answers.set("systemctl is-active --quiet rmk-server-proxy", { code: 0 });
    await install(sys, { domain: "r.example.com" });
    sys.files.set("/var/lib/rmk-server/ronne.db", { content: "db", mode: 0o600 });
    sys.commands.length = 0;
    sys.output.length = 0;
    return sys;
  };
  const uninstall = (sys: FakeSystem, deleteData = false) =>
    uninstallService(sys, linuxBackend(sys), context, deleteData);

  it("removes both services and the accounts it created, and keeps the data", async () => {
    const sys = await installed();
    expect(await uninstall(sys)).toBe(0);
    for (const line of [
      "systemctl disable --now rmk-server-proxy",
      "systemctl disable --now rmk-server",
      "userdel rmk-server",
      "userdel caddy",
    ])
      expect(sys.commands).toContain(line);
    expect(sys.files.has("/etc/systemd/system/rmk-server.service")).toBe(false);
    expect(sys.files.has(statePath(layout))).toBe(false);
    expect(sys.files.has("/var/lib/rmk-server/ronne.db")).toBe(true);
    expect(sys.files.has("/etc/rmk-server/env")).toBe(true);
    expect(sys.output.join("")).toContain("The data stays in /var/lib/rmk-server");
  });

  it("removes only its own two accounts, whatever service.json says", async () => {
    const sys = await installed();
    const state = JSON.parse(sys.files.get(statePath(layout))?.content ?? "{}");
    state.createdAccounts.push("root", "ana");
    sys.files.set(statePath(layout), { content: JSON.stringify(state), mode: 0o644 });
    expect(await uninstall(sys)).toBe(0);
    expect(sys.commands.filter((c) => c.startsWith("userdel"))).toEqual([
      "userdel rmk-server",
      "userdel caddy",
    ]);
  });

  it("doesn't remove an account it didn't create", async () => {
    const sys = machine();
    sys.answers.set("getent passwd rmk-server", { code: 0 });
    await install(sys);
    expect(await uninstall(sys)).toBe(0);
    expect(sys.commands.some((c) => c.startsWith("userdel"))).toBe(false);
  });

  it("deletes the data only when the folder's name is typed", async () => {
    const wrong = await installed();
    wrong.answer = "yes";
    expect(await uninstall(wrong, true)).toBe(1);
    expect(wrong.commands).toEqual([]);
    expect(wrong.files.has("/etc/systemd/system/rmk-server.service")).toBe(true);

    const right = await installed();
    right.answer = "rmk-server";
    expect(await uninstall(right, true)).toBe(0);
    expect(right.output.join("")).toContain("Type the data folder's name (rmk-server)");
    expect(
      [...right.files.keys()].filter(
        (p) => p.startsWith("/var/lib/rmk-server") || p.startsWith("/etc/rmk-server"),
      ),
    ).toEqual([]);
  });

  it("says when there's nothing to remove", async () => {
    const sys = machine();
    expect(await uninstall(sys)).toBe(0);
    expect(sys.output.join("")).toContain("isn't installed");
  });
});
