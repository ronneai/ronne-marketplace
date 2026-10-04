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
| Settings | `/etc/rmk-server/env` (mode 600, the service account's; its folder is root's) | `/usr/local/etc/rmk-server/env` |
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
  step (open it and finish the setup). If the service account can't run that Node and rmk-server
  (a Node in someone's home folder, such as nvm's), it stops and says to install Node.js for the
  whole machine.
- Running it again updates the files (port, domain) and restarts, keeping the data.
- **macOS:** `_rmkserver` is a hidden account and group made with `dscl`, with the highest free id
  below 500, no shell and no home. `--user` runs it as the account that ran `sudo` (`SUDO_USER`),
  which uninstall never removes. The prefix is Homebrew's (`/opt/homebrew`) when rmk-server lives
  there, else `/usr/local`. A Node from Homebrew is recorded by its `opt/` link, so `brew upgrade`
  doesn't break the service. Install loads the plists with `launchctl bootstrap system` and makes
  `/Library/Logs/rmk-server/` with each log owned by its service's account.

**Without a domain**, Ronne listens on `127.0.0.1:7650`. `--host 0.0.0.0` makes it reachable from
the network over plain HTTP; install prints a warning that it should be behind HTTPS.

**With `--domain ronne.example.com`**:
- Needs Caddy 2.7 or later on `PATH` (the Caddyfile uses `trusted_proxies_strict` and
  `{client_ip}`; Debian's and Ubuntu's own package is 2.6); otherwise exits with how to install it
  on this system.
- Writes `/etc/rmk-server-proxy/Caddyfile` (macOS: the prefix's `etc/rmk-server-proxy`) from the
  **same template as 080** (in the server package, `src/service/caddyfile.ts`; a test fails when
  `compose.yaml`'s copy differs, so Docker and native can't drift), with `reverse_proxy
  127.0.0.1:7650`. The only line native adds is `admin off`: a second Caddy on the machine would
  otherwise share a system Caddy's admin port (2019), so the system Caddy's `reload` could reach
  the proxy and replace its config.
- That folder is root's and apart from the settings folder (which the server's account owns,
  because the setup rewrites the settings file there), so the server's account can't change what
  the proxy runs or read its key. `--tls files` reads `cert.pem` (the full chain) and `key.pem`
  from its `certs/` (made once, `root:caddy` 750). Install gives them to the `caddy` group with
  group read (owner and other modes stay, so a key kept at 600 becomes 640); uninstall hands them
  back to `root`'s group (still 640) when it removes `caddy`. So they must be the proxy's own
  copies: install refuses `certs/`, `cert.pem` or `key.pem` as a link, symbolic or hard (certbot's, or
  a key other services share), and says to copy them there and again after each renewal.
- Adds a second service, `rmk-server-proxy`, running that Caddy with that file as the `caddy` user
  (Linux, created when missing, allowed to bind 80/443 with `AmbientCapabilities=CAP_NET_BIND_SERVICE`)
  or root (macOS).
  It doesn't touch an existing system Caddy's `/etc/caddy/Caddyfile`; if that service holds 80/443,
  install stops and explains.
- Sets `PUBLIC_URL=https://…` and `TRUST_PROXY=true` in the settings file.

**`service status`** prints: installed or not, running or not, version, address (and whether
it still waits for the setup), the address it listens on, its account, data folder, settings
file, where its log is, and the proxy's state; it needs no `sudo`, and exits 0 running, 3
stopped, 4 not installed (as `systemctl`). A version newer than the last install or restart (npm
upgraded it) and a program that isn't there any more (moved: install again) are named. **`start`,
`stop`, `restart`** act on both services (the proxy stops first); on macOS `stop` unloads the
job, since KeepAlive would start it again, and the next boot loads it. **`logs`** follows the log
(`journalctl -f` on both units, `tail -F` on the files).

**`setup`, `migrate`, `reset-root-password`** with the service installed work on its data: with
`sudo` they run as its account, with its settings (and, with a domain, its `https://` address);
without `sudo` they say to use it, or to set `RONNE_DATA_DIR` for an instance of one's own.

**The settings folder is root's; only the settings file in it is the service account's.** The
setup rewrites that file in place when it can't add a file to the folder (not its own, or
read-only inside the service's sandbox: the app's `writeEnvFile`), and
the unit lets the service write the file, not the folder. So the service account can't put a
`service.json` of its own there or swap a name for a link: what root reads there is root's, or the
account's own settings. On top of that, the scripts run the `rmk-server` that was invoked, as the
system account (on macOS, with `--user`, only as the person running `sudo`), never as uid 0; root
refuses the settings file or `service.json` as a link; and every file root writes is a new file
(its mode set on the open file) renamed into place.
**`uninstall`** stops and removes the definitions and the accounts install created; data and
settings stay unless `--delete-data`, which asks to type the data folder's name (read from standard
input, so it can be piped). Installing again uses the kept data.

## Edge cases

- **SELinux** (Fedora, RHEL): the data folder gets the right context (`restorecon`); tested in CI on
  a Fedora container with systemd if feasible, otherwise by hand.
- **A container without systemd** (WSL 1, some Docker images): install says systemd isn't running and
  points to `rmk-server start` or Docker.
- **WSL 2** with systemd enabled: works like Linux; Windows reaches it on `localhost`.
- **macOS asks for permission** (background items notification, macOS 13+): expected; the docs say so.
- **`npx` instead of a global install**: refused, because the npx cache can be cleaned; the message
  says to `npm i -g @ronneai/marketplace` first.
- **Port taken** at install: stop before writing anything, naming the program that holds it.
- **Installed again without `--domain`** after a domain: the proxy service and the Caddyfile are
  removed, and so are `TRUST_PROXY` and the `PUBLIC_URL` install had set.

## Documentation

- **Documentation › Installing an instance**: a *As a service* section (install, status, logs,
  uninstall, with a domain), and the data and log locations.
- **README**: the same, short.
- The guide's *Install as a service* section (the npm part) is published when this is released.

## Acceptance criteria

- [x] On Ubuntu 24.04 and Debian 13, `sudo rmk-server service install` gives a running service
      that survives a reboot, owned by `rmk-server`, at `http://127.0.0.1:7650`.
- [ ] The same on macOS 15 (Apple silicon and Intel), with and without `--user`. Apple silicon
      only so far: CI on macOS 15 (with and without `--user`) and the owner on macOS 27 (`--user`);
      no Intel Mac yet.
- [x] `--domain` with `--tls internal` serves HTTPS through `rmk-server-proxy` (CI on Linux).
- [x] Docker (080) and native use one Caddyfile template.
- [x] `status`, `logs`, `restart` and `uninstall` behave as described; data survives `uninstall`.
- [x] The generated unit and plist match golden files in tests.
- [x] The README and the Documentation say what the feature does now.

## Open questions

- None.
