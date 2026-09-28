# 015 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Migration `0007_items`.** `items`, `item_versions`, `dist_tags` and
  `version_dependencies`, with their Kysely types.
  *Done when:* it migrates on SQLite and the three servers, with foreign-key and unique-index tests.

- [ ] **2. `StorageAdapter`.** The interface and the local-disk implementation (temporary file and
  rename, no overwrite of different bytes, safe keys), wired to `STORAGE_PATH`.
  *Done when:* tests cover put, get, exists, a retried identical put, a refused different put, and
  unsafe keys.

- [ ] **3. Versions.** Computing the next version from the choice (stable, pre-release, bumps) and the
  tag rules, in `packages/core` next to `highestMatching`.
  *Done when:* a table test covers first releases, bumps, pre-release numbering and dropping the
  suffix.

- [ ] **4. Publish service.** Pack the approved revision, store it, and the transaction (item,
  version, dependencies, tag, status, audit), with the dependency checks re-run.
  *Done when:* database tests cover a first release, a pre-release, refusals, a retry after a failed
  transaction, and two concurrent publishes.

- [ ] **5. The real registry lookup.** `kyselyRegistryLookup`, and 013's checks switched to it.
  *Done when:* 013's tests still pass, and new ones cover a dependency on a released item and a
  published name.

- [ ] **6. The publish dialog.** On the submission and review pages, with the summary and the result.
  *Done when:* render and action tests pass, and the Playwright test in the acceptance criteria passes.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 015 without answering the
  spec's open questions: the author, moderators and root publish, and versions may have notes.
- **Task 1 (2026-09-28): migration `0007_items`.** `items` (unique scope and name; the owner sets
  null), `item_versions` (versions compared exactly with `exactString`, so `1.1.0-beta.1` and
  `1.1.0-Beta.1` are two; manifest, README and file list as `longText`, since MySQL's `text` stops
  at 64 KB), `dist_tags` (one per tag per item) and `version_dependencies`. Everything else is
  RESTRICT: published versions are never deleted. Tested on all four databases, with a 1 MB README.
