# 087 — Windows installer and winget

> Milestone: M12 · Depends on: 086, 084, 081 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap) · Guide: [`docs/runbooks/install.md`](../../runbooks/install.md)

## Goal

On Windows, `winget install RonneAI.Marketplace` (or double-clicking the installer from the release)
installs Ronne as a service with no Docker and no Node.js. The install script (081) offers it when
Docker is missing.

## Scope

**In:**
- A Windows installer per architecture (x64, arm64), built from 084's Windows bundles with **Inno
  Setup** (its own permissive licence: free use and redistribution; owner, 2026-10-03), attached
  to each release.
- The installer copies the bundle to `C:\Program Files\RonneAI\Marketplace`, adds `rmk-server` to
  the machine `PATH`, runs `rmk-server service install` (086), and opens the address when finished.
  Silent mode (`/VERYSILENT`) for winget and scripts.
- The winget manifest `RonneAI.Marketplace`, submitted to `microsoft/winget-pkgs` for each release
  by a release job (a pull request from a fork, with a scoped token).
- `install.ps1` (081): when Docker isn't there, offer "Install without Docker" and run
  `winget install RonneAI.Marketplace` (or the downloaded installer when winget is missing).
- Uninstall from Settings › Apps or `winget uninstall`, keeping the data unless the person ticks
  "Also delete my data".

**Out** (and where it goes instead):
- Microsoft Store: needs MSIX and a developer account; not planned.
- Chocolatey and Scoop: possible later from the same installer and archives, if asked for.
- Code signing with a paid certificate: not used (Open questions).

## Behaviour

- **Upgrades** (`winget upgrade RonneAI.Marketplace`, or a newer installer): stop the service,
  replace the program folder, start it; data and settings untouched; migrations run on start.
- **The installer's pages**: welcome, licence (MIT), the port (7650, checked free), "Start Ronne
  now", finish. No other choices; `--domain` is done afterwards with `rmk-server service install
  --domain …`, which the finish page mentions.
- **winget's validation** runs the installer silently; it must finish with no prompt and exit 0.

## Edge cases

- **SmartScreen** shows "Windows protected your PC" for an unsigned installer downloaded in a
  browser ("More info" › "Run anyway"). winget installs avoid the browser download but not every
  warning. The guide says what to expect until the installer is signed.
- **A previous npm-based service** (086 from `npm i -g`): the installer detects the service, says it
  will be replaced, and keeps its data folder.
- **No winget** (older Windows 10, Server): `install.ps1` downloads the installer from the release
  and checks its checksum.

## Documentation

- **README** and **Documentation › Installing an instance**: the Windows line of *As a service*,
  and what SmartScreen shows.
- The guide's Windows lines are published when released.

## Acceptance criteria

- [ ] `winget install RonneAI.Marketplace` on Windows 11 x64 installs and starts the service, with
      no Node.js and no Docker; arm64 checked by hand.
- [ ] The installer's silent mode passes winget's validation.
- [ ] Upgrading keeps the data; uninstalling keeps it unless asked.
- [ ] Each release submits the winget manifest update.
- [ ] `install.ps1` with no Docker offers and completes the native install.
- [ ] Inno Setup is recorded in the dependency policy.
- [ ] The README and the Documentation say what the feature does now.

## Open questions

None. Decided by the owner, 2026-10-03:

1. **Signing:** apply to the SignPath Foundation (free code signing for open source) and ship
   unsigned until accepted; the guide explains the SmartScreen warning meanwhile. Paid options
   (a certificate, Azure Trusted Signing) are not used.
2. **Inno Setup** builds the installer. Its licence isn't OSI-approved but allows free use and
   redistribution, including commercially; it's recorded in the dependency policy as an allowed
   exception (task 5), used only at build time.
