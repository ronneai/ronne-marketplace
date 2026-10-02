# 056 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **0. Decisions.** The owner settles whether another author's open submission counts as a
  dependency on its way, and the spec is updated before anything is built.
  *Done when:* the spec has no open question that changes what's built.

- [x] **1. The submit rule.** `RegistryLookup` finds open submissions by name (type and latest
  revision's dependencies); `dependencyIssues` accepts one with the warning, keeps the range check
  for releases, and follows open submissions for cycles.
  *Done when:* `registry-checks.test.ts` covers released, on its way, draft-only, rejected,
  withdrawn, wrong type, a range a first release can't match, and a cycle through open submissions;
  `registry.db.test.ts` covers the lookup on every database.

- [x] **2. Marks.** A function that computes **Waits on** and **Blocked** for a set of submissions,
  used by My submissions, the queue, the review page and the submission page.
  *Done when:* unit tests cover each mark, a chain, and a replaced dependency; the pages render
  them.

- [x] **3. Release gate.** 015's publish refuses a dependent whose dependency isn't released with a
  matching version, naming it; **Publish** is disabled with the mark. 055 isn't built yet, so its
  part (selecting approved dependencies with a dependent, refusing ones waiting on review) moved to
  055's task 2.
  *Done when:* `registry.db.test.ts` covers the release refused, then allowed once the dependency is
  released, on every database; `review-page.test.tsx` covers Publish disabled.

- [x] **4. Bulk submit includes dependencies.** 052's `submitMany` adds the person's own ready
  dependency drafts first; the web selection, `rmk submit` (**Included**, `--no-deps`) and
  `submit_drafts`.
  *Done when:* `bulk-submit.db.test.ts` and `submit.test.ts` cover the inclusion and the flag.

- [ ] **5. Rejecting a dependency.** `request_changes` from `approved`; the dependents query; the
  reject dialog with the list, the checkbox and the prefilled message; each dependent decided in its
  own transaction with `cause`; the withdraw confirmation's count.
  *Done when:* `reviews.db.test.ts` covers ticked, unticked, a moderator's own dependent, one that
  moved on, and an approved dependent; `status.test.ts` covers the new move.

- [ ] **6. End to end.** A skill and an agent that uses it, submitted together, approved, released
  in one batch; then rejecting the skill sends the agent back.
  *Done when:* the Playwright test passes.

- [ ] **7. Documentation.** The sections and helpers in the spec's Documentation section.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
