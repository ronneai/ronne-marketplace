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

- [ ] **6. Documentation.** README and the *With Docker* section, as the spec lists.
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
