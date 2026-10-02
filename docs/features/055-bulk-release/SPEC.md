# 055 — Release in bulk

> Milestone: M7 · Depends on: 015, 017, 052, 054, 056 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§3.4](../../MVP/MVP.md#34-versions-and-dist-tags), [§4.2](../../MVP/MVP.md#42-release) · Contracts: none new

## Goal

After 052 and 054, dozens of exported items can be submitted and approved in a few clicks, but each
one is still released from its own page, through 015's publish dialog. This feature lets the
author of approved submissions, or a moderator or root, **release several at once**, with one set
of release settings applied to all, and in the order their dependencies need.

## Scope

**In:**
- **A release for many submissions** in the `submissions` domain: 015's `publishSubmission` run for
  each one, each with its own pack, stored artifact and transaction, so one that fails doesn't stop
  the others.
- **The order:** submissions that depend on each other are released dependencies first, so a
  dependent and its dependency go out in the same batch. Selecting a dependent selects its
  approved, unreleased dependencies with it ([056](../056-pending-dependencies/SPEC.md)).
- **One set of settings for all:** stable or pre-release (with its id), the bump for items that
  already have versions, the tag, and optional release notes.
- **My submissions** (web): a checkbox on each `approved` row the person may release, **Select all
  approved**, and **Release selected (n)** with a confirmation that previews each version and tag.
- **The review queue** (web, moderators and root): a **To release** tab listing `approved`
  submissions, with the same selection and dialog.

**Out** (and where it goes instead):
- **Releasing from `rmk` or the MCP server** (by token). A release is what developers install; it
  stays a step a person takes in the web app, as approving does (054). Later, if people ask, with
  its own decision about tokens.
- **Approving and releasing in one step.** Each stays its own action (MVP §4.1 and §4.2); 054's
  dialog could offer "Release next" later.
- **Different settings per item in one batch** (one is a major, another a patch). Items that need
  their own settings are released from their own page, or in separate batches. Change proposals
  get their **suggested bump** by default (below), which covers the common case.
- **Moving tags, deprecating or yanking in bulk** (016): later, if people ask.
- **Submitting and approving a dependent alongside its dependencies:**
  [056](../056-pending-dependencies/SPEC.md), which also says when a dependent is releasable.

## Behaviour

**Releasable.** A submission can be released in bulk by this person when its own **Publish** would
be offered now: its status is `approved`, and the person is its author, or has
`submissions.publish` (moderator, root; MVP §2). Releasing runs 015's checks again, so the ones
that fail at release time (a dependency yanked, the proposal stale) are reported then.

**The settings, applied to each.** The dialog has one form, like 015's:
- **Stable** or **Pre-release** with its id (`beta`, lowercase letters and digits).
- **The bump**, for items that already have versions (change proposals, 017):
  **Suggested for each** (the default: 017's `suggestBump` from each proposal's changes), or
  **Patch**, **Minor** or **Major** for all. A first release is always `1.0.0` (or
  `1.0.0-<id>.1`), whatever is chosen, as in 015.
- **The tag:** **Default for each** (`latest` for a stable release, `next` for a pre-release, as
  015's `defaultTag`), or one tag typed for all, checked with 015's `tagProblem` against every
  version it would point to.
- **Release notes (optional)**, Markdown, at most 2,000 characters: stored on every version
  released, as if typed in each publish dialog. Empty means none.

The server computes each version from the choice and the item's versions, as 015 does; nobody
types a version number. Each row of the dialog previews it: "@team/reviewer **1.0.0** as latest",
"@team/github **1.3.0** as latest (minor, suggested: adds a tool)". A row whose version can't be
computed or whose tag is refused says why, and the button stays disabled until the settings work
for every selected row, or that row is unselected.

**The order.** Selecting a dependent selects its approved, unreleased dependencies too (056),
listed in the dialog as "Included for @team/reviewer"; they can't be unselected while the dependent
is selected. Before releasing, the selection is sorted so every submission comes after the
selected submissions it depends on (by item name, from each approved revision's `dependencies`),
with the rest in the order given. The dependency-first sort moves to `packages/core`, shared with
`rmk`'s `releaseOrder` (041, 052). 015's dependency check, run at release, then sees each
dependency's new version and checks the dependent's range against it. A cycle can't happen (013
and 056 refuse one at submit); if it did, the batch is refused with the cycle named and nothing is
released.

**One at a time, inside.** Each submission is 015's publish: pack the approved revision, store the
`.tgz` (outside the transaction, so a retry reuses it), then one transaction that locks the
submission's row, re-checks its status and staleness, records the version, its dependencies, the
tag and the submission's `published` status, with the `publish` event in the conversation and
015's audit events (`version.published`, `dist_tag.moved`), plus `via: "bulk"` in their metadata.
A failure stops only that submission. When a dependency fails, its dependents in the same batch
are not tried and are reported `skipped`, naming the dependency, since 015's check would refuse
them anyway.

**Results.** For each submission, one of:

| Result | When |
|---|---|
| `published` | released; with its version, tag and sha256 |
| `not_found` | no submission with that id that this person can see |
| `not_releasable` | not `approved` any more, not the person's and they're a user, a stale proposal, a check failed (with 013's issues), the version exists, or the pack or the store failed; with the reason, as 015's errors word it |
| `skipped` | a selected dependency of it wasn't released in this batch |

**My submissions (web).** Each `approved` row the person may release gets a checkbox; for a user,
those are their own. Above the table: **Select all approved (n)** and **Release selected (n)**,
next to 052's submit buttons and shown only when at least one row is approved. The two selections
are separate: Submit selected takes only the drafts, Release selected only the approved ones.

**The review queue (web).** A new tab, **To release**, lists `approved` submissions, oldest
first, with who approved them and when; **Decided** keeps `rejected` and `published`. It has the
same checkboxes, **Select all** and **Release selected (n)**. The nav's count stays the Needs review
count.

**The dialog.** The settings above, then the selected submissions in release order, each with its
previewed version and tag, its type and author, and **first release** or the version it follows.
**Release n items** and **Cancel**. The server action releases them (the domain's release-many, as a
session). The dialog then shows each result: version, tag and sha256 for those released, the reason
for the others with a link to their page. The list refreshes.

**The limit.** At most **50** submissions per request: each one packs an artifact of up to 5 MB and
writes it to storage, which is heavier than submitting or approving.

**Permissions.** As 015: `submissions.create` for the author's own, `submissions.publish`
(moderator, root) for anyone's. Nothing new.

## Edge cases

- **Two people release the same submissions at once:** each row is locked in its transaction, so
  each submission is released once; the other gets `not_releasable` ("A submission that's published
  can't be published."). An artifact stored by the loser is identical bytes at the same key, so
  015's storage accepts it and nothing is left behind that differs.
- **Two approved proposals for the same item** in one batch: the first is released; the second is
  now stale (017) and is `not_releasable`, with "rebase needed: 1.3.0 is out".
- **A dependency yanked** after approval: the dependent is `not_releasable` with 013's message, as
  on its page.
- **A dependent whose dependency is still in review:** it can't be selected ("Waits on
  @team/github (in review)", 056). One that arrives by id anyway is `not_releasable`.
- **Unselecting an included dependency:** not possible while its dependent is selected; unselect
  the dependent first.
- **Storage full or read-only** partway through: that submission and the rest that fail say so;
  the ones before it stay released. Releasing again picks up where it stopped.
- **A pre-release batch with a custom tag of `latest`:** refused by `tagProblem` before anything
  is released (a pre-release can never be `latest`).
- **The user loses their session or role** partway: the remaining ones are refused by the
  permission check; the ones before stay released.

## Documentation

- **Versions and tags → Versions** (`versions#semver`) and **Patch, minor or major**
  (`versions#bump`): one setting for many, and "Suggested for each" uses each proposal's suggested
  bump; a first release is always 1.0.0.
- **Versions and tags**, a new section **Releasing many at once** (`versions#release-many`): where
  to do it (My submissions, the review queue's To release tab), the settings applied to each, the
  dependency order and `skipped`, each released on its own, the limit of 50.
- **Submitting and review → Statuses** (`review#statuses`): approved submissions wait on the To
  release tab.
- **Changing a published item → Releasing a change** (`changes#release`): a pointer to releasing
  many, and that a second proposal for the same item goes stale once the first is released.
- **Helpers:** next to **Release selected** (on My submissions and the To release tab): "Release
  several at once?", linking to `versions#release-many`; in the dialog, next to the bump: "Which
  bump?", linking to `versions#bump`.

## Acceptance criteria

- [x] The domain releases many submissions, each with its own pack, stored artifact and
  transaction, reporting `published` (version, tag, sha256), `not_found`, `not_releasable` and
  `skipped`. One that fails doesn't stop the others, and each release is audited as 015's, with
  `via: "bulk"`.
- [x] Selecting a dependent selects its approved dependencies; selected submissions are released
  dependencies first, and a dependent whose selected dependency failed is `skipped`.
- [x] The settings apply to each: first releases are `1.0.0` (or `1.0.0-<id>.1`), later ones use the
  suggested or chosen bump; the default tag or a custom tag that's valid for every version; the notes
  on every version.
- [x] A user releases only their own approved submissions; moderators and root release anyone's;
  two people releasing the same submissions at once release each one once.
- [x] My submissions and the To release tab select only releasable rows; the dialog previews every
  version and tag in release order, and shows each result after releasing.
- [x] The service tests pass on SQLite, PostgreSQL, MySQL and MariaDB, and an end-to-end test
  releases a skill and an agent that depends on it in one batch, and installs the agent with `rmk`.
- [x] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **A To release tab on the review queue** (owner, 2026-10-01): approved submissions move out of
   Decided into their own tab, so moderators see what's waiting to go out. This changes 014's queue.
2. **The bump default for change proposals** (owner, 2026-10-01): **Suggested for each**, 017's
   suggestion from each proposal's changes; the person can pick one bump for all instead.
3. **The limit** (owner, 2026-10-01): 50 per request, half of 052's and 054's, because each release
   packs and stores an artifact.
