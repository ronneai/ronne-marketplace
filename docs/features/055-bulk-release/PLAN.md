# 055 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **0. Decisions.** The owner settles the To release tab and the bump default for change
  proposals, and the spec is updated to match before anything is built.
  *Done when:* the spec has no open question that changes what's built.

- [x] **1. Settings for many.** A pure function that takes the settings and each submission's
  published versions and suggested bump, and returns each version and tag, or why not (`nextVersion`,
  `defaultTag`, `tagProblem`, `suggestBump`), shared by the dialog's preview and the server.
  *Done when:* unit tests cover first releases, suggested and forced bumps, pre-releases, a custom
  tag, and a pre-release tagged `latest`.

- [ ] **2. Domain.** `releaseMany` in the `submissions` service over 015's `publishSubmission`:
  releasable check, dependency order (a sort in `packages/core`, which `rmk`'s `releaseOrder`
  then uses too), selecting a dependent's approved dependencies with it and refusing one waiting on
  review (056's release rule, moved here from 056's task 3), `skipped` for dependents of a failure,
  the result kinds, `via: "bulk"` in the audit metadata, and the 50 limit. An action for a session.
  *Done when:* `bulk-release.db.test.ts` covers a dependency and its dependent in one batch, a
  failed dependency, two proposals for one item, a user releasing someone else's, two releases at
  once, a yanked dependency, and the audit, on every database.

- [ ] **3. My submissions.** Checkboxes on releasable approved rows, **Select all approved**,
  **Release selected**, separate from 052's draft selection, and the dialog (settings, preview in
  release order, results).
  *Done when:* `submissions.test.tsx` covers the selection and the dialog's preview and results.

- [ ] **4. The review queue.** The **To release** tab (`approved`, oldest first, who approved and
  when), with the same selection and dialog; **Decided** without `approved`.
  *Done when:* `reviews.test.tsx` and `queue.db.test.ts` cover the tab, and a Playwright test
  releases a skill and an agent that depends on it in one batch, then installs the agent with `rmk`.

- [ ] **5. Documentation.** `versions#semver`, `versions#bump`, the new `versions#release-many`,
  `review#statuses`, `changes#release`, and the two helpers.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
