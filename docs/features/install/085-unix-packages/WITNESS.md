# 085 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, a fresh agent that didn't do the work checks it: it gets the task's *Done
when*, the claims in the notes and where to look, runs the commands itself, and reports each claim as
confirmed, partly or not met (owner, 2026-10-04). A task is ticked only when every claim holds.
Its record lands here, in the same commit as the task. Differences it finds are fixed in the notes
in that commit.

## Task 3 — `.deb` and `.rpm` with nFPM

### Here (arm64)

Witnessed: 2026-10-04 (22:16–22:45 EDT), by a fresh agent. Machine: macOS (Darwin 27.0.0) arm64, Docker; nFPM 2.47.0 (checksum checked).

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Tests, lint, typecheck | confirmed | repo-tools 100; marketplace 88; `pnpm lint` 53 warnings, 0 errors; typecheck 7/7. |
| 2 | The packages: contents, link, dependencies, scripts, maintainer | confirmed | The witness built both formats (and 0.0.1): everything under `/opt/rmk-server` (root:root), `/usr/bin/rmk-server` → `/opt/rmk-server/bin/rmk-server`; `.deb` `Depends: libc6 (>= 2.34), libstdc++6 (>= 11)`, `Recommends: caddy`; `.rpm` requires `libc.so.6(GLIBC_2.34)(64bit)` and `libstdc++.so.6(GLIBCXX_3.4.29)(64bit)`, suggests caddy; both have the three scripts; Maintainer `Ronne AI Marketplace <marketplace@ronne.ai>`. |
| 3 | The life cycle in Ubuntu 24.04, Debian 13, Fedora 42 | confirmed | `test-in-containers.sh` on the witness's own packages (0.0.1 → 0.2.0): exit 0; install (503), upgrade (restarted, 200), remove, install again (200), purge, on each. |
| 4 | The `runuser` fix | confirmed | `fedora:42` has no `runuser` (util-linux-core only), no `/usr/sbin/nologin`, no `ss`; the install passes there now. Node's `spawnSync` with the account's uid/gid ran as `uid=999 gid=999 groups=999` (root's groups dropped), couldn't read `/etc/shadow` or write `/root`; `id`'s output is checked to be digits. |
| 5 | Edge cases | confirmed | Ubuntu 20.04 (glibc 2.31) refuses, naming both dependencies; Debian 13 without systemd installs it and says how to start it, no unit or account made; port 7650 taken: apt exits 0, "port 7650 is in use … --port 7660" and the command to finish, nothing left half-made; an upgrade keeps `--port 7700` (`--domain` read in the code, not run: no Caddy 2.7 there). |
| 6 | The workflows and the policy | confirmed (read), with two defects fixed | nFPM's checksums for Linux x86_64 and arm64 match GoReleaser's file; the sparse checkout builds both packages in `node:24-bookworm-slim`; artifact names line up; four packages required in the release, added to `checksums.txt`; dry run builds and tests them; `dependencies.md` has nFPM (MIT, CI only, pinned). |

**Found, and fixed in this commit:** the CI's output folder `packages/` was the repository's own,
so the artifact carried repo-tools' scripts; the release notes would name a pre-release's packages
`-rc.1-1` where nFPM writes `~rc.1-1`. Both checked by the builder (the notes rendered for
`1.0.0-rc.1`).
**Not checked here:** amd64; the workflows on GitHub (privileged systemd containers on hosted
runners); an upgrade with `--domain`; openSUSE and RHEL.
**Differences from the notes:** the upgrade test's two packages are the same program labelled 0.0.1
and 0.2.0 (now in the notes); the account check keeps root's environment and drops the account's
extra groups (now in the notes).
**Overall:** met as far as arm64 here goes; the *Done when* waits for CI.

### Task 3 — CI on GitHub

Witnessed: 2026-10-05, from GitHub's logs (`gh`, read only), by a fresh agent. Pull request #127, head `5ecf8e7a50781423f88ee67baf7544e10a009807`, run https://github.com/ronneai/ronne-marketplace/actions/runs/37255521282 ("Server package", attempt 1, 02:28–02:35Z).

| # | Claim | Verdict | Evidence (job → log lines) |
|---|---|---|---|
| 1 | Every check passed, on the head commit | confirmed | `gh pr checks 127`: 41 pass; the run's head SHA is the pull request's and `origin`'s. |
| 2 | Both processors, nFPM verified | confirmed | x64 job 111592258107 on `ubuntu-24.04` 20260927.320.1, arm64 job 111592258119 on `ubuntu-24.04-arm`; `nfpm_2.47.0_Linux_x86_64.tar.gz: OK` and `…_Linux_arm64.tar.gz: OK`. |
| 3 | Four packages per job | confirmed | `rmk-server_0.2.0-1_amd64.deb` (80,252,808 B), `rmk-server-0.2.0-1.x86_64.rpm` (80,672,224 B), the arm64 pair, and the 0.0.1 pairs. |
| 4 | Install, health, upgrade, remove in Ubuntu 24.04, Debian 13, Fedora 42 | confirmed | In both jobs, 5 ✓ lines per system (install with 503; upgrade restarted on 0.2.0, 200; remove keeping data and settings; install again, 200; purge) and the overall ✓; no ✗. The scripts run under `set -eu`, so each ✓ follows its checks (MainPID changed, status shows the new version, unit, account and link gone, `ronne.db` kept). |
| 5 | The artifacts hold only the packages | confirmed | `linux-packages-x64` (159,622,003 B) and `-arm64` (159,449,992 B); "2 files uploaded" each, from `linux-packages/`. |

**Not covered by CI:** `release.yml` (it calls the same `packages.yml`; read only); an upgrade
between two different builds; other distributions and real machines.
**Overall:** met. Task 3 is ticked.

## Task 4 — `install.sh` without Docker

Witnessed: 2026-10-05 (22:34–22:55 EDT on 2026-10-04), by a fresh agent. Machine: macOS (Darwin 27.0.0) arm64, Docker; Ubuntu 24.04 and Fedora 42 containers booted with systemd, no Docker in them.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Tests and CI's shfmt check | confirmed | `pnpm test:install` "all passed" under dash and bash (14 new checks); shfmt v3.14.1 `-p -i 2 -ci -d` → no diff; lint 53 warnings, 0 errors. |
| 2 | Ubuntu 24.04 without Docker: a tampered checksum stops it | confirmed | "…doesn't match checksums.txt (SHA-256 7ed4…, expected 0ed4…). Nothing was installed.", exit 1; `dpkg -l` has no rmk-server. A missing line: "checksums.txt has no line for …", exit 1. |
| 3 | The questions | confirmed | Interactive (`script -qec`): "n" at the first → "Nothing changed"; "y" then "n" → the checksum checked, the command shown, "Nothing changed. To install it yourself: …"; nothing installed. |
| 4 | The install | confirmed | "y", "y", with `--domain ronne.example.com`: SHA-256 matches, `sudo apt-get install -y …` shown and run, the service starts, the URL and Caddy 2.7 `--domain` hint printed; `systemctl is-active` active, health 503. Again with `--yes`: "already the newest version", exit 0. As root: `apt-get` without sudo. |
| 5 | Caddy only suggested | confirmed | `Depends: libc6 (>= 2.34), libstdc++6 (>= 11)`, `Suggests: caddy`, no Recommends; after the install `dpkg -l caddy` → not installed. |
| 6 | macOS without Docker | confirmed | `env -i … PATH=/usr/bin:/bin sh scripts/install/install.sh --yes`: "Docker isn't installed.", the npm choice and the Docker links, exit 1; `~/ronne-marketplace` absent before and after. |
| 7 | Fedora, the release URL, edge cases | confirmed | fedora:42 with `--yes`: `dnf install -y …aarch64.rpm`, service active, 503, no caddy. With `RONNE_VERSION=0.2.0-rc.1`: `…/releases/download/v0.2.0-rc.1/rmk-server_0.2.0~rc.1-1_arm64.deb`. No `/etc/os-release`, a development copy, no curl: each explains and exits 1. |

**Found, and fixed in this commit** (checked by the builder in an Ubuntu container): a temporary
folder with a space broke the install command; a failed run left the 80 MB download in `/tmp`;
apt's "unsandboxed" notice (a 0700 folder); `curl` found missing only after the first question, and
`--domain` not checked.
**Open:** a pre-release's `~` in the packages' names, which GitHub may rename (untried; in the notes).
**Not checked here:** amd64; Debian and RHEL themselves; a real GitHub download; `curl … | sh`.
**Overall:** met.

## Task 5 — Documentation and the policy

Witnessed: 2026-10-05, by a fresh agent. Machine: macOS arm64, Docker; an Ubuntu 24.04 systemd container and a Fedora container with the arm64 packages.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | The docs render and help tests pass; lint, typecheck | confirmed | 13 passed (the `packages` section and its facts asserted); `pnpm lint` 53 warnings, 0 errors; typecheck 7/7. The builder's `pnpm test:e2e`: 84 passed. |
| 2 | `apt install ./…deb` makes Ronne a service | confirmed | Enabled and active, `Restart=on-failure`, `WantedBy=multi-user.target`; postinst "open http://localhost:7650 and finish the setup"; `curl :7650` → 307. |
| 3 | Where things are | confirmed | `/usr/bin/rmk-server` → `/opt/rmk-server/bin/rmk-server`; `/var/lib/rmk-server` owned by `rmk-server`; `/etc/rmk-server/env` (600); `User=rmk-server`; the log in `journalctl -u rmk-server`; `rmk-server service status` → "installed, running". |
| 4 | Upgrading keeps the options | partly | `service install --port 7700`, then `apt-get install --reinstall` → "Restarted the rmk-server service", `--port 7700` kept. A real version change with migrations wasn't run here (CI's upgrade test covers the package step). |
| 5 | Removing and purging keep the data | confirmed | `apt remove`: unit, account and `/opt` gone, `/var/lib` and `/etc/rmk-server` kept; `apt purge`: the "sudo rm -rf …" line, folders kept. |
| 6 | Without systemd | confirmed | "systemd isn't running here… Start it with: rmk-server start --host 0.0.0.0"; `install ok installed`. |
| 7 | `dnf install`, the file names, glibc 2.34 | confirmed | The `.rpm` installs and removes on Fedora (no systemd there), requiring `GLIBC_2.34` and `GLIBCXX_3.4.29`; the documented names follow nFPM's patterns (amd64/x86_64); the systems listed meet the dependencies, and `install.sh` refuses below 2.34 with the same list. |
| 8 | The install script, MVP's row, 081's spec, nFPM in the policy | confirmed | `check_docker` → `native_install` (checksum, then "Run it?" before `sudo`); the MVP row and 081's spec match what ships; `dependencies.md` has nFPM. |

**Found, and fixed in this commit:** the runbook still showed Homebrew as live in its table, upgrade
and uninstall lines, and its header said only Docker on port 3000 works; the spec's Documentation
section still promised Homebrew; `dnf remove` prints the delete command too (now said).
**Not checked here:** amd64; RHEL 9, Debian 12, Ubuntu 22.04 themselves; a real upgrade with
migrations; `--domain` through the package; a reboot.
**Overall:** met.

## Follow-up: messages within 80 columns (2026-10-05, after the v0.3.0 release run)

The v0.3.0 release's packages test failed on Fedora 42: dnf 5 (5.2.18) cuts each line a package
script prints at 80 columns, its `>>> ` prefix included, so the purge note's `sudo rm -rf …` line and
`rmk-server service uninstall`'s note were cut. The fix: short echoes, and `rmk-server`'s messages
folded at spaces (`wrapped`, `fold -s -w 76`), keeping its exit status.

| Check | Result | Evidence |
|---|---|---|
| Syntax and lint | confirmed | `sh -n` and `dash -n` (debian:13) and shellcheck clean on the three scripts and the test |
| Behaviour unchanged | confirmed | Under dash: `wrapped` returns the command's status (7, 0); a failing `mktemp` still runs the command; the fallbacks still print; every script exits 0 |
| `fold` keeps the text | confirmed | Present on fedora:42, debian:13, ubuntu:24.04; the joined lines match the original (`cmp`, md5), `…` and `→` included; the longest line 75 columns |
| dnf 5 | confirmed | A throwaway rpm running the real scripts with a fake `rmk-server` printing the real messages: every line at most 80, nothing cut, the `said` checks pass. Built from the old scripts, the cut lines and the failing checks reproduce |
| apt | found, fixed | apt's lines end in `\r\n` (dpkg in a pty): `said` now deletes `\r` too, which passes on debian:13 and ubuntu:24.04 |
| Unit tests catch regressions | confirmed, gaps fixed | Long echoes, an unwrapped call, `wrapped` drifting, a lost status, a wider fold, stderr dropped. A single-quoted echo and a call by full path were missed; both are caught now |

**Not checked here:** the full CI package test, which the pull request runs on Ubuntu, Debian and
Fedora for both processors. dnf drops non-ASCII characters (`…`, `→`) from script output in the C
locale, before and after this change.
**Overall:** met.
