import { describe, expect, it } from "vitest";
import { serviceStatus } from "./control.js";
import { type FakeSystem, fakeSystem } from "./fake-system.js";
import { serviceTarget } from "./index.js";
import { installService, readState, uninstallService } from "./install.js";
import { serviceLayout } from "./layout.js";
import {
  ADMINISTRATORS_SID,
  inUserProfile,
  listeningPid,
  serviceSid,
  windowsBackend,
} from "./windows.js";

// The feature-086 backend, on the fake system: what it runs, in order.
const layout = serviceLayout({ platform: "win32" });
const ROOT = "C:\\ProgramData\\RonneAI\\Marketplace";
const PROGRAM = "C:\\Program Files\\RonneAI\\Marketplace";
const NODE = `${PROGRAM}\\node\\node.exe`;
const ENTRY = `${PROGRAM}\\lib\\node_modules\\@ronneai\\marketplace\\dist\\bin.js`;
const WINSW = `${PROGRAM}\\lib\\node_modules\\@ronneai\\marketplace\\vendor\\winsw\\WinSW.NET461.exe`;
const context = { layout, node: NODE, entry: ENTRY, version: "0.3.0" };
const defaults = { port: 7650, host: "127.0.0.1", tls: "auto" as const, user: false };
const APP_SID = serviceSid("rmk-server");

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
  return sys;
};
const backendOf = (sys: FakeSystem) => windowsBackend(sys, { layout, winsw: WINSW });
const install = (sys: FakeSystem, options: Partial<typeof defaults> = {}) =>
  installService(sys, backendOf(sys), context, { ...defaults, ...options });

describe("the service's account (086)", () => {
  it("has the SID Windows computes from the service's name", () => {
    // sc showsid TrustedInstaller, as documented by Microsoft.
    expect(serviceSid("TrustedInstaller")).toBe(
      "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464",
    );
    // Case doesn't matter: Windows upper-cases the name first.
    expect(serviceSid("rmk-server")).toBe(serviceSid("RMK-SERVER"));
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
    const admins = `*${ADMINISTRATORS_SID}`;
    const lines = sys.commands
      .filter((line) => /^(powershell|icacls|takeown|copy|net |netsh|C:)/.test(line))
      .map((line) => (line.startsWith("powershell") ? `powershell ${madeIn(line)}` : line));
    expect(lines).toEqual([
      // Each folder made with its final permissions (RonneAI and Marketplace on the way to data).
      `powershell C:\\ProgramData\\RonneAI, ${ROOT}, ${ROOT}\\data (private)`,
      `powershell C:\\ProgramData\\RonneAI, ${ROOT}`,
      // The data: the service's account may change what's in it, never its permissions.
      `icacls ${ROOT}\\data /grant *${APP_SID}:(OI)(CI)M /Q`,
      // The settings file: the one file in the folder the service may write.
      `icacls ${ROOT}\\.env /inheritance:r /grant:r *S-1-5-18:F ${admins}:F *${APP_SID}:M /Q`,
      `icacls ${ROOT}\\.env /setowner ${admins} /Q`,
      // The logs, which WinSW writes as the service's account.
      `powershell C:\\ProgramData\\RonneAI, ${ROOT}, ${ROOT}\\logs (private)`,
      `icacls ${ROOT}\\logs /grant *${APP_SID}:(OI)(CI)M /Q`,
      // WinSW: its own copy, in a folder only the administrators may write.
      `powershell C:\\ProgramData\\RonneAI, ${ROOT}, ${ROOT}\\service`,
      `copy ${WINSW} ${ROOT}\\service\\rmk-server-service.exe`,
      `icacls ${ROOT}\\service /grant *${APP_SID}:(OI)(CI)(RX) /Q`,
      `${ROOT}\\service\\rmk-server-service.exe install`,
      "net start rmk-server",
      // Listening on 127.0.0.1: no firewall rule (an earlier one is removed).
      "netsh advfirewall firewall delete rule name=rmk-server",
    ]);
    expect(sys.commands.some((line) => line.startsWith("takeown") || line.includes("/T"))).toBe(
      false,
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
      stderr: `${ROOT}\\data belongs to S-1-5-21-1-2-3-1001, not the administrators\r\n`,
    });
    await expect(install(sys)).rejects.toThrow(
      `${ROOT}\\data belongs to S-1-5-21-1-2-3-1001, not the administrators. Ronne's folders are made by its install`,
    );
    expect(sys.files.has(`${ROOT}\\.env`)).toBe(false);
    expect(sys.commands.some((line) => /^(icacls|copy|net )/.test(line))).toBe(false);
  });

  it("doesn't grant again on a folder an earlier install granted", async () => {
    const sys = machine();
    sys.answers.set("powershell.exe", {
      stdout: `kept\t${ROOT}\\data\tO:BAG:SYD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1301bf;;;${APP_SID})\r\n`,
    });
    expect(await install(sys)).toBe(0);
    expect(sys.commands.some((line) => line.startsWith(`icacls ${ROOT}\\data`))).toBe(false);
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
