# 075 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Guards.** Remove `expectedFailures`; tap-target check fails with an allowlist; template
  acceptance line; `CLAUDE.md` line.
  *Done when:* `pnpm test:e2e` passes, and a deliberately tiny button in a scratch branch fails it.

- [ ] **2. Real devices.** The flows on an iPhone, an Android phone and an iPad; record them in the
  knowledge note; fix the small findings and add features to the index for the large ones.
  *Done when:* the note's "Seen on devices" section lists each flow per device as passing or with
  a link to its fix.

- [ ] **3. Screen readers and text size.** VoiceOver, TalkBack and 200% zoom through the menu, a
  table, a dialog and the bottom bars.
  *Done when:* recorded in the note; issues fixed or listed.

- [ ] **4. Performance.** Lighthouse mobile on the four pages; lazy-load React Flow behind "View as
  graph" on phones if it's in the first load.
  *Done when:* scores recorded; nothing over the thresholds without a fix or a feature.

- [ ] **5. Documentation and decisions.** "Using Ronne on a phone"; MVP §15 row; index status.
  *Done when:* the docs render tests pass, and the index marks 065–075 `done`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
