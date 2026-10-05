# 089 — Who can be picked as a dependency

> Milestone: Across the app · Depends on: 031, 056 · Design: [MVP §4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§15](../../MVP/MVP.md) · Contracts: [manifest spec §3](../../spec/manifest.md)

## Goal

One rule for what an item may depend on (owner, 2026-10-05): **any of your own items, in any
state** (draft, in review, approved or published), and **only published items of other people**.
056 also offered others' items while they were in review and let them count at submit; that goes.
The visual composer's canvas, which offers only published items, gets your own unreleased items
too, so both pickers offer the same things.

## Scope

**In:**
- **The form's Item field and `@` in markdown** (056's picker): others' open submissions are no
  longer offered. Your own items are offered in every state, found by a query on the author (not
  056's scan of the newest 500 open submissions), and your own published items always match,
  whatever their rank in the catalogue.
- **The canvas** (031): its picker offers the same list as the form (published items plus your own
  unreleased items, with their status badge).
- **The check at submit** (013, 056's `dependencyIssues`): a dependency that isn't released counts
  only when it's **your own** open submission. Another author's open submission no longer counts,
  even when the name is typed by hand in `ronne.yaml`.
- **Bulk release** (055): including approved dependencies in the batch is unchanged; it only ever
  meets your own, or released ones, once the submit rule holds.

**Out** (and where it goes instead):
- **A new kind of link between items** ("related", "see also"). Dependencies stay the only
  relation (owner, 2026-10-05).
- **Workspaces' visibility rules** (private items only within their workspace):
  [093](../093-private-workspaces/SPEC.md) adds that filter to this picker and to this check.
- **Changing the type rules** (manifest spec §3). Unchanged.

## Behaviour

**Mine.** An item is yours when you're the author of its submission: your drafts, your open
submissions (`submitted`, `changes_requested`, `approved`) and your change proposals. A published
item is offered to everyone, so "mine" matters only for unreleased ones. An item someone else
first published, to which you have a change proposal open, is offered as published (as 056 does).

**The list** (form, `@` and canvas), at most 12, of the types this item may depend on, never the
item itself or one already listed, in this order:

| Offered | Shown as |
|---|---|
| Your published items (those you first published), whatever their rank in the catalogue | name, type, newest version, "yours" |
| Your drafts and open submissions, newest change first | name, type, status badge, "yours" (a draft: "submitted with this item", 056) |
| Others' published items, newest first | name, type, newest version |

Yours come first, so they're never pushed out by others' items. Others' drafts and open
submissions are never offered, nor named. A name that's published and also one of your open
proposals shows once, as published.

**At submit.** `dependencyIssues` keeps 056's rules for released items and for your own open
submissions (a warning, the range checked at release). A dependency on **another author's**
unreleased item is an error: "@team/github isn't released yet. You can depend on someone else's
item once it's published." A draft of yours still doesn't count at submit unless bulk submit
includes it (056). Rejected and withdrawn stay errors.

**Already in review.** Submissions that already depend on another author's open submission keep
their place: the rule is checked again only when they're resubmitted or released. At release
nothing changes, because a dependency had to be released then anyway. Their marks (056's "Waits
on") stay until the dependency is released.

**The canvas.** Its picker's first page starts with your own items, as the list above (your
published ones, then your drafts and open submissions), then pages through others' published items,
newest first, as before; what the first page showed as yours isn't repeated later. Published items
match the name, description and keywords; your unreleased ones match `@scope/name` only, since a
draft's description is still in its `ronne.yaml`. An unreleased item shows an amber badge instead of
a version ("draft, yours", "in review, yours", "back for changes, yours", "pending release, yours"),
and a published one of yours says "v1.4.0, yours". On the canvas, a node for one of your own
unreleased items shows the same badge instead of the red "not published". Under an open submission of
yours, 056's "isn't released yet; it's in review" warning isn't repeated. A draft of yours keeps its
problem ("isn't a published item or in review. Submit it first"): the editor's Submit refuses it until
it's submitted, or submitted together in bulk (056), and its type and cycle are checked only then.

## Edge cases

- **Another author's item gets published while my draft names it:** it's published, so it counts
  from then on; nothing to do.
- **I'm the author of a change proposal to someone else's published item:** the item is offered as
  published; the proposal's new version counts only once it's released.
- **Two people's open submissions of the same new name** (impossible: a new name is taken by the
  first open submission, 013).
- **A typed dependency on someone else's open submission, in a draft saved before this feature:**
  the form shows the row with the new error; the draft can be saved but not submitted.

## Documentation

- **Items and types → Dependencies** (`items#dependencies`), the part **Adding one**: which items
  are offered (yours in any state, others' once published), and the canvas offering the same.
- **Submitting and review → The checks at submit** (`review#checks`) and **Dependencies in review**
  (`review#dependencies`): only your own items count before release; someone else's counts once
  published.
- **Helpers:** the dependencies field's "How do I add one?" (056) keeps its link; its short answer
  says "your own items in any state, others' once published".

## Acceptance criteria

- [ ] The form's search and `@` offer published items and the person's own drafts and open
  submissions, never another author's unreleased ones; the person's own published items match
  whatever their catalogue rank.
- [ ] The canvas offers the same list, with status badges on unreleased items.
- [ ] Submitting with a dependency on another author's open submission fails with the message
  above; on the person's own it passes with 056's warning.
- [ ] A submission already in review that depends on another author's open submission isn't
  changed until it's resubmitted.
- [ ] The service tests pass on SQLite, PostgreSQL, MySQL and MariaDB.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Others' items only once published** (owner, 2026-10-05). Replaces 056's decision 4 (another
   author's open submission counted). MVP §15's "Dependencies on export" row is updated.
2. **No new relation kind** (owner, 2026-10-05): "relationships" between items are dependencies.

## Open questions

None.
