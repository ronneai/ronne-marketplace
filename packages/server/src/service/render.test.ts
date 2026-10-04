import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderLaunchdPlist } from "./launchd.js";
import { serviceLayout } from "./layout.js";
import {
  type ProxyOptions,
  type ServiceDefinition,
  type ServicePlan,
  servicePlan,
  upstreamFor,
} from "./model.js";
import { renderSystemdUnit, systemdQuote } from "./systemd.js";

// The golden files (083): `UPDATE_GOLDEN=1 pnpm --filter @ronneai/marketplace test` rewrites them;
// review the diff before committing.
const goldenDir = fileURLToPath(new URL("./__golden__/", import.meta.url));

const matchesGolden = (name: string, actual: string): void => {
  const path = join(goldenDir, name);
  if (process.env.UPDATE_GOLDEN === "1") {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual);
  }
  const hint = "if the new output is right, run the tests with UPDATE_GOLDEN=1 and review the diff";
  expect(existsSync(path), `${name} is missing: ${hint}`).toBe(true);
  expect(actual, `${name} differs: ${hint}`).toBe(readFileSync(path, "utf8"));
};

const LINUX_NODE = "/usr/bin/node";
const LINUX_ENTRY = "/usr/lib/node_modules/@ronneai/marketplace/dist/bin.js";
const MAC_NODE = "/opt/homebrew/bin/node";
const MAC_ENTRY = "/opt/homebrew/lib/node_modules/@ronneai/marketplace/dist/bin.js";
const proxy = (caddy: string): ProxyOptions => ({
  domain: "ronne.example.com",
  tls: "auto",
  email: "ops@example.com",
  caddy,
});

const proxyOf = (plan: ServicePlan): ServiceDefinition => {
  if (!plan.proxy) throw new Error("expected a proxy");
  return plan.proxy;
};

const linux = (withProxy: boolean): ServicePlan =>
  servicePlan({
    layout: serviceLayout({ platform: "linux" }),
    node: LINUX_NODE,
    entry: LINUX_ENTRY,
    port: 7650,
    host: "127.0.0.1",
    ...(withProxy ? { proxy: proxy("/usr/bin/caddy") } : {}),
  });

const mac = (options: { withProxy?: boolean; user?: boolean } = {}): ServicePlan =>
  servicePlan({
    layout: serviceLayout({
      platform: "darwin",
      prefix: "/opt/homebrew",
      ...(options.user ? { user: { name: "ana", group: "staff" } } : {}),
    }),
    node: MAC_NODE,
    entry: MAC_ENTRY,
    port: 7650,
    host: "127.0.0.1",
    ...(options.withProxy ? { proxy: proxy("/opt/homebrew/bin/caddy") } : {}),
  });

describe("the service model (083)", () => {
  it("Linux: the rmk-server user, /var/lib and /etc, journald", () => {
    const { app, proxy, settings, layout } = linux(false);
    expect(app).toMatchObject({
      name: "rmk-server",
      user: "rmk-server",
      group: "rmk-server",
      program: LINUX_NODE,
      args: [LINUX_ENTRY, "start", "--no-open", "--port", "7650", "--host", "127.0.0.1"],
      environment: {
        NODE_ENV: "production",
        RONNE_DATA_DIR: "/var/lib/rmk-server",
        RONNE_ENV_FILE: "/etc/rmk-server/env",
      },
      writablePaths: ["/var/lib/rmk-server", "/etc/rmk-server"],
      readsHome: false,
    });
    expect(app.logFile).toBeUndefined();
    expect(proxy).toBeUndefined();
    expect(settings).toEqual({});
    expect(layout.definition).toBe("/etc/systemd/system/rmk-server.service");
  });

  it("a domain adds the proxy service and the HTTPS settings", () => {
    const { proxy, settings } = linux(true);
    expect(proxy).toMatchObject({
      name: "rmk-server-proxy",
      user: "caddy",
      program: "/usr/bin/caddy",
      args: ["run", "--config", "/etc/rmk-server/Caddyfile", "--adapter", "caddyfile"],
      bindsLowPorts: true,
      after: ["rmk-server"],
      upstream: "127.0.0.1:7650",
    });
    expect(settings).toEqual({ PUBLIC_URL: "https://ronne.example.com", TRUST_PROXY: "true" });
  });

  it("macOS: _rmkserver, the prefix's var and etc, log files, a root proxy", () => {
    const { app, proxy, layout } = mac({ withProxy: true });
    expect(app).toMatchObject({
      user: "_rmkserver",
      label: "ai.ronne.rmk-server",
      environment: {
        RONNE_DATA_DIR: "/opt/homebrew/var/rmk-server",
        RONNE_ENV_FILE: "/opt/homebrew/etc/rmk-server/env",
      },
      logFile: "/Library/Logs/rmk-server/server.log",
    });
    expect(proxy).toMatchObject({ user: "root", bindsLowPorts: false });
    expect(layout.systemUser).toBe(true);
    expect(layout.definition).toBe("/Library/LaunchDaemons/ai.ronne.rmk-server.plist");
    expect(serviceLayout({ platform: "darwin" }).dataDir).toBe("/usr/local/var/rmk-server");
  });

  it("macOS --user runs as the signed-in user, and isn't a system user to remove", () => {
    const { app, layout } = mac({ user: true });
    expect(app).toMatchObject({ user: "ana", group: "staff" });
    expect(layout.systemUser).toBe(false);
  });

  it("a program under /home stays readable", () => {
    const plan = servicePlan({
      layout: serviceLayout({ platform: "linux" }),
      node: "/home/ana/.nvm/versions/node/v24.0.0/bin/node",
      entry:
        "/home/ana/.nvm/versions/node/v24.0.0/lib/node_modules/@ronneai/marketplace/dist/bin.js",
      port: 7650,
      host: "127.0.0.1",
    });
    expect(plan.app.readsHome).toBe(true);
    expect(renderSystemdUnit(plan.app)).toContain("ProtectHome=read-only\n");
  });

  it("the proxy reaches the server on this machine", () => {
    expect(upstreamFor("127.0.0.1", 7650)).toBe("127.0.0.1:7650");
    expect(upstreamFor("0.0.0.0", 7700)).toBe("127.0.0.1:7700");
    expect(upstreamFor("::", 7650)).toBe("127.0.0.1:7650");
    expect(upstreamFor("::1", 7650)).toBe("[::1]:7650");
    expect(upstreamFor("192.168.1.10", 7650)).toBe("192.168.1.10:7650");
  });
});

describe("the renderers' golden files (083)", () => {
  it("systemd, without a domain", () => {
    matchesGolden("linux/rmk-server.service", renderSystemdUnit(linux(false).app));
  });

  it("systemd, with a domain: the server and the proxy", () => {
    const plan = linux(true);
    expect(renderSystemdUnit(plan.app)).toBe(renderSystemdUnit(linux(false).app));
    matchesGolden("linux-domain/rmk-server-proxy.service", renderSystemdUnit(proxyOf(plan)));
  });

  it("launchd, without a domain", () => {
    matchesGolden("macos/ai.ronne.rmk-server.plist", renderLaunchdPlist(mac().app));
  });

  it("launchd, --user", () => {
    matchesGolden(
      "macos-user/ai.ronne.rmk-server.plist",
      renderLaunchdPlist(mac({ user: true }).app),
    );
  });

  it("launchd, with a domain: the server and the proxy", () => {
    const plan = mac({ withProxy: true });
    expect(renderLaunchdPlist(plan.app)).toBe(renderLaunchdPlist(mac().app));
    matchesGolden(
      "macos-domain/ai.ronne.rmk-server-proxy.plist",
      renderLaunchdPlist(proxyOf(plan)),
    );
  });

  it("quotes what systemd would split or expand", () => {
    expect(systemdQuote("/usr/bin/node")).toBe("/usr/bin/node");
    expect(systemdQuote("/opt/My Apps/node")).toBe('"/opt/My Apps/node"');
    expect(systemdQuote("50%")).toBe('"50%%"');
    expect(systemdQuote("$HOME")).toBe('"$$HOME"');
    expect(systemdQuote('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("escapes XML in the plist", () => {
    const plan = servicePlan({
      layout: serviceLayout({ platform: "darwin" }),
      node: "/Users/a&b/node",
      entry: "/x/<bin>.js",
      port: 7650,
      host: "127.0.0.1",
    });
    const plist = renderLaunchdPlist(plan.app);
    expect(plist).toContain("<string>/Users/a&amp;b/node</string>");
    expect(plist).toContain("<string>/x/&lt;bin&gt;.js</string>");
  });
});
