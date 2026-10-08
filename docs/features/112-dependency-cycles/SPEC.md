# 112 — Dependency cycles, submitted and released together

> Milestone: Across the app · Depends on: 013, 015, 020, 052, 055, 056, 089, 096, [#142](../../issues/142-submit-problems-on-save/SPEC.md) · Design: [MVP §3.1](../../MVP/MVP.md#31-item-types), [§4.3](../../MVP/MVP.md#43-install--update), [§15](../../MVP/MVP.md#15-decision-log) · Contracts: [manifest spec §3](../../spec/manifest.md)

## Goal

Items that need each other can be published (owner, 2026-10-08). An agent and the skill it runs,
each naming the other, are submitted together from the item's own page, reviewed, released
together, and installed together. Until now a cycle was refused at submit, at release and by the
resolver (MVP §4.3, §15), and the author saw a misleading message: a dependency that's only their
draft "isn't a published item or in review", when the real obstacle was the cycle.

The owner's report: reviewing a draft agent that names `@test/agent`'s skill, and the skill naming
the agent, the problems list says "`@test/agent` isn't a published item or in review. Submit it
first". Submitting from the item's page should see that the dependencies can go at the same time,
and offer it.

## Scope

**In:**
- **The decision** (MVP §3.1, §4.3, §15 "Resolver" and "Dependencies between types"; manifest spec
  §3): cycles are allowed. An item still can't depend on itself (`self_dependency`).
- **The resolver** (`packages/core`, 020): no `dependency_cycle` error. One version per item, as
  before; a cycle's items are installed side by side like any others.
- **The order helper** (`dependenciesFirst`, `packages/core`): a cycle's items come out together,
  as one group, instead of no order at all.
- **Submit** (013, 056, 089): a cycle isn't an error. A dependency that's the author's own draft
  says so, and that it can be submitted with this item.
- **Submit with its drafts** (052, 056): the item's Submit dialog lists the author's own drafts this
  item needs, through the whole chain and cycles included, and offers to submit them together.
- **Release** (015, 055, 056): a cycle's items are released together, in one transaction. The
  Release dialog of an item in a cycle releases its whole cycle; bulk release treats a cycle as one
  unit.
- **What reads an order:** plugin feeds (076), and the release-order hints of `rmk submit`,
  `rmk export` and the MCP tools.
- **The Documentation** and the helpers.

**Out:**
- **An item on itself.** Still refused.
- **Two versions of one item in one install.** Still one version per item (MVP §4.3).
- **Older `rmk` and MCP server versions:** nothing to do. They don't resolve or order dependencies
  themselves: they ask the server (`POST /api/v1/resolve`), then install by name. Once the server
  accepts cycles, they install a cycle's items too.
- **Cycles through another author's item.** Unchanged by this feature: another author's item counts
  only once it's published (089), so a cycle with someone else's work forms only when one side is
  already released, and then it's an ordinary dependency on a published version.

## Behaviour

### Installs (the resolver)

- `resolve()` accepts a dependency graph with cycles: A on B and B on A resolve to one version of
  each, both installed. No `dependency_cycle` error code any more (`ResolveErrorCode`), and the API's
  409 for it goes.
- **Only what the requests reach is installed.** Today an item drops out of the resolution when
  nothing asks for it any more. With a cycle, A and B would keep asking for each other after the
  item that brought them in stopped needing them. The resolver keeps only the items reachable from
  the requests through the chosen versions.
- `dependenciesFirst` returns every item, dependencies before what needs them, with each cycle's
  items next to each other as a group (`groups`: the cycles, by name). No `cycle` result.

### Submit

- **A cycle isn't an error.** `dependency_cycle` stops being reported by `dependencyIssues` at
  submit, at release, on save (#142) and on the canvas. A **warning** takes its place where it
  helps the author and the reviewer: "`@team/a` and `@team/b` need each other: they're released
  together." (`dependency_cycle`, severity warning).
- **A dependency that's your own draft** gets its own message, an error as before (it isn't on its
  way yet): "`@team/b` is your draft: submit it with this item, or first." (`dependency_draft`).
  Another author's draft keeps today's message (089).
- **Submit with its drafts.** When the dependencies include the author's own drafts, the item's
  Submit dialog:
  - lists them, with the chain that brings each in ("needed by `@team/a`"), the cycle's members
    marked as going round;
  - offers **Submit with N drafts**: the same submission as 056's bulk submit with this item
    selected, its dependency drafts included before it;
  - checks each one as if all of them were in review, so a cycle's members don't block each other;
  - submits **a cycle's members all or none**: if one of them isn't ready, none of that cycle is
    submitted, and the dialog says which one and why;
  - shows the outcome for each, as bulk submit does.
- **My submissions' bulk submit** (052, 056) follows the same rules: a cycle's members are checked
  together and submitted all or none.

### Release

- **A cycle is released together.** 056's rule stays for everything else (a dependency must be
  released first). For a cycle, the other members must be **approved** and released in the same
  step: their versions are planned together, each range is checked against the versions going out,
  and all the versions are recorded in **one database transaction**. If any one fails, none is
  released. The artifacts are packed and stored first; one stored for a release that then fails
  isn't referenced and is harmless.
- **The Release dialog** of an item in a cycle says "Released together with `@team/b`" and plans
  each member's version with bulk release's settings (055: stable or pre-release, each item's own
  suggested bump). It refuses, with why, when a member isn't approved yet, or the person may not
  release it (055's permission rule).
- **Bulk release** (055) treats a cycle as one unit: selected together, planned together, released
  in one transaction; a unit that fails is `not_releasable` for each member, with why, and what
  depends on it is `skipped`, as today.

### What reads an order

- **Plugin feeds** (076): a plugin whose members form a cycle lists them all. Today an unresolvable
  cycle made the plugin unavailable, and a cycle the resolver let through would have left it empty.
- **`rmk submit`, `rmk export` and the MCP export and submit tools:** the release-order hint says
  "`@team/a` and `@team/b` are released together" for a cycle, instead of contradicting itself.

## Edge cases

- **A longer cycle** (A → B → C → A): one group of three; submitted all or none, released together.
- **Two cycles joined by a plain dependency** (A ↔ B, B → C, C ↔ D): two groups, C and D first.
- **A cycle with an item already released** (A released; B, a draft, names A, and a new version of A
  names B): B is submitted and released like any item whose dependency is released; A's new
  version then depends on B's release. It's one group only while both are unreleased.
- **One member of a cycle is rejected or withdrawn** (013, 057): the others can't be released
  without it; their marks say they wait on it (056), as for any unreleased dependency.
- **A cycle member's change proposal** (017): a proposal is a new version of a released item, so the
  cycle is already out; the proposal is released like any version whose dependencies are released.
- **A pre-release** in a cycle: each member's range has to accept the other's version going out, as
  for any release (a range picks a pre-release only when it names one).
- **An install that asks for A only:** A and B are both installed, as for any dependency.
- **`rmk remove A`:** B stays only if something still asks for it (the reachability rule).

## Documentation

- **Items and types → Dependencies** (`items#dependencies`): items may need each other; they're
  submitted and released together. Never itself.
- **Items and types → Composing on a canvas** (`items#canvas`): the cycle warning on a node.
- **Review → The checks at submit** (`review#checks`): no cycle refusal; "your draft" and Submit
  with its drafts.
- **Review → Dependencies in review** (`review#dependencies`): a cycle is submitted all or none.
- **Review → Submitting many at once** (`review#many`): cycles checked together, all or none.
- **Versions → Releasing many** (`versions#release-many`): a cycle is one unit, released together,
  and an item in a cycle's own Release releases its cycle.
- **`rmk` → Installing** (`rmk#installing`): items that need each other install together.
- **Helpers:** the Submit dialog's new list gets an inline helper ("Why are these submitted
  together?") linking to `review#dependencies`.

## Acceptance criteria

- [ ] MVP §3.1, §4.3 and §15, and the manifest spec §3, say cycles are allowed and released together;
  a self-dependency is still refused.
- [ ] Core: the resolver installs A ↔ B, keeps only what the requests reach, and `dependenciesFirst`
  groups a cycle; the tests that asserted refusal assert the new rule.
- [ ] Submit: no cycle error; the warning; `dependency_draft` for your own draft.
- [ ] The item's Submit dialog offers Submit with its drafts, and submits a cycle all or none.
- [ ] Release: the Release dialog and bulk release release a cycle together, in one transaction,
  and none of it when one fails.
- [ ] Plugin feeds and the `rmk`/MCP release-order hints handle a cycle.
- [ ] Service db tests pass on SQLite, PostgreSQL, MySQL and MariaDB.
- [ ] An end-to-end test: two drafts that need each other submitted together from one item's page,
  approved, released together, and installed with `rmk`, on desktop and phone.
- [ ] The Documentation listed above says so, in English, Portuguese and French.

## Decisions

1. **Cycles are allowed** (owner, 2026-10-08). Replaces MVP §4.3 "Cycles are rejected" and the §15
   rows that refuse them.
2. **The item's Submit dialog offers to submit its own dependency drafts together** (owner,
   2026-10-08).
3. **A cycle is submitted all or none, and released in one transaction** (Claude). Half a cycle in
   review or released would leave the rest unable to follow: a released item whose dependency never
   comes can't be installed.
4. **A cycle's warning instead of silence** (Claude). Reviewers should see that two items go
   together, since approving one isn't enough to release it.

## Open questions

- **A cycle across workspaces** (093): today an item in a private workspace can be a dependency only
  of items in the same workspace, so a cycle across two private workspaces can't form; one between a
  public and a private workspace can't either (the public one can't name the private one). Nothing
  to decide unless that rule changes. Recorded so the next change to it remembers cycles.
