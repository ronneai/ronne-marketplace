# 083 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, a fresh agent that didn't do the work checks it: it gets the task's *Done
when*, the claims in the notes and where to look, runs the commands itself, and reports each claim as
confirmed, partly or not met (owner, 2026-10-04). A task is ticked only when every claim holds.
Its record lands here, in the same commit as the task. Differences it finds are fixed in the notes
in that commit.

## Task 1 — The service model

Witnessed: 2026-10-04 (01:03–01:10 EDT), by a fresh agent. Machine: macOS 27.0.1 arm64, Node v24.0.0, Docker 29.7.2.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Golden-file tests for systemd and launchd, with and without a domain, pass, and a mismatch fails them | confirmed | `pnpm --filter @ronneai/marketplace test` → 27 passed; `src/service` → 13 passed. On a scratchpad copy: `Restart=on-failure`→`always` in the golden → "linux/rmk-server.service differs"; `ProtectSystem=strict`→`full` in `systemd.ts` → 2 failed; a deleted golden → "missing"; `<true/>`→`<false/>` in the proxy plist → failed. |
| 2 | The files do what the notes say; the definition is platform-neutral | confirmed | `layout.ts` matches the spec's table for both systems (Homebrew prefix, `--user`). `ServiceDefinition`: name, label, account, program and arguments, working folder, environment, writable folders, `readsHome`, `bindsLowPorts`, `after`, log file. Against 086's behaviour, each WinSW setting maps onto these fields; 086 adds win32 to the layout only. |
| 3 | The program is Node's absolute path plus `dist/bin.js`, with `start --no-open --port N --host H` | confirmed | `ExecStart=/usr/bin/node /usr/lib/node_modules/@ronneai/marketplace/dist/bin.js start --no-open --port 7650 --host 127.0.0.1`; the plist's ProgramArguments are the same with `/opt/homebrew/bin/node`. |
| 4 | No `EnvironmentFile=`; `RONNE_ENV_FILE` set; the data and settings folders writable | confirmed | `Environment=RONNE_ENV_FILE=/etc/rmk-server/env`, `ReadWritePaths=/var/lib/rmk-server /etc/rmk-server`. `env-file.ts:76-79` writes a temporary file and renames it, so the folder must be writable. |
| 5 | `ProtectHome=read-only` under /home or /root, `true` otherwise | confirmed | `inHome = /^\/(home\|root)(\/\|$)/` on Node or the entry; a test asserts `ProtectHome=read-only`; the goldens (/usr, /opt) have `true`. |
| 6 | The proxy has its own folder; CAP_NET_BIND_SERVICE on Linux, root on macOS | confirmed | `User=caddy`, `HOME`/`XDG_DATA_HOME`/`XDG_CONFIG_HOME` = `/var/lib/rmk-server-proxy`, both capability lines, `After=… rmk-server.service`. The macOS plist runs as `root`/`wheel` and logs to `proxy.log`. Settings with a domain: `PUBLIC_URL=https://ronne.example.com`, `TRUST_PROXY=true` (tested). |
| 7 | `systemd-analyze verify` and `plutil -lint` accept the files | confirmed | debian:13-slim, systemd 257.13, with the users, folders and stub programs → no output, exit 0 for both units. A negative control (`ProtectHome=bogus`, a relative ExecStart) was reported. `plutil -lint` → 3 OK. |
| 8 | `pnpm lint` has no errors; typecheck passes | confirmed | `pnpm lint` → exit 0, 53 warnings and 3 infos (as on `main`); `src/service` has none. `tsc --noEmit` → exit 0. |
| 9 | The SPEC change matches the code | confirmed | The unit bullet names `RONNE_ENV_FILE`, read by the app, with the data and settings folders writable, as `model.ts` and the golden do. |

**Not checked here:** starting the units under a running systemd or loading the plists with
`launchctl` (tasks 3 and 4); whether the service user can read a Node under /home (task 3); the
Caddyfile (task 2); the full `pnpm test` and `pnpm build` (left to the pre-commit hook).
**Differences from the notes:** none of substance. The domain cases have a golden for the proxy only,
and assert that the server's unit and plist equal the no-domain ones. Two points for task 3, now in
the notes: the unit runs `node …/dist/bin.js start`, which the spec calls `rmk-server start`; and the
spec's settings file mode, 640, differs from the 0600 the setup writes, so the service user must own
the file.
**Overall:** met.

## Task 2 — The shared Caddyfile

Witnessed: 2026-10-04 (from 01:08 EDT), by a fresh agent. Machine: macOS 27.0.1 arm64, Node v24.0.0, Docker 29.7.2; Caddy 2.11.6 (the `caddy:2.11.6` image).

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | A test fails when `compose.yaml`'s Caddyfile differs from the template, and passes on the real file | confirmed | `compose.yaml` and `src/service` copied to a scratch folder: the untouched copy passes 4/4. Each of these fails the compose test, naming both files: a trailing space, one more space of indent, a line added in the middle, an extra blank line, `web:3001`, and a line added at the end of the block. `29MiB` in the template → 2 failed. On the repo: 6 files, 31 tests passed. |
| 2 | `compose.yaml` is unchanged | confirmed | `git diff main --quiet -- compose.yaml` → exit 0. |
| 3 | `nativeCaddyfile()` fills every slot and adds only `admin off` | confirmed | Three files generated from `dist/service/caddyfile.js` (internal; auto with an email; files) have no `${` or `{{`. Against the compose output they differ only in the filled slots, the dropped email and trusted_proxies lines, and `admin off`. Without an email, no blank line is left. |
| 4 | Caddy 2.11.6 validates the native files | confirmed | `caddy validate --adapter caddyfile` → "Valid configuration" (exit 0) for internal, auto and files (a self-signed pair mounted at `/etc/rmk-server/certs`). Without the pair, files fails with "open …/cert.pem: no such file or directory". |
| 5 | Without `admin off`, a second Caddy shares port 2019 and a reload can reach the wrong one; `admin off` fixes it | confirmed (after a wording fix) | A on :8081, B on :8082 in one container. Without `admin off`, B also bound localhost:2019; 10 GETs to `/config/` split 4 to A and 6 to B. A's `caddy reload` landed on B, which then served A's config and dropped :8082. With it, 10/10 reached A, the reload worked and both sites kept serving. The notes first said B "took over" the port; they, the spec and the code comment now say it shares it, and the witness re-read all three. |
| 6 | Lint has no errors and the same warnings as `main`; typecheck passes | confirmed | `pnpm lint` → 53 warnings and 3 infos, as on a `git archive main` copy; the new files are clean. `pnpm typecheck` → 7/7. The four `noTemplateCurlyInString` ignores are on Compose's `${…}` strings, which are literal text. |
| 7 | The SPEC change matches the code | confirmed | The template is in `src/service/caddyfile.ts`, a test catches drift, the upstream is passed in (`127.0.0.1:7650` in the test), and `admin off` is the only added line. |

**Not checked here:** writing `/etc/rmk-server/Caddyfile` and the proxy service (task 3); that the
proxy is restarted, never reloaded (task 3); HTTPS through `localhost` (claimed in the notes, checked
end to end in task 3's CI); Compose's interpolation of the unchanged file; the full `pnpm test` and
`pnpm build` (left to the pre-commit hook).
**Differences from the notes:** "took over" port 2019 was wrong; both Caddys share it. Fixed in the
notes, the spec and the code comment in this commit. Trailing blank lines at the end of compose's
block aren't compared (harmless).
**Overall:** met.

## Task 3 — `service install` and `uninstall` on Linux

Witnessed: 2026-10-04 (01:31–01:54 EDT, in five rounds), by a fresh agent. Machine: macOS (Darwin 27.0.0) arm64, Docker 29.7.2. Containers booted with systemd (Ubuntu 24.04 and Debian 13, with D-Bus and openssl), Node 24.21.0 linux-arm64 (SHA-256 checked) and Caddy 2.11.6 linux_arm64 (SHA-512 checked against its checksums file), and the tarball packed from this branch.

**Not ticked:** the *Done when* is the `service-linux` job on GitHub's Ubuntu runner, which runs once the branch is pushed.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Unit tests, typecheck and lint pass | confirmed | Finally 57 tests passed; `pnpm typecheck --force` → 7/7; `pnpm lint` → 53 warnings, 0 errors (as on `main`). |
| 2 | All checks before any write; then accounts, the `runuser` check, folders, settings, units, enable and restart, the health wait | confirmed | `install.ts` runs in that order. By hand: port 80 taken → exit 1, no proxy unit; a fake Caddy saying `v2.6.2` → "needs Caddy 2.7 or later … is 2.6" with the Debian/Ubuntu hint, nothing written. |
| 3 | Permissions | confirmed | `/var/lib/rmk-server` rmk-server 750, `/etc/rmk-server` rmk-server 755, `env` rmk-server 600, `/var/lib/rmk-server-proxy` caddy 700, `/etc/rmk-server-proxy` and its Caddyfile root 755/644, `certs/` root:caddy 750. As `rmk-server`, writing the Caddyfile, a new file in its folder or `certs/x`, or moving the Caddyfile → "Permission denied". |
| 4 | `SuccessExitStatus=143`; Caddy ≥ 2.7; the port's holder from `ss` and `/proc/<pid>/cmdline`; `service.json` contents | confirmed | After `systemctl restart`, `Result=success`. "port 80 is in use by node (pid 237)". `service.json` lists node, entry, port, host, domain and `createdAccounts`. |
| 5 | `scripts/service/test-linux-service.sh` passes | confirmed | Ubuntu 24.04 and Debian 13, as a non-root user with passwordless sudo → exit 0, every step; again on Ubuntu after each fix (11 steps with `--tls files`). |
| 6 | `--domain localhost --tls internal`: HTTPS through `rmk-server-proxy`, running as `caddy` | confirmed | `https://localhost/api/health` 200; the proxy runs as caddy, the server as rmk-server; `PUBLIC_URL=https://localhost`, `TRUST_PROXY=true`. |
| 7 | A reboot brings it back | confirmed | `docker restart` → both services active, health 200, HTTPS 200, token 201. |
| 8 | The CI job would work on `ubuntu-24.04` | partly (read only) | Artifact name, `./tarball/*.tgz`, `sudo env "PATH=$PATH"`, the SHA-512 (matches the amd64 line of the checksums file) and the summary job's wiring are right. It can't run here. |
| 9 | Fix: a failed check no longer leaves new accounts behind | confirmed | Debian 13, a Node `rmk-server` can't run → exit 1; afterwards neither `rmk-server` nor `caddy` exists, nor their groups, folders or units. |
| 10 | Fix: `--tls files` with a `root:root` 600 key, on a fresh machine and after a new gid | confirmed | Exit 0; `key.pem` becomes `root:caddy` 640, `cert.pem` `root:caddy` 644, and Caddy serves that certificate. Uninstall → `root:root` 640. A new `caddy` with another gid (994, not 995) → install works again. |
| 11 | Fix: the server's account can't change the proxy's Caddyfile or certificates | confirmed | See 3. The app unit's `ReadWritePaths` is only `/var/lib/rmk-server /etc/rmk-server`. |
| 12 | Fix: uninstall removes only `rmk-server` and `caddy`, and only when recorded | confirmed (code and unit test) | `uninstallService` loops over those two names and checks `createdAccounts`. |
| 13 | Fix: links in `certs/` are refused before anything changes | confirmed | Symbolic `cert.pem`, `key.pem` or `certs/` (shared key behind a 700 folder, or a readable one), and a hard-linked `key.pem` → exit 1 "is a link …"; the shared key stays `root:ssl-cert` 640; no `caddy`, no `/etc/rmk-server`. Copies install and serve HTTPS; the original key keeps its group. |

**Found, and fixed in this commit** (each re-witnessed): accounts left behind after a failed check;
`--tls files` breaking a key that wasn't world-readable, because install handed `/etc/rmk-server`,
`certs/` included, to `rmk-server`; the server's account owning the folder of the proxy's
Caddyfile; the suggested `chown root:caddy` failing when install had just removed `caddy`, and a key
left with a gid nobody had; symbolic and hard links in `certs/` changing a shared key's group.
**Not checked here:** the GitHub run; Node 22; SELinux and `restorecon`; `--tls auto` with a real
domain; install from npx's cache and the `--host 0.0.0.0` warning (unit tests only). Install
without systemd was checked by the builder, not the witness.
**Differences from the notes:** the notes didn't say the containers had D-Bus (now they do). After
uninstall a kept key is 640, readable by `root`'s group (now in the spec). The refusal for linked
certificates names `rmk-server service restart`, which arrives in task 5.
**Overall:** met here; the *Done when* waits for the GitHub run.

## Task 4 — macOS

Witnessed: 2026-10-04 (01:56–02:12 EDT, with a re-check of the fixes), by a fresh agent. Machine: macOS 27.0.1 (26A434) arm64, Node v24.0.0 (nvm). No `sudo`: nothing was installed on this Mac.

**Not ticked:** the *Done when* needs a run by hand on macOS 15 (the owner's) and the `service-macos` job on GitHub.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Tests, lint, typecheck | confirmed | 8 files, 69 tests; `pnpm lint` → 53 warnings, 0 errors; `pnpm typecheck` → 7/7. |
| 2 | `_rmkserver` through `dscl`, hidden, no shell or home, highest free id below 500 in both lists | confirmed | `ensureAccount` and `freeSystemId` read `/Users UniqueID` and `/Groups PrimaryGroupID`; an existing group's gid is reused. Here 499 is free; the highest id in use below 500 is 441. |
| 3 | bootout, enable, bootstrap with retries | confirmed (after a fix) | First `enable` came after `bootstrap`; moved before it. The test checks the order and two failed bootstraps before a success. |
| 4 | `state = running` from `launchctl print`; `lsof -Fpc`; `dscl` formats and exit 56 | confirmed | `launchctl print system/com.apple.notifyd` → `\tstate = running`, `\tpid = 455` (nested `\t\tstate = active` not matched; unloaded label → 113). A port opened by the witness → `p90262`, `cPython`. `dscl . -read` of a missing user or group → 56. |
| 5 | Log folder and files owned by each service's account | confirmed | `install.ts` makes `/Library/Logs/rmk-server` (755) and each file (644), then `chown` to `_rmkserver`, the `--user` account, or root. |
| 6 | Homebrew's `Cellar/…` recorded as `opt/…` | confirmed | `stableNodePath` (`indexOf`); on this Mac `process.execPath` really is `/opt/homebrew/Cellar/node/25.5.0/bin/node`. |
| 7 | Install and uninstall never create or remove `root` | confirmed | Install skips `ensureAccount` for a root proxy; uninstall only looks at the two layout accounts and skips `root`; `SUDO_USER` of root is refused; a `service.json` naming root has no effect (test). No other way found. |
| 8 | `--user` from `SUDO_USER`, refused on Linux | confirmed | `index.ts` and tests. |
| 9 | `plutil -lint` on plists rendered for this machine | confirmed | App and proxy, as `_rmkserver` and with `--user`, from the built `dist`: 4 OK. |
| 10 | The packed `rmk-server` refuses without root | confirmed | Installed with `npm install --global --prefix <scratch>`: `service install` and `uninstall` → "needs root. Run: sudo rmk-server service …"; `--user` → "run it with sudo from your own account". |
| 11 | The macOS CI job and script | partly (read only) | The `mac_arm64` SHA-512 matches Caddy's checksums file; the pid `awk`, `stat -f '%Su %Lp'` and `ps -o user=` work on real output; the summary job includes `service-macos`. It can't run here. |
| 12 | The notes say what hasn't happened | confirmed | "Still open, so the task stays unticked" names the run by hand and the CI run. |

**Found, and fixed in this commit:** `enable` after `bootstrap` (a disabled job would never load);
any `dscl -read` failure taken as "missing" for the account, and then (re-check) for its group.
The re-check confirmed the first two; the group fix followed the same pattern, with a test.
**Known and left (in the notes):** uninstall deletes the account's group even if it existed before;
the plists set no `PATH`.
**Not checked here:** a real `bootstrap` or `dscl -create`; macOS 15; the CI run; whether launchd
opens `StandardOutPath` as the job's account; Homebrew `node@24`'s global prefix on the runner.
**Differences from the notes:** the example ids (fixed); `lsof` also prints an `f…` line (ignored).
**Overall:** met here; the *Done when* waits for the run by hand and the CI run.

## Task 5 — `status`, `start`, `stop`, `restart`, `logs`

Witnessed: 2026-10-04 (02:07–02:43 EDT, in five rounds), by a fresh agent. Machine: macOS (Darwin 27.0.0) arm64, Docker; containers booted with systemd (Ubuntu 24.04), Node 24.21.0 and Caddy 2.11.6 (both checksum-verified), and the package from `pnpm build && pnpm build:server`.

**Not ticked:** the *Done when* says CI calls each command, which happens once the branch is pushed.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Tests, lint, typecheck | confirmed | Server 86 tests; apps/web `env-file` 23; `pnpm lint` 53 warnings, 0 errors; typecheck 7/7. |
| 2 | `status` without root; exit 0, 3, 4; address, setup wait, listen address, account, folders, log, proxy | confirmed | As a user with no extra groups: 4 before install, 0 running, 3 stopped; "not set up yet"; with `--domain`, `https://localhost` and "rmk-server-proxy, running (Caddy, internal certificates)". |
| 3 | Version and moved-install messages; `restart` records the version | confirmed | `package.json` set to 0.2.1 → "0.2.1 (it was 0.2.0 … restart runs …)"; `restart` printed "(0.2.1)" and recorded it. Node moved away → "isn't there any more … install again". |
| 4 | `start`, `stop`, `restart` on both services, the proxy stopped first | confirmed | Stop → health 000, status 3; start → "Started … (0.2.0)", proxy active. macOS (code and tests): stop is `bootout`, start bootstraps or kickstarts, restart `kickstart -k`. |
| 5 | `logs` follows both units and leaves nothing behind | confirmed | The journal held "Data folder: /var/lib/rmk-server". After `timeout 4 … logs`, `timeout -s INT`, or a HUP: no `journalctl` left. |
| 6 | `sudo rmk-server setup`, `migrate`, `reset-root-password` work on the service's data as its account | confirmed | The database is `rmk-server`'s; `reset-root-password --yes` → old password 401, new 201; with a domain, `PUBLIC_URL=https://localhost` kept (even with another `PUBLIC_URL` passed in). Without `sudo`: the hint, exit 1; `RONNE_DATA_DIR` set: runs as before. No folder made in /root. |
| 7 | The service's account can't steer root | confirmed (after fixes) | Round 1: a `service.json` naming root and `/usr/bin/touch` made a root-owned file. Round 2: still `user: tester` (the admin) and a swap of `env` for a link to `/etc/shadow` between check and read (5 of 5). Round 3, with `/etc/rmk-server` root's: `user: root`, `daemon` and `tester` refused; recorded programs ignored; `service.json` or `env` as a link refused by install, start, stop, restart, setup and migrate; 10 timed swaps (0.1–0.7 s), also from a folder still owned by `rmk-server`, leak nothing; `/etc/shadow`'s checksum unchanged; links planted in `/var/lib/rmk-server` not followed by `chown -R`. |
| 8 | The browser's setup writes the settings file inside the service's sandbox | confirmed (after a fix) | Round 3 found EROFS there (`ProtectSystem=strict`). Round 4: `systemd-run` with the unit's sandbox and `nsenter` into the service both write `env` in place (600, no temporary file left, folder still root's 755). With the EROFS line removed from the installed bundle, the script's new step fails as it should. |
| 9 | `test-linux-service.sh` | confirmed | Fresh container, as a user with passwordless sudo: exit 0, 14 steps. |

**Found, and fixed in this commit:** the hand-off trusting `service.json` for the account and the
program (root escalation); root reading and writing `env` through a link (and racing the check);
`SUDO_USER` accepted on Linux; chmod by name after writing; an orphaned `journalctl` after a
signal; the refusal's wording; "logs needs no sudo" (it does on Linux); the browser's setup failing
with EROFS once the folder became root's. The settings folder is now root's, with only `env` the
service's, and the app rewrites `env` in place when it can't add a file there.
**Not checked here:** the browser form itself (the same code path was run in the same namespace);
the macOS script; Debian 13 by the witness (the builder ran it: 14 steps); CI.
**Differences from the notes:** none left; the notes were corrected each round.
**Overall:** met here; the *Done when* waits for CI.

## Task 6 — Documentation

Witnessed: 2026-10-04 (02:49–02:58 EDT), by a fresh agent. Machine: macOS 27.0.1 arm64; Docker container from Ubuntu 24.04 with systemd and the package built after the last app change.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | The docs render and help tests pass; lint, typecheck, e2e | confirmed | `vitest run src/features/docs src/components/help` → 13 passed; with `src/server/setup` and `config.test.ts` → 92 passed, 2 skipped; `pnpm lint` 0 errors (53 warnings); typecheck 7/7; `pnpm test:e2e` re-run → 84 passed. |
| 2 | `status` without sudo; every other command with it | confirmed | Not installed → exit 4; installed → version, address ("not set up yet"), listen address, account, folders, log, proxy. install, stop and setup without sudo → "Run: sudo …". `logs` isn't refused in code, but without sudo journalctl shows no lines ("Failed to search journal ACL"). |
| 3 | stop, start, restart, logs; `sudo rmk-server setup` and `migrate` on the service's data | confirmed | "Stopped …", "Started … (0.2.0).", "Restarted … (0.2.0)."; logs follow both units; "The rmk-server service's /var/lib/rmk-server, as rmk-server:", health 503 → 200; "Nothing to migrate". |
| 4 | Linux locations and account | confirmed | `/var/lib/rmk-server` (rmk-server 750), `/etc/rmk-server/env` (600), `journalctl -u rmk-server`, account `rmk-server`. |
| 5 | uninstall keeps the data; install again uses it; `--delete-data` asks for the name | confirmed | Accounts gone, `ronne.db`, `storage`, `env` kept; reinstall → "It's set up"; a wrong name → "Not confirmed: nothing was changed." (exit 1); `rmk-server` → the four folders deleted. |
| 6 | `--domain`, Caddy 2.7+, Debian/Ubuntu's package too old; `--tls files` copies not links | confirmed (Ubuntu) | Without Caddy: the message pointing to Caddy's repository; with 2.11.6, `--domain localhost --tls internal` → proxy running, HTTPS 200, status "internal certificates". Ubuntu 24.04's candidate `caddy` is 2.6.2. A linked `cert.pem` → "Copy them there instead (sudo cp -L)". |
| 7 | A Node in a home folder is refused; `sudo env "PATH=$PATH"`; no systemd | confirmed | Node in `~alice/n` → "can't run … in someone's home folder"; without init → "systemd isn't running here … rmk-server start …". |
| 8 | Upgrading lines | confirmed (code) | `restart` records the new version; status names a missing Node or entry. No real upgrade run. |
| 9 | The setup's closing line under the service | confirmed | `sudo rmk-server setup --yes` → "The service runs it: open http://localhost:7650 and sign in as root@example.com."; with `RONNE_DATA_DIR`, the old line. |
| 10 | Index row "in progress" | confirmed | specified → in progress → done; tasks 3–5 aren't ticked. |

**Found, and fixed in this commit:** the `--tls files` folder was given as `/etc/rmk-server-proxy/certs`
without its macOS form (the prefix's `etc/rmk-server-proxy/certs`) in the Documentation, README and
runbook; `rmk-server service --help` said "the settings folder's certs/".
**Not checked here:** the macOS facts (checked against `layout.ts` and `macos.ts` only); Debian's
`caddy` version; `--tls files` with valid certificates, `--tls auto`, `--email`; a real upgrade;
`--port` and `--host` on a reinstall.
**Differences from the notes:** the notes' "36" was the docs and help tests (13) plus the
settings-file tests (23); now said so.
**Overall:** met.
