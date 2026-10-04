# 083 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The service model.** A platform-neutral description (user, folders, command, environment,
  proxy) and renderers to a systemd unit and a launchd plist, written so 086 adds a WinSW renderer.
  *Done when:* golden-file tests for both, with and without a domain.

- [ ] **2. The shared Caddyfile.** Move 080's Caddyfile into one template used by `compose.yaml`'s
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
