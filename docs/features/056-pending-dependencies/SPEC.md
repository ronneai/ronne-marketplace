# 056 — Dependencies on their way

> **Since [112](../112-dependency-cycles/SPEC.md)** (owner, 2026-10-08): an author's own dependency drafts are submitted *with* the item, and its unreleased dependencies released *with* it, all or none, instead of first; cycles are allowed. The rest of this spec stands.
>
> Milestone: M7 · Depends on: 013, 014, 015, 041, 052, 054 · Design: [MVP §4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§4.2](../../MVP/MVP.md#42-release), [§15](../../MVP/MVP.md) · Contracts: none new

## Goal

013's rule says a dependency is **released** before its dependent can be submitted. So exporting a
skill together with the agent that uses it takes two full rounds: submit, approve and release the
skill, then submit, approve and release the agent. This feature lets a dependent go through review
**alongside** its dependencies: a dependency counts once it's **on its way** (an open submission),
and the release is where everything has to line up. When a dependency is rejected, the reviewer
sees what depended on it and can send those back in the same step.

## Scope

**In:**
- **The submit rule** (013): a dependency is satisfied when it's released, or when it's an **open
  submission** of that name (`submitted`, `changes_requested` or `approved`). A draft isn't enough.
- **Bulk submit** (052, web and `rmk submit`, `submit_drafts`): submitting a dependent adds the
  person's own ready drafts of its dependencies, which go first.
- **Marks** on rows and pages, from submit to release: "Waits on @team/github (in review)",
  "Blocked: @team/github was rejected".
- **Approving** (014, 054): allowed while a dependency is on its way, with the mark shown.
- **Releasing** (015, 055): a dependent is releasable only when each dependency is released or
  approved and released in the same batch. Selecting a dependent in 055 selects its approved
  dependencies with it.
- **Rejecting a dependency** (014): the reject dialog lists the open submissions that depend on it
  and offers **Request changes on them too**, on by default, with a message written for them.
- **Request changes from `approved`** (014's transition table): so an approved dependent can be sent
  back when its dependency is rejected.

- **Picking a dependency** (owner, 2026-10-01): in the settings form, the Item field searches as
  you type, over published items and your own items (draft, in review, approved), and others' items
  in review; picking one shows its versions, `latest` by default. In a markdown file, typing `@`
  opens the same list in a popover, and picking one adds the dependency too. Half-typed names never
  reach `ronne.yaml`.

**Out** (and where it goes instead):
- **Grouped submissions** (a dependent and its dependencies reviewed and released as one unit, all
  or nothing). Each item keeps its own review and release; this feature only connects them.
- **Changing a dependent automatically** (removing the dependency, or rejecting the dependent).
  Statuses change only by someone's decision.
- **Depending on someone else's draft.** Drafts are private (013); only open submissions count.
- **Installing before release.** Nothing is installable until it's released (MVP §4.2); `rmk` is
  unchanged.

## Behaviour

**On its way.** A dependency `@scope/name` with range `R` is satisfied at submit (013's
`dependencyIssues`) when:
1. a published, non-yanked version matches `R` (today's rule), or
2. there's an **open submission** of `@scope/name` (any author's): a new item, or a change proposal
   to it. The dependent passes with a **warning**, not an error: "@scope/name isn't released yet;
   it's in review. @team/reviewer can be released after it."

The range can't be checked against a version that doesn't exist yet. It's checked when the
dependent is **released** (015 runs the checks again then), against the version the dependency
actually got. A warning at submit says so when the range can't match a first release: `^2.0.0`
against a new item (whose first stable release is `1.0.0`).

The type rule (manifest spec §3) is checked against the open submission's type. Cycles are checked
through each dependency's published version or, when it's on its way, its open submission's latest
revision, so a cycle among items in review is still refused.

When there are several open submissions of the name (proposals to a published item), any one
counts. Another author's open submission is named only by item and status, as 013's "name is
taken" already does; its content stays hidden from people who can't see it.

**Waits on, blocked.** Each open submission and draft whose dependency is on its way carries a mark,
computed when it's shown (not stored):

| Mark | When |
|---|---|
| **Waits on @x (in review)** | the dependency is `submitted` or `changes_requested` |
| **Waits on @x (approved)** | the dependency is `approved`, not released |
| **Blocked: @x was rejected** | the dependency's newest submission is `rejected` or `withdrawn`, and no other open one or matching release exists |

The marks show on My submissions, the review queue and the review page; in the lists (owner,
2026-10-02) as one link icon with the count, amber while pending and red when one is blocked,
whose popover lists each dependency with its badge. In the editor (owner,
2026-10-01) each dependency in the form has its own badge beside its name instead of a card under
the editor: amber while it isn't released ("in review", "pending release" once approved, "not submitted"), red when it's
blocked, with the full sentence on hover. A blocked dependent can't be submitted (it's an error again), approved stays possible (the reviewer
sees the mark), and it can't be released.

**Bulk submit** (052). Submitting a dependent whose dependency is the person's own **ready draft**
adds that draft to the batch, before the dependent, and says so: "Included for @team/reviewer:
@team/github". If the dependency's draft isn't ready, the dependent isn't either, with the
dependency's issues named. In the web list, selecting the dependent selects the dependency; it
can't be unselected while the dependent is selected. `rmk submit @team/reviewer` lists it under
**Included** in its preview; `--no-deps` leaves it out, and then the dependent is not
ready. `submit_drafts` does the same as `rmk`.

**Approving** (014, 054). Unchanged rules; the review page and 054's dialog show the marks, so a
reviewer can approve the dependency first or both together. Nothing is added to an approval
automatically: each item gets its own review.

**Releasing** (015, 055). A dependent is releasable when each dependency is released with a
matching version, or is **approved and released earlier in the same batch**. In 055:
- selecting a dependent selects its approved, unreleased dependencies, listed as "Included for
  @team/reviewer"; they can't be unselected while the dependent is selected;
- a dependent whose dependency isn't approved yet can't be selected: "Waits on @team/github (in
  review)";
- the batch is released dependencies first (055's order), and 015's checks at release are the last
  guard, now including the range against the dependency's new version.
On a single submission's page, **Publish** is disabled with the same mark until its dependencies
are released.

**Rejecting a dependency** (014). The reject dialog lists the open submissions that depend on this
one without a matching release, each with its status and author: "2 submissions depend on
@team/github: @team/reviewer (approved), @team/deploy (in review)". Below the reject message:

- **Request changes on them too**, a checkbox, on by default.
- **Their message**, prefilled and editable: "@team/github was rejected: remove it from
  dependencies, or depend on another item."

Rejecting then decides each, in order, as its own 014 decision by the same reviewer: the reject in
its transaction, then each dependent's request changes in its own, with its own event and audit
(`submission.changes_requested`, `cause: { rejected: <id> }`). A dependent the reviewer may not
decide (their own, as a moderator) is skipped and listed: "Yours: edit or withdraw it." A dependent
that moved on meanwhile is skipped with its status. Drafts that depend on it aren't changed; they
show **Blocked**.

Unticked, the dependents stay where they are, marked **Blocked**, until their authors edit them or
another submission of the name comes along.

**Request changes from approved.** 014's transition table gains `approved → changes_requested` for
`request_changes`, as 017's `rebase` already has. It's offered on an approved submission's review
page too, so a reviewer can send back an approved item for any reason before it's released. The
author edits and resubmits, and it's reviewed again.

**Withdrawn dependency.** A dependency withdrawn by its author makes its dependents **Blocked**, the
same as rejected. Nobody is asked, since the author decided alone; the dependents' authors see the
mark. (The dependency's author sees "2 submissions depend on this" in the withdraw confirmation.)

**Audit.** No new actions. Request changes caused by a rejection carries `cause` in its metadata;
submits that included dependencies are 052's events, one per item.

**Picking a dependency** (owner, 2026-10-01). Typing a dependency by hand gave errors while
typing (`@engineering` isn't a full name; `^1.` isn't a range), and the canvas's search only knew
published items and didn't match the scope.

- **The list.** Typing any part of `@scope/name` filters, case aside; published items also match
  their description and keywords.
  `@team/re` matches scope `team` and names containing `re`. It offers only types this item may
  depend on (manifest spec §3), never the item itself or one already listed, and at most 12:
  - **published** items, with their newest version;
  - **your own** items in review, approved, or still drafts;
  - **others'** items in review or approved (they count since this feature), shown by name, type,
    status and author only.
  A name both published and with a proposal in review shows once, as published. Each option shows
  its type badge and status. A draft says it's submitted with this item (bulk submit, above).
- **The version.** Picking a published item adds a row with a version list: **latest (1.4.0)** by
  default, then each released version, newest first; yanked ones aren't offered. The range written
  is `^<version>` (a pre-release exactly, as the canvas does); a dist-tag can't be a range, so
  `latest` is written as the version it points to now. An unreleased item gets `^1.0.0`, its
  first release. The range can still be typed for anything else.
- **The form** writes a row to `ronne.yaml` only once it has a picked name and a range, so the
  checks never see half a name. Rows already in the file (typed in the raw editor, or invalid) show
  as they are, with their problems, and can be changed or removed.
- **`@` in markdown** (SKILL.md, prompts, any `.md` file of the draft): typing `@` followed by
  text opens the same list in a popover at the cursor; ↑/↓ and Enter pick, Esc closes. Picking
  inserts `@scope/name` in the text and adds the dependency (latest, as above) to the manifest, if
  this type may have dependencies and it isn't there yet. Like every edit it's saved with **Save**.
  Deleting the text later leaves the dependency: dependencies are removed in the form or the
  canvas (owner's recommendation, 2026-10-01).
- **The canvas** keeps its own picker (published items), now matching the scope too.

## Edge cases

- **The dependency gets a different first version than the range allows** (released as a
  pre-release `1.0.0-beta.1` while the dependent wants `^1.0.0`): the dependent isn't releasable;
  055's dialog and its page say why, with the dependency's version.
- **A dependency on its way is renamed:** impossible; names are fixed once submitted (013).
- **The dependency is resubmitted after changes:** still on its way; the dependent's mark changes
  back to "in review".
- **Two dependents share one rejected dependency:** both are listed in the reject dialog and both
  are sent back (or both blocked).
- **A chain** (A depends on B, B on C) with C rejected: B is listed; A depends only on B and isn't
  listed, but shows **Blocked: @x/b waits on @x/c, which was rejected** once B is sent back or
  blocked.
- **A change proposal as the dependency** (a published item's next version in review): the
  dependency is already satisfied by the published version if it matches the range; only a range
  that needs the new version waits on it.
- **The rejected dependency is replaced** by a new submission of the same name: the blocked
  dependents become "waits on" again without any action.

## Documentation

- **Submitting and review → The checks at submit** (`review#checks`): a dependency counts once it's
  in review; the range is checked at release; a draft dependency doesn't count.
- **Submitting and review → Submitting many at once** (`review#many`): your own ready dependency
  drafts are included, first; `--no-deps`.
- **Submitting and review**, a new section **Dependencies in review** (`review#dependencies`): the
  marks (waits on, blocked), approving with a dependency in review, releasing in order, and what
  happens when a dependency is rejected or withdrawn.
- **Submitting and review → Decisions** (`review#decisions`): rejecting lists the dependents and can
  request changes on them; request changes is possible on an approved submission too.
- **Versions and tags → Releasing many at once** (`versions#release-many`): dependencies are
  included when a dependent is selected. (Written with 055, which adds that section.)
- **Exporting your own items → What arrives, and what to do next** (`export#next`): an item and its
  dependencies can be submitted together; no more rounds.
- **Helpers:** next to a **Waits on** or **Blocked** mark: "What does this wait on?", linking to
  `review#dependencies`; in the reject dialog, next to the dependents: "Why are these listed?",
  linking to `review#dependencies`.

- **Items and types → Dependencies** (`items#dependencies`): at submit a dependency may be in
  review; a new part, **Adding one**: picking from the list, the version and `latest`, and `@` in
  markdown files. **Helper:** next to the dependencies field, "How do I add one?", linking there.

## Acceptance criteria

- [x] A draft submits when a dependency is an open submission, with the warning; a draft dependency,
  a rejected or withdrawn one, a wrong type and a cycle through open submissions are refused.
- [x] The range is checked at release against the dependency's released version, and a dependent
  whose dependency isn't released (or released in the batch first) can't be released.
- [x] Bulk submit (web, `rmk submit`, `submit_drafts`) includes the person's own ready dependency
  drafts first; `--no-deps` leaves them out.
- [x] **Moved to 055** (built there): 055 selects a dependent's approved dependencies with it,
  refuses a dependent waiting on a dependency in review, and releases dependencies first.
- [x] Rejecting a submission lists its open dependents, and with the box ticked requests changes on
  each the reviewer may decide, each audited with `cause`; unticked, they show **Blocked**.
- [x] Request changes works from `approved`.
- [x] The marks show on My submissions, the review queue and the review page, and as a badge beside
  each dependency in the editor's form.
- [x] The service tests pass on SQLite, PostgreSQL, MySQL and MariaDB, and an end-to-end test
  submits a skill and a bundle that uses it together, approves both, releases the skill and then
  the bundle (in one batch once 055 is built), and in a second run rejects a skill and sees its
  bundle sent back.
- [x] The Documentation and inline helpers listed above say what the feature does now.

- [x] The dependency search matches any part of `@scope/name`, a description or a keyword, offers
  published items, the person's own drafts and open submissions, and others' open ones, only of
  allowed types, and never the item itself.
- [x] The form adds a row only from a pick, with the versions listed and `latest` by default
  written as `^<version>`, `^1.0.0` for an unreleased item; no half-typed name reaches the file.
- [x] Typing `@` in a markdown file opens the list; picking inserts the name and adds the
  dependency, and nothing is saved until Save.

## Decisions

1. **A dependency on its way counts at submit** (owner, 2026-10-01): released, or an open
   submission of that name; the range is checked at release. This replaces 013's rule, which 041
   and 052 kept. MVP §15's "Dependencies on export" row is updated.
2. **Rejecting a dependency** (owner, 2026-10-01): the reviewer is offered **Request changes on
   them too**, on by default. Nothing changes without a decision.
3. **Release auto-includes approved dependencies** (owner, 2026-10-01), in 055.
4. **Another author's submission as a dependency** (owner, 2026-10-01): it counts, named only by
   item and status, as 013's "name is taken" already does; its content stays hidden from people who
   can't see it. *Replaced by [089](../089-dependency-picker-rule/SPEC.md) (owner, 2026-10-05):
   another author's item counts only once published.*

5. **Picking dependencies** (owner, 2026-10-01): an autocomplete in the form and `@` in markdown,
   over published items and the person's own; built in this feature. Deleting an `@` mention keeps
   the dependency; others' items in review are offered; a draft says it's submitted with the item
   (Claude's recommendations, taken while the owner's answers were pending). *Since
   [089](../089-dependency-picker-rule/SPEC.md) (owner, 2026-10-05), others' items are offered only
   once published, and the canvas offers the person's own too.*

## Open questions

None.
