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
