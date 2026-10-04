# 083 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The service model.** A platform-neutral description (user, folders, command, environment,
  proxy) and renderers to a systemd unit and a launchd plist, written so 086 adds a WinSW renderer.
  *Done when:* golden-file tests for both, with and without a domain.

- [x] **2. The shared Caddyfile.** Move 080's Caddyfile into one template used by `compose.yaml`'s
  generator check and by this feature.
  *Done when:* a test fails if `compose.yaml`'s inline Caddyfile differs from the template's output.

- [x] **3. `service install` and `uninstall` on Linux.** User, folders, permissions, environment
  file, unit, enable, start, wait; the proxy service with `--domain`.
  *Done when:* CI on Ubuntu (systemd is there on GitHub's runners) installs, checks health, restarts,
  uninstalls; with `--domain localhost --tls internal`, HTTPS answers.

- [x] **4. macOS.** The same with launchd, the `--user` variant, Homebrew prefixes.
  *Done when:* by hand on macOS 15, recorded in the notes; CI on macOS runs install up to
  `launchctl bootstrap` if the runner allows it.

- [x] **5. `status`, `start`, `stop`, `restart`, `logs`.**
  *Done when:* tests for the output and CI calls each.

- [x] **6. Documentation.**
  *Done when:* the docs render tests pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

### Task 1: the service model (2026-10-04)

- **`packages/server/src/service/`:**
  - `layout.ts`: where things go per system (user, data, settings, Caddyfile, certificates, the
    proxy's folder and account, the definitions, the log files). macOS takes Homebrew's prefix and
    the `--user` account. 086 adds Windows here.
  - `model.ts`: `servicePlan()` gives the server's `ServiceDefinition` and, with a domain, the
    proxy's, plus the settings install writes (`PUBLIC_URL`, `TRUST_PROXY`). A definition is
    neutral: name, launchd label, account, program and arguments (absolute paths), working folder,
    environment, writable folders, log file, low ports, ordering. A WinSW renderer needs nothing
    more.
  - `systemd.ts` and `launchd.ts`: the renderers. `__golden__/` holds the unit and plist files;
    `UPDATE_GOLDEN=1` rewrites them, as in `packages/core`.
- **The program is Node's absolute path plus `dist/bin.js`,** not the `rmk-server` shim: a service
  doesn't get the caller's `PATH`, and the shim's `#!/usr/bin/env node` wouldn't find a Node from nvm
  or Homebrew.
- **The settings file isn't systemd's `EnvironmentFile=`.** The unit sets `RONNE_ENV_FILE` and the
  app reads the file itself, as it does everywhere else. Loaded by systemd, its values would become
  environment variables, which win over the file and stay frozen until a restart, so a setup
  finished in the browser wouldn't apply. The spec is reworded.
- **The settings folder is writable too** (`ReadWritePaths=/var/lib/rmk-server /etc/rmk-server`):
  the setup writes the settings file through a temporary file and a rename in its folder
  (`env-file.ts`).
- **`ProtectHome=read-only`** instead of `true` when Node or rmk-server is under `/home` or `/root`
  (nvm): `true` would hide the program from the service. Whether the service user can read it there
  is install's check (task 3).
- **The proxy's Caddy** keeps its state in its own folder (`HOME`, `XDG_DATA_HOME` and
  `XDG_CONFIG_HOME` = `/var/lib/rmk-server-proxy`), apart from a system Caddy's. On Linux it binds
  80 and 443 with `AmbientCapabilities=CAP_NET_BIND_SERVICE`; on macOS it runs as root.
- **Checked:** `systemd-analyze verify` accepts both units (Debian 13 container, systemd 257);
  `plutil -lint` accepts the three plists.
- **For task 3** (found by the witness): the setup writes the settings file with mode 0600 (owner
  only), not the spec's 640, through a rename. So install makes the service user own the settings
  folder and file; a file root created would become unreadable to the server.

### Task 2: the shared Caddyfile (2026-10-04)

- **`packages/server/src/service/caddyfile.ts`** holds 080's Caddyfile as one template with slots
  (admin, email, trusted proxies, site, TLS snippet, certificate folder, upstream).
  `composeCaddyfile()` fills them with Compose's `${…}` expressions; `nativeCaddyfile()` with the
  domain, `--tls`, `--email`, the certificate folder and `127.0.0.1:<port>`. A line whose slot is
  empty is left out, so the native file has no blank `email` line.
- **`caddyfile.test.ts`** reads the `configs.caddyfile.content` block from `compose.yaml` (plain
  text, no YAML dependency) and fails when it differs from `composeCaddyfile()`, naming both files.
  A second test proves it notices a change (`28MiB` → `10MiB`). `compose.yaml` itself is unchanged.
- **The native proxy says `admin off`.** In one container, a second `caddy run` next to a running
  Caddy also bound `localhost:2019`: both listened, and admin requests split between them (4 and 6
  of 10 in the witness's run). So the first one's `caddy reload` (what `systemctl reload caddy`
  runs) can reach the second, which then serves the first one's config and drops its own site. With
  `admin off` the system Caddy keeps its admin API, its reload works, and both keep serving. So the
  proxy service is restarted, never reloaded. Compose leaves the slot empty, as before.
- **Checked with Caddy 2.11.6** (the image 080 pins): `caddy validate` accepts the native file for
  `--tls internal`, `auto` (with an email) and `files` (with a certificate in the folder).
  `localhost` with `tls internal` serves HTTPS (a 502 with no server behind it).
- Caddy warns "Caddyfile input is not formatted" (it wants tabs). 080's file has the same warning;
  left as it is, so the two stay identical.

### Task 3: `service install` and `uninstall` on Linux (2026-10-04)

- **The code** (`packages/server/src/service/`):
  - `args.ts`: `rmk-server service <action>` and install's options. `--domain` is checked label by
    label (a loop, per `docs/knowledge/codeql-regex.md`), so nothing can break out of the
    Caddyfile.
  - `system.ts`: everything that touches the machine, behind one `System` interface.
    `fake-system.ts` is the in-memory one for tests, left out of the build.
  - `install.ts`: install and uninstall, the same on every system, over a `Backend` (task 4 adds
    launchd, 086 WinSW).
  - `linux.ts`: the systemd backend (`useradd`, `systemctl`, `runuser`, `restorecon`, `ss`).
  - `settings.ts`: install's edits to the settings file, keeping every other line.
  - `service.json` in the settings folder records what was installed (Node, entry, port, host,
    domain, the accounts install created) for a later install, uninstall and status.
- **Order:** every check (root, npx, systemd, Caddy and its version, the certificate files, the
  ports) comes before anything is written. Then the accounts, then a check that the service account
  can run Node and rmk-server (`runuser -u rmk-server -- node …/bin.js --version`), then the
  folders, the settings, the units, `systemctl enable` and `restart`, and the wait for
  `/api/health` (503 or 200, up to 90 seconds; on a timeout it prints the journal).
- **Permissions:**
  - `/var/lib/rmk-server` is 750, `/etc/rmk-server` is 755 (the proxy's `caddy` reads the Caddyfile
    there) and both are owned by `rmk-server`, recursively on every install, so data kept from an
    earlier install with another uid works.
  - The settings file is 600, owned by `rmk-server` (the spec's 640 is corrected).
  - The proxy's folder `/var/lib/rmk-server-proxy` is 700, owned by `caddy`.
  - The proxy's settings, `/etc/rmk-server-proxy/` (Caddyfile 644 and `certs/`), are root's: see
    the witness's findings below.
- **`SuccessExitStatus=143`:** Node ends with 143 on SIGTERM, so every `systemctl stop` or
  `restart` was logged as "Failed with result 'exit-code'". The goldens have the line.
- **Caddy 2.7 or later.** The Caddyfile needs `trusted_proxies_strict` and `{client_ip}` (2.7).
  Ubuntu 24.04's and Debian 13's `caddy` package is 2.6.2, so the message points Debian and
  Ubuntu to Caddy's own repository, and says its package starts a `caddy` service on 80 and 443
  that has to be stopped. With 80 or 443 taken, install names the program and suggests the same.
- **The port's holder** comes from `ss -ltnp` and `/proc/<pid>/cmdline`: `ss` names a Node process
  "MainThread" (its thread's name), and Debian's image has no `ps`.
- **CI:** `scripts/service/test-linux-service.sh` runs the whole life cycle (install, 503, setup as
  `rmk-server`, 200 with no restart, a token, restart, `SIGKILL` and the automatic restart, a taken
  port, `--domain` without and with Caddy, HTTPS and the redirect, install again without the domain,
  uninstall keeping the data, install again, `--delete-data` refused and then accepted).
  `server-package.yml`'s new `service-linux` job runs it on `ubuntu-24.04` with the packed tarball
  and Caddy 2.11.6's release archive (SHA-512 checked; added to the policy's tools table).
- **Run here** in containers booted with systemd (`--privileged`, cgroups from the host), as a normal
  user with passwordless sudo, as on GitHub's runner, with Node 24.21.0 (arm64), the packed tarball
  and Caddy 2.11.6:
  - every step passes on **Ubuntu 24.04.5** and **Debian 13.7**;
  - **a reboot** (restarting the container, so systemd boots again): the service came back on its
    own, health 200, and sign-in worked;
  - **without systemd** (`node:24-bookworm-slim`): install says systemd isn't running, points to
    `rmk-server start` and Docker, and writes nothing.
- **Still open:** the *Done when* asks for CI on GitHub's Ubuntu runner, which runs once this branch
  is pushed. So the task stays unticked until that run passes.
- **For task 5 or 6:** before the setup, the app's 503 and its start log say "or run
  `rmk-server setup`". Under the service, `sudo rmk-server setup` would set up root's own folder,
  not the service's. CI runs the setup as the service user with its two paths, which is too much to
  ask of people. Either the docs say to finish the setup in the browser, or `rmk-server setup` run
  as root finds the installed service and uses its account and folders.
- **Fixed after the witness** (three findings, each with a test):
  - *An account left behind:* when the check that the account can run Node failed, the accounts
    just made stayed, unrecorded, so a later uninstall kept them. Install now removes the accounts
    that run made before it stops.
  - *`--tls files` and a private key:* install handed all of `/etc/rmk-server` to `rmk-server`
    (`chown -R`), certificates included, so `caddy` couldn't read a 600 or `root:caddy` 640 key.
    The Caddyfile and `certs/` now live in `/etc/rmk-server-proxy/`, root's; `certs/` is made once
    as `root:caddy` 750 (see the re-check below for the files in it). The spec says so.
  - *The server's account could rewrite the proxy's Caddyfile* (the folder was its own). Fixed by
    the same move. And `service.json` stays in the server's settings folder, so uninstall removes
    only `rmk-server` and `caddy`, and only when install recorded creating them, whatever else the
    file lists.
  - The test script gained a `--tls files` step. It passes on Ubuntu 24.04 and Debian 13.
- **Fixed after the re-check:** the first fix stopped on a key `caddy` couldn't read and suggested
  `chown root:caddy`. On a fresh machine that failed: install had just made `caddy`, and removed it
  again when it stopped. After an uninstall, the kept key had a group number nobody had. Now
  install gives `certs/`, `cert.pem` and `key.pem` to the `caddy` group with group read (`chgrp`,
  `chmod g+rX`; owners and other modes stay, so a 600 key becomes 640), then checks it can read
  them. Uninstall, when it removes `caddy`, hands kept certificates back to `root:root`. The script
  checks both: a `root:root` 600 key is served and becomes `root:caddy` 640, and after uninstall
  it's `root:root` 640. Passes on Ubuntu 24.04 and Debian 13.
- **Fixed after the second re-check: links in `certs/`.** `chgrp` and `chmod` follow a link, so a
  `key.pem` linked to a shared key (certbot's, `root:ssl-cert` 640) became `root:caddy`, other
  services lost it, and an uninstall left a group number nobody had. Install now refuses `certs/`,
  `cert.pem` or `key.pem` as a symbolic link, before writing anything. The message says to copy them
  (`cp -L`) and to copy them again on renewal (certbot's `--deploy-hook`, then `rmk-server service
  restart`, task 5). Checked on Debian 13: the linked case is refused and the shared key stays
  `root:ssl-cert` 640, with no account or folder made; with copies, install works and the copy
  becomes `root:caddy` 640.
- **Fixed after the third re-check: hard links.** `lstat` doesn't show a hard link as a link, so a
  `key.pem` hard-linked to a shared key got through and changed its group. A file with more than
  one link (`nlink > 1`) is now refused the same way. Checked on Debian 13: refused, the shared key
  stays `root:ssl-cert` 640.
- **The containers here have D-Bus** (installed with systemd); as a normal user, `systemctl` needs
  it. The witness's first image didn't, and `systemctl is-enabled` failed with "Failed to connect to
  bus". GitHub's runners have it.

### Task 4: macOS (2026-10-04)

- **`packages/server/src/service/macos.ts`,** the launchd backend:
  - accounts through `dscl` (`_rmkserver`, hidden, `/usr/bin/false`, `/var/empty`, `Password *`),
    with the highest id from 499 down that no account or group has. Apple's own accounts fill the
    range from 200 up (on this Mac from 200, 202, 203…; the highest below 500 is 441), so the top is least likely to meet a
    future one;
  - `launchctl bootout`, `enable`, then `bootstrap system <plist>` (RunAtLoad starts it). A
    bootstrap right after a bootout can fail with "5: Input/output error" while launchd tears the
    old job down, so it's retried for up to ten seconds;
  - "running" is `state = running` in `launchctl print system/<label>`;
  - `sudo -u` for the "can the account run it" check; `lsof -Fpc` for a port's holder;
  - the proxy runs as root, so certificates get no group.
- **`index.ts`** picks it on darwin: the prefix from where rmk-server is (`macPrefix`), and
  `--user` from `SUDO_USER` (its group from `id -gn`). `--user` without `sudo` from an account, or
  on Linux, is refused.
- **Install** now makes each `logFile`'s folder (launchd doesn't) and the file, owned by its
  service's account.
- **Homebrew's Node** reports `…/Cellar/node@24/24.21.0/bin/node`, which `brew upgrade` deletes.
  `stableNodePath` records `…/opt/node@24/bin/node` instead (`indexOf`, not a regex).
- **Found by the tests: `root` as an account.** On macOS the proxy runs as `root`, and install
  called `ensureAccount("root")`. A real Mac answers that root exists, but uninstall's list of
  accounts it may remove then held `root`, and `service.json` (which the server's account can
  write) could have named it. Install and uninstall now skip `root` outright, with a test.
- **Checked on this Mac without sudo** (macOS 27.0.1, arm64): the output formats the code parses
  (`launchctl print` gives `\tstate = running` and `\tpid = 455`; `dscl . -list` columns; `dscl .
  -read` of a missing record exits 56; `lsof -Fpc` gives `p…` and `c…`); `plutil -lint` on the
  goldens (task 1). 69 unit tests.
- **CI:** `scripts/service/test-macos-service.sh` (install as `_rmkserver`, the setup, KeepAlive
  after `kill -9`, `--domain localhost --tls internal`, removing the domain, uninstall keeping the
  data, `--user`, `--delete-data`). `server-package.yml`'s `service-macos` job runs it on
  `macos-15` with Homebrew's `node@24`, so the Homebrew prefix and the `opt/` path are used, and
  Caddy 2.11.6's `mac_arm64` archive (SHA-512 checked).
- **Still open, so the task stays unticked:**
  - the *Done when* asks for a run by hand on macOS 15. There's no passwordless `sudo` here, and
    this Mac runs macOS 27, so it's the owner's to do. With an nvm Node, which `_rmkserver` can't
    read, use `--user`: `sudo env "PATH=$PATH" rmk-server service install --user`, or install
    Node with Homebrew for the `_rmkserver` path;
  - the `service-macos` job runs once the branch is pushed.
- **Fixed after the witness:** `enable` came after `bootstrap`, so a job someone had disabled
  (`launchctl disable` outlives a bootout) failed every bootstrap and was never enabled; it now
  comes before. And only `dscl`'s exit 56 ("record not found") means the account is missing; any
  other failure stops install rather than recreate an existing `_rmkserver`, for the account and
  (found on the re-check) its group. Tests for each.
- **Known and left:** uninstall deletes the `_rmkserver` group (and on Linux the `rmk-server` group)
  with the account, even in the unlikely case the group existed before install. The plists set no
  `PATH`; launchd's default applies, and the service gets every path in full.

- **Found by the owner's first run on a Mac (`--user`, nvm Node, macOS 27):** install waited its
  90 seconds and failed, and launchd reported `spawn failed`, `last exit code = 78: EX_CONFIG` with
  an empty log. `/usr/local/var` didn't exist, and `mkdirSync(…, { recursive: true, mode: 0o750 })`
  gave that parent 750 too (`root:wheel`), so the job's account couldn't enter its working folder.
  `System.mkdir` now makes missing parents with the default 755 and sets the mode on the folder
  itself only (a test on a real folder). Linux never met it: `/var/lib` always exists; the macOS
  CI job uses `/opt/homebrew/var`, which does too. Also: install now says it's waiting for the
  server (it looked stuck), and on macOS a failed start shows launchd's state and last exit code
  next to the log, since a job launchd can't start writes nothing there.

### Task 5: `status`, `start`, `stop`, `restart`, `logs` (2026-10-04)

- **`packages/server/src/service/control.ts`:**
  - `serviceStatus`: reads `service.json` (644, so no `sudo`), asks the backend whether each
    service runs, and `/api/health` when it does. Exit 0, 3 or 4 as `systemctl`. It names a version
    newer than the recorded one (npm upgraded it; `restart` runs it) and a Node or rmk-server that
    isn't there any more (moved: install again), as the spec asked.
  - `controlService`: start, stop, restart on both services, then the health wait. `restart`
    records the version now at the entry, so status stops saying "newer".
  - `serviceLogs`: `journalctl --follow` on both units; on macOS `tail -F` on both files.
  - The backends gained `start`, `stop`, `restart` and `followLogs`. On macOS `stop` is a
    `bootout`, because KeepAlive would start a killed job again; `start` bootstraps an unloaded job
    or kickstarts a loaded one; `restart` is `kickstart -k`.
- **The open point from task 3 is closed:** with the service installed, `sudo rmk-server setup`,
  `migrate` and `reset-root-password` run as its account (Node's `uid` and `gid` options), from `/`,
  on its data and settings, and, with a domain, with `PUBLIC_URL=https://<domain>`. The setup in a
  terminal takes the address from the environment, so without it a setup after `--domain` would
  have written `http://localhost:7650` over the domain. Not through `sudo -u`: that drops the
  environment, so `setup --yes` would lose `DATABASE_URL` and `RONNE_ROOT_*`, and passing them as
  `env` arguments would show the password in the process list. Without `sudo` they say to use it,
  or to set `RONNE_DATA_DIR` for an instance of one's own. `RONNE_DATA_DIR` or `RONNE_ENV_FILE`
  already set means the person chose, and the script runs as before.
- **Help:** `rmk-server service --help` lists the new commands, says `status` and `logs` need no
  `sudo`, and that the scripts follow the service.
- **Tests:** 82 unit tests (status text, exit codes, the systemctl and launchctl calls, the version
  record, logs, the scripts' account, environment and refusals).
- **The end-to-end scripts call each command.** On Linux: status before install (4) and after
  (running, waiting for the setup), `rmk-server setup` refused without `sudo`, `sudo rmk-server setup
  --yes` and `migrate` on the service's data (the database owned by `rmk-server`), stop (no answer,
  status 3), start, restart, logs (the journal has "Data folder: /var/lib/rmk-server"), and status
  showing the proxy with `--domain`. 13 steps pass on Ubuntu 24.04 and Debian 13. The macOS script
  does the same with launchd and `perl -e 'alarm 5'` in place of `timeout`; it runs in CI.
- **Still open:** the *Done when* says "CI calls each", which happens once the branch is pushed.
- **Fixed after the witness: the service's account could get root.** `service.json` sits in the
  settings folder, which `rmk-server` owns, and the script hand-off took the account, Node and
  entry from it. The witness rewrote it as `rmk-server` (`user: root`, `node: /usr/bin/touch`), and
  `sudo rmk-server reset-root-password` made a root-owned file. The same folder held a second hole:
  install read and rewrote the settings file as root, so a link from it to `/etc/shadow` would have
  been read (and copied where `rmk-server` can read it) or written. Now:
  - the hand-off runs the Node and rmk-server that were invoked, never the recorded ones, as the
    layout's system account or (`--user`) only `SUDO_USER`, never root or uid 0;
  - install, start, stop, restart and the hand-off refuse when `env` or `service.json` is a link
    (`unsafeFiles`);
  - `System.writeFile` writes a new file (`wx`, so a planted name or link fails) and renames it
    over the old one, which replaces a link instead of following it;
  - uninstall already trusted only the two known accounts (task 3).

  Checked in a systemd container: the witness's rewrite now ends with "isn't one it may use here"
  and no file; `env` as a link to `/etc/shadow` is refused by install, restart and setup, and
  `/etc/shadow` is untouched. The Linux script gained a step for both, and passes on Ubuntu 24.04
  and Debian 13 (14 steps).
- **Also from the witness:**
  - `logs` and the hand-off now run their program with `spawn` and pass on SIGINT, SIGTERM and
    SIGHUP, so `timeout` no longer leaves `journalctl --follow` behind (checked: none left);
  - the refusal reads "To set it up / migrate its database / reset its root password, run …";
  - `logs` needs `sudo` on Linux unless the account is in `systemd-journal` or `adm`, so the help
    says only `status` works without it;
  - status names the version a restart would run, rather than calling it newer (a downgrade is
    different too).
- **Left:** the setup's last line still says "If it isn't running, start it with `rmk-server`"
  under the service (the app's text, task 6 looks at it). The Linux script isn't meant to run
  twice on one machine: the first run leaves Caddy in `/usr/local/bin`.
- **Fixed after the second re-check: the folder itself.** Checking and then reading in a folder
  the service's account owns stays racy. The witness swapped `env` for a link to `/etc/shadow`
  between install's check and its read (5 of 5 tries, in a window of about 0.4 s), so install
  copied the shadow file into a file `rmk-server` owns. And `service.json` could name the admin
  running `sudo`, so `sudo rmk-server migrate` acted as them. So `/etc/rmk-server` is now root's
  (755), with only `env` the server's (600):
  - install takes the folder back (`chown root:root`, not recursive) and checks for links again
    before reading anything in it. `service.json` is written by root, so it's root's;
  - the app's `writeEnvFile` rewrites the file in place when it can't make its temporary file there
    (EACCES or EPERM), with a test. Elsewhere (Docker, `rmk-server start`) nothing changes;
  - the unit's `ReadWritePaths` names `/etc/rmk-server/env`, not the folder (goldens updated);
  - the hand-off takes `SUDO_USER` only on macOS (a `--user` install), with a test;
  - `System.writeFile` sets the mode on the open file (`openSync(…, "wx", mode)`, `fchmodSync`),
    not by name afterwards.

  The Linux script's step now checks the folder and `service.json` are root's, and that
  `rmk-server` can't write `service.json`, make a link there or rename `env`, but can still rewrite
  `env`. With a fresh `pnpm build && pnpm build:server` (the app's scripts ship in the package, so
  an app change needs both), it passes on Ubuntu 24.04 and Debian 13 (14 steps). 86 unit tests.
- **Fixed after the third re-check: EROFS.** Inside the unit's sandbox (`ProtectSystem=strict`, only
  `/etc/rmk-server/env` writable), making the temporary file fails with EROFS, not EACCES, so the
  browser's setup threw instead of rewriting in place. `cannotWriteFolder` now takes EACCES, EPERM
  and EROFS (tested). The script missed it because `sudo rmk-server setup` runs outside the
  sandbox; its setup step now runs inside the running service's mounts as `rmk-server` (`nsenter -m`
  into its main process, `setpriv`), as the browser's setup does, and `migrate` covers the `sudo`
  hand-off. Passes on Ubuntu 24.04 and Debian 13.

### Task 6: documentation (2026-10-04)

- **Documentation › Installing Ronne › As a service** (new section `service`, after *With
  Node.js*): installing with a machine-wide Node.js (and `sudo env "PATH=$PATH"` when `sudo` can't
  find it), a table of the commands (`status` the only one without `sudo`; `uninstall` and
  `--delete-data`; `sudo rmk-server setup`), where things are on Linux and macOS (`--user`, the
  background-item notification), `--port`/`--host`, `--domain` with Caddy 2.7+ (Debian's and
  Ubuntu's package too old), `--tls internal|files` (copies, not links), and no systemd. The
  topic's summary says "as a service". *Upgrading* gains the npm lines and `sudo rmk-server service
  restart`. `docs.test.tsx` asserts the section and its facts.
- **README:** *As a service (macOS and Linux)* under *With Node.js, no clone*: the commands, where
  things are, options, `--domain`, upgrading, no systemd.
- **The runbook's *Install as a service*:** the npm part is corrected and filled in (the account
  and nvm, `--user`, `sudo env PATH`, the macOS notification; Caddy 2.7+ from Caddy's repository,
  not `apt install caddy`, and stopping its package's service; `--tls internal|files`), every command
  but `status` with `sudo`, the script commands, `--delete-data`, and a table of where things are.
  The Homebrew, `.deb`/`.rpm` and winget parts stay for 085–087.
- **The setup's last line under the service** (left from task 5): the hand-off sets
  `RONNE_SERVICE=1`, and `apps/web/scripts/setup.ts` then says "The service runs it: open … and
  sign in as …" rather than "If it isn't running, start it with `rmk-server`". Checked in a
  container.
- **Helpers:** none changed. The setup page's helpers already describe `rmk-server` (082); the
  service changes no field.
- **MVP.md:** unchanged; §15's *Easy install* row already names services through systemd and
  launchd.
- **Index:** 083 is *in progress*: tasks 3, 4 and 5 wait for CI on GitHub and task 4 for a run by
  hand on macOS 15.
- **Fixed after the witness:** the `--tls files` folder on macOS (the prefix's
  `etc/rmk-server-proxy/certs`) in the Documentation, README and runbook; `rmk-server service --help`
  said "the settings folder's certs/", which isn't where they are. `logs` isn't refused without
  `sudo` in code; on Linux it shows nothing without it (journal access), so the docs keep saying it
  needs `sudo`.
- **Checks:** the docs and help tests (13) and the settings-file tests (23) pass, and `pnpm test:e2e` passes (84, including the phone sweep over the docs).

### CI on GitHub and the run by hand (2026-10-04)

- **PR #124, head 3acba0a, run 37216357956 ("Server package"): every check passed (33).**
  - *Service on Linux (systemd)*, ubuntu-24.04 (24.04.5), Node 24.21.0, Caddy 2.11.6 (SHA-512
    OK): all 14 steps of `test-linux-service.sh`, so task 3's *Done when* (install, health,
    restart, uninstall, HTTPS with `--domain localhost --tls internal`) and task 5's (each command
    called) are met on Linux.
  - *Service on macOS (launchd)*, macos-15-arm64 (15.7.9), Homebrew `node@24`, Caddy 2.11.6
    (SHA-512 OK): all 11 steps of `test-macos-service.sh`, the first run of the macOS path anywhere.
    Install bootstraps the daemon as `_rmkserver` in `/opt/homebrew`, KeepAlive brings back a killed
    process, `--domain` serves HTTPS, `--user` runs as the runner's account, and status, start, stop,
    restart and logs are each called.
- **By hand on macOS (task 4):** the owner ran `sudo rmk-server service install --user` on macOS
  27.0.1 (Apple silicon) with an nvm Node. It found the 750 `/usr/local/var` bug (fixed above);
  once fixed, install printed the running service and its address. The owner decided this run, not
  one on macOS 15, counts for the *Done when*; CI covered macOS 15.
- **Not covered:** an Intel Mac (CI's runner is arm64), so that acceptance criterion stays open; on
  macOS CI checks a restart by health only, not that launchd recorded it as clean; a real reboot
  on macOS (Linux's was checked in a container).
- Tasks 3, 4 and 5 are ticked (witnessed from GitHub's logs; see WITNESS.md).
- **Done (owner, 2026-10-04):** the feature is marked done with the Intel Mac criterion still open;
  no Intel Mac has run it yet.
