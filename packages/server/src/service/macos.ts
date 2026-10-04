// The macOS backend (feature 083): launchd daemons in the system domain, accounts through dscl.
import type { Backend } from "./install.js";
import { renderLaunchdPlist } from "./launchd.js";
import type { ServiceDefinition } from "./model.js";
import type { System } from "./system.js";

/**
 * Homebrew's Node reports its versioned path (…/Cellar/node@24/24.21.0/bin/node), which `brew
 * upgrade` removes. Its opt link (…/opt/node@24/bin/node) follows upgrades, so the service uses it.
 */
export const stableNodePath = (execPath: string): string => {
  const at = execPath.indexOf("/Cellar/");
  if (at < 0) return execPath;
  const [formula, version, ...rest] = execPath.slice(at + "/Cellar/".length).split("/");
  if (!formula || !version || rest.length === 0) return execPath;
  return `${execPath.slice(0, at)}/opt/${formula}/${rest.join("/")}`;
};

/** Homebrew's prefix when rmk-server came from it (Apple silicon), else /usr/local. */
export const macPrefix = (entry: string): string =>
  entry.startsWith("/opt/homebrew/") ? "/opt/homebrew" : "/usr/local";

/**
 * The highest number below 500 (macOS's system range) that no account or group uses. Apple's own
 * accounts fill it from 200 up, so the top is least likely to meet a future one.
 */
export const freeSystemId = (listings: string[]): number | undefined => {
  const used = new Set<number>();
  for (const listing of listings)
    for (const line of listing.split("\n")) {
      const id = Number(line.trim().split(/\s+/).pop());
      if (Number.isInteger(id)) used.add(id);
    }
  for (let id = 499; id >= 200; id--) if (!used.has(id)) return id;
  return undefined;
};

const NOT_FOUND = 56;

export const macBackend = (sys: System): Backend => {
  const launchctl = (...args: string[]) => sys.run("launchctl", args);
  const dscl = (...args: string[]) => sys.run("dscl", [".", ...args]);
  const target = (definition: ServiceDefinition) => `system/${definition.label}`;
  const pause = () => sys.run("sleep", ["1"]);
  return {
    unavailable: () => undefined,
    render: renderLaunchdPlist,
    isActive: (definition) => {
      const result = launchctl("print", target(definition));
      return result.code === 0 && /\bstate = running\b/.test(result.stdout);
    },
    ensureAccount: (user, group, _home) => {
      // 56 is dscl's "record not found"; any other failure isn't proof the account is missing.
      const existing = dscl("-read", `/Users/${user}`);
      if (existing.code === 0) return false;
      if (existing.code !== NOT_FOUND)
        throw new Error(`Couldn't check for the ${user} account: ${existing.stderr.trim()}`);
      const id = freeSystemId([
        dscl("-list", "/Users", "UniqueID").stdout,
        dscl("-list", "/Groups", "PrimaryGroupID").stdout,
      ]);
      if (id === undefined)
        throw new Error(`Couldn't create the ${user} account: no free id from 200 to 499.`);
      const steps: string[][] = [];
      const groupRead = dscl("-read", `/Groups/${group}`);
      if (groupRead.code !== 0 && groupRead.code !== NOT_FOUND)
        throw new Error(`Couldn't check for the ${group} group: ${groupRead.stderr.trim()}`);
      if (groupRead.code === NOT_FOUND)
        steps.push(
          ["-create", `/Groups/${group}`],
          ["-create", `/Groups/${group}`, "PrimaryGroupID", String(id)],
          ["-create", `/Groups/${group}`, "RealName", "Ronne AI Marketplace"],
          ["-create", `/Groups/${group}`, "Password", "*"],
        );
      const gid =
        steps.length > 0
          ? String(id)
          : (/PrimaryGroupID:\s*(\d+)/.exec(
              dscl("-read", `/Groups/${group}`, "PrimaryGroupID").stdout,
            )?.[1] ?? String(id));
      steps.push(
        ["-create", `/Users/${user}`],
        ["-create", `/Users/${user}`, "UniqueID", String(id)],
        ["-create", `/Users/${user}`, "PrimaryGroupID", gid],
        ["-create", `/Users/${user}`, "UserShell", "/usr/bin/false"],
        ["-create", `/Users/${user}`, "NFSHomeDirectory", "/var/empty"],
        ["-create", `/Users/${user}`, "RealName", "Ronne AI Marketplace"],
        ["-create", `/Users/${user}`, "Password", "*"],
        ["-create", `/Users/${user}`, "IsHidden", "1"],
      );
      for (const step of steps) {
        const result = dscl(...step);
        if (result.code !== 0)
          throw new Error(
            `Couldn't create the ${user} account (dscl ${step.join(" ")}): ${result.stderr.trim()}`,
          );
      }
      return true;
    },
    removeAccount: (user, group) => {
      dscl("-delete", `/Users/${user}`);
      if (dscl("-read", `/Groups/${group}`).code === 0) dscl("-delete", `/Groups/${group}`);
    },
    canRun: (user, program, args) => sys.run("sudo", ["-u", user, program, ...args]).code === 0,
    chown: (path, user, group, recursive = true) => {
      sys.run("chown", [...(recursive ? ["-R"] : []), `${user}:${group}`, path]);
    },
    // The proxy runs as root on macOS, so its certificates need no group.
    shareWithGroup: () => {},
    labelFolders: () => {},
    activate: (definition, path) => {
      // Unload what's there (a reinstall), clear a `launchctl disable` (which outlives a bootout
      // and would make bootstrap fail), then load the new plist; RunAtLoad starts it.
      launchctl("bootout", target(definition));
      launchctl("enable", target(definition));
      let result = launchctl("bootstrap", "system", path);
      // Right after a bootout, launchd can still be tearing the old job down ("5: Input/output
      // error"): try again for a few seconds.
      for (let tries = 0; result.code !== 0 && tries < 10; tries++) {
        pause();
        result = launchctl("bootstrap", "system", path);
      }
      if (result.code !== 0)
        return `launchctl bootstrap system ${path} failed: ${(result.stderr || result.stdout).trim()}`;
      return undefined;
    },
    start: (definition, path) => {
      // Loaded but stopped: start it; not loaded (after stop): load it, and RunAtLoad starts it.
      if (launchctl("print", target(definition)).code === 0) {
        const result = launchctl("kickstart", target(definition));
        return result.code === 0 ? undefined : (result.stderr || result.stdout).trim();
      }
      launchctl("enable", target(definition));
      const result = launchctl("bootstrap", "system", path);
      return result.code === 0 ? undefined : (result.stderr || result.stdout).trim();
    },
    // KeepAlive would start it again after a kill, so stopping unloads it. The plist stays, so
    // launchd loads it again at the next boot, as systemd starts an enabled unit.
    stop: (definition) => {
      launchctl("bootout", target(definition));
    },
    restart: (definition, path) => {
      if (launchctl("print", target(definition)).code !== 0) {
        launchctl("enable", target(definition));
        const result = launchctl("bootstrap", "system", path);
        return result.code === 0 ? undefined : (result.stderr || result.stdout).trim();
      }
      const result = launchctl("kickstart", "-k", target(definition));
      return result.code === 0 ? undefined : (result.stderr || result.stdout).trim();
    },
    followLogs: (definitions) =>
      sys.runAttached("tail", [
        "-n",
        "50",
        "-F",
        ...definitions.flatMap((definition) => (definition.logFile ? [definition.logFile] : [])),
      ]),
    deactivate: (definition, path) => {
      launchctl("bootout", target(definition));
      sys.remove(path);
    },
    recentLogs: (definition) =>
      definition.logFile
        ? (sys.readFile(definition.logFile) ?? "").split("\n").slice(-40).join("\n")
        : "",
    logsHint: (definition) => `tail -f ${definition.logFile ?? "/Library/Logs/rmk-server"}`,
    caddyHint: () =>
      "Install it with Homebrew: brew install caddy (and don't start brew's own caddy service, which would take ports 80 and 443).",
    portHolder: (port) => {
      const listing = sys.run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"]).stdout;
      const pid = /^p(\d+)$/m.exec(listing)?.[1];
      const command = /^c(.+)$/m.exec(listing)?.[1];
      return pid ? `${command ?? "a program"} (pid ${pid})` : undefined;
    },
  };
};
