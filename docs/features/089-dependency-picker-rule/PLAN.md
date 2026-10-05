# 089 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Your own items, by query.** A repository method for the author's submissions in
  `draft`, `submitted`, `changes_requested` and `approved` matching a name fragment and types;
  `findDependencies` (`services/dependency-search.ts`) uses it instead of `listForReview` and drops
  others' open submissions. Your own published items are looked up by name as well as through the
  catalogue's top 12.
  *Done when:* `dependency-search` db tests cover mine in each state, others' open (not offered),
  others' published (offered) and my published item past the catalogue's top 12.

- [x] **2. The check at submit.** `dependencyIssues` (`services/registry-checks.ts`) counts an
  unreleased dependency only when its open submission's author is the submitter; another author's
  gives the new error code `dependency_not_published`. Resubmit runs the same check; release is
  unchanged.
  *Done when:* registry-check tests cover mine (warning), others' (error), and released (passes),
  on the four databases (`pnpm test:db:up`).

- [ ] **3. The canvas.** `searchDependencies` (`services/composer.ts`) returns the same options as
  task 1, and the canvas shows the status badge on unreleased nodes.
  *Done when:* composer tests and the canvas component test pass.

- [ ] **4. End-to-end.** A user can't pick another user's skill in review, can pick it once it's
  released, and can pick their own draft from the form, `@` and the canvas.
  *Done when:* the Playwright test passes on desktop and phone.

- [ ] **5. Decisions and Documentation.** 056's decision 4 points here; MVP §15's "Dependencies on
  export" row says "your own open submission, or a release"; the ronne-web topics and the helper in
  the spec's Documentation section.
  *Done when:* the docs render tests pass in ronne-web, and the helper test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 1.** "Your published items" are the items whose `owner_id` is you (you published their
  first version), found with the catalogue's new `ownerId` filter, so rank doesn't matter. The
  service reads `catalogue.list` directly; its scan is capped at `API_PAGE_MAX`. Your unreleased
  items (`listOwnUnreleased`) match by `@scope/name` only, since a draft's description lives in its
  `ronne.yaml`; published ones also match description and keywords. Task 3 decides whether the
  canvas needs more.
- **Task 2.** `dependencyIssues` takes the submitter (`authorId`). At submit, only their own open
  submission counts; at release, and in the cycle walk, anyone's still does, as in 056, so a
  submission left from before 089 is refused at release with "Release it first" as before.
  `NamedSubmission` carries `authorId`. The review tests make a left-over with `leftOver`, which
  rewrites a submitted revision's `ronne.yaml`, since 089 no longer lets one be submitted.
