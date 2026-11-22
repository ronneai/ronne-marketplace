# M12 — Easy install

> [All milestones](README.md) · [Features index](../README.md)

Ronne installs in one command, with Docker or without it, on a laptop or on a server with a domain
and HTTPS, on macOS and Linux (owner, 2026-10-03; Windows through WSL 2 or a Linux VM since 121, 2026-10-14, and in a terminal with `npx` since #222, 2026-10-22). The user's guide is
[`docs/runbooks/install.md`](../../runbooks/install.md), a draft for the website that each feature
makes true. Build order: 080 → 081 (Docker path done); 082 → 083 → 084 → 085 (macOS and Linux
without Docker); 086 → 087 (Windows without Docker; both withdrawn by 121).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [080](../install/080-docker-https/SPEC.md) | Docker with a domain and HTTPS: a Caddy proxy in `compose.yaml` on ports 80/443 inside, published on 7650/7651 by default (80/443 for a public domain); `RONNE_DOMAIN` for automatic certificates, own certificate files or an internal CA; the app's port no longer published | 005, 035, 036 | in progress |
| [081](../install/081-install-script/SPEC.md) | Install script: `curl … \| sh` and `irm … \| iex` from each release; checks Docker, asks "this computer or a server with a domain", writes `~/ronne-marketplace`, starts, opens the browser; rerun to upgrade; `--yes` for scripts | 080, 035 | in progress |
| [082](../install/082-server-npm-package/SPEC.md) | The server as an npm package: `npx @ronneai/marketplace`, command `rmk-server` (`start`, `setup`, `migrate`, `reset-root-password`), a data folder per system, `127.0.0.1:7650` by default | 034, 035, 036 | done |
| [083](../install/083-service-unix/SPEC.md) | Service on Linux and macOS: `rmk-server service install \| status \| logs \| uninstall …` with systemd and launchd, a system user, `--domain` with Caddy from the same Caddyfile as 080 | 082, 080 | done |
| [084](../install/084-bundles/SPEC.md) | Self-contained bundles: six archives per release (Linux, macOS, Windows × x64, arm64) with Node.js inside, smoke-tested per platform | 082 | done |
| [085](../install/085-unix-packages/SPEC.md) | Homebrew tap, `.deb` and `.rpm`: `brew install ronneai/tap/rmk-server`, packages that install the service; the install script's no-Docker path on macOS and Linux | 083, 084, 081 | done (Homebrew tap: later work) |
| [086](../install/086-service-windows/SPEC.md) | Service on Windows: the same `service` subcommands through WinSW, `C:\ProgramData`, a virtual account, firewall rules, Caddy for `--domain` | 083, 084 | withdrawn (121) |
| [087](../install/087-windows-package/SPEC.md) | Windows installer and winget: `winget install RonneAI.Marketplace`, Inno Setup installer per architecture, the install script's no-Docker path on Windows; unsigned until SignPath Foundation signs it | 086, 084, 081 | withdrawn (121) |
| [121](../install/121-no-windows-server/SPEC.md) | No Windows server: `rmk-server` runs on Linux and macOS only (npm's `os` field and a one-line refusal), Windows people use WSL 2 or a Linux VM; the Windows service (086), bundles, `install.ps1` and their CI go; `rmk` and `rmk-mcp` stay on Windows, with a Windows CI job of their own; in the next release, with 099 (nobody installs the server on Windows: no migration) | 081, 082, 084, 086 | done (partly reversed by [#222](../../issues/222-windows-foreground/SPEC.md): `rmk-server` runs in a Windows terminal again) |
