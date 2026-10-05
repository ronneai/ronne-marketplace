# 086 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, a fresh agent that didn't do the work checks it: it gets the task's *Done
when*, the claims in the notes and where to look, runs the commands itself, and reports each claim as
confirmed, partly or not met (owner, 2026-10-04). A task is ticked only when every claim holds.
Its record lands here, in the same commit as the task. Differences it finds are fixed in the notes
in that commit. The owner tests on Windows later; that doesn't block the feature (owner, 2026-10-04).

## Task 1 — WinSW renderer

Witnessed: 2026-10-04, by a fresh agent, on macOS arm64, with WinSW 2.12.0's sources and docs.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Golden-file tests pass, and a mismatch fails them | confirmed | 93 tests in the package; lint 53 warnings, 0 errors; typecheck 7/7. On a scratch copy: `keepFiles` 5→6 → "differs"; a deleted golden → "missing"; LF instead of CRLF → fails. `xmllint` finds both well-formed. |
| 2 | The Windows layout and `logDir` | confirmed | Data, `.env`, `logs`, `service\rmk-server-service.xml` (WinSW reads `<exe base name>.xml`), `proxy\{Caddyfile,certs,data}`, the two virtual accounts, a custom `programData`; they match the spec. |
| 3 | The XML is WinSW 2.12's | confirmed | Against v2.12.0's `XmlServiceConfig.cs`, `Log.cs`, `LogAppenders.cs`, `ConfigHelper.cs`, `WrapperService.cs`, `ProcessHelper.cs` and its docs: `startmode` (parsed ignoring case), `depend`, `resetfailure` "1 hour", `stopparentprocessfirst` (Ctrl+C first, then kill after `stoptimeout`), `env`, `roll-by-size` with `sizeThreshold` in KB and `keepFiles`. |
| 4 | Restarts: three at 10 s, then every 60 s | confirmed | The list becomes the Service Control Manager's `SC_ACTION[]`; "the last action will be repeated" (WinSW) and "repeats the last action" (Microsoft's `SERVICE_FAILURE_ACTIONS`). They fire on a non-zero exit. |
| 5 | The virtual account | confirmed | `ServiceAccount.FullUser` gives `NT SERVICE\rmk-server`; no `<password>` passes null to `CreateService`, as Microsoft's page asks for a virtual account named `NT SERVICE\<ServiceName>`; the ids match the account names. |
| 6 | `windowsQuote` | confirmed | The standard ArgvQuote algorithm: 200,000 random argument lists round-trip through Microsoft's documented `CommandLineToArgvW` rules with no failure, and the edge cases (a trailing `\`, a UNC path with a space, a lone `"`). |
| 7 | WinSW 2.12.0, `WinSW.NET461.exe`, both processors | confirmed (a nuance) | 2.12.0 is the stable release (3.0 is a prerelease alpha since 2023-01-29), with no arm64 build. The `.NET461` file is IL-only (no 32-bit flag), so it runs natively on arm64 under .NET Framework 4.8.1 (Windows 11 22H2+, Server 2025). Windows 10 1507 has only 4.6 (support ended 2025-10), so "every Windows 10" is "1607 and later" (corrected). |

**Found, and fixed in this commit:** CRLF golden files with no `.gitattributes`: a Windows runner
(`core.autocrlf`) would rewrite the LF ones on checkout, failing task 3's CI; `**/__golden__/**` is
`-text` now. The notes said WinSW names its logs after the service (it's the renamed executable,
plus an unrolled `wrapper.log`), "10 MB × 5" (5 old files beside the current one, per stream), and
"every Windows 10" (1607 and later): corrected.
**For task 3:** the 30 s stop timeout runs without asking the Service Control Manager for more time;
WinSW expands `%VAR%` in paths (none of ours has one).
**Not checked here:** WinSW installing and running these files (no Windows here; task 3's CI, and
the owner's test later).
**Overall:** met.

## Task 2 — WinSW in the bundles

Witnessed: 2026-10-04, by a fresh agent on macOS arm64; the Windows archives then in PR #128's CI.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Tests, lint, typecheck | confirmed | repo-tools 103 tests; lint 53 warnings, 0 errors; typecheck 7/7. |
| 2 | The pin is the official release | confirmed | Downloaded independently: 655,872 bytes, SHA-256 `b5066b7b…dfc4f` as in `winsw.js`; winsw/winsw (not a fork, MIT), v2.12.0 not a prerelease, `releases/latest`; no GitHub digest (`null`). The committed `LICENSE.txt` is byte-identical to v2.12.0's. The file is IL-only AnyCPU (CLR flags 0x1). |
| 3 | The pack step | confirmed | A missing copy is downloaded; one byte added → replaced; a pin of zeros (on a scratch copy) → "✗ WinSW.NET461.exe has SHA-256 b5066b…, not the pinned 0000…", exit 1; the notices section appears once, in `section()`'s format. |
| 4 | `packages:check`, the tarball, a bundle | confirmed | 1798 files on the allowlist; the `.tgz` holds both files and nothing else in `vendor/`; a `darwin-arm64` bundle passes the content check, holds the pinned copy, lists WinSW in its notices; the check fails on a changed or missing `.exe` and on a missing `LICENSE.txt`. |
| 5 | The Windows archives contain it, and the content check passes | confirmed (in CI) | Not buildable here (npm installs that machine's native modules). PR #128's CI, run 37259992637 on 102ffe5: `bundles / Bundle (win32-x64)` and `(win32-arm64)` passed (the content check, then "runs with its own Node.js, none on PATH"); downloaded, both zips hold `vendor/winsw/WinSW.NET461.exe` (SHA-256 `b5066b7b…`, the pin) and `LICENSE.txt`, and both notices list *WinSW 2.12.0 (MIT)*. |
| 6 | The policy table | confirmed | The Node.js row against `bundle.js` (newest 24 or `--node`, `SHASUMS256.txt`, `node/`); "and so the `.deb` and `.rpm`" through nFPM's tree copy; the WinSW row against the code. |

**Found, and fixed:** a network error while downloading WinSW ended the pack step with an
unhandled rejection; it now fails with its own message (tested with a failing `fetch`). The notes'
dates said 2026-10-05: corrected.
**Not checked here:** WinSW running on Windows (task 3).
**Overall:** met.
