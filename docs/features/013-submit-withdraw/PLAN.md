# 013 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Status transitions.** The status list, the allowed moves (with the owner's withdraw
  decision), and the domain errors.
  *Done when:* a table test covers every allowed and refused move.

- [x] **2. Registry checks.** The `RegistryLookup` interface, the name check against open
  submissions, the dependency checks (exists, allowed type, range matches a published non-yanked
  version, no cycles), and the M2 lookup that finds no published items.
  *Done when:* unit tests with a fake lookup cover each failure and a passing graph, and a database
  test covers the open-submission name check.

- [ ] **3. Submit and withdraw services.** Submit (011's checks on saved files, then the registry
  checks, then the status change and audit event in one transaction), withdraw, read access for
  `submissions.view_submitted`, and the editor refusing non-drafts.
  *Done when:* database tests cover submit, refused submits, the concurrent-name case, withdraw from
  each allowed state, the audit events, and who can see what.

- [ ] **4. Pages.** Submit with its confirmation and check results, the read-only view, withdraw,
  and the status filters on My submissions.
  *Done when:* render and action tests pass, and the Playwright test in the acceptance criteria passes.

## Notes
- **Task 1 (2026-09-28): status transitions.** `models/status.ts` lists MVP §4.1's seven statuses
  and every action (`submit`, `resubmit`, `request_changes`, `approve`, `reject`, `withdraw`,
  `publish`), with the moves in one table; `transition(from, action)` returns the new status or
  throws `InvalidStatusTransitionError`, whose message says it in words ("A submission that's
  withdrawn can't be withdrawn."). The 014 and 015 moves are in the table too, so the table test
  covers all 7 × 7 pairs. `isEditable` (drafts only) and `OPEN_STATUSES` (the statuses that hold a
  name) live beside it. 012's `DraftNotEditableError` is now the spec's `SubmissionNotEditableError`,
  and the other errors the spec names are in `exceptions/errors.ts`.
- **Task 2 (2026-09-28): registry checks.**
  - `@ronneai/core` now exports manifest spec §3's table as `DEPENDENCY_TYPES`, with
    `mayDependOn` and `mayHaveDependencies`; the package check and the web form use it instead of
    their own lists. `ITEM_TYPES` moved to `item-types.ts` so `package-checks.ts` can import it
    without a cycle through `index.ts`. `highestMatching(versions, range)` wraps semver's
    `maxSatisfying`, for these checks and the resolver (020).
  - `repositories/registry-lookup.ts`: the `RegistryLookup` interface, and `unreleasedRegistry`,
    which finds nothing until 015.
  - `services/registry-checks.ts`: `nameIssues` (a published item, then an open submission, holds
    the name) and `dependencyIssues` (exists, allowed type, a non-yanked version matches, then no
    cycle). Each problem is an issue built from the spec's error class, so its message is the
    error's. The cycle walk follows the highest matching version and walks each item once.
  - `isNameProposed(scopeId, name, statuses, exceptId)` on the repository, tested on all four
    databases: drafts, closed submissions, other scopes and the submission itself never count.
