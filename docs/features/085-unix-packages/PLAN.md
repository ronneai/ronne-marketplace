# 085 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The tap and the formula.** *On hold (owner, 2026-10-05).* Create `ronneai/homebrew-tap` (the owner creates the
  repository), the formula with `service do` and `caveats`, `brew audit --strict` clean.
  *Done when:* installing from the tap against a dry-run release works on macOS, recorded in notes.

- [ ] **2. Release updates the tap.** *On hold (owner, 2026-10-05).* A job after the archives that writes the new version and
  checksums into the formula, with a token limited to the tap.
  *Done when:* a dry run produces the expected formula diff.

- [x] **3. `.deb` and `.rpm` with nFPM.** `packaging/nfpm.yaml`, the scripts (`postinst`, `prerm`,
  `postrm`), built per architecture in `release.yml`.
  *Done when:* CI installs each in a systemd container (Ubuntu, Debian, Fedora), checks health,
  upgrades over the previous version, removes.

- [x] **4. `install.sh` without Docker.** The offer and the Linux path; on macOS, the choices
  (Homebrew on hold).
  *Done when:* by hand on Ubuntu without Docker, and macOS without Docker showing the choices,
  recorded in notes.

- [x] **5. Documentation and the policy.** README, the Documentation section, nFPM in the policy.
  *Done when:* the docs render tests pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

### On hold: the Homebrew tap (2026-10-05)

The owner put the tap on hold before task 1 started: tasks 1 and 2, the two Homebrew acceptance
criteria, and `install.sh`'s Homebrew path on macOS. The work goes on with task 3 (`.deb` and
`.rpm`), task 4 (Linux path) and task 5. Kept for when it resumes:
- `ronneai/homebrew-tap` must exist first (a tap is a `homebrew-<name>` repository); the owner
  creates it;
- the formula's `service do` must run the stable `opt_bin/"rmk-server"`, never a Cellar path,
  which `brew upgrade` deletes (084's notes);
- a dry run publishes no archives, so a test before a real release installs from local copies of
  the dry run's `bundle-*` artifacts in a local, unpublished tap.

### Task 3: `.deb` and `.rpm` with nFPM (2026-10-05)

- **`packaging/linux/nfpm.yaml`:** the bundle (084) unpacked as it is into `/opt/rmk-server`, a
  link `/usr/bin/rmk-server`, the scripts, and the glibc 2.34 and libstdc++ 11 dependencies
  (symbol versions in the `.rpm`, so it's the same on Fedora, RHEL and openSUSE). `Suggests:
  caddy` in both (first `Recommends` in the `.deb`; task 4 found apt then installs Ubuntu's own
  Caddy 2.6 and starts its service). The maintainer is "Ronne AI Marketplace
  <marketplace@ronne.ai>", the address the owner gave (first written as the issues page, since
  the project had no email).
- **The scripts** (`packaging/linux/scripts/`, POSIX `sh`, the same for both formats, which pass
  their arguments differently):
  - `postinstall.sh`: without systemd, say so and how to start it; with `service.json` (an upgrade or
    a reinstall), `rmk-server service restart`; else `rmk-server service install`. Always exits 0, so
    a busy port doesn't leave the package half-configured: it prints the command that finishes;
  - `preremove.sh`: on removal (`remove`, rpm `0`), not on an upgrade, `rmk-server service
    uninstall`;
  - `postremove.sh`: on a purge (or rpm's erase), the data's folders and the command to delete them.
- **`packages/repo-tools/src/package-linux.js`** unpacks a Linux bundle and runs nFPM for both
  formats. **nFPM expands variables in a few fields only** (not in `contents` or `scripts`), so the
  script fills the template's `${…}` itself into a config of the build's own, and refuses a
  placeholder it doesn't know. `--version` builds an older version to test upgrades from.
- **Found: 083's account check needed `runuser`,** which Fedora's container image lacks (it's in
  util-linux, absent from minimal images). Every install there failed with "the rmk-server account
  can't run …". The Linux backend now starts the program as the account through Node (`uid`/`gid`
  from `id`, which is coreutils), as the setup hand-off already did. The fake system records such
  a command as `as UID:GID …`. Also absent there and handled already: `/usr/sbin/nologin` (falls
  back to `/bin/false`), `ss` (the port's holder isn't named).
- **`scripts/packages/test-linux-package.sh`** (inside the machine, as root): install the older
  package → a service running as `rmk-server` from `/opt/rmk-server`, 503 → set up → upgrade (the
  service restarted, still 200, status shows the new version) → remove (the service, account and
  `/usr/bin/rmk-server` gone, data and settings kept) → install again (200) → purge (data kept,
  the delete command printed). **`scripts/packages/test-in-containers.sh`** builds Ubuntu 24.04,
  Debian 13 and Fedora 42 images with systemd and runs it in each.
- **Run here (arm64):** all steps pass on Ubuntu 24.04, Debian 13 and Fedora 42. And: on Ubuntu
  20.04 (glibc 2.31) apt refuses, naming `libc6 (>= 2.34)` and `libstdc++6 (>= 11)`; in a Debian
  13 container without systemd the package installs, `rmk-server` runs, and postinstall says no
  service was installed and how to start it. Packages are 80 MB each (arm64).
- **CI:** `.github/workflows/packages.yml` (reusable), after the bundles: per processor
  (`ubuntu-24.04`, `ubuntu-24.04-arm`), nFPM 2.47.0 (SHA-256 checked), the packages and older ones
  (0.0.1), the three distributions, then `linux-packages-<arch>`. `server-package.yml` runs it on
  every pull request (the *Server package* check needs it); `release.yml` runs it after the bundles,
  and the GitHub release attaches the four packages (it fails unless there are four), with their
  SHA-256 in `checksums.txt` and an apt/dnf line in the notes. nFPM is in the policy's table of CI
  tools.
- **Still open:** the *Done when* says CI installs each, which runs once this branch is pushed (both
  processors; here only arm64 ran).
- **Fixed after the witness:** the CI's output folder was `packages/`, the repository's own (with
  repo-tools in it), so the artifact took scripts along; it's `linux-packages/` now. And the
  release notes named a pre-release's packages `1.0.0-rc.1-1`, where nFPM writes `1.0.0~rc.1-1`;
  the notes now convert the version the same way (checked by rendering them for `1.0.0-rc.1`).
- **Known:** the upgrade test installs the same bundle labelled 0.0.1, then 0.2.0, so it shows the
  restart by the process ID, not by a different program. The new account check runs the program
  with the account's uid and gid but root's environment, without the account's extra groups,
  which is enough for `--version` and `test -r`.
- **CI passed on both processors** (pull request #127, head 5ecf8e7, run 37255521282): x64 on
  `ubuntu-24.04` and arm64 on `ubuntu-24.04-arm` each built the four packages with nFPM (checksum
  OK) and passed every step in Ubuntu 24.04, Debian 13 and Fedora 42 (install, set up, upgrade,
  remove, install again, purge); the artifacts hold only the packages. The *Done when* is met
  (witnessed). The first amd64 run of them anywhere. Not covered: `release.yml` itself (it calls
  the same workflow) and an upgrade between two different builds (the older one is the same bundle
  labelled 0.0.1).

### Task 4: `install.sh` without Docker (2026-10-05)

- **`scripts/install/install.sh`:** when `docker` isn't installed, `native_install` replaces the
  old "Docker isn't installed: Ronne runs in Docker" stop:
  - not Linux (macOS while Homebrew is on hold), a Linux that isn't Debian, Ubuntu, Fedora or
    RHEL-like (by `ID`/`ID_LIKE`), a processor other than amd64 or arm64, or glibc older than
    2.34: it explains the choices (Docker, or Node.js 22.12 with `npm install --global
    @ronneai/marketplace` and `sudo rmk-server service install`) and exits 1;
  - a development copy (no release written in) has no packages to take: the same;
  - otherwise it asks, downloads the package nFPM named for this release (`package_file`, `~` for a
    pre-release) and `checksums.txt`, refuses on a mismatch ("Nothing was installed"), shows the
    `sudo apt-get install -y …` or `sudo dnf install -y …` command, asks, runs it, waits for the
    server and says where it is, with the `--domain` command when a domain was given.
- The script's first line no longer says "install with Docker".
- **Found here: `Recommends: caddy` made apt install Ubuntu's Caddy** (2.6, too old for 083's
  `--domain`) and enable its service, which on a real machine starts at once on ports 80 and 443.
  The `.deb` now *suggests* Caddy, as the `.rpm` did (spec updated).
- **For tests:** `RONNE_INSTALL_RELEASE_URL` (where the package and `checksums.txt` come from,
  `file://` works) and `RONNE_INSTALL_VERSION`, beside 081's two.
- **Tests** (`test-install.sh`, under dash and bash): `native_target` for Ubuntu, Debian, Mint (by
  `ID_LIKE`), Fedora, Rocky, AlmaLinux, and none for Alpine, riscv64 or no `os-release`;
  `package_file` (deb, rpm, a pre-release); the glibc comparison. `shfmt -p -i 2 -ci` as CI runs it:
  clean.
- **By hand:**
  - **Ubuntu 24.04 without Docker** (a systemd container, as a user with passwordless sudo, the
    packages and `checksums.txt` in a local folder): a tampered checksum stops with "doesn't match
    checksums.txt … Nothing was installed" and nothing installed; the real run checks the SHA-256,
    shows and runs `sudo apt-get install -y …`, and Ronne answers (503, the setup next); the service
    is active, and Caddy is only suggested.
  - **macOS without Docker** (this Mac, `PATH=/usr/bin:/bin`): it explains the choices and exits 1.

  The *Done when* is met (witnessed).
- **Fixed after the witness** (it also confirmed a missing checksum line, the interactive answers
  including "n", running as root, and Fedora 42 with the `.rpm`):
  - the install command kept the package's path in one variable split by the shell, so a
    temporary folder with a space (`TMPDIR="/tmp/a b"`) broke it; the path is one quoted argument
    now (checked: installs from `/tmp/a b/…`);
  - a failed run left the 80 MB download in `/tmp`; a trap removes it whatever happens, except
    when the person declines to run the command, whose message names the file (checked: nothing
    left after a checksum mismatch or after an install);
  - the folder was 0700, so apt said it downloads "unsandboxed as root"; it's 755 and the package
    644 now (checked: no notice);
  - a missing `curl` is found before the first question, and `--domain` is checked with the
    script's own `valid_domain`.
- **Open, for a pre-release:** nFPM writes a pre-release's version with `~` (`0.3.0~rc.1`), and
  GitHub may rename release assets with characters like `~`. Neither has been tried; the first
  pre-release with packages should check its file names and the notes' and `install.sh`'s URLs.

### Task 5: documentation and the policy (2026-10-05)

- **README:** *As a Linux package (apt or dnf), no Docker or Node.js*, before *With Node.js*: the
  systems (glibc 2.34+), the `apt`/`dnf` commands with the release's file names, the install
  script doing it without Docker, where things are, upgrading, removing and purging (data kept),
  and no systemd.
- **Documentation › Installing Ronne › With apt or dnf** (new section `packages`): the same, with a
  link to *As a service* for the commands and `--domain`. *Upgrading* gains the package line.
  `docs.test.tsx` asserts the section and its facts.
- **The runbook's *Install as a service*:** Homebrew marked on hold; Debian 12 / Ubuntu 22.04 and
  Fedora / RHEL 9 (openSUSE left out: untested); the install script's no-Docker path; removal keeps
  the data; glibc 2.34.
- **081's spec** now says the script offers the package without Docker (085), macOS waiting for the
  tap.
- **MVP §15's *Easy install* row** records the tap on hold and what 085 ships (a decision change).
- **nFPM in the policy:** done in task 3 (the CI tools table).
- **Helpers:** none; the setup page doesn't change.
- **Fixed after the witness:** the runbook still showed Homebrew as live in its table, upgrade and
  uninstall lines, and its header said only Docker on port 3000 works (stale since 080); the
  spec's Documentation section still promised a Homebrew section; and `dnf remove`, not only `apt
  purge`, prints the delete command. All corrected.
- **Checks:** the docs and help tests (13), lint, and `pnpm test:e2e` (84 passed, the phone sweep over the docs included).
