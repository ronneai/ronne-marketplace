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

- [ ] **4. `install.sh` without Docker.** The offer and the Linux path; on macOS, the choices
  (Homebrew on hold).
  *Done when:* by hand on Ubuntu without Docker, and macOS without Docker showing the choices,
  recorded in notes.

- [ ] **5. Documentation and the policy.** README, the Documentation section, nFPM in the policy.
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
  (symbol versions in the `.rpm`, so it's the same on Fedora, RHEL and openSUSE). `Recommends:
  caddy` (deb), `Suggests: caddy` (rpm). The maintainer is "Ronne AI Marketplace
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
