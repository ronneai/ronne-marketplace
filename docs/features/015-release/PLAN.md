# 015 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Migration `0007_items`.** `items`, `item_versions`, `dist_tags` and
  `version_dependencies`, with their Kysely types.
  *Done when:* it migrates on SQLite and the three servers, with foreign-key and unique-index tests.

- [x] **2. `StorageAdapter`.** The interface and the local-disk implementation (temporary file and
  rename, no overwrite of different bytes, safe keys), wired to `STORAGE_PATH`.
  *Done when:* tests cover put, get, exists, a retried identical put, a refused different put, and
  unsafe keys.

- [x] **3. Versions.** Computing the next version from the choice (stable, pre-release, bumps) and the
  tag rules, in `packages/core` next to `highestMatching`.
  *Done when:* a table test covers first releases, bumps, pre-release numbering and dropping the
  suffix.

- [x] **4. Publish service.** Pack the approved revision, store it, and the transaction (item,
  version, dependencies, tag, status, audit), with the dependency checks re-run.
  *Done when:* database tests cover a first release, a pre-release, refusals, a retry after a failed
  transaction, and two concurrent publishes.

- [x] **5. The real registry lookup.** `kyselyRegistryLookup`, and 013's checks switched to it.
  *Done when:* 013's tests still pass, and new ones cover a dependency on a released item and a
  published name.

- [x] **6. The publish dialog.** On the submission and review pages, with the summary and the result.
  *Done when:* render and action tests pass, and the Playwright test in the acceptance criteria passes.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 015 without answering the
  spec's open questions: the author, moderators and root publish, and versions may have notes.
- **Task 1 (2026-09-28): migration `0007_items`.** `items` (unique scope and name; the owner sets
  null), `item_versions` (versions compared exactly with `exactString`, so `1.1.0-beta.1` and
  `1.1.0-Beta.1` are two; manifest, README and file list as `longText`, since MySQL's `text` stops
  at 64 KB), `dist_tags` (one per tag per item) and `version_dependencies`. Everything else is
  RESTRICT: published versions are never deleted. Tested on all four databases, with a 1 MB README.
- **Task 2 (2026-09-28): `StorageAdapter`.** `server/storage/`: the interface, `localStorage(root)`
  and `getStorage()` over `STORAGE_PATH`. A put writes a temporary file and hard-links it into
  place, which fails when the key exists, so two concurrent puts can't both win (tested); the same
  bytes again succeed, different ones throw `StorageConflictError`. Keys that are absolute, have
  `..`, `.`, empty segments, backslashes or control characters throw `StorageKeyError`. `get`
  returns the bytes rather than a stream: artifacts are at most 5 MB, and 019 can add streaming.
- **Task 3 (2026-09-28): versions.** In `packages/core` (`versions.ts`): `nextVersion(published,
  choice)` from semver's `inc` (with `"1"` as the pre-release base, so numbering starts at `.1`):
  the first stable release is `1.0.0`, the first pre-release `1.0.0-<id>.1`, a bump raises the
  highest published version (yanked ones included, since versions aren't reused), a stable release
  from a pre-release drops its suffix, and a pre-release continues its line. It returns null when
  the result wouldn't be higher than every published version (`alpha` after `beta`) or the id is
  invalid. `defaultTag` (`latest` or `next`) and `tagProblem` (the name rules; no tag that reads as
  a semver range, such as `x` or `v1`; `latest` only on a stable version). A table test.
- **Task 4 (2026-09-28): publish service.**
  - `items` domain: `ItemRepository` (find by `@scope/name`, insert an item, versions with their
    dependencies by name, insert a version with its dependency rows, move a tag, lock an item).
  - `ReleaseStore`: one READ COMMITTED transaction over the submission and item repositories.
  - `services/publish.ts`: the author, or `submissions.publish` (moderator, root, new). It reads the
    approved revision, re-runs 011's and 013's checks, computes the version (`nextVersion`) and the
    tag (`defaultTag`, `tagProblem`), packs with `packItem`, stores the `.tgz`, then in one
    transaction: locks the submission and re-checks its status, creates the item on its first
    release, locks it, refuses an existing version, inserts the version (manifest with `version`,
    README from `readme` or `README.md`, file list, notes, sha256) and its dependencies, updates the
    item's description, moves the tag, marks the submission `published`, adds a `publish` event
    ("released it as 1.0.0") and records `version.published` and `dist_tag.moved`.
  - New errors: `ReleaseVersionError`, `VersionExistsError`, `ReleaseTagError`,
    `ReleaseNotesError`, `ReleasePackError`. New audit groups `version` and `dist_tag`, and target
    types `item` and `item_version`.
  - The web Vitest config aliases `@ronneai/core/pack` to its source, as `@ronneai/core` already was.
  - Database tests on all four databases: a first release, a pre-release on `next`, who may
    publish, refusals (nothing stored), and two concurrent publishes.
- **Task 5 (2026-09-28): the real registry lookup.** `kyselyRegistryLookup` answers 013's
  `findItem` and `publishedVersions` from the new tables (yanked versions marked, dependencies by
  name). The repository hands it out (`registry()`), bound to its own connection: wired through the
  app's main handle instead, the checks inside `submitDraft`'s transaction deadlocked on SQLite's
  single connection (and would have read outside the transaction elsewhere). `deps.registry` is now
  only for tests with a fake. Database tests on all four databases: a skill depending on a released
  MCP server submits; an unmatched range, a type the item can't depend on, and a yanked-only
  version are refused; a published name can't be proposed again.
- **Task 6 (2026-09-28): the publish dialog.** `PublishDialog`: stable or pre-release (with its id),
  the bump once the item has versions, the tag (its default as the placeholder), and optional
  notes; it previews the version with the same `nextVersion` the server uses ("Publishes
  @scope/name 1.0.0 as latest"), and shows the version and sha256 when it's done. It's on the
  review page for moderators and root, and on the author's page as an **Approved** panel.
  `getReview` gains `can.publish` and the item's `published` versions.
  - **Found on the way:** revalidating the page after publishing re-rendered it as `published`,
    which no longer holds the dialog, so the result vanished (the e2e test caught it). The action
    doesn't revalidate; the dialog's Done refreshes the page.
  - Playwright (`e2e/review.e2e.ts`, extended): after approval, the author publishes 1.0.0 on
    `latest` and sees its sha256, then an agent depending on it with `^1.0.0` submits.
