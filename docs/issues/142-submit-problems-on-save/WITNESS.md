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

## Task 3 — The editor

Witnessed: 2026-10-08 14:27 EDT, by a fresh agent (blind). Commit: 51d8918. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: draft-editor (DraftEditor, actions, types, issues, tests), validation (IssuesPopover and its test).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `saveDraftAction` returns `submitIssues` from `saveDraftFiles` | yes | confirmed | `actions.ts:52` destructures it, `:72` returns it; `types.ts:91` adds it to `SaveResult`; typecheck clean. No test covers it: `submitIssues: []` in a scratch copy → 130 passed |
| 2 | Kept from the page load, replaced on each successful save; typing doesn't re-query | yes | confirmed | `DraftEditor.tsx:199` `useState(draft.submitIssues ?? [])`; `setChecked` only in the save's success path (`:287`); the page remounts the editor on a new `updatedAt`. Not covered by a test: removing `setChecked` → 130 passed |
| 3 | The badge counts live and registry issues together | yes | confirmed | Probe: valid manifest plus registry `[warning, error]` → `Problems: 1 error, 1 warning`; the #142 test → `Problems: 1 error` |
| 4 | The file tree shows registry issues under ronne.yaml, including a missing file's or one with no file | yes | confirmed | Probe: an error about `SKILL.md` (not in the tree) and a warning with no file → `Show problems: 1 error, 1 warning` on ronne.yaml. Tree from live issues only → the #142 test fails |
| 5 | Each problem appears once, even when a check is on both sides | yes | confirmed | `issues.ts` `savedOnly` dedupes on severity, code, message, file and path. Probe: 4 live errors passed back as `submitIssues` → badge stays `4 errors`. `issues.test.ts` covers the overlap |
| 6 | While dirty, the registry issues are listed apart, marked "as of your last save", in `IssuesPopover` | yes | confirmed | `DraftEditor.tsx:387` `savedLabel={dirty && !readOnly ? AS_OF_SAVE : undefined}`; `IssuesPanel` puts the label between the lists (test checks the order). By reading only: the popover body doesn't render in static markup. Only the badge's popover marks them, not the tree's `FileIssues` |
| 7 | A clean draft still shows "No problems" | yes | confirmed | `draft-editor.test.tsx` #142 test: `submitIssues: []` → `Problems: No problems`, no tree icon |
| 8 | Submit's dialog doesn't change | no | confirmed | `git diff --stat` → `SubmitDialogs.tsx` untouched. The Submit button is now also held by registry errors ("Fix the error first.") |
| 9 | Done when: the component tests cover the merge, the marking and the clean case | yes | partly | 130 passed. Merge and clean case covered. Marking: only `IssuesPanel` with a made-up label; `savedLabel={undefined}` in the editor → 130 still passed |
| 10 | Typecheck and lint clean for the change | no | confirmed | `pnpm --filter @ronneai/web typecheck` → no errors; `biome check` on both folders → no fixes |

**Overall:** not met: the merge, the dedupe, the clean case and the save wiring work, but no test covers the editor marking registry issues while dirty (claim 9). Also: the save path (`setChecked`, the action's `submitIssues`) has no test; the tree's popover doesn't mark them.

### Re-check — claims 6, 9 and the tree marking

Witnessed: 2026-10-08 14:29 EDT, by a fresh agent (blind). Commit: 51d8918. Machine: macOS 27.0.1, Node v24.0.0. The editor's decisions moved into `editorProblems` (`issues.ts`); `FileIssues` takes `saved` and `savedLabel`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | While dirty, the registry issues are listed apart in `IssuesPopover`, marked "as of your last save" | yes | confirmed | `editorProblems` → `savedLabel: dirty && !readOnly && saved.length > 0 ? AS_OF_SAVE : undefined`, passed to `IssuesSummary` (`DraftEditor.tsx:383`). Scratch copy: dropping `dirty` → 1 test fails (`issues.test.ts`); dropping `!readOnly` → 1 fails; `IssuesPanel` ignoring the label → 1 fails (`issues-popover.test.tsx`) |
| 11 | The file tree's popover lists the registry issues apart under the same label | yes | confirmed | `DraftEditor.tsx:568-570` passes `byFile.get(path).live`, `.saved` and `problems.savedLabel` to `FileIssues`, which counts both (test: `Show problems: 1 error` with `saved` only). Dropping `saved` from the tree → the #142 editor test fails. `FileIssues` passing the label to `IssuesPanel` is untested |
| 9 | Done when: the component tests cover the merge, the marking and the clean case | yes | confirmed | 133 passed. Merge: dropping the dedupe → 2 fail; a missing file's issue sent elsewhere → 1 fails. Marking: as in claim 6. Clean case: `issues.test.ts` and the editor test. `savedLabel={undefined}` at both editor call sites still passes: that needs a DOM, left to task 4's Playwright test |
| 10 | Typecheck and lint still clean | no | confirmed | `pnpm --filter @ronneai/web typecheck` → no errors; `biome check` on both folders → no fixes |

**Overall:** met: the merge, the marking (badge and tree) and the clean case are each covered by a test that fails when broken. The JSX props passing the label, and the save round trip, are left to task 4's Playwright test, which opens the badge while dirty.

## Task 4 — End to end

Witnessed: 2026-10-08 14:47 EDT, by a fresh agent (blind). Commit: 8531243. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: e2e (frontmatter-agent, users, new submit-problems*.ts), draft-editor (DraftEditor, issues, test), SPEC.md. Mutations ran in a scratchpad copy built with `next build --webpack` (Turbopack couldn't resolve modules there); an unmutated control build passed on chromium and phone.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Done when: `pnpm test:e2e` passes on desktop and phone | yes | confirmed | `pnpm test:e2e` → 101 passed, exit 0; the #142 test passed in `[chromium]`, `[phone]`, `[phone-webkit]` and `[tablet]` (`playwright.config.ts`: desktop is `chromium`, phones `phone`/`phone-webkit`) |
| 2 | Saving a draft with `^9.0.0` shows Submit's error in the badge and the list | yes | confirmed | `submit-problems.ts`: "No problems" before the save, "Problems: 1 error" after, and the popover shows "No published version of @…/… matches ^9.0.0." Without `setChecked(result.submitIssues)` → fails at `submit-problems.ts:45` ("No problems"), chromium and phone |
| 3 | Opening a blocked draft shows the problem before any save | yes | confirmed | The test reloads and expects "Problems: 1 error". Page passing `submitIssues.slice(0, 0)` → fails at `submit-problems.ts:58` |
| 4 | While editing, the registry problems stay, marked "As of your last save", and the next save re-checks them | yes | confirmed | Edited to `^1.0.0`: still "1 error", `^As of your last save` and the error in the badge popover; saved → "No problems". `savedLabel={undefined}` on `IssuesSummary` (`DraftEditor.tsx:383`) → fails at `submit-problems.ts:64`, chromium and phone |
| 5 | Task 3's open wiring: the editor passes the label to the badge's popover | yes | confirmed | The mutation in row 4. Only the badge's popover is opened; the tree's `FileIssues` label (`DraftEditor.tsx:570`) isn't exercised in a browser |
| 6 | Task 3's open wiring: the action's `submitIssues` reaches the editor | yes | confirmed | The mutation in row 2: the badge after the save can only come from the server, since the same text showed "No problems" before it |
| 7 | Submit's dialog doesn't change: it checks again and refuses in the same words | yes | confirmed | The test opens Submit: the same `^9.0.0` message, its Submit button disabled. `git diff --stat` → no change to `SubmitDialogs` |
| 8 | Only 011's errors hold the Submit button (Behaviour, Decision 3) | yes | confirmed | `DraftEditor.tsx:246` counts `issues` (011's), not `problems.all`. Restoring `problems.all` → the e2e test times out clicking "Submit for review" (`submit-problems.ts:50`). The unit test expects `not.toContain("Fix the error first.")`; SPEC.md has the bullet and Decision 3 |
| 9 | The `frontmatter-agent.e2e.ts` edit is right against the spec | yes | confirmed | The agent dependency is submitted, not released, so the save shows Submit's pending warning, "Problems: 1 warning", and Submit still succeeds ("Warnings stay warnings"). Passed in the full run. It checks the count, not the warning's text |
| 10 | The new e2e user is seeded, and each project uses its own user and item | no | confirmed | `users.ts` adds `problemsAuthor`, seeded from `E2E_USERS` (`seed.ts:42`); mobile uses `mobileUser(testInfo, "member")` and `submit-problems-${project}`; `^1.0.0` matches the seeded `E2E_SKILL` 1.0.0 (`seed.ts:176`) |
| 11 | Unit tests and lint for the change | no | confirmed | `vitest run src/features/draft-editor` → 127 passed; `biome check` on the changed files → 36 files, no fixes |

**Overall:** met: the e2e test covers the `^9.0.0` save, the reload, the "as of your last save" marking, the re-check and Submit's dialog, on desktop and phone; removing the save round trip, the page-load issues, the badge label or the new Submit rule each makes it fail. Remarks, not blocking: the tree popover's label isn't exercised in a browser; the frontmatter-agent assertion checks the count only.

## Task 5 — Documentation

Witnessed: 2026-10-08 14:49 EDT, by a fresh agent (blind). Commit: dc12c50. Machine: macOS 27.0.1, Node v24.0.0. The website: ronne-web branch `bugfix/marketplace-142-problems-on-save`, then uncommitted, `www/src/content/docs/{en,pt,fr}/{items,review}.tsx` (committed unchanged as ronne-web b4f3ea8).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | review#checks (en): saving runs the registry's checks (the name, the dependencies, and for a change proposal whether it changes anything) | yes | confirmed | `services/drafts.ts:486` save returns `submitIssuesOf` = `registryIssues` (`registry-checks.ts:293-333`) plus `noChangeIssues` with storage (`actions/drafts.ts:133-139`). Rebase conflicts aren't checked on save and the docs leave them out. The parenthetical also omits the proposal type and skill-agent checks, which run; nothing it says is false |
| 2 | The dependency checks include cycles, and the submit dialog checks this | yes | confirmed | `registry-checks.ts:281-283` adds `dependency_cycle` (`errors.ts:191`); Submit uses the same `registryIssues` (`submissions.ts:175`) |
| 3 | The summary and the file icons show what Submit would refuse, in the same words, after each save | yes | confirmed | `DraftEditor.tsx:283` `setChecked(result.submitIssues)`; `IssuesSummary saved={problems.saved}` and `FileIssues` through `problems.byFile` (`issues.ts` `editorProblems`). `vitest run src/features/draft-editor src/components/validation` → 133 passed |
| 4 | …and when you open the draft | yes | confirmed | `page.tsx:124-127` calls `draftSubmitIssues` for your own editable draft; `DraftEditor.tsx:199` seeds `checked`. Unit test "shows a blocked draft's problem when it opens…"; e2e `submit-problems.ts:56-58` |
| 5 | While you edit, they stay listed under **As of your last save** until the next save checks again | yes | confirmed | `issues.ts:26` `AS_OF_SAVE`, shown when `dirty && !readOnly && saved.length > 0`; `IssuesPanel` lists them apart. e2e `submit-problems.ts:60-68`. `checked` is only set on save |
| 6 | **Submit for review** stays off for the editor's own errors or unsaved changes; the registry's problems don't turn it off | yes | confirmed | `DraftEditor.tsx:246-251`: `errorCount` counts only `validateDraft` issues, plus `dirty`, into `disabledReason`. Unit test: no "Fix the error first." when blocked by the registry. e2e `submit-problems.ts:50-53` opens the dialog with a registry error. Matches SPEC Behaviour |
| 7 | The submit dialog checks again, since something may have been released since the save | yes | confirmed | Submit runs `registryIssues` itself (`submissions.ts:175`); e2e line 52: same message, confirm disabled |
| 8 | items#canvas (en): after each save, the editor's problems list the node's dependency problems too, linking to review#checks | yes | confirmed | `dependencyIssues` inside `registryIssues`, saved into `checked`. `DocLink to="review" section="checks"`: the section exists in all three languages, and the link text matches each title |
| 9 | pt and fr say the same as en in both files, with UI labels in English | yes | confirmed | Read side by side: the same three paragraphs, parenthetical, Submit rule, cycle sentence ("formar um ciclo" / « former de cycle ») and canvas sentence; **Submit for review**, **As of your last save** and **● Unsaved changes** stay English |
| 10 | The website's checks pass | no | confirmed | `cd ronne-web/www && pnpm lint && pnpm typecheck && pnpm test src/content/docs` → Biome 206 files, no fixes; tsc clean; 5 passed |

**Overall:** met: in en, pt and fr, review#checks and items#canvas describe what tasks 1–3 do, and task 4's rule that only 011's errors hold Submit; every fact matches the code at dc12c50. Not run here: the Playwright tests (claims 4–7 rest on reading them and the code, plus the unit tests).

## Follow-up — phone-webkit in CI

CI on PR #149 failed in `phone-webkit` (WebKit on Linux): the test's Ctrl+A didn't select ronne.yaml, so the new manifest was added to the template ("Problems: 4 errors"), and the retry then hit the 5-a-minute sign-in limit of the shared phone user.

Witnessed: 2026-10-08 15:46 EDT, by a fresh agent (blind). Commit: dc12c50. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: e2e (submit-problems.ts, submit-problems.mobile.e2e.ts, mobile.ts, users.ts); HEAD was 2bf15c5, docs only after dc12c50.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | ronne.yaml is replaced without a platform select-all key | yes | confirmed | `submit-problems.ts:31-34`: `editor.click()`, `editor.selectText()`, `keyboard.insertText(text)`; grep finds no `ControlOrMeta+a` left |
| 2 | The replacement works where Ctrl+A means "start of line" (WebKit on macOS behaves as on Linux) | yes | confirmed | `pnpm test:e2e` → `[phone-webkit] submit-problems.mobile.e2e.ts` passed. Scratchpad copy with `keyboard.press("Control+a")` instead of `selectText()` → the new manifest lands inside the template: CI's failure reproduced on macOS WebKit |
| 3 | The flow fails clearly if the old text stays | yes | partly | First write: the `Control+a` swap fails at `submit-problems.ts:36` (`not.toContainText('description: ""')`). Second write only with `Control+a`: both manifests kept, and the test passed; both checks only look for the template's text |
| 4 | Each of phone, phone-webkit and tablet signs in as its own user, used by no other test | yes | confirmed | `mobile.ts:6-24` adds the role `problems` → `phoneProblems` / `phoneWebkitProblems` / `tabletProblems`; `users.ts:76-78` distinct emails; `submit-problems.mobile.e2e.ts:8`; `mobile-sweep` keeps `ROLES = ["member","moderator","root"]` |
| 5 | The new users exist in the e2e instance | no | confirmed | `seed.ts:42-55` creates every `E2E_USERS` entry with its `E2E_NAMES` (`users.ts:145-147`); the test passed on the three projects |
| 6 | A retry can still sign in (5 a minute per email) | yes | confirmed | `login-rate-limiter.ts:19-20,61`. Copy with a forced first failure, `playwright test --project phone-webkit --retries=1` → retry #1 passed ("1 flaky, 14 passed"); the same probe with the old `"member"` role → retry fails at `signIn`, as in CI |
| 7 | `pnpm test:e2e` passes on every project | yes | confirmed | "101 passed (2.4m)", the 4 `submit-problems` runs included, nothing flaky; `biome check` clean; typecheck passed |
| 8 | phone-webkit passes in CI (WebKit on Linux) | yes | can't check here | Needs the GitHub run after the push |

**Overall:** not met: the select-all fix and the separate users hold and the suite passes (101), but the old-text check covers only the first write (claim 3), and claim 8 waits for CI. Aside, outside this follow-up: a ronne.yaml with duplicate top-level keys showed "No problems".

### Re-check — claim 3 and the submit-problems runs

Witnessed: 2026-10-08 15:55 EDT, by a fresh agent (blind). Commit: dc12c50. Machine: macOS 27.0.1, Node v24.0.0. `write()` now polls for exactly one `type: agent` after each write.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The flow fails clearly if the old text stays, on either write | yes | confirmed | `submit-problems.ts:35-40`: one `type: agent`, no `description: ""`, the new text's last line present. Second-write `Control+a` probe → fails at the poll, "Expected: 1, Received: 2"; first-write probe → same; second write inserting nothing → fails at `toContainText('  "@e2e-seeded/secret-scanner": ^1.0.0')`, `^9.0.0` received |
| 7 | The four submit-problems runs, and the whole suite, still pass | yes | confirmed | `pnpm test:e2e` → exit 0, "101 passed (2.5m)", chromium, phone, phone-webkit and tablet included, nothing flaky; `biome check` clean; typecheck exit 0 |
| 8 | phone-webkit passes in CI (WebKit on Linux) | yes | can't check here | Still needs the GitHub run after the push |

**Overall:** not met: claim 3 holds on both writes and the suite passes here (101); claim 8 waits for phone-webkit on Linux in CI.
