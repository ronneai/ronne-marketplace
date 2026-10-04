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
