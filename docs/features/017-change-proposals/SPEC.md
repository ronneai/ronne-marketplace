# 017 — Change proposals

> Milestone: M3 · Depends on: 015 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§4.2](../../MVP/MVP.md#42-release) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md) §6

## Goal

Anyone signed in can propose a change to a published item: they start from one of its versions, edit
it in the same editor, and submit it. Reviewers see exactly what changes against that version, and
if a newer version is published meanwhile, the proposal is marked stale and brought up to date before
it can be approved. Releasing it publishes the item's next version.

## Scope

**In:**
- **Propose a change** from an item: a submission with `item_id` and `base_version_id` (012's columns),
  starting from the base version's files.
- **The diff against the base** on the review page, next to 014's diff between revisions.
- **Stale** proposals and **rebase** onto the newest version.
- **The suggested bump** when releasing a change (015's dialog), from the diff.
- The registry check that the type hasn't changed (manifest spec §6, layer 3).

**Out:**
- Proposals that rename an item or move it to another scope: an item's name is fixed. A new name is a
  new item.
- Merging two open proposals into one.

## Behaviour

**Starting a proposal.** On an item page (018), **Propose a change** creates a draft with `item_id` and
`base_version_id` set to the version shown (`latest` by default), and fills its files from that
version's artifact, unpacked with 011's `unpackItem`. The scope, name and type are the item's and
can't change in Settings; `ronne.yaml` keeps its `version` field out (the release sets it). Everything
else works as 012 and 013: the editor, the private draft, submit and withdraw. Anyone signed in may
propose, in any scope (MVP §2).

**Name check.** A proposal doesn't need a free name: it's for an existing item. Several open proposals
for one item are allowed; the first one released makes the others stale.

**The diff against the base.** The review page (014) gains **Changes to v1.2.0**: every file of the
current revision against the base version's files, as 014's line diffs, and the manifest's fields
side by side. Reviewers see both this and **Changes since revision N**.

**Stale** (MVP §4.1). A proposal is stale when a newer version of its item has been published after
its base (any newer stable version, or a newer pre-release on the same line). It's computed, not
stored, so it's always current. Stale proposals show a `stale` badge in the queue, My submissions and
the review page, and **approve is refused** (`SubmissionStaleError`) until the author rebases.
So is **releasing** one that went stale after it was approved (another proposal was released
first): releasing it would undo what the newer version changed. Yanked versions don't make a
proposal stale.

**Rebase** (the author, on a draft or `changes_requested` proposal, or one that's `submitted` or
`approved` and stale, which moves it back to `changes_requested` first, so it's reviewed again). Moves the base to the item's newest version,
file by file (a three-way merge by whole files, recommended; see Open questions):
- Changed only by the author since the old base: keep the author's.
- Changed only in the newer version: take the newer version's.
- Changed by both: keep the author's, and list it as a **conflict** with a link to a diff of the two;
  the author edits it, and marks it resolved. Submitting is refused while conflicts are open.
- Added or removed on one side: follow that side; added with different content on both: a conflict.
- Removed on one side and changed on the other: a conflict, kept as the author has it.

**Releasing a proposal** (015's dialog). The publish dialog suggests a bump from the diff to the base:
- **major:** the type block loses a field, a dependency is removed, or a file the manifest names is
  removed;
- **minor:** a file, a dependency, a keyword or a type-block field is added;
- **patch:** anything else.
The publisher can choose another bump. The version, the tag rules and the rest are 015's.

**Registry check** (manifest spec §6, layer 3): a proposal's `type` must be the item's (`TypeChangedError`).

## Edge cases

- **The base version is yanked:** the proposal still opens and diffs against it; rebasing moves it
  forward.
- **The item has no stable version left:** a proposal starts from the newest pre-release.
- **Two proposals released one after the other:** the second becomes stale and must rebase first.
- **A proposal that changes nothing:** submitting says "No changes to v1.2.0" and is refused.

## Acceptance criteria

- [ ] Proposing a change creates a draft from the base version's files, with the item's scope, name and type fixed.
- [ ] The review page shows the diff to the base version as well as the diff since the last revision.
- [ ] A proposal becomes stale when a newer version is published, and approve is refused until it's rebased.
- [ ] Rebase merges file by file as specified, lists conflicts, and refuses to submit while any are open.
- [ ] Releasing a proposal suggests the bump from the diff, and publishes the item's next version.
- [ ] Changing the type is refused by the registry checks.
- [ ] Playwright: a user proposes a change to a published skill, a second version is released meanwhile, the user rebases, a moderator approves, and the author releases 1.1.0.

## Open questions

The owner started 017 (2026-09-28) without answering these, so it's built on the recommendations;
any can still change.

1. **Rebase merges by whole files** (recommended: simple, and conflicts are rare in small items), or by
   lines within a file (a three-way text merge), or rebase isn't offered and the author starts again.
2. **The suggested bump rules** above, or always suggest patch and let the publisher decide.
3. **Who may propose:** anyone signed in, in any scope (MVP §2, recommended), or only the item's owner
   and moderators.
