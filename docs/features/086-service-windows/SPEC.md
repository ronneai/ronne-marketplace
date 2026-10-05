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
  `…\Marketplace\logs` (WinSW's rolling logs, 10 MB × 5); each service's renamed WinSW and its XML
  in `…\Marketplace\service`; the proxy's Caddyfile, certificates and data in `…\Marketplace\proxy`.
- **WinSW 2.12.0** (the stable release; 3.0 has been an alpha since 2023), its `WinSW.NET461.exe`
  build: it runs on the .NET Framework Windows 10 (1607+), 11 and Server 2016+ have, natively on arm64
  too, where 2.12 has no arm64 build of its own. One small file for both bundles.
- **Account:** the virtual account `NT SERVICE\rmk-server`, given full control of the data folder only.
- **Install** checks for an elevated shell (else explains how to open one), the port, writes the
  XML, installs and starts, waits for `/api/health`, prints the address.
- **`--host 0.0.0.0`** adds an inbound firewall rule for the port, on Private networks only; removed
  on uninstall.
- **`--domain`** needs `caddy.exe` on `PATH` (`winget install CaddyServer.Caddy`), then adds
  `rmk-server-proxy` with the shared Caddyfile (083) and firewall rules for 80 and 443.
- **`status`, `start`, `stop`, `restart`, `logs`, `uninstall`** behave as in 083; `logs` tails the
  log file.

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
