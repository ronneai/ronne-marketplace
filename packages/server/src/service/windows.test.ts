import { describe, expect, it } from "vitest";
import type { InstallOptions } from "./args.js";
import { serviceStatus } from "./control.js";
import { type FakeSystem, fakeSystem } from "./fake-system.js";
import { serviceTarget } from "./index.js";
import { installService, readState, uninstallService } from "./install.js";
import { serviceLayout } from "./layout.js";
import { inUserProfile, listeningPid, parseServiceSid, windowsBackend } from "./windows.js";

// The feature-086 backend, on the fake system: what it runs, in order.
const layout = serviceLayout({ platform: "win32" });
const ROOT = "C:\\ProgramData\\RonneAI\\Marketplace";
const PROGRAM = "C:\\Program Files\\RonneAI\\Marketplace";
const NODE = `${PROGRAM}\\node\\node.exe`;
const ENTRY = `${PROGRAM}\\lib\\node_modules\\@ronneai\\marketplace\\dist\\bin.js`;
const WINSW = `${PROGRAM}\\lib\\node_modules\\@ronneai\\marketplace\\vendor\\winsw\\WinSW.NET461.exe`;
const context = { layout, node: NODE, entry: ENTRY, version: "0.3.0" };
const defaults: InstallOptions = { port: 7650, host: "127.0.0.1", tls: "auto", user: false };
// What sc.exe showsid gives for the two names (the services' virtual accounts).
const APP_SID = "S-1-5-80-592519931-4167868336-2113710152-492910867-907829221";
const PROXY_SID = "S-1-5-80-3679413298-395819311-4094257142-1108795590-674802607";

/** A PowerShell command by its script's first line (what it does); other commands as they are. */
const shown = (line: string): string => {
  if (!line.startsWith("powershell")) return line;
  const script = Buffer.from(line.split(" ").pop() ?? "", "base64").toString("utf16le");
  return `ps ${script.split("\n")[0]?.replace(/^# /, "")}`;
};

/** The folders makeFolder's PowerShell script makes or checks, from its encoded command. */
const madeIn = (line: string): string => {
  const script = Buffer.from(line.split(" ").pop() ?? "", "base64").toString("utf16le");
  return [...script.matchAll(/\$p = '([^']+)'; \$sd = \$(\w+)/g)]
    .map(([, path, kind]) => (kind === "private" ? `${path} (private)` : path))
    .join(", ");
};

/** A Windows machine, elevated, with nothing installed. */
const machine = (): FakeSystem => {
  const sys = fakeSystem({ platform: "win32" });
  sys.env = { USERPROFILE: "C:\\Users\\ana", ProgramData: "C:\\ProgramData" };
  sys.files.set(WINSW, { content: "WinSW", mode: 0o755 });
  sys.answers.set("sc.exe query", { code: 1060, stdout: "" });
  sys.answers.set("sc.exe showsid rmk-server", {
    stdout: `\r\nNAME: rmk-server\r\nSERVICE SID: ${APP_SID}\r\nSTATUS: Inactive\r\n`,
  });
  sys.answers.set("sc.exe showsid rmk-server-proxy", {
    stdout: `NAME: rmk-server-proxy\r\nSERVICE SID: ${PROXY_SID}\r\n`,
  });
  return sys;
};
const backendOf = (sys: FakeSystem) => windowsBackend(sys, { layout, winsw: WINSW });
const install = (sys: FakeSystem, options: Partial<InstallOptions> = {}) =>
  installService(sys, backendOf(sys), context, { ...defaults, ...options });

describe("the service's account (086)", () => {
  it("asks Windows for the account's SID (sc showsid), for a service that isn't there yet", () => {
    // sc showsid's answer, as Microsoft documents it for TrustedInstaller.
    expect(
      parseServiceSid(
        "\r\nNAME: TrustedInstaller\r\nSERVICE SID: S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464\r\nSTATUS: Active\r\n",
      ),
    ).toBe("S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464");
    expect(
      parseServiceSid("[SC] OpenSCManager FAILED 5:\r\n\r\nAccess is denied."),
    ).toBeUndefined();
  });

  it("knows a user's profile, and the PID on a port", () => {
    expect(inUserProfile("C:\\Users\\ana\\AppData\\Roaming\\npm\\x.js", "C:\\Users")).toBe(true);
    expect(inUserProfile("c:\\users\\ana\\x.js", "C:\\Users\\")).toBe(true);
    expect(inUserProfile("C:\\Program Files\\nodejs\\node.exe", "C:\\Users")).toBe(false);
    expect(inUserProfile("C:\\UsersData\\x.js", "C:\\Users")).toBe(false);
    const netstat = [
      "  Proto  Local Address          Foreign Address        State           PID",
      "  TCP    0.0.0.0:7650           0.0.0.0:0              LISTENING       4242",
      "  TCP    127.0.0.1:50000        127.0.0.1:7650         ESTABLISHED     99",
    ].join("\r\n");
    expect(listeningPid(netstat, 7650)).toBe("4242");
    expect(listeningPid(netstat, 80)).toBeUndefined();
  });
});

describe("service install on Windows (086)", () => {
  it("needs an administrator, and says how to open one", async () => {
    const sys = fakeSystem({ platform: "win32", root: false });
    expect(await install(sys)).toBe(1);
    expect(sys.errors.join("")).toContain("needs an administrator");
    expect(sys.errors.join("")).toContain("Run as administrator");
    expect(sys.commands).toEqual([]);
  });

  it("refuses a program in a user's profile, changing nothing", async () => {
    const sys = machine();
    const npm =
      "C:\\Users\\ana\\AppData\\Roaming\\npm\\node_modules\\@ronneai\\marketplace\\dist\\bin.js";
    const code = await installService(sys, backendOf(sys), { ...context, entry: npm }, defaults);
    expect(code).toBe(1);
    expect(sys.errors.join("")).toContain("in a user's profile");
    expect(sys.errors.join("")).toContain("C:\\Program Files\\RonneAI\\Marketplace");
    expect(sys.dirs.size).toBe(0);
    expect(sys.commands.filter((line) => /^(takeown|icacls|net |netsh)/.test(line))).toEqual([]);
  });

  it("refuses without WinSW, and when Ronne's folder is a link", async () => {
    const missing = machine();
    missing.files.delete(WINSW);
    expect(await install(missing)).toBe(1);
    expect(missing.errors.join("")).toContain("WinSW");
    const linked = machine();
    linked.links.add("C:\\ProgramData\\RonneAI");
    expect(await install(linked)).toBe(1);
    expect(linked.errors.join("")).toContain("C:\\ProgramData\\RonneAI is a link");
    expect(linked.dirs.size).toBe(0);
  });

  it("makes the folders locked from the start, writes the XML, installs WinSW and starts it", async () => {
    const sys = machine();
    expect(await install(sys)).toBe(0);
    const lines = sys.commands
      .filter((line) => /^(powershell|icacls|takeown|copy|net |netsh|C:)/.test(line))
      .map((line) =>
        shown(line).startsWith("ps make ") ? `powershell ${madeIn(line)}` : shown(line),
      );
    expect(lines).toEqual([
      // Each folder made with its final permissions (RonneAI and Marketplace on the way to data).
      `powershell C:\\ProgramData\\RonneAI, ${ROOT}, ${ROOT}\\data (private)`,
      `powershell C:\\ProgramData\\RonneAI, ${ROOT}`,
      // The data: the service's account may change what's in it, never its permissions.
      `ps allow M ${APP_SID} ${ROOT}\\data`,
      // The settings file: the one file in the folder the service may write.
      `ps settings ${APP_SID} ${ROOT}\\.env`,
      // The logs, which WinSW writes as the service's account.
      `powershell C:\\ProgramData\\RonneAI, ${ROOT}, ${ROOT}\\logs (private)`,
      `ps allow M ${APP_SID} ${ROOT}\\logs`,
      // WinSW: its own copy, in a folder only the administrators may write.
      `powershell C:\\ProgramData\\RonneAI, ${ROOT}, ${ROOT}\\service`,
      `copy ${WINSW} ${ROOT}\\service\\rmk-server-service.exe`,
      `ps allow RX ${APP_SID} ${ROOT}\\service`,
      `${ROOT}\\service\\rmk-server-service.exe install`,
      "net start rmk-server",
      // Listening on 127.0.0.1, no proxy: no firewall rules (earlier ones are removed).
      "netsh advfirewall firewall delete rule name=rmk-server",
      "netsh advfirewall firewall delete rule name=rmk-server-proxy",
    ]);
    // No icacls or takeown: icacls looks a SID up, and the account has none before the service.
    expect(sys.commands.some((line) => /^(icacls|takeown)/.test(line))).toBe(false);
    // .env: exactly the administrators' (owner), SYSTEM's, and the account's Modify.
    const settings = sys.commands.find((line) => shown(line).startsWith("ps settings")) ?? "";
    expect(Buffer.from(settings.split(" ").pop() ?? "", "base64").toString("utf16le")).toContain(
      `O:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x1301bf;;;${APP_SID})`,
    );
    const xml = sys.files.get(`${ROOT}\\service\\rmk-server-service.xml`)?.content ?? "";
    expect(xml).toContain("<user>rmk-server</user>");
    expect(xml).toContain(`<env name="RONNE_ENV_FILE" value="${ROOT}\\.env"/>`);
    expect(sys.files.has(`${ROOT}\\.env`)).toBe(true);
    expect(readState(sys, layout)).toMatchObject({ port: 7650, user: "NT SERVICE\\rmk-server" });
    const output = sys.output.join("");
    expect(output).toContain("Address:   http://localhost:7650");
    expect(output).toContain(`Logs:      ${ROOT}\\logs\\rmk-server-service.out.log`);
    expect(output).toContain("finish the setup");
  });

  it("opens the port in the firewall on Private networks for --host 0.0.0.0", async () => {
    const sys = machine();
    expect(await install(sys, { host: "0.0.0.0" })).toBe(0);
    expect(sys.commands).toContain(
      "netsh advfirewall firewall add rule name=rmk-server dir=in action=allow protocol=TCP localport=7650 profile=private",
    );
  });

  it("installing again on 127.0.0.1 after 0.0.0.0 keeps its own port, and removes the rule", async () => {
    const sys = machine();
    expect(await install(sys, { host: "0.0.0.0" })).toBe(0);
    // Running, and holding 7650 (on 0.0.0.0): the port is the service's own.
    sys.answers.set("sc.exe query rmk-server", { code: 0, stdout: "  STATE : 4  RUNNING" });
    sys.busy.add(7650);
    sys.commands.length = 0;
    expect(await install(sys)).toBe(0);
    expect(sys.commands).toContain("netsh advfirewall firewall delete rule name=rmk-server");
    expect(sys.commands.some((line) => line.includes("add rule name=rmk-server "))).toBe(false);
  });

  it("installing again stops it, replaces WinSW and starts it, without registering it again", async () => {
    const sys = machine();
    expect(await install(sys)).toBe(0);
    sys.answers.set("sc.exe query", { code: 0, stdout: "        STATE              : 1  STOPPED" });
    sys.commands.length = 0;
    expect(await install(sys, { port: 7700 })).toBe(0);
    const service = sys.commands.filter((line) => /^(copy|net |C:)/.test(line));
    expect(service).toEqual([
      "net stop rmk-server /y",
      `copy ${WINSW} ${ROOT}\\service\\rmk-server-service.exe`,
      "net start rmk-server",
    ]);
    expect(sys.files.get(`${ROOT}\\service\\rmk-server-service.xml`)?.content).toContain(
      "--port 7700",
    );
  });

  it("refuses a folder of Ronne's that something else made, before writing anything", async () => {
    const sys = machine();
    // Anyone may make a folder in ProgramData: the check in makeFolder's script fails.
    sys.answers.set("powershell.exe", {
      code: 1,
      // The script's trap: one plain line (PowerShell's own errors would be CLIXML on stderr).
      stdout: `made\tC:\\ProgramData\\RonneAI\r\nerror\t${ROOT}\\data belongs to S-1-5-21-1-2-3-1001, not the administrators\r\n`,
      stderr: "#< CLIXML\r\n",
    });
    await expect(install(sys)).rejects.toThrow(
      `${ROOT}\\data belongs to S-1-5-21-1-2-3-1001, not the administrators. Ronne's folders are made by its install`,
    );
    expect(sys.files.has(`${ROOT}\\.env`)).toBe(false);
    expect(
      sys.commands.map(shown).some((line) => /^(ps allow|ps settings|copy|net )/.test(line)),
    ).toBe(false);
  });

  it("doesn't grant again on a folder an earlier install granted", async () => {
    const sys = machine();
    sys.answers.set("powershell.exe", {
      stdout: `kept\t${ROOT}\\data\tO:BAG:SYD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1301bf;;;${APP_SID})\r\n`,
    });
    expect(await install(sys)).toBe(0);
    expect(sys.commands.map(shown)).not.toContain(`ps allow M ${APP_SID} ${ROOT}\\data`);
  });

  it("refuses to run a script as the administrator over a link in the data folder", async () => {
    const sys = machine();
    expect(await install(sys)).toBe(0);
    sys.links.add(`${ROOT}\\data\\ronne.db`);
    const { scriptForService } = await import("./control.js");
    expect(await scriptForService(sys, context, "migrate", [])).toBe(1);
    expect(sys.errors.join("")).toContain(`${ROOT}\\data\\ronne.db is a link`);
    sys.links.clear();
    expect(await scriptForService(sys, context, "migrate", [])).toBe(0);
    expect(sys.attached.at(-1)?.env?.RONNE_DATA_DIR).toBe(`${ROOT}\\data`);
  });

  it("says when the service started but doesn't answer, with WinSW's logs", async () => {
    const sys = machine();
    sys.statuses = [undefined];
    sys.files.set(`${ROOT}\\logs\\rmk-server-service.err.log`, {
      content: "Error: listen EACCES\r\n",
      mode: 0o644,
    });
    // The 90-second wait, in ten-second steps.
    let now = 0;
    const realNow = Date.now;
    Date.now = () => (now += 10_000);
    try {
      expect(await install(sys)).toBe(1);
    } finally {
      Date.now = realNow;
    }
    expect(sys.errors.join("")).toContain("Error: listen EACCES");
    expect(sys.errors.join("")).toContain("rmk-server-service.out.log shows more");
  });
});

describe("--domain on Windows: the proxy service (086)", () => {
  const CADDY = "C:\\Program Files\\Caddy\\caddy.exe";
  const withCaddy = (sys: FakeSystem, path = CADDY): FakeSystem => {
    sys.which = (name) => (name === "caddy" ? path : undefined);
    sys.answers.set(`${path} version`, { stdout: "v2.11.6 h1:abc\r\n" });
    // The fake answers the same each time: not registered (1060) for activate, and running for the
    // check after the start.
    sys.answers.set("sc.exe query rmk-server-proxy", {
      code: 1060,
      stdout: "  STATE : 4  RUNNING",
    });
    return sys;
  };
  const domain = { domain: "ronne.example.com", tls: "internal" as const };

  it("needs Caddy on PATH, and says how to get it for the whole machine", async () => {
    const sys = machine();
    sys.which = () => undefined;
    expect(await install(sys, domain)).toBe(1);
    expect(sys.errors.join("")).toContain("winget install --id CaddyServer.Caddy --scope machine");
  });

  it("refuses a Caddy in a user's profile (winget for one person), before making anything", async () => {
    const sys = withCaddy(
      machine(),
      "C:\\Users\\ana\\AppData\\Local\\Microsoft\\WinGet\\Links\\caddy.exe",
    );
    expect(await install(sys, domain)).toBe(1);
    expect(sys.errors.join("")).toContain(
      "the proxy's account (NT SERVICE\\rmk-server-proxy) can't run",
    );
    expect(sys.errors.join("")).toContain("--scope machine");
    expect(sys.dirs.size).toBe(0);
  });

  it("adds rmk-server-proxy: its folders, its Caddyfile, after the server, and 80 and 443 open", async () => {
    const sys = withCaddy(machine());
    const code = await install(sys, domain);
    expect(sys.errors.join("")).toBe("");
    expect(code).toBe(0);
    const made = sys.commands.filter((line) => line.startsWith("powershell")).map(madeIn);
    expect(made).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${ROOT}\\proxy\\data (private)`),
        expect.stringContaining(`${ROOT}\\proxy\\certs (private)`),
        expect.stringContaining(`${ROOT}\\proxy\\logs (private)`),
      ]),
    );
    expect(sys.commands.map(shown)).toEqual(
      expect.arrayContaining([
        `ps allow M ${PROXY_SID} ${ROOT}\\proxy\\data`,
        `ps allow RX ${PROXY_SID} ${ROOT}\\proxy\\certs`,
        `ps allow M ${PROXY_SID} ${ROOT}\\proxy\\logs`,
        // It reads its Caddyfile, in a folder that's otherwise the administrators'.
        `ps allow RX ${PROXY_SID} ${ROOT}\\proxy`,
        // (no net start here: the fake already answers that it runs)
        `${ROOT}\\service\\rmk-server-proxy-service.exe install`,
        "netsh advfirewall firewall add rule name=rmk-server-proxy dir=in action=allow protocol=TCP localport=80,443 profile=any",
      ]),
    );
    const xml = sys.files.get(`${ROOT}\\service\\rmk-server-proxy-service.xml`)?.content ?? "";
    expect(xml).toContain("<depend>rmk-server</depend>");
    expect(xml).toContain("<user>rmk-server-proxy</user>");
    expect(xml).toContain(`<executable>${CADDY}</executable>`);
    expect(sys.files.get(`${ROOT}\\proxy\\Caddyfile`)?.content).toContain("ronne.example.com");
    expect(sys.files.get(`${ROOT}\\.env`)?.content).toContain(
      "PUBLIC_URL=https://ronne.example.com",
    );
    expect(sys.output.join("")).toContain("Proxy:     rmk-server-proxy, Caddy on ports 80 and 443");
  });

  it("port 80 taken by Windows' own HTTP server: says what it is and how to stop it", async () => {
    const sys = withCaddy(machine());
    // A first --domain: no proxy running yet, so 80 and 443 are checked.
    sys.answers.set("sc.exe query rmk-server-proxy", { code: 1060, stdout: "" });
    sys.busy.add(80);
    sys.answers.set("netstat -ano -p TCP", {
      stdout: "  TCP    0.0.0.0:80             0.0.0.0:0              LISTENING       4\r\n",
    });
    sys.answers.set("tasklist", { stdout: '"System","4","Services","0","152 K"\r\n' });
    expect(await install(sys, domain)).toBe(1);
    const message = sys.errors.join("");
    expect(message).toContain("port 80 is in use by System (pid 4)");
    expect(message).toContain("netsh http show servicestate");
    expect(message).toContain("Stop-Service W3SVC");
    expect(message).not.toContain("systemctl");
  });

  it("--tls files: reads certs\\cert.pem and key.pem, with paths Caddy reads", async () => {
    const sys = withCaddy(machine());
    expect(await install(sys, { ...domain, tls: "files" })).toBe(1);
    expect(sys.errors.join("")).toContain(`${ROOT}\\proxy\\certs\\cert.pem (the full chain)`);
    for (const file of ["cert.pem", "key.pem"])
      sys.files.set(`${ROOT}\\proxy\\certs\\${file}`, { content: "pem", mode: 0o600 });
    expect(await install(sys, { ...domain, tls: "files" })).toBe(0);
    expect(sys.files.get(`${ROOT}\\proxy\\Caddyfile`)?.content).toContain(
      "tls C:/ProgramData/RonneAI/Marketplace/proxy/certs/cert.pem C:/ProgramData/RonneAI/Marketplace/proxy/certs/key.pem",
    );
    expect(sys.commands.map(shown)).toContain(
      `ps allow RX ${PROXY_SID} ${ROOT}\\proxy\\certs\\key.pem`,
    );
  });

  it("installed again without a domain, the proxy, its rule and its Caddyfile go", async () => {
    const sys = withCaddy(machine());
    expect(await install(sys, domain)).toBe(0);
    sys.commands.length = 0;
    expect(await install(sys)).toBe(0);
    expect(sys.commands).toEqual(
      expect.arrayContaining([
        "net stop rmk-server-proxy /y",
        "sc.exe delete rmk-server-proxy",
        "netsh advfirewall firewall delete rule name=rmk-server-proxy",
      ]),
    );
    expect(sys.files.has(`${ROOT}\\proxy\\Caddyfile`)).toBe(false);
    expect(sys.files.has(`${ROOT}\\service\\rmk-server-proxy-service.xml`)).toBe(false);
    expect(sys.files.get(`${ROOT}\\.env`)?.content).not.toContain("PUBLIC_URL=https://");
  });
});

describe("the other subcommands on Windows (086)", () => {
  const installed = async (): Promise<FakeSystem> => {
    const sys = machine();
    await install(sys, { host: "0.0.0.0" });
    sys.answers.set("sc.exe query", { code: 0, stdout: "        STATE              : 4  RUNNING" });
    sys.commands.length = 0;
    sys.output.length = 0;
    return sys;
  };

  it("uninstall stops and removes the service and its rule, and keeps the data", async () => {
    const sys = await installed();
    expect(await uninstallService(sys, backendOf(sys), context, false)).toBe(0);
    expect(sys.commands).toEqual(
      expect.arrayContaining([
        "net stop rmk-server /y",
        "sc.exe delete rmk-server",
        "netsh advfirewall firewall delete rule name=rmk-server",
      ]),
    );
    expect(sys.files.has(`${ROOT}\\service\\rmk-server-service.xml`)).toBe(false);
    expect(sys.files.has(`${ROOT}\\service\\rmk-server-service.exe`)).toBe(false);
    expect(sys.files.has(`${ROOT}\\.env`)).toBe(true);
    expect(sys.output.join("")).toContain(
      "(in a terminal opened as administrator) uses them again",
    );
  });

  it("logs follows WinSW's output and error files", async () => {
    const sys = await installed();
    const { serviceLogs } = await import("./control.js");
    expect(await serviceLogs(sys, backendOf(sys), context)).toBe(0);
    expect(sys.followed).toEqual([
      [`${ROOT}\\logs\\rmk-server-service.out.log`, `${ROOT}\\logs\\rmk-server-service.err.log`],
    ]);
  });

  it("status: the details for an administrator, the state for anyone", async () => {
    const sys = await installed();
    expect(await serviceStatus(sys, backendOf(sys), context)).toBe(0);
    expect(sys.output.join("")).toContain("installed, running");
    expect(sys.output.join("")).toContain("Listens:   0.0.0.0:7650");
    // A plain terminal can't read service.json (the administrators' only).
    const plain = fakeSystem({ platform: "win32", root: false });
    plain.files.set(`${ROOT}\\service\\rmk-server-service.xml`, { content: "", mode: 0o644 });
    plain.answers.set("sc.exe query", { code: 0, stdout: "  STATE : 4  RUNNING" });
    expect(await serviceStatus(plain, backendOf(plain), context)).toBe(0);
    expect(plain.output.join("")).toContain(
      "installed, running. Its details are for administrators",
    );
  });

  it("restart stops (with what depends on it) and starts it again", async () => {
    const sys = await installed();
    const { controlService } = await import("./control.js");
    sys.answers.set("sc.exe query", { code: 0, stdout: "  STATE : 1  STOPPED" });
    expect(await controlService(sys, backendOf(sys), context, "restart")).toBe(0);
    expect(sys.commands.filter((line) => line.startsWith("net "))).toEqual([
      "net stop rmk-server /y",
      "net start rmk-server",
    ]);
  });
});

describe("choosing the Windows backend (086)", () => {
  it("lays out under ProgramData, with the package's WinSW", () => {
    const sys = machine();
    sys.env.ProgramData = "D:\\ProgramData";
    const target = serviceTarget(sys, { node: NODE, entry: ENTRY, version: "0.3.0" });
    if ("error" in target) throw new Error(target.error);
    expect(target.context.layout.dataDir).toBe("D:\\ProgramData\\RonneAI\\Marketplace\\data");
    expect(serviceTarget(sys, { node: NODE, entry: ENTRY, version: "0.3.0" }, true)).toEqual({
      error: "--user is for macOS; on Windows the service always has its own account.",
    });
  });
});
