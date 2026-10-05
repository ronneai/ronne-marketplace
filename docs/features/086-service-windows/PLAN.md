# 086 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. WinSW renderer.** The XML from 083's service model, with and without a domain.
  *Done when:* golden-file tests pass.

- [ ] **2. WinSW in the bundles.** Download the official release, check its checksum, place it in the
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

### Task 1: the WinSW renderer (2026-10-05)

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
