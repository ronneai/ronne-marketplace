# 155 — Following an imported item's source

> Milestone: M26 · Depends on: 154, 017, 042, 051, 102, 139 · Design: [MVP §4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§15](../../MVP/MVP.md#15-decision-log) ("Import") · Contracts: none changed

## Goal

An item imported from another marketplace (154) keeps getting its author's fixes: Ronne notices when
the source changes and brings the change in as a **change proposal**, reviewed and scanned like any
other, so the instance never runs a newer upstream version nobody here looked at.

## Scope

**In:**
- **Follow**, per imported item (the item page's Overview, beside the provenance line), for the
  item's maintainers (the importer, the scope's moderators and admins, root): on by default for an
  item imported from a branch, off for one imported from a tag or a commit.
- **The check:** a job (102's scheduler, under its lease) once a day per followed item, and **Check
  now**: it lists the source's references (152's `GitRemote`, no clone) and, when the branch's head
  moved, fetches it shallowly and compares the item's folder at the new commit with the one last
  brought in.
- **When the item's files changed:**
  - before its first release: its draft (or one sent back for changes) is updated with the new
    files, as 051 does on export; one in review is left alone and says "A newer source is waiting";
  - after a release: a **change proposal** draft (017) against the version `latest` points to,
    merged as 042 merges an export (keywords, dependencies and settings the source can't express are
    kept from the base), owned by the importer, with the new commit as its provenance;
  - the item's maintainers get a notification (139): "pdf has a newer source: a proposal is ready to
    submit".
- **The licence, every time:** found again with 154's rules; a licence that's no longer on root's list
  (or gone) stops following, brings nothing in and says why; for an item imported with root's
  permission note (154), a change waits, `permission to confirm`, until root confirms the permission
  again for the new commit.
- **Its state**, on the item page: "Following github.com/acme/skills (main) · checked 2 hours ago ·
  up to date", "… · a proposal is waiting", or a stopped state with the reason: `source gone`
  (the repository, branch or path no longer exists), `licence changed`, `unreachable` (after 7 days
  of failures), `host removed` (root took it off the list).
- **Unfollow** and **Follow again**, audited (`item.follow_changed`); a proposal brought in is
  audited as `item.source_updated` (commit, licence).

**Out** (and where it goes instead):
- **Submitting or releasing by itself.** A person submits the proposal; review and the scan decide.
- **Moving to another source.** Import again from the new place.
- **Webhooks from the git host** (a push triggers a check). Later; daily checks first.

## Behaviour

**Which commit.** A branch's head; for an item followed from a tag, the newest tag matching the same
pattern (`v1.2.3` → newer `v*` tags by semver) if the importer chose so on import; otherwise none.

**Nothing changed in the item's folder** (the repository moved, the item didn't): the check records
the commit and makes nothing.

**Two newer commits before anyone acts:** the waiting proposal draft is updated to the newest one
(051's rule), not a second draft.

## Edge cases

- **The importer's account is disabled or erased** (103): the proposal is owned by the scope's first
  admin, else root, and says so.
- **The item was moved or renamed** (113, 118, 134): it keeps following; provenance is per item.
- **The item was edited here since** (a release from a proposal not from the source): the merge is
  042's, against the latest version, so local changes to what the source can't express are kept;
  file conflicts show in the proposal's diff for the reviewer.
- **Root turns imports off:** following stops for every item ("imports are off"), and resumes when
  they're on again.

## Data

- A migration: `item_imports` gains `follow`, `follow_ref`, `checked_at`, `seen_commit`,
  `follow_state`, `follow_reason`, and `failing_since`.

## Documentation

- **Importing items** (`import#follow`): following a source, what happens when it changes, the
  stopped states and what to do about each.
- **Change proposals** (`proposals#from-source`): proposals that come from a followed source.
- **Helpers:** the item page's "What does following do?" → `import#follow`.

## Acceptance criteria

- [ ] A followed item whose source changes gets, within a check, an updated draft before its first
  release, or a change proposal merged onto `latest` after it, with the new commit's provenance,
  and its maintainers are notified.
- [ ] Nothing is brought in when the item's folder didn't change, or when the licence is no longer
  allowed (which stops following, with the reason).
- [ ] A waiting proposal is updated, not duplicated; one in review is left alone.
- [ ] Each stopped state shows with its reason; Unfollow and Follow again are audited, and only the
  item's maintainers can use them (server check).
- [ ] Tests against the local git server cover each case above, and two processes checking at once
  (one result).
- [ ] The screens are in English, Portuguese and French, and pass the phone sweep.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Upstream changes arrive as proposals, never as releases** (Claude, 2026-10-29, from the owner's
   rule that imports are always reviewed and scanned).

## Open questions

- Should a moderator be able to set an item to bring changes in and submit them for review at once?
