# 081 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Tools under the dependency policy.** shfmt (BSD-3-Clause) to parse the script as POSIX
  `sh`, and PSScriptAnalyzer (MIT). Not ShellCheck: GPL-3.0, forbidden even in CI. Record both.
  *Done when:* the policy lists them.

- [ ] **2. `install.sh`.** In `scripts/install/`: checks, questions, port check, folder, start, wait,
  open; `--yes` and the flags; the function-on-the-last-line guard.
  *Done when:* `shfmt -p` passes, it runs under `dash`, and by hand on macOS and Ubuntu: a fresh install, a rerun, a
  busy port, no Docker.

- [ ] **3. `install.ps1`.** The same, for PowerShell 5.1 and 7.
  *Done when:* PSScriptAnalyzer passes, and by hand on Windows 11 with Docker Desktop.

- [ ] **4. Release assets.** `release.yml` attaches both scripts, with `compose.yaml`'s version
  written in, and `checksums.txt`.
  *Done when:* a dry-run release shows the assets and the checksums match.

- [ ] **5. CI.** On Ubuntu: `install.sh --yes` (local, then server with `RONNE_TLS=internal`)
  against the image built in the same run, with health checks; on Windows: `install.ps1 -Yes`
  up to the Docker check (GitHub's Windows runners can't run Linux containers), plus lint.
  *Done when:* the jobs pass, and a broken script fails them.

- [x] **6. Documentation.** README and the *With Docker* section, as the spec lists.
  *Done when:* the docs render tests pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

### Task 1: the tools (2026-10-03)

- **shfmt:** `mvdan/sh` on GitHub, BSD-3-Clause, maintained (last push 2026-09-29). v3.14.1
  (2026-09-06, past the cooldown). Used as the official image
  `mvdan/shfmt:v3.14.1@sha256:8c06884a35683d8763fba6c0d9484d11a61a96da65f8d497d6f625825a6043f2`
  (linux/amd64 and arm64 among its platforms), like Trivy, so CI downloads no loose binary.
- **PSScriptAnalyzer:** `PowerShell/PSScriptAnalyzer`, MIT, Microsoft. 1.25.0 (2026-03-20), from
  the PowerShell Gallery with `-RequiredVersion 1.25.0`.
- **dash:** Ubuntu's `/bin/sh`, and also at `/bin/dash` on this macOS machine, so the tests run
  under it in both places.
- The policy now has a table of the tools CI runs that aren't npm packages (Trivy too, which
  wasn't listed), and says why ShellCheck isn't used.

### Task 2: `install.sh` (2026-10-03)

`scripts/install/install.sh`. `shfmt -p -i 2 -ci -d` passes (no diff), and so do `dash -n` and
`bash -n`. Checked by hand on macOS (Docker Desktop, Compose 5.5), with
`RONNE_INSTALL_COMPOSE_URL=file://…/compose.yaml RONNE_INSTALL_IMAGE=ronne-web:local`, under dash
and under bash:

- Fresh install with `--yes`: `.env` has only `RONNE_IMAGE`, `certs/` exists, and
  `http://localhost:7650` answers. A rerun keeps it on 7650, since its own ports count as free.
- Busy 7650 (a Python server): it moves to 7652 and 7653 and says so.
- Interactive, through a pseudo-terminal: answering 2, `localhost` and no email writes
  `RONNE_DOMAIN`, `RONNE_PORT=80` and `RONNE_HTTPS_PORT=443`, and `https://localhost` answers 503.
  Rerunning and answering 1 removes the domain lines and goes back to 7650.
- Busy 80 (an nginx container): stops with the *Behind your own web server* advice, exit 1.
- With the version set to 0.2.0 (the real image): `.env` at 0.3.0 is refused; at 0.1.1 it asks
  "Upgrade 0.1.1 → 0.2.0?". Answering no changes nothing; yes pulls `ronneai/marketplace:0.2.0`
  and runs it behind the proxy.
- No Docker on `PATH`, a bad domain, a folder with other files, a second folder while one install
  exists, and no terminal without `--yes`: each prints its own message and exits 1.
- `${HOME:?HOME isn't set}` parsed in dash but not in bash or shfmt: an apostrophe inside `${…}`
  in double quotes opens a quote in bash. The tests run under both for this reason.
- **Not checked by hand:** Ubuntu (CI runs it there in task 5); a stopped daemon and an old
  Compose (messages read but not triggered); a legacy install whose old stack holds 3000. 3000
  was already taken on this machine, so the test only showed the move to 7650. The fix found then
  (any of the install's own containers running, not only `proxy`, makes its ports count as free)
  wasn't run against a real legacy stack.

### Task 3: `install.ps1` (2026-10-03)

`scripts/install/install.ps1` follows `install.sh` step by step, with the same messages, flags
(`-Yes -Mode -Domain -Email -Dir`), port pairs, version rules and test variables.

- **PSScriptAnalyzer 1.25.0:** no findings at any severity, with `PSUseCompatibleSyntax` targeting
  5.1 and 7.4. It flagged a ternary (`? :`, PowerShell 7 only), now an `if`. It also flagged
  `$Yes` as unused, because the functions read it from the script's scope; it's now `$script:Yes`.
  Run in `mcr.microsoft.com/powershell:7.5-ubuntu-24.04` (the only PowerShell image tag published,
  amd64 only, so emulated on Apple silicon).
- **ASCII only:** Windows PowerShell 5.1 reads text without a BOM as the system code page, so "→"
  and "…" would be garbled. The script writes "->" and "...".
- **`.env`** is written as UTF-8 without a BOM (Compose would read a BOM as part of the first key)
  and with LF line ends: `Set-Content -Encoding utf8` adds a BOM in 5.1.
- **Run on PowerShell 7.5 (Linux):** no Docker gives the message and exit 1; `-Mode moon` is
  refused by `ValidateSet`. With the function definitions loaded: `Compare-RonneVersion` gives
  the same answers as `install.sh`'s `version_cmp` (checked under dash and bash) in 9 cases, including
  pre-releases and 0.10 > 0.9. `Test-Domain` accepts and refuses the same names. `Write-EnvValue`
  keeps other lines, removes emptied keys, and writes no BOM.
- **Health and downloads use `curl.exe`**, which ships with Windows 10 and 11, rather than
  `Invoke-WebRequest`. That one throws on the expected 503, and reports the status differently in
  5.1 and 7.
- **Not checked:** by hand on Windows 11 with Docker Desktop (no Windows machine here). CI runs it
  on a Windows runner up to the Docker check in task 5. The rest needs the owner on Windows.

### Task 4: release assets (2026-10-03)

- `packages/repo-tools/src/install-scripts.js` writes the version in (`withInstallVersion`, which
  refuses a script with no placeholder or two) and makes `checksums.txt` in `sha256sum` format. Its
  tests also check that both scripts end by calling their entry point.
  `release-install-scripts.js <version> <folder>` is the command `release.yml` runs.
- `release.yml`: the `release` job writes the three files and uploads them as the
  `install-scripts` artefact, on a dry run too, so a dry run shows them. `github-release` checks
  them with `sha256sum -c` and attaches them next to the npm tarballs.
- Locally: `release-install-scripts.js 0.3.0 …` writes both scripts with the version in, and
  `shasum -a 256 -c checksums.txt` reports both OK.
- **Fixed on the way:** `github-release` used `$VERSION` without setting it, so v0.1.0 to v0.2.0's
  notes read "docker pull ronneai/marketplace:" with no version. It now gets
  `needs.release.outputs.version`.
- **Still open:** a dry-run release (run by hand from `main`, after the merge) to see the
  artefact. Tick the task then.

### Task 5: CI (2026-10-03)

- **Unit tests:** `scripts/install/test-install.sh` (under dash and bash, `pnpm test:install`) and
  `test-install.ps1` (Windows PowerShell 5.1 and PowerShell 7). Each loads its script without the
  last line and checks the version comparison, the domain and email checks, `.env` editing (no BOM
  for PowerShell), the release placeholder, and a run with no Docker on `PATH` (message, exit 1).
  `PATH=/nonexistent` hid the shell too (exit 127), so the test runs it by its full path.
- **`install-scripts.yml`:** shfmt `-p` and the sh tests on Ubuntu; PSScriptAnalyzer and both
  PowerShell versions on `windows-latest`; one `Install scripts` check that passes on success or
  on a docs-only skip.
- **`install-probe.sh`**, in the image action after the compose probe, runs `install.sh --yes` on
  the image just built: a fresh install under dash, a rerun under bash, a domain (`localhost`,
  with `RONNE_TLS=internal` written first) over HTTPS with the redirect, back to this computer with
  7650 held by a Python server (moves to 7652), and no Docker. It checks `.env` line by line. It
  passes locally in about 12 s. With the port search broken on purpose (steps of 3), it fails at
  the busy-port case.
- **Bug found by the probe:** on macOS `mktemp -d` is under `/var/folders`, a symlink to
  `/private/var/folders`. `docker compose ls` reports the path unresolved, so the rerun took its
  own install for another one. `check_other_install` now compares real paths (`pwd -P`) on both
  sides. `install.ps1` compares with `Resolve-Path`, which doesn't resolve symlinks. That's
  enough on Windows, where installs don't sit behind symlinks, but not on PowerShell for macOS.
- **Still open:** the runs on the pull request, and a broken script failing them there.

### Task 6: documentation (2026-10-03)

- README *With Docker*: the two commands first, what the script does, `--yes` for scripts, and
  checking the download against `checksums.txt`. `compose.yaml` by hand follows.
- Documentation › Installing Ronne › With Docker: the commands, the questions, the port check, the
  folder, and rerunning to upgrade, with tests. As in 080, the Documentation has no search, so
  there were no `topics.ts` keywords to add (spec updated).
- The runbook says how to check the download, and that rerunning upgrades.
- The docs tests pass, and so does `pnpm test:e2e` (84 tests).
- The commands work from the first release that includes this feature: v0.2.0 has no install
  scripts attached.
