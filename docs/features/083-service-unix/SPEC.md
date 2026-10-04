# 083 — Running as a service on Linux and macOS

> Milestone: M12 · Depends on: 082, 080 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap) · Guide: [`docs/runbooks/install.md`](../../runbooks/install.md)

## Goal

`sudo rmk-server service install` makes Ronne a background service that starts at boot and
restarts if it stops, on Linux (systemd) and macOS (launchd), with `--domain` adding HTTPS through
Caddy as in 080. The packages in 085 call the same code.

## Scope

**In:**
- `rmk-server service install | uninstall | status | start | stop | restart | logs`.
- A system user, folders and permissions per system.
- `--domain` (with `--tls`, `--email`), writing a Caddyfile and a second service for Caddy.
- `--port`, `--host`, and `--user` (macOS: run as the signed-in user instead of a system user).
- Tests that generate the unit and plist files, and CI that installs the service on Linux.

**Out** (and where it goes instead):
- Windows → [086](../086-service-windows/SPEC.md), sharing this feature's command and model.
- Installing Caddy: the command checks for `caddy` on `PATH` and says how to install it.
- Other init systems (OpenRC, runit, SysV): not planned; `rmk-server start` under any supervisor
  works, and the docs show a minimal example.

## Behaviour

**What `service install` does** (as root; it refuses without and says to use `sudo`):

| | Linux (systemd) | macOS (launchd) |
|---|---|---|
| User | `rmk-server` system user, no login shell | `_rmkserver` system user; or the signed-in user with `--user` |
| Data | `/var/lib/rmk-server` | `/usr/local/var/rmk-server` (Homebrew: `$(brew --prefix)/var/rmk-server`) |
| Settings | `/etc/rmk-server/env` (mode 640) | `/usr/local/etc/rmk-server/env` |
| Definition | `/etc/systemd/system/rmk-server.service` | `/Library/LaunchDaemons/ai.ronne.rmk-server.plist` |
| Logs | journald | `/Library/Logs/rmk-server/server.log` |

- The unit runs `rmk-server start --no-open` with `RONNE_ENV_FILE` naming the settings file (the app
  reads it itself rather than systemd loading it, so a setup finished in the browser applies without
  a restart), `Restart=on-failure`, and systemd's hardening options that don't break Node.js
  (`NoNewPrivileges`, `ProtectSystem=strict` with the data and settings folders writable,
  `ProtectHome`, `PrivateTmp`); the plist uses `KeepAlive` and `RunAtLoad`.
- It records the path of the `rmk-server` it was run from. After an npm upgrade, `service restart`
  picks up the new version; a moved install needs `service install` again (status says so).
- It enables and starts the service, waits for `/api/health`, and prints the address and the next
  step (open it and finish the setup).
- Running it again updates the files (port, domain) and restarts, keeping the data.

**Without a domain**, Ronne listens on `127.0.0.1:7650`. `--host 0.0.0.0` makes it reachable from
the network over plain HTTP; install prints a warning that it should be behind HTTPS.

**With `--domain ronne.example.com`**:
- Needs `caddy` on `PATH`; otherwise exits with the install command for this system.
- Writes `/etc/rmk-server/Caddyfile` from the **same template as 080** (in the server package,
  `src/service/caddyfile.ts`; a test fails when `compose.yaml`'s copy differs, so Docker and native
  can't drift), with `reverse_proxy 127.0.0.1:7650`. The only line native adds is `admin off`: a
  second Caddy on the machine would otherwise share a system Caddy's admin port (2019), so the
  system Caddy's `reload` could reach the proxy and replace its config.
- Adds a second service, `rmk-server-proxy`, running that Caddy with that file as the `caddy` user
  (Linux, allowed to bind 80/443 with `AmbientCapabilities=CAP_NET_BIND_SERVICE`) or root (macOS).
  It doesn't touch an existing system Caddy's `/etc/caddy/Caddyfile`; if that service holds 80/443,
  install stops and explains.
- Sets `PUBLIC_URL=https://…` and `TRUST_PROXY=true` in the settings file.

**`service status`** prints: installed or not, running or not, version, address, data folder,
settings file, and the proxy's state. **`logs`** follows the log (`journalctl -fu`, `tail -f`).
**`uninstall`** stops and removes the definitions and the system user; data and settings stay
unless `--delete-data`, which asks to type the folder's name.

## Edge cases

- **SELinux** (Fedora, RHEL): the data folder gets the right context (`restorecon`); tested in CI on
  a Fedora container with systemd if feasible, otherwise by hand.
- **A container without systemd** (WSL 1, some Docker images): install says systemd isn't running and
  points to `rmk-server start` or Docker.
- **WSL 2** with systemd enabled: works like Linux; Windows reaches it on `localhost`.
- **macOS asks for permission** (background items notification, macOS 13+): expected; the docs say so.
- **`npx` instead of a global install**: refused, because the npx cache can be cleaned; the message
  says to `npm i -g @ronneai/marketplace` first.
- **Port taken** at install: stop before writing anything.

## Documentation

- **Documentation › Installing an instance**: a *As a service* section (install, status, logs,
  uninstall, with a domain), and the data and log locations.
- **README**: the same, short.
- The guide's *Install as a service* section (the npm part) is published when this is released.

## Acceptance criteria

- [ ] On Ubuntu 24.04 and Debian 13, `sudo rmk-server service install` gives a running service
      that survives a reboot, owned by `rmk-server`, at `http://127.0.0.1:7650`.
- [ ] The same on macOS 15 (Apple silicon and Intel), with and without `--user`.
- [ ] `--domain` with `--tls internal` serves HTTPS through `rmk-server-proxy` (CI on Linux).
- [ ] Docker (080) and native use one Caddyfile template.
- [ ] `status`, `logs`, `restart` and `uninstall` behave as described; data survives `uninstall`.
- [ ] The generated unit and plist match golden files in tests.
- [ ] The README and the Documentation say what the feature does now.

## Open questions

- None.
