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

- [ ] **3. `service install` and `uninstall` on Linux.** User, folders, permissions, environment
  file, unit, enable, start, wait; the proxy service with `--domain`.
  *Done when:* CI on Ubuntu (systemd is there on GitHub's runners) installs, checks health, restarts,
  uninstalls; with `--domain localhost --tls internal`, HTTPS answers.

- [ ] **4. macOS.** The same with launchd, the `--user` variant, Homebrew prefixes.
  *Done when:* by hand on macOS 15, recorded in the notes; CI on macOS runs install up to
  `launchctl bootstrap` if the runner allows it.

- [ ] **5. `status`, `start`, `stop`, `restart`, `logs`.**
  *Done when:* tests for the output and CI calls each.

- [ ] **6. Documentation.**
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

