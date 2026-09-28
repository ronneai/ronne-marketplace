# 017 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Start a proposal.** A draft from a published version: `item_id`, `base_version_id`, files
  from the artifact, and the scope, name and type fixed.
  *Done when:* database tests cover starting from `latest` and from an older version, and refused
  renames.

- [x] **2. Stale and the type check.** Computing stale, refusing approve while stale, and
  `TypeChangedError` in the registry checks.
  *Done when:* database tests cover a proposal going stale when a version is published, and a refused
  approve.

- [x] **3. Rebase.** The whole-file three-way merge, conflicts and resolving them, and the submit
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
- **Task 2 (2026-09-28): stale and the type check.** Core gains `supersededBy(base, versions)`: the
  newest version that makes a proposal from `base` stale (any newer stable version; a newer
  pre-release only for a pre-release base on the same `major.minor.patch` line). `models/proposal.ts`
  applies it to the non-yanked published versions; `staleVersion` and `requireCurrent` in
  `services/proposals.ts` read them through the registry lookup, so stale is never stored. Approving
  (and overriding) a stale proposal is refused, and so is releasing an approved one that went stale
  meanwhile (added to the spec: it would undo the newer release). `typeIssues` in the registry
  checks compares a proposal's type with the published item's (`TypeChangedError`, code
  `type_changed`); proposals run it instead of the free-name check.
- **Task 3 (2026-09-28): rebase.** `models/rebase.ts`: `mergeFiles`, the whole-file three-way merge
  (a file's encoding and executable bit count as content), with a unit test per rule.
  `rebaseProposal` reads the old base's and the newest version's files from their artifacts, locks
  the proposal and checks it's still on that base, merges, writes only what changed, and moves the
  base; a `submitted` or `approved` proposal goes back to `changes_requested` (a new `rebase`
  transition, extended to `approved` in the spec so an approved proposal that went stale can be
  brought up to date and reviewed again). It records a `rebase` event in the conversation ("rebased
  it onto 1.1.0") and audits `submission.rebased` with the conflicts. Conflicts are stored in
  `submissions.rebase_conflicts` (migration `0010`); each is a `rebase_conflict` error in the
  submit checks until `resolveConflict` clears it.
