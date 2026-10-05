# 086 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. WinSW renderer.** The XML from 083's service model, with and without a domain.
  *Done when:* golden-file tests pass.

- [x] **2. WinSW in the bundles.** Download the official release, check its checksum, place it in the
  Windows bundles (084); record it in the dependency policy.
  *Done when:* the Windows archives contain it and the content check passes.

- [ ] **3. Install, uninstall and the other subcommands on Windows.** Elevation check, folders and
  ACLs, the virtual account, firewall rules, health wait.
  *Done when:* CI on `windows-latest` installs, checks health, restarts and uninstalls.

- [ ] **4. The proxy service.** `--domain` with Caddy.
  *Done when:* CI with `--tls internal` answers over HTTPS.

- [ ] **5. Documentation.**
  *Done when:* the docs render tests pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

### Task 1: the WinSW renderer (2026-10-04)

- **The model (083's) gains Windows:** `serviceLayout({ platform: "win32", programData })` puts
  everything under `%ProgramData%\RonneAI\Marketplace` (data, `.env`, `logs`, `service\` with
  each WinSW and its XML, `proxy\` with the Caddyfile, certificates and Caddy's data). The services
  run as the virtual accounts `NT SERVICE\rmk-server` and `NT SERVICE\rmk-server-proxy`, which
  Windows makes and removes with them (`systemUser: false`: nothing for install to create).
  `ServiceDefinition` gains `logDir`. WinSW names the log files after its renamed executable
  (`rmk-server-service.out.log`, `.err.log`), and also writes `rmk-server-service.wrapper.log`
  there, which isn't rolled.
- **`packages/server/src/service/winsw.ts`:** WinSW 2.12's XML: id, name, the program and its
  arguments quoted as Windows' `CommandLineToArgvW` reads them back (`windowsQuote`: quotes for a
  space or a quote, `\"` inside, backslashes before a quote doubled), the working folder, the
  environment, the virtual account (`<domain>NT SERVICE</domain><user>…</user>`, no password),
  `Automatic` start, the proxy's `<depend>` on the server, restarts on failure (10 s three times,
  then 60 s, the last one repeating), `resetfailure` 1 hour, `stopparentprocessfirst` and a 30 s
  stop timeout (Ctrl+C first, so SQLite closes its files), and logs rolled at 10 MB, keeping 5 old
  ones beside the current one, for output and errors each. CRLF line ends.
- **WinSW 2.12.0, `WinSW.NET461.exe`:** the stable release (3.0 is an alpha since January 2023, 2.12
  is from the same week). 2.12 ships `WinSW-x64.exe` and `-x86.exe` but no arm64; the .NET
  Framework build runs on the framework Windows 10 (1607 and later), 11 and Server 2016+ carry,
  natively on arm64 (.NET Framework 4.8.1, an IL-only file), so one file serves both bundles. The
  spec says so.
- **Golden files** (`__golden__/windows/`, `windows-domain/`), with the installer's path with a space
  (`C:\Program Files\…`): the server's XML and the proxy's; the server's is the same with a domain.
  Tests for the quoting (spaces, quotes, trailing backslashes) and XML escaping. `xmllint` finds
  both well-formed. 93 tests in the package.
- **Not checked here:** WinSW reading these files (no Windows here): the XML follows 2.12.0's
  `sample-allOptions.xml` and its docs for the virtual account and `roll-by-size`; task 3's CI on
  `windows-latest` is where WinSW installs them.
- **Fixed after the witness:** golden files are compared byte for byte, and the WinSW ones are CRLF
  while the others are LF; with no `.gitattributes`, a Windows runner's `core.autocrlf` would turn
  the LF ones into CRLF on checkout (failing task 3's CI), and a commit from such a clone could do
  the reverse. A root `.gitattributes` marks `**/__golden__/**` as `-text`.
- **For task 3** (from the witness): WinSW waits the 30 s stop timeout without asking the Service
  Control Manager for more time, so `sc stop` may report a time-out, and at shutdown Windows may
  end it sooner; WinSW expands `%VAR%` in paths and arguments (none of ours has one).

### Task 2: WinSW in the bundles (2026-10-04)

- **In the npm package, so in every bundle:** `rmk-server service install` on Windows needs WinSW
  whether Ronne came from npm or a bundle, so it ships in `@ronneai/marketplace` as
  `vendor/winsw/WinSW.NET461.exe`, beside its `LICENSE.txt` (committed). The bundles install the
  package, so each carries it, the Windows ones and also the others (650 KB of a 70 MB archive;
  splitting it out wasn't worth a second package layout).
- **Pinned once,** in `packages/repo-tools/src/winsw.js`: version 2.12.0, the release URL, the
  SHA-256 `b5066b7b…` (from the downloaded asset; GitHub publishes no digest for 2023 assets). The
  pack step (`assemble.mjs`) downloads the file when it's missing or different, then fails unless the
  SHA-256 matches; a tampered copy is replaced. The `.exe` is git-ignored.
- **Notices:** `assemble.mjs` adds a *WinSW 2.12.0 (MIT)* section to the package's
  `THIRD_PARTY_NOTICES` with `notices.js`'s own `section` and `RULE`, so it reaches the bundles'.
- **Checks:** `packages:check` requires `vendor/winsw/WinSW.NET461.exe` and `LICENSE.txt` and
  allows nothing else in `vendor/`; the bundle check (084) also fails when the bundled copy's
  SHA-256 isn't the pinned one (tests pass it a stand-in's SHA-256).
- **Policy:** a new table, programs Ronne ships that aren't npm packages: WinSW, and Node.js in the
  bundles (084), which wasn't listed.
- **Here (macOS arm64):** `pnpm build:server`, `packages:check` (1798 files), the packed `.tgz` holds
  both files; a `darwin-arm64` bundle built from it passes the content check, holds the pinned
  WinSW and its notices section. A Windows bundle can only be built on Windows (npm installs that
  machine's native modules): the Windows archives are checked by CI's `bundles.yml` on
  `windows-2025` and `windows-11-arm`.
- **Witnessed (2026-10-04),** all but the Windows archives: the pin is the official release's
  (downloaded independently; `LICENSE.txt` byte-identical to v2.12.0's), a missing or tampered copy
  is replaced, a wrong pin fails, the notices section appears once, a `darwin-arm64` bundle passes
  and fails on a changed or missing WinSW. **Fixed after it:** a network error while downloading
  WinSW now fails with the pack step's own message, not an unhandled rejection. **Then
  observed** in PR #128's CI (run 37259992637, on 102ffe5): the `win32-x64` and `win32-arm64`
  archives hold `vendor/winsw/WinSW.NET461.exe` with the pinned SHA-256 and its `LICENSE.txt`,
  both notices list WinSW, and each passed the content check and ran with its own Node.js.
