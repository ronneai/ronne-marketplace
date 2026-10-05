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

- [ ] **3. `.deb` and `.rpm` with nFPM.** `packaging/nfpm.yaml`, the scripts (`postinst`, `prerm`,
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
