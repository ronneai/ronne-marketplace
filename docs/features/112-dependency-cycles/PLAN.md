# 112 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The decision.** MVP §3.1, §4.3 and §15 (the "Resolver" and "Dependencies between types"
  rows, and a new row for this decision); the manifest spec §3; `item-types.ts`'s comment.
  *Done when:* no doc in `docs/MVP` or `docs/spec` says cycles are refused, and each place that did
  says they're submitted and released together.

- [ ] **2. Core: the resolver and the order.** [risky] In `packages/core`:
  - `resolve.ts`: the final cycle walk goes, with `dependency_cycle` in `ResolveErrorCode`; the
    resolution keeps only what the requests reach through the chosen versions;
  - `order.ts`: `dependenciesFirst` returns every item, with `groups` for cycles;
  - their callers follow in the same change (the pre-commit hook runs every suite): the registry
    API's 409 mapping, `bulk-release.ts` and `plugin-feed.ts` stop reading `cycle`.

  *Done when:* core tests cover A ↔ B, a cycle of three, two cycles joined, and a pair dropped when
  nothing reaches it any more; the tests that asserted refusal assert the new rule; the API and
  plugin-feed tests pass with a cycle.

- [ ] **3. Submit's checks.** In `registry-checks.ts`: no cycle error, the `dependency_cycle`
  warning, and `dependency_draft` for the author's own draft (`DependencyDraftError`). Save
  (#142), the canvas and the dependency marks show the same.
  *Done when:* the registry-checks tests and the submissions db tests cover a cycle through
  submissions in review, the warning's words, and an own draft versus another author's, on the four
  databases.

- [ ] **4. Submit with its drafts.** [risky] The service: 056's `withDependencies` and `withIncoming`
  count all of a batch's drafts as on their way while checking, and a cycle's members are submitted
  all or none. The item's Submit dialog (`SubmitDialogs.tsx`): the list of drafts it needs, the
  **Submit with N drafts** button, the outcome for each; an inline helper.
  *Done when:* db tests cover submitting A with its draft B, a cycle A ↔ B, a cycle one of whose
  members isn't ready (none submitted), on the four databases; component tests cover the dialog's
  list and button.

- [ ] **5. Release together.** [risky] `publish.ts` splits into preparing (pack and store each
  artifact) and recording (the database rows), so a cycle's versions are recorded in one
  transaction, each range checked against the versions going out. The Release dialog of a cycle
  member releases its cycle; `bulk-release.ts` releases a cycle as one unit.
  *Done when:* db tests cover releasing A ↔ B from one dialog, a member not approved (refused, with
  why), a failure while recording (nothing released), and bulk release with a cycle and something
  depending on it, on the four databases.

- [ ] **6. The order hints.** `rmk submit`, `rmk export` and the MCP tools say "released together"
  for a cycle.
  *Done when:* the CLI and MCP tests cover a cycle's hint.

- [ ] **7. End to end.** Two drafts that need each other: submitted together from one item's page,
  approved, released together from one Release dialog, then installed with `rmk`.
  *Done when:* `pnpm test:e2e` passes on desktop and phone.

- [ ] **8. Documentation.** The topics in the spec (en, pt, fr) in a ronne-web branch that goes live
  with the release, and the Submit dialog's helper.
  *Done when:* the pages say what tasks 2–6 do, and the docs tests pass in ronne-web.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
