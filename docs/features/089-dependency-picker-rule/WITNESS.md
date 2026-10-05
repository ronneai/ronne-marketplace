# 089 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, a fresh agent that didn't do the work checks it: it gets the task's *Done
when*, the claims in the notes and where to look, runs the commands itself, and reports each claim as
confirmed, partly or not met (owner, 2026-10-04). A task is ticked only when every claim holds.
Its record lands here, in the same commit as the task. Differences it finds are fixed in the notes
in that commit.

## Task 1 — Your own items, by query

Witnessed: 2026-10-05 19:17 EDT, by a fresh agent. Machine: macOS 27.0.1 (Darwin), Node v24.0.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | A repository method returns the author's drafts and open submissions (submitted, changes_requested, approved), filtered by types and a name fragment, without change proposals | confirmed | `git diff` → `listOwnUnreleased` in `submission-repository.ts` and `kysely-submission-repository.ts`: `author_id`, `status in ["draft", ...OPEN_STATUSES]`, `item_id is null` (no proposals), `type in types`, the catalogue's `@scope/name` match on `scopes.name` / `submissions.name`; `[]` for no types; `updated_at desc, id desc` with a limit. |
| 2 | findDependencies no longer calls listForReview and never offers another author's unreleased submission | confirmed | `listForReview`, `OPEN_SCAN`, `nameMatches` and `listByAuthor` are gone; the only unreleased source is `listOwnUnreleased({ authorId: me })`; others come only from `catalogue.list` (published). The db test "never offers others' drafts or items in review, approved or sent back" passes. |
| 3 | Your own published items are found by owner whatever their catalogue rank ("own" = `items.owner_id`, first published by you) | confirmed | `CatalogueFilter.ownerId` → `items.owner_id = ownerId`; `publish.ts:133-142` sets the owner only on an item's first publish. Owner-filtered first, then unreleased, then everyone's published, as the spec's table says. A proposal's item shows as published (`mine: false`), as the spec says. |
| 4 | The db tests cover mine in each state, others' open (not offered), others' published (offered), mine past the top 12 | confirmed | Test 1: mine published, approved, changes_requested, submitted, draft, and another's published `@infra/lint`, in the spec's order. Test 2: another's draft, submitted, approved, changes_requested → `[]`. Test 3: mine published first, then 13 of another's → 12 options, `@team/mine` first. |
| 5 | The tests pass on SQLite, PostgreSQL, MySQL and MariaDB, and the picker's unit tests pass | confirmed | `vitest --project db …dependency-search.db.test.ts` → 5/5; `scripts/test-db.mjs {postgres,mysql,mariadb}` → 5/5 each; `vitest run src/features/draft-editor/dependency-picker` → 6/6. |
| 6 | `pnpm typecheck` passes and `pnpm lint` has no errors | confirmed | typecheck → 7/7 tasks; lint → 43 warnings, 3 infos, 0 errors; `biome check` on the 8 changed files is clean (the warnings are elsewhere). |
| 7 | Nothing else used the removed `author` field | confirmed | `DependencyOption` users (`DraftEditor.tsx`, `DependencyField.tsx`, `actions.ts`, `model.ts`, the test) don't read `.author`; no e2e text expects "by <name>". |

**Not checked here:** the canvas, the submit check, the Documentation and helpers (later tasks); the
full `pnpm test` and `pnpm build` (the pre-commit hook runs them); the end-to-end tests (task 4).
**Differences from the notes:** the service calls `catalogue.list` directly instead of
`searchCatalogue`, so it no longer took that function's page-size clamp; `submissions.create` is
still required. Fixed in this commit: the scan is capped at `API_PAGE_MAX` (100) however long
`exclude` is, and the loop stops once the list is full. Your unreleased items match by `@scope/name`
only, while published ones also match their description and keywords (noted in the plan for task 3).
**Overall:** met. The repository method, the service and the db tests do what task 1 asks, on all
four databases.

## Task 2 — The check at submit

Witnessed: 2026-10-05 19:23–19:27 EDT, by a fresh agent. Machine: macOS 27.0.1 (Darwin 27.0.0), Node v24.0.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | `dependencyIssues` requires the submitter and counts only their own open submissions; another author's alone gives `dependency_not_published` with the exact message | confirmed | `input.authorId: string` required; with no item and nothing pending the order is `dependency_closed`, `dependency_not_published`, `dependency_not_found`; `DependencyNotPublishedError` says "… isn't released yet. You can depend on someone else's item once it's published."; asserted in the unit test (`@infra/deploy`, `@infra/ready`, `@team/shared`) and the db test (`submitDraft` throws). |
| 2 | Both open: the submitter's counts (`dependency_pending`) | confirmed | Unit test `@team/both` → `["dependency_pending"]`. |
| 3 | A published item with only another author's proposal open: the published versions decide at submit | confirmed | `@team/github` `^1.0.0` → `[]`, `^2.0.0` → `["dependency_range"]`. |
| 4 | Rejected or withdrawn with nobody open stays `dependency_closed`; nothing gives `dependency_not_found` | confirmed | `closed` still from anyone's open; 056's tests pass. |
| 5 | Resubmit runs the same check; release unchanged | partly | Resubmit: `submitDraft` handles both through `allIssues` → `registryIssues` (same path); no test resubmits one. Release: a left-over dependency on another author's item gave `dependency_not_published` instead of 056's `dependency_unreleased` (see the re-check). |
| 6 | Every caller passes the right author | confirmed | `registryIssues` → `submission.authorId` (submit, resubmit, release, upload advice); composer → the actor; bulk submit's in-batch lookup → the draft's author (the actor's own), and `bulk-submit.db.test.ts` "includes the person's own dependency drafts" still passes. |
| 7 | "Already in review" untouched: marks and a rejected dependency's dependents | confirmed | `dependency-marks.ts` and `reviews.ts` unchanged; the `leftOver` helper rewrites a submitted revision's `ronne.yaml`, which is exactly what marks and dependents read, so it fairly stands for a submission from before 089. |
| 8 | Tests pass on the four databases | confirmed | SQLite unit + db: 314 passed; PostgreSQL, MySQL, MariaDB: 164 each. |
| 9 | typecheck and lint | confirmed | typecheck 7/7; lint 0 errors (43 warnings, as on main). |

**Not checked here:** the full `pnpm test` and `pnpm build` (the pre-commit hook runs them); an actual
resubmit of a `changes_requested` submission; the canvas (task 3).
**Differences from the notes:** release wasn't exactly unchanged (claim 5), and the cycle walk at
submit stopped at another author's open submission, so a cycle through a left-over could go
unreported. Both fixed before the commit; see the re-check.
**Overall:** met apart from claim 5, fixed below.

### Re-check after fixes

Witnessed: 2026-10-05 19:30–19:33 EDT, by a fresh agent.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `OnItsWay` has `anyOpen` and `mine`; `pending` is `(release ? anyOpen : mine)[0]`; `dependency_not_published` only when nothing is pending and someone else's is open; the cycle walk uses `anyOpen` | confirmed | `git diff` of `registry-checks.ts` shows exactly that; `next()` gives `anyOpen[0]?.dependencies` at submit and `null` at release, as before. |
| 2 | Tests for (a) release with another author's open → `dependency_unreleased`, (b) a cycle through another author's open → `dependency_cycle`; the earlier 089 cases hold | confirmed | Both new tests fail if the fix is undone (with `mine` at release, (a) gives not_published; with `mine` in `next()`, (b) finds no cycle). The earlier cases still pass. |
| 3 | At release, a published item with only another author's proposal and an unmatched range | confirmed (same as before 089) | Gives `dependency_unreleased`, as at HEAD. Not tested then; an assertion pinning it (`@team/github` `^2.0.0` at release) was added in this commit. |
| 4 | Tests, typecheck, lint | confirmed | SQLite 315 passed; PostgreSQL, MySQL, MariaDB 164 each; typecheck 7/7; lint 0 errors. |

**Overall:** both gaps fixed. A release goes by anyone's open submission, as in 056; the cycle walk
goes through any author's; 089's submit rule is unchanged.

## Task 3 — The canvas

Witnessed: 2026-10-05 19:40–19:45 EDT, by a fresh agent. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | The picker's first page: your own items first (published whatever their rank, then drafts and open submissions), then others' published; later pages don't repeat yours; others' unreleased never | confirmed, with differences | `searchDependencies` uses the shared `ownDependencies`, puts `mine` only on the page without a cursor and drops those names from every catalogue page; the db test checks the order, no repeat across pages, and root's draft and submission absent. |
| 2 | Unreleased entries carry status and `mine`, version `1.0.0`, no tools; adding one writes `^1.0.0` | confirmed | `ComposerView.tsx:72` → `startingRange("1.0.0")` = `^1.0.0`; asserted in the db test. |
| 3 | `dependencyReports` gives your own unreleased one its status, drops 056's `dependency_pending` only for those; another author's gets `status: null` and the not-published problem | confirmed | Exact-name lookup through `listOwnUnreleased`, only when the catalogue doesn't list it; db test for `tone`, `house` and `theirs`. |
| 4 | Node and panel: amber badge with the status for your own unreleased, red "not published" otherwise; picker shows "vX, yours" or the badge; the item page's canvas unchanged | confirmed | `Badge tone="warning"` (tokens) in `DependencyFactsLine`, passed `status` by the node and the panel; the item page's reports have no status, so it's red as before. |
| 5 | Tests, typecheck, lint | confirmed | 565 passed (SQLite, unit + db); 166 each on PostgreSQL, MySQL, MariaDB; typecheck 7/7; lint 0 errors. |
| 6 | No regressions in other users of the changed types | confirmed | `drag.ts` checks only `name` and `version`, so old and new dragged shapes behave the same; `ComposerDeps` is built only in `actions/composer.ts`. |

**Not checked here:** the app in a browser and the end-to-end tests (task 4); the Documentation
(task 5); the full `pnpm test` and `pnpm build` (the pre-commit hook runs them).
**Differences from the notes:** the canvas's first page can hold more than 12 (12 of yours
published, 12 unreleased, 12 others'), while the form caps the total at 12; the draft's own name is
left out in the browser, as before. A node for your own **draft** showed the amber badge beside a
red "isn't a published item or in review" problem. Changed, then put back (see both re-checks).
**Overall:** met.

### Re-check after fixes

Witnessed: 2026-10-05 19:45 EDT, by a fresh agent. The fix under test hid "not found" for your own
draft and labelled it "draft: submitted with this item".

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Only those two codes dropped, only for your own unreleased items | partly | For a draft, `dependencyIssues` stops at `dependency_not_found` (no type check, no cycle walk), so hiding it left a draft of a disallowed type, or one closing a cycle, with no problem at all. |
| 2 | Tests pin it | confirmed | db and component tests passed on all four databases. |
| 3 | "submitted with this item" is true | not met | The editor's Submit (`submitDraftAction` → `submitDraft`) refuses a draft whose dependency is the author's draft; only bulk submit (056) includes it. |
| 4 | SPEC matches the code | confirmed, with #3's caveat | |
| 5 | typecheck, lint | confirmed | |

**Overall:** not met; the fix was undone (below).

### Re-check after the draft fix was undone

Witnessed: 2026-10-05 19:50, by a fresh agent.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Only `dependency_pending` is dropped, only for your own unreleased item (exact name, lookup limit 100); a draft keeps "not found"; others' and published items unfiltered; own open submissions keep type, range and cycle problems | confirmed | `services/composer.ts` filter `!(own && code === "dependency_pending")`; db test: `house` keeps "…isn't a published item or in review. Submit it first…", `tone` has none, `theirs` keeps "isn't released yet…". |
| 2 | The spec's canvas paragraph matches the code and is right about Submit | confirmed | `submitDraft` throws on `dependency_not_found`; bulk submit includes your own dependency drafts first. |
| 3 | Tests, typecheck, lint | confirmed | 565 passed; 166 each on PostgreSQL, MySQL, MariaDB; typecheck 7/7; lint 0 errors. |
| 4 | The rest of task 3 | confirmed | Order, paging, `^1.0.0`, badges and the item page as in the first table. |

**Overall:** met. Risks noted in the plan: two of your own submissions with one name (the newest
gives the badge); more than 100 of your unreleased items matching a name; one query per unpublished
dependency.
