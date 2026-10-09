# 112 — Submitted and released together, cycles included

> Milestone: Across the app · Depends on: 013, 015, 020, 052, 055, 056, 089, 096, [#142](../../issues/142-submit-problems-on-save/SPEC.md) · Design: [MVP §3.1](../../MVP/MVP.md#31-item-types), [§4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§4.3](../../MVP/MVP.md#43-install--update), [§15](../../MVP/MVP.md#15-decision-log) · Contracts: [manifest spec §3](../../spec/manifest.md)

## Goal

An item and what it needs go through review together (owner, 2026-10-08). Submitting an item
submits the author's own drafts it depends on, and releasing it releases its dependencies that
aren't released yet, all in one step, all or none. Items that need each other (a cycle) are allowed
now, and go the same way: an agent and the skill it runs, each naming the other, are submitted
together from the item's own page, reviewed, released together and installed together.

Until now each item went on its own: a dependency had to be in review before its dependent was
submitted (056) and released before it (056), and a cycle was refused at submit, at release and by
the resolver (MVP §4.3, §15). The owner's report: reviewing a draft that names `@test/agent`, with
the agent naming it back, the problems list says "`@test/agent` isn't a published item or in
review. Submit it first", when the dependency was the author's own draft and the two could have
gone together.

## Scope

**In:**
- **The decisions** (MVP §3.1, §4.1, §4.3, §15; manifest spec §3): cycles are allowed; an item is
  submitted with its own dependency drafts and released with its unreleased dependencies, all or
  none. An item still can't depend on itself (`self_dependency`).
- **The resolver** (`packages/core`, 020): no `dependency_cycle` error. One version per item, as
  before; a cycle's items are installed side by side like any others.
- **The order helper** (`dependenciesFirst`, `packages/core`): a cycle's items come out together,
  as one group, instead of no order at all.
- **Submit's checks** (013, 056, 089, #142): no cycle error; a dependency that's the author's own
  draft says it goes with this item.
- **Submit together** (013, 052, 056): Submit on an item's page submits it with every draft of the
  author's that it needs, through the whole chain, in one step, all or none. My submissions' bulk
  submit follows the same rule.
- **Release together** (015, 055, 056): Release on an item's page releases it with every dependency
  that isn't released yet, through the whole chain, in one transaction, all or none. Bulk release
  follows the same rule.
- **What reads an order:** plugin feeds (076), and the release-order hints of `rmk submit`,
  `rmk export` and the MCP tools.
- **The Documentation** and the helpers.

**Out:**
- **An item on itself.** Still refused.
- **Two versions of one item in one install.** Still one version per item (MVP §4.3).
- **Another author's items.** They're never submitted or released by someone else's Submit or
  Release. Another author's item counts as a dependency only once it's published (089), so it never
  needs to go together with yours.
- **Older `rmk` and MCP server versions:** nothing to do. They don't resolve or order dependencies
  themselves: they ask the server (`POST /api/v1/resolve`), then install by name. Once the server
  accepts cycles, they install a cycle's items too.
- **`rmk submit` and the MCP submit tool** already submit a selection with its dependency drafts
  through 056's bulk submit; they get the all-or-none rule from the service, with no change of
  their own beyond the order hints.

## Behaviour

### The group

What goes together is the **group** of an item:
- **at submit:** the item and every one of the author's own **drafts** that it needs, directly or
  through others, cycles included. Dependencies already in review, approved, released or sent back
  for changes aren't in it: they're on their way already (056).
- **at release:** the item and every dependency, direct or through others, that has **no released
  version** matching its range yet, cycles included. They must all be **approved**: one still in
  review or sent back makes the release wait, with why.

A group is submitted or released **all or none**. Two groups that share an item, in one bulk
action, become one group.

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

### Submit's checks

- **A cycle isn't an error.** `dependency_cycle` stops being reported as an error at submit, at
  release, on save (#142) and on the canvas. A **warning** takes its place, for the author and the
  reviewer (`dependency_cycle`, severity warning), worded by what comes next (owner, 2026-10-08):
  - while any of them is still with its author (a draft, or sent back for changes): "`@team/a` and
    `@team/b` need each other: they're submitted for review together.";
  - once they're all in review or approved: "`@team/a` and `@team/b` need each other: they're
    released together."
- **A dependency that's your own draft** gets its own message: "`@team/b` is your draft: it's
  submitted with this item." (`dependency_draft`). It's a **warning** on save and in the problems
  list, since Submit takes care of it; it's an error only where the item is submitted alone (an
  older `rmk`'s single submit, or a group refused because the draft isn't ready).
- **Another author's draft** keeps today's message and stays an error (089).

### Submit

- **The item's Submit dialog** lists the group before it submits: each draft, with what brings it
  in ("needed by `@team/a`"), a cycle's members marked as needing each other, and each one's checks,
  as it shows the item's today.
- **One button** submits the whole group: **Submit with 2 more drafts** (or **Resubmit with…**),
  and **Submit for review** when nothing goes with it; the dialog's title stays **Submit for
  review**. It's off while any member has an error, with why ("`@team/b` isn't ready: fix its
  errors first."), and each member's name links to that draft, above its problems.
- **Checked together:** each member is checked as if the whole group were in review, so members,
  and a cycle's especially, don't block each other.
- **All or none:** the group's members are submitted in one database transaction. If one fails at
  that moment (someone else just took its name, say), none is submitted: the dialog says "Something
  changed since the check: here's where each draft stands now.", checks again, and shows each.
  Once submitted, it says what went: "Submitted `@team/a` for review, with `@team/b`."
- **Unsaved changes:** Submit stays off while the open item has unsaved changes, as today. A member
  is submitted as it was last saved.
- **My submissions' bulk submit** (052, 056) works in groups: a selected draft brings its group, as
  056 already includes dependency drafts; each group is checked together and submitted all or none;
  the outcome is shown per draft, a group's failure on each of its members. An unexpected error
  (the database going away) stops the run, as before 112: the groups already sent stay sent, and
  running it again picks up the rest.

### Release

- **The Release dialog** of an approved item lists its group: each member with the version it will
  get. One set of settings (055: stable or pre-release), and each member's own suggested bump.
  Publish is off, with why, when a member gets no version from those settings; anything else the
  server refuses (a range a member's version misses, say) is said when Publish is pressed, in
  words that name it: "`@team/b` goes out as 1.0.0-beta.1, which `@team/a`'s range ^1.0.0 doesn't
  match."
- **Release** releases the whole group: the artifacts are packed and stored first, then all the
  versions are recorded in **one database transaction**, each range checked against the versions
  going out. If any one fails, none is released.
  - **Under the transaction's locks,** each dependency outside the group is locked as a yank locks
    it, and must still have a version in its range: one yanked meanwhile refuses the release.
  - **Artifacts never change.** An artifact stored for a release that then failed isn't referenced
    by any version; when a later release of that version has other bytes, they're stored next to
    it as `<version>-<first 12 of their sha256>.tgz`, and the version records that path.
  - **A change proposal that's stale** is refused with 017's own error, as before.
- **Refused, with why**, when a member isn't approved yet ("It can't be released yet: it waits on
  `@team/b`, which is submitted."; Publish is off with the same reason), or the person may not
  release a member (055's rule: a workspace's moderators and root release any, an author their own;
  "`@team/b` can't be released with it: only its author, a moderator or root releases it.").
- **Bulk release** (055) works in groups the same way: a selected item brings its group (056 already
  includes approved dependencies); everything joined by a dependency in the batch is one group,
  released in one transaction, all or none, each member `not_releasable` with why when it fails
  (what depends on a group is in it, so `skipped` no longer happens). An item that can't go takes
  back what it brought. Two proposals of one item can't go in one batch: the second is refused
  ("Another change to `@team/b` is in this batch: release them one at a time.").

### What reads an order

- **Plugin feeds** (076): a plugin whose members form a cycle lists them all. Today an unresolvable
  cycle made the plugin unavailable, and a cycle the resolver let through would have left it empty.
- **`rmk submit`, `rmk export` and the MCP export and submit tools:** the order hints follow
  how Submit works now. After an export: "rmk submit `@team/a` takes `@team/b` with it, all or
  none."; for a draft that isn't ready: "`@team/a` waits on `@team/b`: once it is ready, rmk
  submit `@team/a` takes it with it."; and for a cycle, one line each: "`@team/a` and `@team/b`
  need each other: they're submitted and released together." (`together` in the JSON and in the
  MCP tools' data).

## Edge cases

- **A chain** (A → B → C, all drafts): Submit on A submits all three; Release on A, once all three
  are approved, releases all three.
- **A longer cycle** (A → B → C → A): one group of three.
- **A dependency already in review** when its dependent is submitted: not in the group; the
  dependent is submitted with a pending warning (056), and its release then takes the dependency
  with it once approved.
- **A shared dependency** (A → C and B → C, all drafts): Submit on A submits A and C; B, submitted
  later, finds C in review. In one bulk submit of A and B, both groups share C and become one.
- **A dependency with a released version that doesn't match** the range: it's in the release group
  if an approved submission of it would match; otherwise the release is refused, as today
  (`dependency_range`).
- **A cycle with an item already released** (A released; B, a draft, names A, and a new version of A
  names B): B is submitted and released like any item whose dependency is released; A's new
  version then depends on B's release. They're one group only while both are unreleased.
- **One member is rejected or withdrawn after submit** (013, 057): the others can't be released
  without it; their marks say they wait on it (056), as for any unreleased dependency.
- **A change proposal** (017) in a group: released as its item's next version, like any member.
- **A pre-release** in a group: each member's range has to accept the versions going out (a range
  picks a pre-release only when it names one).
- **A group over the bulk limits** (100 to submit, as bulk submit's `MAX_BULK`; 50 to release, as
  bulk release's): refused with why, rather than cut.
- **Two drafts of one new item's name in a group:** refused, with why: only one of them can go for
  review. Change proposals of one item can go together (017).
- **A dependency with a draft and a change proposal of its name:** the group takes the proposal
  (a new item's draft of a published name can never go); of two proposals, the newest.
- **An install that asks for A only:** A and what it needs are installed, cycles included.
- **`rmk remove A`:** B stays only if something still asks for it (the reachability rule).

## Faster checks (owner, 2026-10-08)

Added to this feature by the owner while building it: the checks had grown slow, both in CI and
for whoever runs them while working, and should run what each change needs without losing what
each kind of test catches. Measured on `main` before this work: database tests on MySQL 8.6 min,
end-to-end 5.6 min, MariaDB 3.8, PostgreSQL 2.9, lint/typecheck/test/build 2.4–2.9 (jobs run in
parallel, so a pull request waited about 9 min).

- **Database tests stay.** End-to-end tests run on SQLite only and cover the main paths; the
  database tests on PostgreSQL, MySQL and MariaDB are what catch dialect differences (SQLite
  accepts what the servers refuse), and they hold the edge cases a browser test never reaches.
- **Set up once, emptied between tests.** On a server, `createTestDb()` migrated a new database
  for every test, and DDL is slow on MySQL. Each test file now migrates one database once and
  puts it back to just migrated before each test (tables emptied, the migrations' rows put back,
  migrated afresh if a test changed the schema), each test on new connections. Leftover
  databases from interrupted runs are dropped when a run starts. SQLite in memory stays as it is. Migration tests keep a
  database of their own (`migrate: false`).
- **The servers where they matter.** On a pull request, the database servers run the tests of
  database code (the `db/` layer, migrations, repositories, setup and the scripts that run
  against the database: `pnpm test:db:core`) always, and every database test only when the pull
  request changes database code. Database code is those paths, any database test, any changed
  file that queries the database (Kysely or raw SQL, wherever it is) or a deleted code file (what
  it held can't be read), the dependencies (the drivers come through them) and what runs the
  database tests; the rule is
  `packages/repo-tools/src/db-scope.js`, and `changes.yml`'s `database` output carries it. Every
  database test still runs on SQLite in the CI job. Pushes to `main`, the weekly run and manual
  runs run everything on every server, as today.
- **End-to-end in two parallel jobs.** Playwright's `--shard`, each half with its own build and
  instance; a small job keeps the required check's name, "End-to-end (Chromium)", and passes when
  both halves did.
- **When working:** run the servers for changes to database code; the rest runs on SQLite, and CI
  runs the full set on `main`. CLAUDE.md and a note in `docs/knowledge/` say which runs where.

## Documentation

- **Items and types → Dependencies** (`items#dependencies`): items may need each other; an item is
  submitted with its own drafts and released with its unreleased dependencies. Never itself.
- **Items and types → Composing on a canvas** (`items#canvas`): the cycle warning and "your draft"
  on a node.
- **Review → The checks at submit** (`review#checks`): no cycle refusal; "your draft"; the group in
  the Submit dialog.
- **Review → Dependencies in review** (`review#dependencies`): submitted and released together, all
  or none.
- **Review → Submitting many at once** (`review#many`): groups, all or none.
- **Versions → Releasing many** (`versions#release-many`): groups, one transaction each; the item's
  own Release releases its group.
- **`rmk` → Installing** (`rmk#installing`): items that need each other install together.
- **Helpers:** the Submit and Release dialogs' group lists get an inline helper ("Why do these go
  together?") linking to `review#dependencies`.

## Acceptance criteria

- [ ] MVP §3.1, §4.1, §4.3 and §15, and the manifest spec §3, say cycles are allowed and an item goes
  through submit and release with its dependencies; a self-dependency is still refused.
- [ ] Core: the resolver installs A ↔ B and keeps only what the requests reach; `dependenciesFirst`
  groups a cycle; the tests that asserted refusal assert the new rule.
- [ ] Checks: no cycle error, the cycle warning, `dependency_draft` for your own draft.
- [ ] Submit on an item submits its group (a chain, a cycle) in one transaction, all or none, and the
  dialog lists it.
- [ ] Release on an item releases its group in one transaction, all or none, and refuses with why
  when a member isn't approved or the person may not release it.
- [ ] Bulk submit and bulk release work in groups, all or none.
- [ ] Plugin feeds and the `rmk`/MCP release-order hints handle a cycle.
- [ ] Service db tests pass on SQLite, PostgreSQL, MySQL and MariaDB.
- [ ] An end-to-end test: two drafts that need each other submitted together from one item's page,
  approved, released together from one Release dialog, and installed with `rmk`, on desktop and
  phone.
- [ ] The Documentation listed above says so, in English, Portuguese and French.
- [ ] Faster checks: database tests set up once per test file; a pull request runs the servers on
  database code (everything when database code changes); end-to-end in two jobs; the same tests
  still pass; CI times measured before and after.

## Decisions

1. **Cycles are allowed** (owner, 2026-10-08). Replaces MVP §4.3 "Cycles are rejected" and the §15
   rows that refuse them.
2. **An item is submitted with its own dependency drafts, and released with its unreleased
   dependencies, all or none** (owner, 2026-10-08). Replaces 056's "submit the dependency first,
   release it first" for the author's own items. Half a group in review or released would leave the
   rest unable to follow: a released item whose dependency never comes can't be installed.
3. **One database transaction per group** (Claude): the artifacts are stored first, the versions
   recorded together, so a failure leaves nothing half released.
4. **A cycle's warning instead of silence** (owner, 2026-10-08). Reviewers should see that items go
   together, since approving one isn't enough to release it.
5. **Your own draft as a dependency is a warning, not an error** (Claude): Submit takes it with the
   item, so it doesn't block anything. It's still an error where the item would go alone.

6. **Faster checks in this feature** (owner, 2026-10-08): the CI and local test time work is
   done on this branch, as tasks 10–13, rather than as a separate change.

## Open questions

- **A cycle across workspaces** (093): an item in a private workspace can be a dependency only of
  items in the same workspace, so a group never spans two private workspaces, nor a public and a
  private one. Nothing to decide unless that rule changes; recorded so that change remembers groups.
- **Reviewing a group**: each member is still approved on its own (one approval per submission, MVP
  §4.1). Approving a group in one step could come later; bulk approve (062) already takes several.
