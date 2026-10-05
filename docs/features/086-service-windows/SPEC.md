# 086 — Running as a service on Windows

> Milestone: M12 · Depends on: 083, 084 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap) · Guide: [`docs/runbooks/install.md`](../../runbooks/install.md)

## Goal

`rmk-server service install`, in an administrator PowerShell, makes Ronne a Windows service that
starts at boot and restarts if it stops, with the same subcommands and options as on Linux and
macOS (083).

## Scope

**In:**
- A WinSW renderer for 083's service model, and the Windows behaviour of every `service`
  subcommand.
- WinSW (MIT) shipped inside the Windows bundles (084) and the npm package's Windows install.
- Folders and permissions under `C:\ProgramData`, a virtual service account, a firewall rule only
  when the service listens beyond `127.0.0.1`.
- `--domain` with Caddy for Windows, as a second service.

**Out** (and where it goes instead):
- The winget package and the installer → [087](../087-windows-package/SPEC.md).
- WSL: people who prefer it follow the Linux path inside WSL 2.

## Behaviour

- **The wrapper.** Node.js can't answer the Windows Service Control Manager itself, so the service
  runs `WinSW.exe` renamed `rmk-server-service.exe` beside an XML file. It starts
  `rmk-server start --no-open`, restarts on failure (three times, then every minute), and stops
  Node cleanly (`stopparentprocessfirst`, Ctrl+C) so SQLite closes its files.
- **Where things are:** program `C:\Program Files\RonneAI\Marketplace` (from 087) or the npm global
  folder; data `C:\ProgramData\RonneAI\Marketplace\data`; settings `…\Marketplace\.env`; logs
  `…\Marketplace\logs` (WinSW's rolling logs, 10 MB × 5; the proxy's in `…\proxy\logs`); each service's renamed WinSW and its XML
  in `…\Marketplace\service`; the proxy's Caddyfile, certificates and data in `…\Marketplace\proxy`.
- **WinSW 2.12.0** (the stable release; 3.0 has been an alpha since 2023), its `WinSW.NET461.exe`
  build: it runs on the .NET Framework Windows 10 (1607+), 11 and Server 2016+ have, natively on arm64
  too, where 2.12 has no arm64 build of its own. One small file for both bundles.
- **Account:** the virtual account `NT SERVICE\rmk-server`, which Windows makes with the service and
  removes with it. It may change (Modify, never the permissions) the data folder, its logs folder
  and the settings file only; it may read its WinSW and XML.
- **Permissions,** set by SID (names are translated on other languages' Windows; the account's SID
  is computed from the service's name, as `sc showsid` gives it, so it's set before the service
  exists). Anyone may make folders in ProgramData, so each of Ronne's folders is made with its
  final permissions from the start (`Directory.CreateDirectory` with a security descriptor, through
  Windows PowerShell): owned by the administrators, nothing inherited, full control for SYSTEM and
  the administrators; Users may list `RonneAI`, `Marketplace` and `service` but read none of the
  files in them (`.env`, `service.json`, the XML); the data and log folders aren't even listable. A
  folder that's already there must be the administrators' (or SYSTEM's), with its own permissions,
  and not a link, or install refuses before reading or writing anything in it. An account is
  granted rights only on a folder that doesn't have them yet, so `icacls` never walks what the
  account itself may have put in one. The proxy has its own logs folder (`proxy\logs`).
- **The settings file** is rewritten in place on Windows (the app's `writeEnvFile`), so it keeps the
  account's access when an administrator runs the setup.
- **Install** checks for an elevated shell (else explains how to open one), WinSW in the package,
  that the program isn't in a user's profile, the port; locks the folders, writes the XML, copies
  WinSW beside it (so npm can replace the package while the service runs), registers the service
  the first time (`WinSW install`) and starts it (`net start`), waits for `/api/health`, prints the
  address. Installing again stops the service, replaces WinSW and the XML and starts it: what
  Windows keeps (the account, the start mode, the dependency, the restarts) never changes, and
  WinSW reads the XML at each start, so the service isn't registered again (Windows can keep a
  deleted service "marked for deletion" while something has it open).
- **`--host 0.0.0.0`** adds an inbound firewall rule for the port, on Private networks only (named
  `rmk-server`, with `netsh`); removed when it's installed again on 127.0.0.1, and on uninstall.
- **`--domain`** needs `caddy.exe` on `PATH`, installed for the whole machine (`winget install --id
  CaddyServer.Caddy --scope machine`): a Caddy in a user's profile (winget's default for one person)
  is refused, as the proxy's account can't run it. It adds `rmk-server-proxy` (WinSW, the virtual
  account `NT SERVICE\rmk-server-proxy`, started after the server) with the shared Caddyfile (083),
  whose paths use `/` (Caddy reads `C:/…`), and one firewall rule for 80 and 443 on every network
  (a certificate authority must reach 80); installed again without `--domain`, the proxy, its rule
  and its settings go. The proxy may read its Caddyfile and certificates (`proxy\certs`, read only)
  and change its own data and logs folders.
- **`status`, `start`, `stop`, `restart`, `logs`, `uninstall`** behave as in 083; `logs` follows
  WinSW's output and error files. `stop` and `restart` also stop what depends on the service (the
  proxy), as Windows requires. `status` in a terminal that isn't elevated says whether the service
  runs and that its details are for administrators (`service.json` is theirs only).
- **`setup`, `migrate`, `reset-root-password`** with the service installed run as the administrator
  running them (a virtual account can't be started from a terminal), on the service's data and
  settings. What they make in the data folder inherits its permissions. They refuse to run over a
  link in the data folder, which the service's account could have put there.

## Edge cases

- **Windows Defender** may scan or flag an unsigned `WinSW.exe`: the official WinSW release is
  used, unmodified, and its checksum checked at build; signing is 087's open question.
- **A path with spaces** (`C:\Program Files`): quoted everywhere in the XML; tested.
- **The npm global folder in a user profile** (`%APPDATA%\npm`): the service account can't read it,
  so install copies nothing and refuses, saying to use the 087 installer or a machine-wide Node.
- **Windows Server Core**: no browser; the same commands work.

## Documentation

- **Documentation › Installing an instance** and **README**: the Windows lines of *As a service*:
  the administrator PowerShell, the folders and the logs.

## Acceptance criteria

- [ ] On Windows 11 and Windows Server 2022 (x64), `rmk-server service install` from an elevated
      shell gives a running service that survives a reboot, running as `NT SERVICE\rmk-server`.
- [ ] `status`, `logs`, `restart` and `uninstall` behave as described; data survives `uninstall`.
- [ ] `--domain localhost --tls internal` serves HTTPS through `rmk-server-proxy`.
- [ ] The WinSW XML matches golden files; CI on `windows-latest` installs, checks health and
      uninstalls.
- [ ] WinSW is recorded in the dependency policy.
- [ ] The README and the Documentation say what the feature does now.

## Open questions

- None.
