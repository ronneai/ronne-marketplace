import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { serviceLayout } from "./layout.js";
import { type ServicePlan, servicePlan } from "./model.js";
import { renderWinswXml, windowsQuote } from "./winsw.js";

// The golden files (086), as for systemd and launchd (083): UPDATE_GOLDEN=1 rewrites them.
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

// As the Windows installer (087) lays it out: a path with a space, quoted everywhere.
const NODE = "C:\\Program Files\\RonneAI\\Marketplace\\node\\node.exe";
const ENTRY =
  "C:\\Program Files\\RonneAI\\Marketplace\\lib\\node_modules\\@ronneai\\marketplace\\dist\\bin.js";
const windows = (withProxy: boolean): ServicePlan =>
  servicePlan({
    layout: serviceLayout({ platform: "win32" }),
    node: NODE,
    entry: ENTRY,
    port: 7650,
    host: "127.0.0.1",
    ...(withProxy
      ? {
          proxy: {
            domain: "ronne.example.com",
            tls: "auto",
            caddy: "C:\\Program Files\\Caddy\\caddy.exe",
          },
        }
      : {}),
  });

describe("the Windows layout (086)", () => {
  it("keeps everything under ProgramData, with virtual accounts", () => {
    const { layout, app, proxy } = windows(true);
    expect(layout).toMatchObject({
      platform: "win32",
      user: "NT SERVICE\\rmk-server",
      proxyUser: "NT SERVICE\\rmk-server-proxy",
      systemUser: false,
      dataDir: "C:\\ProgramData\\RonneAI\\Marketplace\\data",
      envFile: "C:\\ProgramData\\RonneAI\\Marketplace\\.env",
      logDir: "C:\\ProgramData\\RonneAI\\Marketplace\\logs",
      definition: "C:\\ProgramData\\RonneAI\\Marketplace\\service\\rmk-server-service.xml",
      caddyfile: "C:\\ProgramData\\RonneAI\\Marketplace\\proxy\\Caddyfile",
    });
    expect(app.environment.RONNE_ENV_FILE).toBe("C:\\ProgramData\\RonneAI\\Marketplace\\.env");
    expect(proxy?.after).toEqual(["rmk-server"]);
    expect(serviceLayout({ platform: "win32", programData: "D:\\Data" }).dataDir).toBe(
      "D:\\Data\\RonneAI\\Marketplace\\data",
    );
  });
});

describe("the WinSW XML (086)", () => {
  it("golden: the server", () => {
    matchesGolden("windows/rmk-server-service.xml", renderWinswXml(windows(false).app));
  });

  it("golden: with a domain, the proxy (and the server unchanged)", () => {
    const plan = windows(true);
    expect(renderWinswXml(plan.app)).toBe(renderWinswXml(windows(false).app));
    if (!plan.proxy) throw new Error("expected a proxy");
    matchesGolden("windows-domain/rmk-server-proxy-service.xml", renderWinswXml(plan.proxy));
  });

  it("quotes arguments as Windows reads them back", () => {
    expect(windowsQuote("start")).toBe("start");
    expect(windowsQuote("C:\\Program Files\\x.js")).toBe('"C:\\Program Files\\x.js"');
    expect(windowsQuote("")).toBe('""');
    expect(windowsQuote('say "hi"')).toBe('"say \\"hi\\""');
    // Backslashes before a quote, or the closing quote, are doubled.
    expect(windowsQuote("C:\\a b\\")).toBe('"C:\\a b\\\\"');
    expect(windowsQuote('a\\"b c')).toBe('"a\\\\\\"b c"');
  });

  it("escapes XML, and ends lines as Windows does", () => {
    const plan = servicePlan({
      layout: serviceLayout({ platform: "win32" }),
      node: "C:\\R&D\\node.exe",
      entry: "C:\\x\\<bin>.js",
      port: 7650,
      host: "127.0.0.1",
    });
    const xml = renderWinswXml(plan.app);
    expect(xml).toContain("<executable>C:\\R&amp;D\\node.exe</executable>");
    expect(xml).toContain("C:\\x\\&lt;bin&gt;.js");
    expect(xml.split("\r\n").length).toBeGreaterThan(20);
    expect(xml.replaceAll("\r\n", "")).not.toContain("\n");
  });
});
