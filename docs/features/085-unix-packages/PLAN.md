# 085 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The tap and the formula.** Create `ronneai/homebrew-tap` (the owner creates the
  repository), the formula with `service do` and `caveats`, `brew audit --strict` clean.
  *Done when:* installing from the tap against a dry-run release works on macOS, recorded in notes.

- [ ] **2. Release updates the tap.** A job after the archives that writes the new version and
  checksums into the formula, with a token limited to the tap.
  *Done when:* a dry run produces the expected formula diff.

- [ ] **3. `.deb` and `.rpm` with nFPM.** `packaging/nfpm.yaml`, the scripts (`postinst`, `prerm`,
  `postrm`), built per architecture in `release.yml`.
  *Done when:* CI installs each in a systemd container (Ubuntu, Debian, Fedora), checks health,
  upgrades over the previous version, removes.

- [ ] **4. `install.sh` without Docker.** The offer and the two paths.
  *Done when:* by hand on macOS without Docker and Ubuntu without Docker, recorded in notes.

- [ ] **5. Documentation and the policy.** README, the Documentation section, nFPM in the policy.
  *Done when:* the docs render tests pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
