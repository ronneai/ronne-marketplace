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
