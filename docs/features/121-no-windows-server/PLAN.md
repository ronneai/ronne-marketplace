# 121 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

Lands in the next release, with 099 (owner, 2026-10-14): build it before that release is cut.

## Tasks

- [ ] **1. The clients' Windows job.** A `windows-latest` job in `ci.yml` that installs, builds
  `@ronneai/core`, `@ronneai/rmk` and `@ronneai/mcp` and runs their tests (run when `ci-scope.js`
  says those packages changed, and nightly). First, so the clients keep a Windows check once the
  server's jobs go.
  *Done when:* the job passes on a pull request; any test that fails only on Windows is fixed or
  written down for the owner.

- [ ] **2. `rmk-server` refuses Windows.** `"os": ["darwin", "linux"]` in
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
  WinSW anywhere outside 086's, 087's and 121's docs.

- [ ] **4. Bundles, scripts and CI.** Four bundles (`bundles.yml`, `bundle.js`,
  `bundle-check.js`, `bundle-smoke.js`, `packs.js`, `notices.js`); `winsw.js` and its test;
  `install.ps1`, `test-install.ps1`, `install-scripts.js`'s and `release-install-scripts.js`'s
  PowerShell parts, `install-scripts.yml`'s PowerShell job; `server-checks.yml`'s Windows install
  entries and jobs (099's disk job included); `release.yml`'s Windows assets and notes;
  `ci-scope.js`; `server-probe.js`'s Windows branches; `test-windows-service.ps1`.
  *Done when:* a pull request runs every remaining suite green (`bundles`, server checks, install
  scripts, image); a release dry run (`release.yml`'s checks on a branch, as `release.md` says)
  lists four bundles and `install.sh` only.

- [ ] **5. Docs in this repository.** `install.md` (the Windows section: WSL 2 or a VM; the clients
  on Windows), `incident-response.md`, `release.md`, `README.md`, the threat model,
  MVP §5 and §15's Easy install row with a decision-log entry, the index (086 and 087 "withdrawn
  (121)", 121's row), "Withdrawn by 121" atop 086's and 087's SPECs, and
  `docs/knowledge/windows-service-sids.md` removed.
  *Done when:* a search of `docs/` finds Windows only where the spec keeps it (the clients, WSL,
  history); each changed command was run, or the notes say why not.

- [ ] **6. Documentation.** In `../ronne-web`: **Installing** (the Windows sections go; a
  **Windows** section, `install#windows`), **Running Ronne** (the Windows rows), in English, Portuguese and French; `topics.ts` in both
  repositories for the new anchor.
  *Done when:* the site builds; each language has the same sections; the app's links to
  `install#windows`, if any, resolve.
