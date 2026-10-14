# 121 — No Windows server: WSL or a virtual machine instead

> Milestone: M12 · Depends on: 081, 082, 084, 086 · Withdraws: 086 (built), 087 (specified) ·
> Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap), [§15](../../MVP/MVP.md#15-decision-log) (Easy install) ·
> Guide: [`docs/runbooks/install.md`](../../runbooks/install.md)

## Goal

The Ronne server (`rmk-server`, the image, the install script) runs on Linux and macOS only. People
on Windows run it in WSL 2 or a Linux virtual machine, where Linux's own install paths work
unchanged (owner, 2026-10-14: "we don't have users installing on windows, I want the next release
without a windows server. We should have only the rmk commands"). The owner has no Windows machine to test the server on, and its
Windows-only parts have been the costliest to keep right. Each bug there was found through CI
logs, one round trip at a time, and is security-sensitive (a virtual account, ACLs, an
administrator's scripts over a folder the service can write). That cost buys a path few people
need, now that WSL 2 runs Linux software as it is.

The **clients stay on Windows**: `rmk` and `rmk-mcp` (the MCP server a coding tool starts on the
developer's machine) run where developers use Claude Code, Codex and Cursor, Windows included.
This feature removes the server's Windows support only, in the next release (the one with 099).
Nobody installs the server on Windows (owner), so there's no migration to write.

## Scope

**In:**
- **`rmk-server` refuses to run on Windows.** `@ronneai/marketplace` declares
  `"os": ["darwin", "linux"]`, so `npm install --global` stops with npm's own EBADPLATFORM. A
  start that gets past it (`npx`, a copied folder) prints one line: "rmk-server runs on Linux and
  macOS. On Windows, run it in WSL 2 or a Linux virtual machine:
  https://www.ronne.ai/marketplace/docs/install#windows". It exits 1.
- **Removed from the code:**
  - The Windows service, feature 086: `packages/server/src/service/windows.ts`, `winsw.ts`, their
    tests and golden files, and the Windows layout in `layout.ts`. Also the `win32` branches in
    `control.ts`, `install.ts`, `args.ts`, `model.ts`, `system.ts` (`fltmc`, `findLinks`'s
    junctions), `index.ts`, `paths.ts` (`%LOCALAPPDATA%`), `run.ts` and `cli.ts`.
  - The web app's Windows-only branches, which only a native Windows server reaches:
    `runtime.ts`'s, `setup/env-file.ts`'s replace-in-place for Windows, and
    `setup/rotate-secret.ts`'s "as an administrator".
  - The repository tools: `winsw.js` (fetching and checking WinSW), the `win32` parts of
    `bundle.js`, `bundle-check.js`, `bundle-smoke.js`, `packs.js` and `notices.js` (WinSW's
    notice), and `server-probe.js`'s Windows branches (the case-insensitive `--out` check stays,
    for macOS).
  - `scripts/service/test-windows-service.ps1`, `scripts/install/install.ps1` and
    `test-install.ps1`, and `install-scripts.js`'s and `release-install-scripts.js`'s
    PowerShell parts.
  - The knowledge note `docs/knowledge/windows-service-sids.md`.
- **CI and releases:**
  - `bundles.yml` builds four archives (Linux and macOS, x64 and arm64), not six.
  - `server-checks.yml` loses `windows-latest` from the install matrix, the "Service on Windows
    (WinSW)" job, and 099's "Disk tests on Windows" job.
  - `install-scripts.yml` loses the PowerShell job.
  - `release.yml` stops attaching `install.ps1` and the `win32` bundles, and its notes stop naming
    them.
  - `ci-scope.js` drops the removed paths.
- **The clients get a Windows check of their own:** a
  `windows-latest` job in `ci.yml` that builds `@ronneai/core`, `rmk` and `rmk-mcp` and runs
  their tests. Today no CI job runs them on Windows, though `packages/cli` has Windows code
  (`config.ts`, `export.ts`, `usage-hooks.ts`).
- **The decision log** (MVP §15, Easy install): "macOS, Linux and Windows" becomes "macOS and
  Linux; Windows through WSL 2 or a virtual machine", with the reason. 086's and 087's index rows
  become "withdrawn (121)".

**Out:**
- **The clients' Windows support.** `rmk` and `rmk-mcp` keep running on Windows; their path
  handling (`win32` in `packages/cli`) stays.
- **099's generic disk checks.** `sameFile` (one folder by any name) and restore's trial of stored
  names stay: they serve macOS, exFAT, SMB and casefolded folders too. Only their Windows CI job
  goes, and the restore's tolerance of Windows' ENOENT can stay as harmless.
- **Developing Ronne on Windows** (a clone with `pnpm dev`): not supported before and not now; the
  contributor guide says to use WSL 2.
- **Docker Desktop on Windows.** It runs on WSL 2. A person who prefers it can run `install.sh` in a
  WSL terminal, with Docker Desktop's WSL integration on. It isn't a path the install guide
  describes on its own.

## Behaviour

### Running on Windows after this

| How | What happens |
|---|---|
| `npm install --global @ronneai/marketplace` on Windows | npm: `EBADPLATFORM … wanted {"os":"darwin,linux"}` |
| `npx @ronneai/marketplace`, or a copied install | The one line above, exit 1, before anything is read or written |
| `irm …/install.ps1 \| iex` | No such file in new releases; 0.3.x's stays on its own release page (releases are immutable) |
| `winget install RonneAI.Marketplace` | Never published (087 wasn't built) |
| WSL 2 (Ubuntu) | The Linux paths: `install.sh` with Docker, or the `.deb`, or npm with `sudo rmk-server service install` (WSL 2 runs systemd when it's on in `/etc/wsl.conf`) |

### What stays the same

Linux and macOS: every command, path and check as today. The image, `compose.yaml` and
`install.sh` don't change. Docker on a Windows host still works through Docker Desktop and WSL 2,
but the install guide doesn't present it as a path of its own.

## Edge cases

- **A 0.3.x Windows service someone has anyway:** the new version refuses to start on Windows, so it
  can't touch it; 0.3.x's own `rmk-server service uninstall` removes it.
- **Old release pages** keep their Windows assets (GitHub releases are immutable); the next
  release's notes say the server no longer runs on Windows, and why.
- **`rmk-server` in WSL with Node.js from Windows** (`node.exe` on `PATH` through interop): it's
  Windows' Node, so the refusal fires; the message's link says to install Node.js inside WSL.
- **099 lands in the same release:** its runbook (`backup.md`) is written without Windows (no Task
  Scheduler, no Windows rows), and its Windows-only CI job goes with this feature.

## Documentation

- **Installing** (`install`, website): the Windows sections go (the service as administrator, the
  bundle, `winget` for Caddy, `%LOCALAPPDATA%`). A **Windows** section (`install#windows`) says:
  use WSL 2 (`wsl --install`, then the Linux steps), or a Linux virtual machine; `rmk` and the MCP
  server run on Windows itself. A new section anchor, so `topics.ts` changes in both repositories.
- **Running Ronne** (`operations`): the "Windows service, as administrator" rows go; the Backups
  section (099) has no Windows.
- **Repository docs:** `install.md` and `incident-response.md` lose their Windows rows and
  sections (`backup.md` is written without them). `release.md`'s checklist stops naming Windows checks. `README.md` drops the
  Windows service and bundle. The threat model drops "Windows installer unsigned". 086's and
  087's SPECs get a "Withdrawn by 121" line at the top.
- **In-app helpers:** none mention Windows (checked); none change.

## Acceptance criteria

- `npm install --global` of the packed package on `windows-latest` fails with EBADPLATFORM, and
  `node <package>/dist/bin.js start` there prints the one line and exits 1 (a CI job that only
  checks this).
- No file in the repository refers to WinSW, `install.ps1`, the `win32` bundles or the Windows
  service, outside 086's, 087's and this feature's own docs and the changelog/release notes
  (a check in CI, or the witness's search).
- `bundles.yml` makes four archives; `server-checks.yml`, `install-scripts.yml` and `release.yml`
  have no Windows server job; every remaining check passes.
- A new `windows-latest` job runs `@ronneai/core`, `rmk` and `rmk-mcp`'s tests and passes.
- The Documentation (en, pt, fr), the runbooks and the README say what's above.
- The next release (with 099) has no Windows bundle, no `install.ps1` and no Windows server text in
  its notes but the line that says it's gone.

## Decisions

- **The next release, with 099** (owner, 2026-10-14): no deprecation release, no migration; nobody
  installs the server on Windows.
- **Only the client commands on Windows:** `rmk` and `rmk-mcp` (owner: "only the rmk commands";
  `rmk-mcp` counted as one, being the coding tool's local MCP server).
- **A Windows CI job for the clients** (recommended in the draft; part of the scope): once the
  server's Windows jobs go, it's the only check that the commands people do run on Windows work.
