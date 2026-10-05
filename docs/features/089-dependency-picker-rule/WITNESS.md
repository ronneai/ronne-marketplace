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
