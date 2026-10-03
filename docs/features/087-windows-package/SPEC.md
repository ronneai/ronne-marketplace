# 087 — Windows installer and winget

> Milestone: M12 · Depends on: 086, 084, 081 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap) · Guide: [`docs/runbooks/install.md`](../../runbooks/install.md)

## Goal

On Windows, `winget install RonneAI.Marketplace` (or double-clicking the installer from the release)
installs Ronne as a service with no Docker and no Node.js. The install script (081) offers it when
Docker is missing.

## Scope

**In:**
- A Windows installer per architecture (x64, arm64), built from 084's Windows bundles with **Inno
  Setup** (its own permissive licence: free use and redistribution; see Open questions), attached
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
- Code signing: Open questions.

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

1. **Signing.** Without a code-signing certificate, Windows warns on every download. Options: a
   standard certificate (about USD 200–400 a year), Azure Trusted Signing (about USD 10 a month,
   individuals and companies in some countries), or the free SignPath Foundation programme for open
   source. The policy rules out tools that need a paid plan, so this is the owner's call.
   Recommended: apply to SignPath Foundation (free for OSS) and ship unsigned meanwhile.
2. **Inno Setup's licence** is its own (free use and redistribution, including commercially), not
   an OSI licence. Confirm it fits the policy; the alternative is WiX Toolset (MS-RL, a reciprocal
   licence, build-time only).
