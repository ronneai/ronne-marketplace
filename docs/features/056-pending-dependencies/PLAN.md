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

- [x] **5. Rejecting a dependency.** `request_changes` from `approved`; the dependents query; the
  reject dialog with the list, the checkbox and the prefilled message; each dependent decided in its
  own transaction with `cause`; the withdraw confirmation's count.
  *Done when:* `reviews.db.test.ts` covers ticked, unticked, a moderator's own dependent, one that
  moved on, and an approved dependent; `status.test.ts` covers the new move.

- [x] **6. End to end.** A skill and a bundle that uses it, submitted together (naming only the
  bundle), approved, and released skill first, with the bundle's Publish waiting until then;
  then rejecting a skill sends its bundle back. Releasing both in one batch is 055's end-to-end
  test.
  *Done when:* the Playwright test passes.

- [x] **7. Documentation.** The sections and helpers in the spec's Documentation section.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

- [x] **8. Dependency search.** The catalogue search matches the scope, and `@scope/name` parts;
  `findDependencies` over published items, the person's own submissions and others' open ones,
  with versions and `latest`; a server action.
  *Done when:* `dependency-search.db.test.ts` covers each source, allowed types, the item itself,
  a name both published and in review, and the scope match, on every database.

- [x] **9. The form's picker.** The dependencies field: a search box with the list, a version list
  per row (`latest` by default), rows written only when complete, existing rows kept.
  *Done when:* unit tests cover the range from a pick, and the field's rendering; a Playwright test
  picks a dependency and saves.

- [x] **10. `@` in markdown.** `@codemirror/autocomplete` (dependency policy checked) in the code
  editor for markdown files, over the same search; picking inserts the name and adds the
  dependency to the manifest.
  *Done when:* unit tests cover the completion source and the manifest change; the Playwright test
  types `@` in SKILL.md and picks one.

- [ ] **11. Documentation** for picking dependencies and `@`, and the helper.
  *Done when:* the docs render tests pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
