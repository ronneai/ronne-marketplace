# 112 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The decisions.** MVP §3.1, §4.1, §4.3 and §15 (the "Resolver" and "Dependencies between
  types" rows, and new rows for decisions 1 and 2); the manifest spec §3; `item-types.ts`'s comment;
  056's spec gets a note that 112 replaces "first" with "together" for the author's own items.
  *Done when:* no doc in `docs/MVP` or `docs/spec` says cycles are refused or that an author's own
  dependency must be submitted or released first, and each place says they go together.

- [x] **2. Core: the resolver and the order.** [risky] In `packages/core`:
  - `resolve.ts`: the final cycle walk goes, with `dependency_cycle` in `ResolveErrorCode`; the
    resolution keeps only what the requests reach through the chosen versions;
  - `order.ts`: `dependenciesFirst` returns every item, with `groups` for cycles;
  - their callers follow in the same change (the pre-commit hook runs every suite): the registry
    API's 409 mapping, `bulk-release.ts` and `plugin-feed.ts` stop reading `cycle`.

  *Done when:* core tests cover A ↔ B, a cycle of three, two cycles joined, and a pair dropped when
  nothing reaches it any more; the tests that asserted refusal assert the new rule; the API and
  plugin-feed tests pass with a cycle.

- [ ] **3. The checks.** In `registry-checks.ts`: no cycle error, the `dependency_cycle` warning, and
  `dependency_draft` for the author's own draft (a warning; an error where the item goes alone).
  Save (#142), the canvas and the dependency marks show the same.
  *Done when:* the registry-checks tests and the submissions db tests cover a cycle, the warning's
  words, and an own draft versus another author's, on the four databases.

- [ ] **4. Submit together.** [risky] The service: the submit group (the item and the author's own
  drafts it needs, through the chain, cycles included), each member checked as if the group were in
  review, all submitted in one transaction or none; `submitDraft` and 056's bulk submit (`rmk
  submit` and the MCP tool through it) work in groups, and two groups sharing a draft merge.
  *Done when:* db tests cover a chain A → B → C, a cycle A ↔ B, a group with one member not ready
  (none submitted), a failure inside the transaction (none submitted), and a bulk submit whose
  groups share a draft, on the four databases.

- [ ] **5. The Submit dialog.** `SubmitDialogs.tsx`: the group's list with what brings each member
  in, each one's checks and links, the cycle marked, the button's reason when a member isn't ready,
  the outcome; an inline helper.
  *Done when:* component tests cover the list, a cycle, a member not ready and the outcome.

- [ ] **6. Release together.** [risky] `publish.ts` splits into preparing (pack and store each
  artifact) and recording (the database rows), so a group's versions are recorded in one
  transaction, each range checked against the versions going out. The release group (the item and
  every dependency with no matching released version, all approved). The Release dialog lists the
  group and its versions; `bulk-release.ts` releases in groups.
  *Done when:* db tests cover releasing a chain and a cycle from one item, a member not approved and
  a member the person may not release (refused, with why), a failure while recording (nothing
  released), and bulk release with a group and something depending on it, on the four databases;
  component tests cover the Release dialog's list.

- [ ] **7. The order hints.** `rmk submit`, `rmk export` and the MCP tools say "released together"
  for a cycle.
  *Done when:* the CLI and MCP tests cover a cycle's hint.

- [ ] **8. End to end.** Two drafts that need each other: submitted together from one item's page,
  approved, released together from one Release dialog, then installed with `rmk`.
  *Done when:* `pnpm test:e2e` passes on desktop and phone.

- [ ] **9. Documentation.** The topics in the spec (en, pt, fr) in a ronne-web branch that goes live
  with the release, and the two dialogs' helpers.
  *Done when:* the pages say what tasks 2–7 do, and the docs tests pass in ronne-web.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
