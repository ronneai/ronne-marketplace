# 078 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Re-check Codex and Cursor.** Marketplace locations, source forms, how a marketplace is
  added, and private-repository auth. Update the contract.
  *Done when:* `docs/spec/plugin-feeds.md` has today's date for both.

- [x] **2. Codex and Cursor routes.** Allow `codex` and `cursor` in the 077 routes.
  *Done when:* route tests cover both tools, including an item left out of one tool's feed.

- [x] **3. `rmk feed build`.** `packages/cli/src/feed-build.ts`: fetch, verify, unpack, write the
  marketplaces and `.rmk-feed.json`, remove stale plugins.
  *Done when:* tests cover an empty folder, a second run, an update, a removal, a foreign path, a
  sha256 mismatch, and `--tools`.

- [ ] **4. CI workflows.** `--print-workflow github|gitlab`.
  *Done when:* both outputs parse as YAML and match golden files (no new lint tool: any would need
  the dependency policy check first).

- [ ] **5. Documentation.** The sections in the spec's Documentation section.
  *Done when:* the docs render tests pass.

- [ ] **6. End to end by hand.** Build a mirror into a test repository, push it, and add it in
  Codex and in Claude Code. The owner checks the Cursor import.
  *Done when:* the results and the tool versions are written in the notes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- fflate's `unzipSync` doesn't give file modes, so core's `readPluginArchive`
  (`packages/core/src/plugins/archive.ts`) reads them from the zip's central directory: a hook's
  script must stay executable in the mirror.
