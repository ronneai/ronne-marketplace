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

- [x] **3. Submit and withdraw services.** Submit (011's checks on saved files, then the registry
  checks, then the status change and audit event in one transaction), withdraw, read access for
  `submissions.view_submitted`, and the editor refusing non-drafts.
  *Done when:* database tests cover submit, refused submits, the concurrent-name case, withdraw from
  each allowed state, the audit events, and who can see what.

- [x] **4. Pages.** Submit with its confirmation and check results, the read-only view, withdraw,
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
- **Task 3 (2026-09-28): submit and withdraw services.**
  - `services/submissions.ts`: `viewSubmission` (the author, or moderators and root once it isn't
    a draft), `checkSubmission` (what submitting would say, for the confirmation), `submitDraft`
    and `withdrawSubmission`. Audit events `submission.submitted { name, type, dependencies }` and
    `submission.withdrawn { name, from }`, a `submission` group and target type, and the
    `submissions.view_submitted` permission (moderator, root).
  - **Concurrent submits.** Inside the transaction, submit locks the scope's row
    (`forUpdate` in `db/locks.ts`: `SELECT … FOR UPDATE`, nothing on SQLite, whose writers already
    run one at a time), then checks the name. The test of two simultaneous submits caught a race on
    MySQL and MariaDB: their REPEATABLE READ snapshot, taken at the transaction's first read, hid
    the other submit's commit from the name check that ran after the lock. The submissions
    repository now runs its transactions at READ COMMITTED (`readCommittedTransaction`, PostgreSQL's
    default), and the test passes on all four databases, repeatedly.
  - Database tests: a valid submit (frozen afterwards: no save, rename, delete or second submit),
    refused submits with their issues, the name held by an open submission and freed by withdrawing
    it, dependencies in M2, withdraw from each allowed status (and not twice, or once approved),
    the audit events, and who can submit, withdraw and view.
- **Task 4 (2026-09-28): pages.**
  - The editor page loads through `viewSubmission` and gives the editor `readOnly`, `canSubmit`
    and `canWithdraw` (from `isEditable` and `canTransition`). Read-only, it shows a notice
    (submitted, withdrawn, or someone else's), hides Save, Settings and the file tools, disables
    the form with a `<fieldset disabled>`, and makes CodeMirror read-only (`EditorState.readOnly`
    and `EditorView.editable`). The Problems panel still shows the checks.
  - `SubmitDialogs.tsx`: **Submit for review** asks to save unsaved changes first, then runs
    `checkSubmission` on the saved files and lists the results; Submit is only enabled with no
    errors. **Withdraw** confirms first ("It can't be undone"). Both reload the page, which remounts
    the editor in its new state.
  - My submissions: status filter chips with counts (`?status=`), shown once there are two
    statuses, and withdrawn submissions last.
  - **Found on the way:** the shared `Dialog` used a fixed `id="dialog-title"`, so with the leave
    guard on the page, the submit dialog was announced by the other dialog's title. Each dialog
    now gets its own id (`useId`), with a test. Disabled inputs now look disabled (`inputClasses`).
  - Playwright (`e2e/submit.e2e.ts`): a skill draft with its two placeholder descriptions fixed,
    saved (submit asks first), submitted after "All checks passed", read-only, then withdrawn. The
    e2e seed now creates a scope (`E2E_SCOPE`), since root already signs in 5 times per run, the
    per-email limit a minute.
