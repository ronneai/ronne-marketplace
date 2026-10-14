# 121 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

Lands in the next release, with 099 (owner, 2026-10-14): build it before that release is cut.

## Tasks

- [x] **1. The clients' Windows job.** A `windows-latest` job in `ci.yml` that installs, builds
  `@ronneai/core`, `@ronneai/rmk` and `@ronneai/mcp` and runs their tests (run when `ci-scope.js`
  says those packages changed, and nightly). First, so the clients keep a Windows check once the
  server's jobs go.
  *Done when:* the job passes on a pull request; any test that fails only on Windows is fixed or
  written down for the owner.

- [x] **2. `rmk-server` refuses Windows.** `"os": ["darwin", "linux"]` in
  `packages/server/package.json`; the one-line refusal at the top of `bin`'s start, before reading
  or writing anything; a test for it (with the platform faked); a small CI job on `windows-latest`
  that installs the packed tarball (expects EBADPLATFORM) and runs `dist/bin.js` (expects the line
  and exit 1).
  *Done when:* that job passes; `packages:check` and `release:smoke` pass with the `os` field.

- [ ] **3. The Windows service and paths go.** [risky] `service/windows.ts`, `winsw.ts`, their
  tests and golden files; the Windows layout; the `win32` branches in `control.ts`, `install.ts`,
  `args.ts`, `model.ts`, `system.ts`, `index.ts`, `paths.ts`, `run.ts`, `cli.ts`; the web app's
  Windows-only branches (`runtime.ts`, `setup/env-file.ts`, `setup/rotate-secret.ts`) and their
  tests. Risky because it touches the service's privilege handling: the Linux and macOS paths must
  be exactly as before.
  *Done when:* every test passes; the server checks pass on Ubuntu and macOS (install, service on
  systemd and launchd); a search finds no `win32` in `packages/server/src` but the refusal, and no
  WinSW anywhere outside 086's, 087's and 121's docs and other features' records of the past
  (finished features' tasks and PLAN notes, WITNESS passes, and 086's and 087's index rows,
  which say what was true then; clarified 2026-10-14).

- [ ] **4. Bundles, scripts and CI.** Four bundles (`bundles.yml`, `bundle.js`,
  `bundle-check.js`, `bundle-smoke.js`, `packs.js`, `notices.js`); `winsw.js` and its test;
  `install.ps1`, `test-install.ps1`, `install-scripts.js`'s and `release-install-scripts.js`'s
  PowerShell parts, `install-scripts.yml`'s PowerShell job; `server-checks.yml`'s Windows install
  entries and jobs (099's disk job included); `release.yml`'s Windows assets and notes;
  `ci-scope.js`; `server-probe.js`'s Windows branches; `test-windows-service.ps1`.
  *Done when:* a pull request runs every remaining suite green (`bundles`, server checks, install
  scripts, image); a release dry run (`release.yml`'s checks on a branch, as `release.md` says)
  lists four bundles and `install.sh` only.

- [x] **5. Docs in this repository.** `install.md` (the Windows section: WSL 2 or a VM; the clients
  on Windows), `incident-response.md`, `release.md`, `README.md`, the threat model,
  MVP §5 and §15's Easy install row with a decision-log entry, the index (086 and 087 "withdrawn
  (121)", 121's row), "Withdrawn by 121" atop 086's and 087's SPECs, and
  `docs/knowledge/windows-service-sids.md` removed.
  *Done when:* a search of `docs/` finds Windows only where the spec keeps it (the clients, WSL,
  history); each changed command was run, or the notes say why not.

- [x] **6. Documentation.** In `../ronne-web`: **Installing** (the Windows sections go; a
  **Windows** section, `install#windows`), **Running Ronne** (the Windows rows), in English, Portuguese and French; `topics.ts` in both
  repositories for the new anchor.
  *Done when:* the site builds; each language has the same sections; the app's links to
  `install#windows`, if any, resolve.

## Notes

- **Task 1, the first Windows runs (#183).** core and rmk-mcp pass on Windows once files are
  checked out as committed (`core.autocrlf` off in `clients-windows.yml`: the runners' CRLF made
  every golden file differ); core's tar-listing test skips there (Windows' `tar` prints names in
  the console's code page; backups run on Linux and macOS only). rmk had 12 failures:
  - **One real bug, fixed (owner's decision, 2026-10-14):** on Windows a folder item with an
    executable file (a hook, a skill's script) looked edited after every install and never
    updated: the hash rmk records counted the executable bit, which Windows' disks don't keep.
    `hashFor` (`packages/cli/src/apply.ts`) leaves the bits out of a folder's hash on Windows, on
    both sides; elsewhere they still count. Tested for each platform (`apply.test.ts`; the test
    fails without the fix), and `apply.test.ts`'s install-twice test now passes on Windows.
  - **Eleven POSIX assumptions in the tests:** file modes (the config's 0600 and its "readable by
    others" refusal, executable bits read from disk) are checked on Linux and macOS only (`posix`
    in each test file); the usage-hook tests' fake `rmk` gets an `rmk.cmd` on Windows, as npm
    leaves; the plugin helper's test accepts the quoted path `sh` gets.
- **Task 5, not run here:** the Windows section's commands (`wsl --install`, `wsl --shutdown`, the
  `systemd=true` line in `/etc/wsl.conf`, and `npm install --global @ronneai/rmk @ronneai/mcp` in
  PowerShell) need a Windows machine, which the owner doesn't have (the reason for 121). They're
  Microsoft's documented WSL commands and npm's; the clients' install is what the clients' Windows
  job does (task 1). The Linux steps they lead to are the ones run on Linux in CI.
- **After the witnesses (2026-10-14):** `release.yml`'s header says four bundles; rotate-secret's
  follow-up comment no longer mentions an administrator; feature 100's spec (specified, not built)
  no longer names WinSW's log files; `packs.test.js` rejects a neutral `vendor/tool/tool.exe`
  rather than a WinSW name; the spec says the refusal covers every system but Linux and macOS.
