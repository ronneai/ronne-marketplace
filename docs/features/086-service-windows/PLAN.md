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

- [x] **3. Install, uninstall and the other subcommands on Windows.** Elevation check, folders and
  ACLs, the virtual account, firewall rules, health wait.
  *Done when:* CI on `windows-latest` installs, checks health, restarts and uninstalls.

- [x] **4. The proxy service.** `--domain` with Caddy.
  *Done when:* CI with `--tls internal` answers over HTTPS.

- [x] **5. Documentation.**
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

### Task 3: install, uninstall and the other subcommands on Windows (2026-10-04)

- **`packages/server/src/service/windows.ts`,** the third backend beside 083's: WinSW services
  (`sc.exe query` for the state, `net start` and `net stop /y`, which wait and also stop what
  depends on the service), folder permissions with `takeown` and `icacls` (*replaced below:
  folders made locked, permissions through .NET*), the firewall with
  `netsh`, the port's holder from `netstat -ano` and `tasklist`. `index.ts` picks it on `win32`,
  with `%ProgramData%` and the package's `vendor\winsw\WinSW.NET461.exe`.
- **SIDs, not names** (*the computed SID was replaced below by `sc.exe showsid`*): `serviceSid`
  computed the virtual account's SID (S-1-5-80 and the SHA-1 of the
  upper-case name in UTF-16LE), checked against Microsoft's documented SID for TrustedInstaller;
  the administrators, SYSTEM and Users by their well-known SIDs. Names are translated on other
  languages' Windows, and the account's name can't be looked up before the service exists, while
  its data folder must be locked before the first start.
- **ProgramData is writable by anyone** (*this takeover was replaced below*), so install took Ronne's
  folders over (`takeown /A`), resets them and what's under them (`icacls /reset /T`), then sets
  exactly SYSTEM, the administrators and the account (`/inheritance:r /grant:r`), and makes the
  administrators own everything under them. Before that it refuses any link in them (a symbolic
  link, a junction, a hard-linked file: `System.findLinks`), since `icacls` would change what one
  points to, and refuses `RonneAI` or `Marketplace` being a link before making anything. Users may
  list Ronne's folders (`(CI)(RX)`) but read none of the files in them.
- **The settings file:** `writeEnvFile` (apps/web) now rewrites an existing `.env` in place on Windows:
  a new file would take the folder's permissions (the administrators' only) and the service would
  lose its settings after a setup run by an administrator. Tested (the same inode).
- **Install again** doesn't register the service again: it stops it, replaces WinSW and the XML,
  starts it. A deleted service stays "marked for deletion" while anything has it open (the
  Services window), which would fail the next `install`; and nothing Windows keeps changes.
- **The shared install** gains three backend hooks (`allowInbound`, `removeInbound`,
  `cantRunHint`; no-ops and the old message on Linux and macOS), a log-folder step, the service
  folder made when it's missing (Ronne's own on Windows), paths with Windows' separator
  (`inLayout`), and `asAdmin`: messages say "in a terminal opened as administrator" where they
  said `sudo`. `fromTemporaryCache` knows `\` too. `System` gains `copyFile`, `findLinks` and
  `followFiles` (polls; starts again when WinSW rolls a file), an elevation check (`fltmc`
  answers only an elevated process) and a `which` that tries PATHEXT.
- **Scripts:** `setup`, `migrate` and `reset-root-password` run as the administrator on Windows (a
  virtual account can't be started from a terminal). `status` without elevation says whether it
  runs and that the details are for administrators.
- **Tests here:** 15 for the backend on the fake system, among them the exact commands of a first
  install (the folders' permissions in order, WinSW copied and registered, no firewall rule on
  127.0.0.1), a second one, `--host 0.0.0.0`'s rule, links refused, the program in a profile
  refused before any folder is made, a start that doesn't answer (WinSW's logs printed),
  uninstall, logs, status with and without elevation, restart. The 79 Linux and macOS tests
  unchanged.
- **CI:** `scripts/service/test-windows-service.ps1`, run by a new `service-windows` job on
  `windows-2025` with the `win32-x64` bundle unzipped into `C:\Program Files\RonneAI\Marketplace`:
  a copy in the user's profile refused; install (the service's account, start mode, `node.exe`'s
  owner, 127.0.0.1); the SID `sc showsid` gives in the folders' permissions, no Users, not
  inherited, the administrators owning them; status; setup and migrate as the administrator, then
  a restart (the settings still the service's) and a sign-in (the database writable by it); stop,
  start, restart, logs; `node.exe` killed and started again by Windows; a taken port; the firewall
  rule; uninstall and `--delete-data`. Its syntax wasn't checked here (no PowerShell for this
  machine's processor): CI is the first to parse it.
- **Fixed after the witness (a privilege escalation):** the first design took Ronne's folders over
  (`takeown /A`, `icacls /reset /T`). Anyone may make folders in ProgramData, and a user who made
  `Marketplace\service` before the first install kept it (the lock wasn't recursive, and
  `mkdir` skipped a folder that was there), and install then ran WinSW from it as the
  administrator. It also read `service.json` and `.env` before locking anything, and a recursive
  reset could be raced with a junction. Now:
  - **Made locked:** a new backend hook, `makeFolder` (Linux and macOS: `sys.mkdir`), makes each of
    Ronne's folders on Windows with its final permissions at once, through Windows PowerShell's
    `Directory.CreateDirectory(path, DirectorySecurity)` and an SDDL (owner the administrators,
    protected, SYSTEM and the administrators full control, Users `(CI)` read on the open ones).
  - **Refused if not ours:** a folder already there must be owned by the administrators or SYSTEM,
    with protected permissions, and not a reparse point, or install stops before reading or
    writing anything in it.
  - **No takeover:** no `takeown`, no `/reset`, no `/T`. An account is granted rights on a folder
    only when its SDDL has none of that account's yet (so after an earlier install, nothing walks
    what the account may have put in it); Modify, not Full control, so it can't change
    permissions. `.env` alone is set file by file, and given to the administrators.
  - **Separate proxy logs** (`proxy\logs`), so each account is granted its own folder once; the
    proxy's golden XML changes its `logpath` only.
  - **Scripts:** `setup`, `migrate` and `reset-root-password`, run as the administrator on Windows,
    refuse a link in the data folder.
  - **The CI script:** the bundle unzips straight into Program Files; command output is turned into
    text line by line before matching; it checks Modify, not Full control, and the administrators
    owning `.env` and `service` too.
  - 96 service tests, among them the folders the script makes and which are private, a folder
    something else made refused before anything is written, no second grant after an earlier
    install, and the link check before a script.
- **The CI job** runs on `windows-2025`, as `bundles.yml` does; the plan's *Done when* said
  `windows-latest`, which is the same image today.
- **Fixed after CI and a second witness:**
  - **CI's first Windows run** stopped at the folders, with PowerShell's error as CLIXML
    (`#< CLIXML`), so the reason was hidden: the script now traps its errors and prints one plain
    line (`error<TAB>…`), and its SDDL no longer sets a group.
  - **CodeQL** flagged the SHA-1 that computed the account's SID (`js/weak-cryptographic-algorithm`):
    the backend now asks Windows (`sc.exe showsid <name>`, which answers for a service not yet
    registered). `docs/knowledge/windows-service-sids.md` says why.
  - **The second witness:** `CreateDirectory` succeeds without a word when the folder appeared in
    between, so a user could still race `RonneAI` into being theirs. Every folder is now checked
    after it's made, made now or not: owned by the administrators (a kept one may also be SYSTEM's
    or this administrator's), not a link, and nobody but SYSTEM, the administrators and services'
    accounts may write in it (a hand-made folder that lets Users write is refused). With
    `--tls files`, `certs` is made and checked before its files are shared.
  - **CI's second Windows run** showed the real error: Windows PowerShell started from PowerShell 7
    (CI's `pwsh`, and anyone's terminal) inherits pwsh's `PSModulePath` and fails on its first
    module ("The member AuditToString is already present", from `Get-Acl`). The script resets
    the module path first and uses no command that loads a module: `[IO.DirectoryInfo]`,
    `GetAccessControl()`, `::new()`. The knowledge note says so.
  - **CI's third Windows run** made and checked the folders, then failed on the first grant:
    `icacls` looks up a `*SID` too ("No mapping between account names and security IDs was done"),
    and a service's account has no name until the service is registered. Every permission change
    now goes through .NET in the same kind of script (`FileSystemAccessRule` with a
    `SecurityIdentifier`, which stores the SID as it is; the `.env` from an SDDL): no `icacls` at
    all. Each script's first line says what it does (`make`, `allow M <SID> <path>`, `settings`),
    which the tests read.
  - **CI's fourth Windows run** installed the service and passed every check up to the setup: the
    service as `NT SERVICE\rmk-server` at boot on 127.0.0.1, 503 before setup, the folders'
    permissions by the account's SID, `status`. The setup then needed `DATABASE_URL`, which
    `setup --yes` takes from the environment (the Linux test gives it too): the script gives it.
  - **CI's fifth Windows run** passed the setup and sign-in, stop, start, restart, logs, a crash
    (Windows started it again) and a taken port, then found a bug Linux has too: installing again
    on 127.0.0.1 after `--host 0.0.0.0`, on the same port, was refused, because install took the
    port as the service's own only with the same host, and the service still held it on 0.0.0.0.
    Now the port is its own whenever it's the same and the service runs (a test covers it); the
    script checks that install's exit code.
  - **CI's sixth Windows run** passed everything up to `--domain`, the firewall rule's removal
    included, then found port 80 held by "System (pid 4)": HTTP.sys, Windows' own HTTP server
    (IIS and some other services use it). Install was right to refuse, as Caddy couldn't bind it
    either, but the message suggested `systemctl`. On Windows it now names HTTP.sys,
    `netsh http show servicestate`, and how to stop IIS (a test covers it); the script stops
    W3SVC and WAS first, and prints who holds 80 or 443 if it still can't go on.

### Task 4: the proxy service (2026-10-05)

- **Install, for `--domain` on Windows:** the proxy's own folders (`proxy\data` and `proxy\logs`,
  which it may change; `proxy\certs`, which it may read), its Caddyfile readable by it (a grant on
  `proxy`, given in `activate`: the folder is otherwise the administrators'), WinSW's XML with
  `<depend>rmk-server</depend>`, and one firewall rule, `rmk-server-proxy`, for 80 and 443 on every
  network (`allowInbound` gained `everywhere`: the server's own rule stays Private-only). Installed
  again without a domain, the rule goes with the proxy; uninstall removes both rules.
- **Caddy the proxy can run:** on Windows install checks the proxy's account can run Caddy (a
  `caddy.exe` in someone's profile, as winget installs for one person, can't be) and says to install
  it with `--scope machine`. Linux and macOS keep 083's checks.
- **The Caddyfile's paths** (`--tls files`) use `/` on Windows: Caddy (Go) reads `C:/…`, and its
  Caddyfile can read a backslash as an escape. The other `--tls files` paths are joined with
  Windows' separator (`inLayout`).
- **A folder an administrator made in Ronne's tree** (`proxy\certs` by hand, for `--tls files`) is
  accepted: only `RonneAI`, in ProgramData, must have its own permissions; below it only
  administrators can make folders, so one owned by this administrator is fine too.
- **Tests:** five for `--domain` on the fake system (Caddy missing, Caddy in a profile, the proxy's
  folders and grants and rule, `--tls files` with the paths Caddy reads, the proxy removed). 101
  service tests in all.
- **CI:** the Windows job downloads Caddy 2.11.6's Windows release, checked against its SHA-512,
  and the script: `--domain` refused without Caddy and with one in the profile; then
  `--domain localhost --tls internal` answers 200 over HTTPS, HTTP redirects (308), the proxy runs
  as `NT SERVICE\rmk-server-proxy`, its rule is for 80 and 443 on every network, `PUBLIC_URL`
  and status show it; installed again without a domain, the proxy and its rule are gone. The
  policy's Caddy row says Windows too.

### Task 5: documentation (2026-10-05)

- **Documentation › Installing Ronne › As a service:** Windows in the opening (WinSW), and a *On
  Windows* bullet: an administrator's terminal instead of `sudo`, `status` in any terminal; npm's
  global folder (`%APPDATA%\npm`) refused, so the Windows bundle unzipped into
  `C:\Program Files\RonneAI\Marketplace`, or npm with a machine-wide `--prefix`; the folders, the
  log files, the account; the firewall rules; Caddy with `--scope machine`; `--tls files`' folder;
  the scripts as you. The docs test asserts these.
- **README** *As a service (macOS, Linux and Windows)*: the same, as a Windows bullet.
- **The install guide** (`docs/runbooks/install.md`): the header (086 built, 087 to come), the
  Windows account and the two ways to a program the service can read, Caddy for the whole machine,
  the certificates' folder and firewall rules, the administrator's terminal, a Windows column in
  *Where things are*.
- **Not changed:** inline helpers (`Help.tsx`): the service has no screen in the app.
- **Fixed after the witness:** the README and the in-app page pointed to bundles on the releases
  page, which v0.2.0 doesn't have: they now say from the release after 0.2.0. The zip holds a top
  folder, so the docs say to unzip into `C:\Program Files\RonneAI` and rename it to
  `Marketplace` (as CI does). The npm `--prefix` route now says to run it in the administrator's
  terminal and to run `rmk-server.cmd` by its full path (that folder isn't on PATH). The firewall
  wording: the port's rule only without a domain, on Private networks; the proxy's on every
  network. A Caddy in a profile is said to be refused. The guide's misplaced line break fixed.

### Done (2026-10-05)

All five tasks witnessed and ticked. CI on `windows-2025` runs the whole service end to end
(`service-windows`). Left for the owner's own Windows test: Windows 11 and Server 2022, a reboot,
and `--tls files` on a real machine (acceptance criterion 1 stays open until then).
