# 084 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Build script.** `scripts/bundle.mjs <platform> <arch>`: download and verify Node.js,
  install the packed 082 tarball into `lib/` with npm for that platform, write the launcher and the
  notices, archive.
  *Done when:* it builds and runs the bundle for this machine; size recorded in the notes.

- [ ] **2. Release matrix.** In `release.yml`, a job per platform on native runners (ubuntu, ubuntu
  arm, macos-13 for x64, macos-latest for arm64, windows, windows arm if available): build, smoke
  test without Node on `PATH`, upload as a workflow artifact; a final job attaches all six only if
  all passed.
  *Done when:* a dry-run release produces six checked archives.

- [ ] **3. Allowlist and notices.** The archive content check and `THIRD_PARTY_NOTICES` with Node.js.
  *Done when:* the check fails on a stray file.

- [ ] **4. Release checklist.** The Node version line in 034's checklist and the release notes
  template.
  *Done when:* both are updated.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
