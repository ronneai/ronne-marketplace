// The Windows backend (feature 086): WinSW services as virtual accounts, folder permissions with
// icacls, the firewall with netsh. Every account is given by its SID: names such as
// "Administrators" are translated on other languages' Windows, and a service's virtual account
// (NT SERVICE\<name>) has no name to look up until the service exists.
import { win32 } from "node:path";
import type { Backend } from "./install.js";
import type { ServiceLayout } from "./layout.js";
import type { ServiceDefinition } from "./model.js";
import type { System } from "./system.js";
import { renderWinswXml } from "./winsw.js";

export const SYSTEM_SID = "S-1-5-18";
export const ADMINISTRATORS_SID = "S-1-5-32-544";
export const USERS_SID = "S-1-5-32-545";

/** The service SID in `sc.exe showsid`'s answer, if there's one. */
export const parseServiceSid = (output: string): string | undefined =>
  /\bS-1-5-80(?:-\d+){5}\b/.exec(output)?.[0];

/** The program WinSW runs as for a service: its definition's .xml, as .exe. */
export const wrapperPath = (definitionPath: string): string =>
  definitionPath.replace(/\.xml$/i, ".exe");

/** WinSW's log files for a service: named after the wrapper (rmk-server-service.out.log …). */
export const logFiles = (
  definition: ServiceDefinition,
): { out: string; err: string; wrapper: string } => {
  const base = win32.join(definition.logDir ?? "", `${definition.name}-service`);
  return { out: `${base}.out.log`, err: `${base}.err.log`, wrapper: `${base}.wrapper.log` };
};

/** Whether `path` is in a user's profile (C:\Users\…), which a service's account can't read. */
export const inUserProfile = (path: string, profilesRoot: string): boolean =>
  path.toLowerCase().startsWith(`${profilesRoot.replace(/\\+$/, "").toLowerCase()}\\`);

/** The PID listening on a TCP port, from `netstat -ano -p TCP`. */
export const listeningPid = (netstat: string, port: number): string | undefined => {
  for (const line of netstat.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    // TCP  0.0.0.0:7650  0.0.0.0:0  LISTENING  1234 (the state's word may be translated)
    if (fields.length === 5 && fields[0] === "TCP" && fields[1]?.endsWith(`:${port}`))
      if (fields[2]?.endsWith(":0")) return fields[4];
  }
  return undefined;
};

const lastLines = (text: string | undefined, count: number): string[] => {
  const lines = (text ?? "").split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.slice(-count);
};

export const WINDOWS_CADDY_HINT =
  "Install it for the whole machine, in a terminal opened as administrator: winget install --id CaddyServer.Caddy --scope machine. Then open a new terminal, so caddy is on PATH, and run this again.";

export const windowsBackend = (
  sys: System,
  options: { layout: ServiceLayout; winsw: string },
): Backend => {
  const { layout, winsw } = options;
  const run = (command: string, args: string[]) => sys.run(command, args);
  const must = (command: string, args: string[]): void => {
    const result = run(command, args);
    if (result.code !== 0)
      throw new Error(
        `${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`,
      );
  };
  const query = (name: string) => run("sc.exe", ["query", name]);
  // A service's virtual account (NT SERVICE\<name>) has a SID Windows derives from the name, which
  // `sc showsid` gives for any name, registered or not: so it's set on folders before the service
  // exists, without looking up a name that isn't there yet.
  const sids = new Map<string, string>();
  const serviceSid = (name: string): string => {
    const known = sids.get(name);
    if (known) return known;
    const sid = parseServiceSid(run("sc.exe", ["showsid", name]).stdout);
    if (!sid) throw new Error(`sc.exe showsid ${name} gave no service SID.`);
    sids.set(name, sid);
    return sid;
  };
  /** An account as icacls takes it (*SID): root and Administrators are the administrators. */
  const sidFor = (account: string): string => {
    if (account === "root" || account === "Administrators") return ADMINISTRATORS_SID;
    const at = account.indexOf("\\");
    if (at > 0 && account.slice(0, at).toUpperCase() === "NT SERVICE")
      return serviceSid(account.slice(at + 1));
    throw new Error(
      `No SID for the account ${account} (it isn't a service's or the administrators').`,
    );
  };
  // net start and stop wait until the service has started or stopped; /y also stops the services
  // that depend on it (the proxy depends on the server).
  const stopService = (name: string) => run("net", ["stop", name, "/y"]);
  const startService = (definition: ServiceDefinition): string | undefined => {
    if (/\s4\s+RUNNING\b/.test(query(definition.name).stdout)) return undefined;
    const result = run("net", ["start", definition.name]);
    return result.code === 0 ? undefined : (result.stderr || result.stdout).trim();
  };
  const profilesRoot = sys.env.USERPROFILE
    ? win32.dirname(sys.env.USERPROFILE)
    : `${sys.env.SystemDrive ?? "C:"}\\Users`;
  const top = win32.dirname(layout.settingsDir); // RonneAI: Ronne's tree starts here
  // Folders no one but SYSTEM, the administrators and their service's account may see into.
  const privateFolders = new Set(
    [
      layout.dataDir,
      layout.logDir,
      layout.proxyLogDir,
      layout.proxyDataDir,
      layout.certsDir,
    ].filter((path): path is string => Boolean(path)),
  );
  /** What makeFolder found: made now, or there already with this security descriptor (SDDL). */
  const folders = new Map<string, { made: boolean; sddl: string }>();

  /**
   * Makes `path` and its missing parents in Ronne's tree, each with its final permissions from the
   * start (Directory.CreateDirectory with a security descriptor), so there's no moment another
   * account could get in: anyone may make folders in ProgramData. Each is checked after, made now
   * or not (CreateDirectory succeeds when someone made it in between): the administrators' (or,
   * one that was there, SYSTEM's or this administrator's), not a link, and nobody but SYSTEM, the
   * administrators and services' accounts may write in it; RonneAI, in ProgramData, must also have
   * its own permissions (below it only administrators make folders).
   */
  const makeFolders = (path: string) => {
    const parts: string[] = [];
    for (let at = path; ; at = win32.dirname(at)) {
      parts.unshift(at);
      if (at.toLowerCase() === top.toLowerCase() || win32.dirname(at) === at) break;
    }
    const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$ProgressPreference = 'SilentlyContinue'",
      // Errors as one plain line on standard output: PowerShell's own go out as CLIXML.
      'trap { "error`t$($_.Exception.Message)"; exit 1 }',
      // Owner the administrators; SYSTEM and the administrators full control; Users may list the
      // folders under it (CI: folders, not files). Private ones: no Users.
      "$open = 'O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;CI;0x1200a9;;;BU)'",
      "$private = 'O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)'",
      // The administrator running this may own a folder they made inside Ronne's (certs, say).
      "$me = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
      // Who may write in one of Ronne's folders: SYSTEM, the administrators, services' accounts.
      "$writes = 0xD0156 -bor 0x50000000",
      `function Check($p, $top, $made) {
  $i = Get-Item -LiteralPath $p -Force
  if ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "$p is a link (a symbolic link or a junction)" }
  if (-not $i.PSIsContainer) { throw "$p isn't a folder" }
  $acl = Get-Acl -LiteralPath $p
  $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  $owners = if ($made) { @('S-1-5-32-544') } else { @('S-1-5-32-544', 'S-1-5-18', $me) }
  if ($owner -notin $owners) { throw "$p belongs to $owner, not the administrators" }
  if ($top -and -not $acl.AreAccessRulesProtected) { throw "$p takes its permissions from ProgramData, where anyone may make folders" }
  foreach ($r in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
    $sid = $r.IdentityReference.Value
    if ($r.AccessControlType -eq 'Allow' -and ([int64]$r.FileSystemRights -band $writes) -and $sid -ne 'S-1-5-18' -and $sid -ne 'S-1-5-32-544' -and -not $sid.StartsWith('S-1-5-80-')) { throw "$p lets $sid write in it" }
  }
  $acl.Sddl
}`,
      // Made with its final permissions; checked after, made now or not: CreateDirectory succeeds
      // without a word when another account made the folder in between.
      ...parts.map(
        (part) =>
          `$p = ${quote(part)}; $sd = ${privateFolders.has(part) ? "$private" : "$open"}
$made = -not (Test-Path -LiteralPath $p)
if ($made) {
  $s = New-Object System.Security.AccessControl.DirectorySecurity
  $s.SetSecurityDescriptorSddlForm($sd)
  [void][IO.Directory]::CreateDirectory($p, $s)
}
$sddl = Check $p ${part.toLowerCase() === top.toLowerCase() ? "$true" : "$false"} $made
if ($made) { "made\`t$p" } else { "kept\`t$p\`t$sddl" }`,
      ),
    ].join("\n");
    const result = run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ]);
    if (result.code !== 0) {
      const reason =
        /^error\t(.*)$/m.exec(result.stdout)?.[1]?.trim() ??
        (result.stderr || result.stdout).trim().split(/\r?\n/)[0] ??
        "";
      throw new Error(
        `${reason}. Ronne's folders are made by its install, the administrators' only; this one was made by something else. Look at it, remove it or move it aside, and run this again.`,
      );
    }
    for (const line of result.stdout.split(/\r?\n/)) {
      const [what, folder, sddl] = line.split("\t");
      if ((what === "made" || what === "kept") && folder)
        folders.set(folder, { made: what === "made", sddl: sddl ?? "" });
    }
  };

  /** Grants an account rights on a folder of Ronne's, unless it has them (an earlier install). */
  const grant = (path: string, sid: string, rights: "M" | "RX") => {
    const found = folders.get(path);
    // Already there: granted then, and any rule of this account in its SDDL means so. Granting
    // again would make icacls walk what the account may have put in it.
    if (found && !found.made && found.sddl.includes(`;;;${sid})`)) return;
    must("icacls", [path, "/grant", `*${sid}:(OI)(CI)${rights === "M" ? "M" : "RX"}`, "/Q"]);
  };

  return {
    unavailable: () => {
      if (!sys.exists(winsw))
        return `WinSW, which runs rmk-server as a Windows service, isn't in this rmk-server (${winsw}). Reinstall it: npm install --global @ronneai/marketplace, or use the Windows bundle.`;
      for (const path of [win32.dirname(layout.settingsDir), layout.settingsDir])
        if (sys.isLink(path))
          return `${path} is a link (a symbolic link or a junction), which Ronne's folder never is; something put it there. Look at it, remove it, and run this again.`;
      return undefined;
    },
    render: renderWinswXml,
    isActive: (definition) => /\s4\s+RUNNING\b/.test(query(definition.name).stdout),
    // Virtual accounts: Windows makes NT SERVICE\<name> with the service and removes it with it.
    ensureAccount: () => false,
    removeAccount: () => {},
    // A service's account can't read anyone's profile, where npm's global folder (%APPDATA%\npm),
    // nvm and downloads are. Programs elsewhere (Program Files) are readable by every account.
    canRun: (_user, program, args) =>
      [program, ...args]
        .filter((path) => /^[A-Za-z]:\\|^\\\\/.test(path))
        .every((path) => !inUserProfile(path, profilesRoot)),
    cantRunHint: (user, node, entry) =>
      `the service's account (${user}) can't run ${entry} with ${node}: it's in a user's profile (npm's global folder is %APPDATA%\\npm), which other accounts can't read. Use the Windows bundle instead: unzip rmk-server-<version>-win32-x64.zip (or -arm64) from https://github.com/ronneai/ronne-marketplace/releases into C:\\Program Files\\RonneAI\\Marketplace, then run its bin\\rmk-server.cmd service install, in a terminal opened as administrator.`,
    // Ronne's folders got their permissions when makeFolder made them: here an account is given
    // its own. The settings file is the one file it may write (Modify: never the permissions).
    chown: (path, user, group) => {
      if (path === layout.envFile) {
        if (sys.isLink(path))
          throw new Error(
            `${path} is a link (a symbolic link or a file with another hard link), which the settings file never is. Look at it, remove it, and run this again.`,
          );
        must("icacls", [
          path,
          "/inheritance:r",
          "/grant:r",
          `*${SYSTEM_SID}:F`,
          `*${ADMINISTRATORS_SID}:F`,
          `*${sidFor(user)}:M`,
          "/Q",
        ]);
        must("icacls", [path, "/setowner", `*${ADMINISTRATORS_SID}`, "/Q"]);
        return;
      }
      if (user !== "root") grant(path, sidFor(user), "M");
      // Read for a group: the proxy's account on its certificates (task 4).
      if (group && group !== user && group !== layout.rootGroup) grant(path, sidFor(group), "RX");
    },
    shareWithGroup: (paths, group) => {
      for (const path of paths) must("icacls", [path, "/grant", `*${sidFor(group)}:(RX)`, "/Q"]);
    },
    makeFolder: (path, mode) => {
      if (
        path.toLowerCase().startsWith(`${top.toLowerCase()}\\`) ||
        path.toLowerCase() === top.toLowerCase()
      )
        makeFolders(path);
      sys.mkdir(path, mode);
    },
    labelFolders: () => {},
    activate: (definition, path) => {
      const wrapper = wrapperPath(path);
      const registered = query(definition.name).code === 0;
      if (registered) stopService(definition.name);
      try {
        // Its own copy, beside its XML: npm can then replace the package's files while it runs.
        sys.copyFile(winsw, wrapper);
        // The proxy reads its Caddyfile, in a folder that's otherwise the administrators'.
        if (definition.user === layout.proxyUser)
          grant(layout.proxySettingsDir, serviceSid(definition.name), "RX");
        // The service's account reads its WinSW and XML; the folder is otherwise the administrators'.
        must("icacls", [
          win32.dirname(path),
          "/grant",
          `*${serviceSid(definition.name)}:(OI)(CI)(RX)`,
          "/Q",
        ]);
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      // Already registered: what Windows keeps (the account, the start mode, the dependency, the
      // restarts) never changes between installs, and WinSW reads the XML at each start.
      if (!registered) {
        const result = run(wrapper, ["install"]);
        if (result.code !== 0)
          return `${wrapper} install failed: ${(result.stderr || result.stdout).trim()}`;
      }
      return startService(definition);
    },
    deactivate: (definition, path) => {
      stopService(definition.name);
      run("sc.exe", ["delete", definition.name]);
      sys.remove(path);
      sys.remove(wrapperPath(path));
    },
    start: (definition) => startService(definition),
    stop: (definition) => {
      stopService(definition.name);
    },
    restart: (definition) => {
      stopService(definition.name);
      return startService(definition);
    },
    followLogs: (definitions) =>
      sys.followFiles(
        definitions.flatMap((definition) => {
          const files = logFiles(definition);
          return [files.out, files.err];
        }),
        50,
      ),
    recentLogs: (definition) => {
      const files = logFiles(definition);
      return [files.wrapper, files.out, files.err]
        .map((file) => lastLines(sys.readFile(file), 40))
        .filter((lines) => lines.length > 0)
        .map((lines) => `${lines.join("\n")}\n`)
        .join("");
    },
    logsHint: (definition) => logFiles(definition).out,
    caddyHint: () => WINDOWS_CADDY_HINT,
    portHolder: (port) => {
      const pid = listeningPid(run("netstat", ["-ano", "-p", "TCP"]).stdout, port);
      if (!pid) return undefined;
      // "node.exe","1234","Services","0","50,000 K"
      const row = run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]).stdout;
      const program = /^"([^"]+)","(\d+)"/.exec(row.trim());
      return program?.[2] === pid ? `${program[1]} (pid ${pid})` : `pid ${pid}`;
    },
    // One inbound rule per service, named after it, for Private networks only.
    allowInbound: (name, ports, everywhere = false) => {
      run("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${name}`]);
      must("netsh", [
        "advfirewall",
        "firewall",
        "add",
        "rule",
        `name=${name}`,
        "dir=in",
        "action=allow",
        "protocol=TCP",
        `localport=${ports.join(",")}`,
        `profile=${everywhere ? "any" : "private"}`,
      ]);
    },
    removeInbound: (name) => {
      // Fails when there's no such rule, which is fine.
      run("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${name}`]);
    },
  };
};
