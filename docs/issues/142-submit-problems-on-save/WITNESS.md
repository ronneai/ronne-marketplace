# #142 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The service

Witnessed: 2026-10-08 14:07 EDT, by a fresh agent (blind). Commit: 7338c2f. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: actions/drafts.ts, services/drafts.ts, actions/registry.db.test.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `saveDraftFiles` returns `submitIssues`, computed by `registryIssues` on the saved draft | yes | confirmed | `services/drafts.ts` save returns `submitIssues: await submitIssuesOf(deps, draft, limits)`, which calls `registryIssues(deps.repo, registry, draft, draft.files)`. Scratchpad copy with save forced to `submitIssues: []` → 3 of the #142 tests fail (range, cycle, failing read) |
| 2 | For a change proposal, the save's `submitIssues` also include `noChangeIssues` | no | confirmed | `submitIssuesOf` adds `noChangeIssues` when `draft.proposal && deps.storage`; the action now passes storage (`actions/drafts.ts`, `bound(headers, app, storage)`). Probe saving a proposal's README unchanged → `no_changes`, the same as `checkSubmission`; after a real change → `[]`. SQLite and PostgreSQL. No repo test yet (finding 2) |
| 3 | Save and `uploaded()` share one helper | yes | confirmed | `grep submitIssuesOf` → defined once, used by save and by `uploaded`; the inline copy in `uploaded` is gone, and `UploadedDraft` inherits `submitIssues` from `SavedDraft` |
| 4 | A failure in the checks is caught and returned as one warning, and the save isn't thrown | yes | confirmed | `submitIssuesOf` catches, logs with `console.warn`, returns `[REGISTRY_CHECKS_FAILED]` (warning). Mutating it to `throw error` → "still saves when the registry checks fail" fails (1 failed, 13 passed) |
| 5 | The range error uses Submit's words: "No published version of @team/db matches ^9.0.0." | yes | confirmed | `registry.db.test.ts` "shows a range no published version matches" asserts the exact issue (`dependency_range`, `/dependencies`, `ronne.yaml`) and that it equals `checkSubmission`; fixed and saved again → `[]` |
| 6 | The cycle error uses Submit's words: "The dependencies go round in a circle: …" | yes | confirmed | Test "shows a cycle the save closes" asserts `[dependency_pending, dependency_cycle]` and `The dependencies go round in a circle: @team/loop → @team/helper → @team/loop.` |
| 7 | A clean draft gets no `submitIssues` | yes | confirmed | Test "returns nothing for a clean draft" asserts `issues` and `submitIssues` are both `[]` |
| 8 | When the registry read fails, the save still stands | yes | confirmed | Test "still saves when the registry checks fail": a repo whose `registry()` throws → `submitIssues == [REGISTRY_CHECKS_FAILED]`, and the re-read `ronne.yaml` contains `^9.0.0` |
| 9 | These db tests pass on the four databases | yes | confirmed | `vitest run registry.db.test.ts` → 14 passed (SQLite); `pnpm test:db:postgres`, `:mysql`, `:mariadb -- registry.db.test.ts` → 14 passed each |
| 10 | The change type-checks and lints | no | confirmed | `pnpm --filter @ronneai/web typecheck` → clean; `biome check` on the submissions domain → 2 warnings, both in files outside the diff |

**Overall:** met: every claim holds. Findings, none blocking: (1) one `try` around both checks drops the registry's issues when only the no-change read fails, and the warning then says the name and dependencies weren't checked; (2) no repo test covers `no_changes` on save; (3) the helper's comment says "never thrown", but `uploaded()` still reads the registry outside it for `staleVersion` (out of scope).

### Re-check — after the fixes for findings 1–3

Witnessed: 2026-10-08 14:17 EDT, by a fresh agent (blind). Commit: 7338c2f. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: actions/drafts.ts, actions/proposals.db.test.ts, actions/registry.db.test.ts, services/drafts.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 11 | When only the no-change check fails, the registry issues are kept and one warning is added | yes | confirmed | `submitIssuesOf` runs each check in its own `guarded` try/catch with one `failed` flag, and returns `[...issues, REGISTRY_CHECKS_FAILED]`. Mutating it to `failed ? [REGISTRY_CHECKS_FAILED] : issues` → "keeps the registry's issues when the base version can't be read on save (#142)" fails (1 failed, 29 passed) |
| 12 | The warning is accurate for either failure | yes | confirmed | `services/drafts.ts:305-309`: "Some of Submit's checks couldn't run. Save again, or Submit will run them." |
| 13 | A test covers `no_changes` on save | yes | confirmed | `proposals.db.test.ts` "says on save that it changes nothing, as Submit would (#142)": `["no_changes"]`, equal to `checkSubmission`; after a real change → `[]`. Skipping the no-change check → 2 failed, 14 passed |
| 14 | A test covers a failing base read keeping the registry issue | yes | confirmed | `proposals.db.test.ts` "keeps the registry's issues when the base version can't be read on save (#142)": storage `get` throws → `["dependency_not_found", "registry_checks_failed"]`; the mutation in row 11 makes it fail |
| 15 | The helper's comment no longer over-promises for `uploaded()`'s staleVersion read | yes | confirmed | The comment says "A check that fails is one warning, never thrown, and the other's issues stay", about the helper's two checks only; `uploaded()`'s `staleVersion` read (`services/drafts.ts:628`) stays out of scope |
| 16 | The submissions db tests still pass on the four databases | yes | confirmed | `vitest run --project db src/server/domains/submissions` → 22 files, 221 passed (SQLite); `pnpm test:db:postgres` / `:mysql` / `:mariadb -- src/server/domains/submissions` → 221 passed each |
| 17 | The change type-checks and lints | no | confirmed | `pnpm --filter @ronneai/web typecheck` → clean; `biome check $(git diff --name-only)` → 4 files, no fixes, no warnings |

**Overall:** met: a failed check keeps the other check's issues and adds one accurate warning, both new #142 tests fail when the fix is removed, and the submissions db tests pass on SQLite, PostgreSQL, MySQL and MariaDB.

## Task 2 — The draft page's first load

Witnessed: 2026-10-08 14:22 EDT, by a fresh agent (blind). Commit: 577d252. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: page.tsx, draft-editor types and test, submissions actions/services drafts.ts, registry.db.test.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The page load uses the same helper that a save and an upload use | yes | confirmed | `services/drafts.ts:278-282`: `draftSubmitIssues` = `submitIssuesOf(deps, await getDraft(...))`; save (`:486`) and upload (`:643`) call the same `submitIssuesOf`. `actions/drafts.ts:124-130` binds it with `instanceStorage`, so the proposal no-change check runs too |
| 2 | The draft page calls it on first load for the author's own editable draft | yes | confirmed | `page.tsx:124-127` gates it on `mine && member && isEditable(status)` (`status.ts:69`). Page test "checks what Submit would refuse on load…" passes; with the gate replaced by `false` in a scratch copy it fails (1 failed / 22 passed) |
| 3 | The page passes the issues into the editor | yes | confirmed | `page.tsx:55,58,154` passes `submitIssues` through `toEditorDraft` to `DraftEditor`; `types.ts:51-55` adds `submitIssues?: ManifestIssue[]`. A scratch probe mocking one `dependency_range` issue found it on `draft.submitIssues`. No repo test covers the passing yet (note 1) |
| 4 | A db test shows a blocked draft's issues with no save | yes | confirmed | `registry.db.test.ts` "tells a draft opened later…": `draftSubmitIssues` on a `^9.0.0` draft → `["No published version of @team/db matches ^9.0.0."]`, equal to `checkSubmission`; a clean draft → `[]`. SQLite 38/38 (with the page test); `pnpm test:db:postgres` / `:mysql` / `:mariadb -- registry.db.test.ts` → 15/15 each. Service returning `[]` in a scratch copy → the test fails |
| 5 | The draft stays private to its author | yes | confirmed | The db test expects `draftSubmitIssues(asModerator, blocked)` → `SubmissionNotFoundError` (`ownSubmission`, `drafts.ts:92`). The page test checks no call for `mine:false` or `member:false`; dropping `draft.mine` from the gate fails it |
| 6 | Types and lint are clean for the change | no | confirmed | `pnpm --filter @ronneai/web typecheck` → no errors; `biome check` on the changed dirs → 2 warnings, both in unchanged files |

**Overall:** met: the page load runs the save's own `submitIssuesOf` for the author's editable draft and passes the result to the editor; a db test on all four databases shows a blocked draft's issues with no save. Notes, not bugs: (1) no test yet checks the page passes the issues to the editor (task 3's page test covers it); (2) the `isEditable` part of the gate is checked by reading only; (3) no test has a draft that becomes blocked after its last save; the helper recomputes on every load.
