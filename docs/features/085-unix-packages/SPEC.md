# 085 — Homebrew, .deb and .rpm packages

> Milestone: M12 · Depends on: 083, 084, 081 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap) · Guide: [`docs/runbooks/install.md`](../../runbooks/install.md)

## Goal

On macOS and Linux, Ronne installs as a service with the package manager people already use, with
no Docker and no Node.js: `brew install ronneai/tap/rmk-server`, or `sudo apt install
./rmk-server_*.deb`. The install script (081) offers this when Docker is missing.

## Scope

**In:**
- A Homebrew tap, `ronneai/homebrew-tap`, with a `rmk-server` formula using 084's macOS and Linux
  archives, and a `service` block so `brew services start rmk-server` works.
- `.deb` and `.rpm` packages for amd64 and arm64, built with nFPM (MIT) from 084's Linux archives,
  attached to each release. Installing one runs `rmk-server service install` (083).
- `release.yml` updates the formula in the tap (a pull request or a commit with a scoped token) after
  the archives are uploaded.
- `install.sh` (081): when Docker isn't there, offer "Install without Docker (Homebrew or the
  package for this Linux)", and run it.

**Out** (and where it goes instead):
- A hosted apt or dnf repository (`apt update` upgrades): needs hosting and a signing key; GitHub
  Releases is enough to start. A feature of its own when people ask, using a free host such as
  GitHub Pages.
- homebrew-core: a formula there needs notability and builds from source; the tap is enough.
- Windows → [087](../087-windows-package/SPEC.md).

## Behaviour

**Homebrew** (macOS and Linux):

```sh
brew install ronneai/tap/rmk-server
brew services start rmk-server         # at login; `sudo brew services start` for at boot
```

- The formula installs the archive into the Cellar and links `rmk-server`. Its `service do` block
  runs `rmk-server start --no-open` with `RONNE_DATA_DIR=$(brew --prefix)/var/rmk-server`, logs in
  `$(brew --prefix)/var/log/rmk-server.log`.
- `caveats` print the address, the data folder, and `brew install caddy` plus
  `rmk-server service install --domain …` for HTTPS.
- `brew upgrade rmk-server` then `brew services restart rmk-server` upgrades; migrations run on start.

**`.deb` and `.rpm`** (Debian 12+, Ubuntu 22.04+, Fedora 40+, RHEL 9+, openSUSE 15.6+):

- Installs to `/opt/rmk-server`, links `/usr/bin/rmk-server`.
- `postinst` runs `rmk-server service install` with the defaults (083: user, folders, unit) and
  prints the address. An existing install's settings are kept.
- `Recommends: caddy` (deb) / `Suggests: caddy` (rpm), not required.
- Removing the package stops and removes the service; `purge` (deb) also offers to delete the data,
  which is otherwise kept.
- Upgrading installs the new package over the old one; `postinst` restarts the service.

**`install.sh` without Docker:** on macOS with `brew`, run `brew install` and `brew services start`;
on Debian/Ubuntu or Fedora/RHEL, download the right package for the release and architecture,
check its checksum, and install it with `sudo` after showing the command and asking. Otherwise,
explain the choices and stop.

## Edge cases

- **Homebrew on Linux** installs the Linux archive; `brew services` uses systemd user units there.
- **Both a package and a Docker install** on one machine: different ports are needed; 081 and the
  package's `postinst` both check 7650 first and say so.
- **Old distributions** (glibc older than 2.34): the package refuses with the requirement (084).
- **No `systemd`** at `postinst` time (a container build): skip the service, print how to start it.

## Documentation

- **README** and **Documentation › Installing an instance**: an *As a service* section with
  Homebrew, apt and dnf.
- The guide's *Install as a service* section (Homebrew, Debian, Fedora) is published when released.
- 081's spec and the install script's messages mention the no-Docker path.

## Acceptance criteria

- [ ] `brew install ronneai/tap/rmk-server` then `brew services start rmk-server` serves
      `http://localhost:7650` on macOS (Apple silicon and Intel) with no Node.js installed.
- [ ] The `.deb` installs, starts and survives a reboot on Ubuntu 24.04 and Debian 13; the `.rpm`
      on Fedora; both on amd64 and arm64 (CI in containers with systemd, and one manual check each).
- [ ] Upgrading the package keeps the data and restarts the service; removing keeps the data.
- [ ] The tap's formula is updated by each release.
- [ ] `install.sh` with no Docker offers and completes the native install on macOS and Ubuntu.
- [ ] nFPM is recorded in the dependency policy.
- [ ] The README and the Documentation say what the feature does now.

## Open questions

- None.
