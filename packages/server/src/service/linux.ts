// The Linux backend (feature 083): systemd, useradd, SELinux labels.
import type { Backend } from "./install.js";
import type { ServiceDefinition } from "./model.js";
import type { System } from "./system.js";
import { renderSystemdUnit } from "./systemd.js";

/** The no-login shell, wherever this distribution keeps it. */
const noLogin = (sys: System): string =>
  ["/usr/sbin/nologin", "/sbin/nologin"].find((path) => sys.exists(path)) ?? "/bin/false";

/** ID and ID_LIKE from /etc/os-release, lower case. */
export const osFamily = (osRelease: string | undefined): string[] => {
  const ids: string[] = [];
  for (const line of (osRelease ?? "").split("\n")) {
    const [key, value] = line.split("=", 2);
    if ((key === "ID" || key === "ID_LIKE") && value)
      ids.push(...value.replaceAll('"', "").toLowerCase().split(" "));
  }
  return ids;
};

export const caddyHintFor = (family: string[]): string => {
  const has = (id: string) => family.includes(id);
  if (has("debian") || has("ubuntu"))
    return "Install it from Caddy's own repository (Debian's and Ubuntu's caddy is 2.6, too old): https://caddyserver.com/docs/install#debian-ubuntu-raspbian. Its package starts a caddy service on ports 80 and 443; stop that one with sudo systemctl disable --now caddy.";
  if (has("fedora") || has("rhel") || has("centos"))
    return "Install it with sudo dnf install caddy (on RHEL, from EPEL or Caddy's COPR: https://caddyserver.com/docs/install#fedora-redhat-centos), then sudo systemctl disable --now caddy if its own service started.";
  if (has("arch")) return "Install it with sudo pacman -S caddy.";
  if (has("alpine")) return "Install it with sudo apk add caddy.";
  return "Install it from https://caddyserver.com/docs/install, as a single binary on PATH.";
};

export const linuxBackend = (sys: System): Backend => {
  const systemctl = (...args: string[]) => sys.run("systemctl", args);
  return {
    unavailable: () =>
      sys.exists("/run/systemd/system")
        ? undefined
        : "systemd isn't running here (a container, WSL 1 or another init system), so there's no service to install. Run rmk-server start under your own supervisor, or use Docker: https://github.com/ronneai/ronne-marketplace#with-docker",
    render: renderSystemdUnit,
    isActive: (definition) => systemctl("is-active", "--quiet", definition.name).code === 0,
    ensureAccount: (user, group, home) => {
      if (sys.run("getent", ["passwd", user]).code === 0) return false;
      const groupExists = sys.run("getent", ["group", group]).code === 0;
      const result = sys.run("useradd", [
        "--system",
        ...(groupExists ? ["--gid", group] : ["--user-group"]),
        "--home-dir",
        home,
        "--no-create-home",
        "--shell",
        noLogin(sys),
        "--comment",
        "Ronne AI Marketplace",
        user,
      ]);
      if (result.code !== 0)
        throw new Error(`Couldn't create the ${user} account: ${result.stderr.trim()}`);
      return true;
    },
    removeAccount: (user, group) => {
      sys.run("userdel", [user]);
      // userdel removes a same-named group it created, but not on every distribution.
      if (sys.run("getent", ["group", group]).code === 0) sys.run("groupdel", [group]);
    },
    // Started as the account by Node itself: runuser isn't on minimal systems (Fedora's container
    // image), and id is coreutils.
    canRun: (user, program, args) => {
      const ids = ["-u", "-g"].map((flag) => sys.run("id", [flag, user]));
      if (ids.some((result) => result.code !== 0 || !/^\d+$/.test(result.stdout.trim())))
        return false;
      const [uid, gid] = ids.map((result) => Number(result.stdout.trim())) as [number, number];
      return sys.run(program, args, { uid, gid }).code === 0;
    },
    chown: (path, user, group, recursive = true) => {
      sys.run("chown", [...(recursive ? ["-R"] : []), `${user}:${group}`, path]);
    },
    shareWithGroup: (paths, group) => {
      sys.run("chgrp", [group, ...paths]);
      sys.run("chmod", ["g+rX", ...paths]);
    },
    labelFolders: (paths) => {
      // Fedora and RHEL: give new folders their default SELinux context.
      if (sys.run("selinuxenabled", []).code === 0) sys.run("restorecon", ["-R", ...paths]);
    },
    activate: (definition: ServiceDefinition) => {
      for (const args of [
        ["daemon-reload"],
        ["enable", definition.name],
        ["restart", definition.name],
      ]) {
        const result = systemctl(...args);
        if (result.code !== 0)
          return `systemctl ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`;
      }
      return undefined;
    },
    start: (definition) => {
      const result = systemctl("start", definition.name);
      return result.code === 0 ? undefined : (result.stderr || result.stdout).trim();
    },
    stop: (definition) => {
      systemctl("stop", definition.name);
    },
    restart: (definition) => {
      const result = systemctl("restart", definition.name);
      return result.code === 0 ? undefined : (result.stderr || result.stdout).trim();
    },
    followLogs: (definitions) =>
      sys.runAttached("journalctl", [
        "--follow",
        "--lines",
        "50",
        ...definitions.flatMap((definition) => ["--unit", definition.name]),
      ]),
    deactivate: (definition, path) => {
      systemctl("disable", "--now", definition.name);
      sys.remove(path);
      systemctl("daemon-reload");
      systemctl("reset-failed", definition.name);
    },
    recentLogs: (definition) =>
      sys.run("journalctl", ["--unit", definition.name, "--lines", "40", "--no-pager"]).stdout,
    logsHint: (definition) => `journalctl -u ${definition.name}`,
    caddyHint: () => caddyHintFor(osFamily(sys.readFile("/etc/os-release"))),
    portHolder: (port) => {
      const listing = sys.run("ss", ["-Hltnp", `sport = :${port}`]).stdout;
      const match = /users:\(\("([^"]*)",pid=(\d+)/.exec(listing);
      if (!match) return undefined;
      // ss gives the thread's name, which for Node is "MainThread"; the command line gives the
      // program.
      const program = sys.readFile(`/proc/${match[2]}/cmdline`)?.split("\0")[0]?.split("/").pop();
      return `${program || match[1]} (pid ${match[2]})`;
    },
  };
};
