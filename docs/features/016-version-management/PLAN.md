# 016 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Tag and version rules.** The pure rules: tag names, `latest` only on stable versions, and
  where `latest` moves after a yank.
  *Done when:* a table test covers each rule and edge case in the spec.

- [x] **2. Services.** Move, add and remove tags; deprecate and undeprecate; yank and unyank; the
  `versions.manage` permission, the item row lock, and the audit events.
  *Done when:* database tests cover each action, refusals, `latest` after a yank, and concurrent
  changes on all four databases.

- [x] **3. The Versions page.** The list, and the action dialogs for moderators and root.
  *Done when:* render and action tests pass, and the Playwright test in the acceptance criteria passes.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 016 without answering the
  spec's open questions: yanking the `latest` version moves `latest` back, and a yank can be undone.
- **Task 1 (2026-09-28): tag and version rules.** `items/models/version-rules.ts`: `latestAfterYank`
  (the highest stable, non-yanked version left, or none; never a pre-release), `moveTagProblem`
  (015's `tagProblem`, no yanked target, at most 20 tags, where moving an existing tag doesn't
  count), `removeTagProblem` (`latest` stays) and `messageFrom` (1 to 300 characters, trimmed).
  Core gains `highestStable`, so the web app needs no `semver` of its own. A table test.
- **Task 2 (2026-09-28): services.**
  - Migration `0008_yank_reason` adds `item_versions.yank_reason` (the spec shows the reason on the
    Versions page; 0007 had no column for it). MVP §10 is updated.
  - `items/services/versions.ts`: `moveTag` (also adds a tag), `removeTag`, `deprecate`,
    `undeprecate`, `yank` and `unyank`, as `versions.manage` (moderator, root, new). Each runs in a
    READ COMMITTED transaction (`ItemRepository.transaction`), locks the item's row, reads the
    versions fresh, applies 016's rules, and records its audit event: `dist_tag.moved`,
    `dist_tag.removed`, `version.deprecated`, `.undeprecated`, `.yanked` (with `latest_moved_to`)
    and `.unyanked`. Repeating a no-op (the tag already there, unyanking a live version) records
    nothing.
  - Yanking the version `latest` points to moves `latest` to the highest stable version left, or
    removes it; unyanking moves no tag back. Artifacts are never touched.
  - Errors: `ItemNotFoundError`, `VersionNotFoundError`, `TagRuleError` (the rule's own sentence),
    `VersionMessageError`. `NewItemVersion.submissionId` may be null, for versions made outside
    the review flow (tests; later imports).
  - Database tests on all four databases: tag moves, rollbacks, refusals, deprecation, yanks moving
    and removing `latest`, permissions, and two moderators moving `latest` at once.
- **Task 3 (2026-09-28): the Versions page.** `/items/[scope]/[name]/versions` (a 404 for an
  unknown item) shows the tags, marking any that point to a yanked version and saying when there's
  no `latest`, and every version newest first with its tags, published at and by, size, short
  sha256 (the full one on hover), deprecation message and yank reason. Moderators and root get the
  actions as dialogs (`features/versions/ChangeDialog.tsx`), through one server action,
  `changeVersions`, that turns domain errors into the dialog's message. `listVersions` joins the
  publisher's name. The e2e seed now publishes `@e2e-seeded/versioned` (1.0.0 and 1.1.0 on
  `latest`) directly through the item repository, with a second moderator, since 015 can only make
  a first release per submission. Render and action tests, and the Playwright test.
