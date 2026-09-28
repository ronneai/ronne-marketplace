# 017 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Start a proposal.** A draft from a published version: `item_id`, `base_version_id`, files
  from the artifact, and the scope, name and type fixed.
  *Done when:* database tests cover starting from `latest` and from an older version, and refused
  renames.

- [ ] **2. Stale and the type check.** Computing stale, refusing approve while stale, and
  `TypeChangedError` in the registry checks.
  *Done when:* database tests cover a proposal going stale when a version is published, and a refused
  approve.

- [ ] **3. Rebase.** The whole-file three-way merge, conflicts and resolving them, and the submit
  refusal while conflicts are open.
  *Done when:* unit tests cover every row of the merge rules, and database tests cover a rebase with
  and without conflicts.

- [ ] **4. Diff to the base and the suggested bump.** The review page's diff against the base, and the
  bump suggestion in the publish dialog.
  *Done when:* unit tests cover each bump rule, and render tests cover both diffs.

- [ ] **5. Pages.** Propose a change on the item page, the stale badges, the rebase flow in the editor,
  and the conflict list.
  *Done when:* render and action tests pass, and the Playwright test in the acceptance criteria passes.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 017 without answering the
  spec's open questions: rebase merges by whole files, the bump is suggested by the rules in the
  spec, and anyone signed in may propose, in any scope.
- **Task 1 (2026-09-28): start a proposal.** `services/proposals.ts`: `proposeChange` takes
  `@scope/name` and the version to start from (the item page's shown version), and creates a draft
  with `item_id` and `base_version_id`, whose files are that version's artifact unpacked from
  storage (`versionFiles`), with `version` removed from `ronne.yaml`. A `Submission` now carries
  `proposal: { itemId, baseVersionId, baseVersion }` or null. Renaming a proposal is refused
  (`ProposalRenameError`); an unknown item or version is `ProposalBaseNotFoundError`, an unreadable
  artifact `ProposalArtifactError`. Proposals skip the free-name check and don't hold a name, so
  several can be open for one item. The registry lookup's versions now carry their id, publish
  time and artifact path. Releasing a proposal already worked through 015: it publishes the item's
  next version.
