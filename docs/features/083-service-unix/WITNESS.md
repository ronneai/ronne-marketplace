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
