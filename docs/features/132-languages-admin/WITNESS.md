# 132 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Admin shell and namespaces

Witnessed: 2026-10-27 10:50 EDT, by a fresh agent (blind). Commit: 7cc64645 plus the uncommitted diff. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The admin pages' titles go through `pageTitle` in the person's language | yes | confirmed | `admin/metadata.ts` builds `adminTitle` and `settingsTitle` from `getTranslations("admin.pages")` and `pageTitle`; users, users/[id], audit and settings swap `metadata` for `generateMetadata` (git diff) |
| 2 | A three-language test of the admin shell exists and passes | yes | partly | `npx vitest run admin/metadata.test.ts src/i18n` → 340 passed; it covers titles only, not the navigation |
| 3 | The `admin` namespace grew in all three files with the same keys | yes | confirmed | `pages` (area, users, user, audit, settings) in `messages/{en,pt,fr}/admin.json`; parity tests in the green run |
| 4 | The English text is unchanged | yes | confirmed | Old titles "Users · …", "User · …", "Audit log · …", "Settings · Admin · Ronne AI Marketplace" equal the new English strings and the test's expected values |
| 5 | The admin navigation is translated | yes | partly | Labels come from `shell` (earlier work); no test of them in pt and fr in this diff |
| 6 | No new namespace is needed yet | yes | confirmed | `namespaces.ts` unchanged; `admin.json` is small |
| 7 | Lint is clean on the touched files | no | confirmed | `npx biome check "src/app/(app)/admin" messages` → no fixes needed |

**Overall:** not met (rows 2 and 5).

### Re-check (rows 2 and 5)

Witnessed: 2026-10-27 EDT, by a fresh agent (blind). Commit: 7cc64645 plus the uncommitted diff. Machine: macOS (Darwin), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | A three-language test of the admin shell exists and passes | yes | confirmed | New test "root's Admin links read in each language (132)" in `AppShell.test.tsx` renders the sidebar in en, pt and fr; `npx vitest run AppShell.test.tsx admin/metadata.test.ts` → 48 passed |
| 5 | The admin navigation labels are translated and tested | yes | confirmed | `messages/pt/shell.json:14-16` has the labels; mutation of pt "Registro de auditoria" to "Registro XX" → the new test and the older sidebar test failed; restored, `cmp` identical, `git status` clean |

**Overall:** met.

The witness listed the actions' words (task 11) and the Help entries (task 12) as out of scope, as the request said; they are not claims of this task.

## Task 2 — Users: the list and create

Witnessed: 2026-10-27 about 11:05 EDT, by a fresh agent (blind). Commit: 291361fe plus the uncommitted tree. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `UsersPage` (headers, filters, chips, roles, status, SCIM and erased badges, empty states, open and copy labels) reads from `admin.users` | yes | confirmed | `git diff UsersPage.tsx`; `vitest run src/features/admin-users` passes with pt and fr assertions |
| 2 | `CreateUserDialog`, `PasswordChoice`, `OneTimePassword` and `CopyEmailButton` have their text in messages | yes | confirmed | Diff; mutation putting `New password` back in `PasswordChoice.tsx` → biome "Text on the screen comes from the message files"; restored, `cmp` identical |
| 3 | No English is left in pt and fr (list, empty, filtered-empty, create form, one-time panel) | yes | confirmed | `englishLeaks` empty and `ownTextsShown` > 15 for pt and fr. The "Type one" branch of `PasswordChoice` is not rendered by a static test, so `new` and `length` are guarded by the lint rule and the parity test only |
| 4 | Counts of 0, 1 and 2 follow each language's rule | yes | partly | Only 1 in all three and 2 in fr were tested; 0 shows the empty state, not a count |
| 5 | Names and emails show as typed | yes | confirmed | pt render of `{count} <b>x</b>` and `{x}@example.com` → escaped, not interpolated |
| 6 | `/admin/users` is in `MIGRATED_ROUTES` | yes | confirmed | `e2e/pages.ts`, `pages-coverage.test.ts` pass; the Playwright sweep is run in task 13 |
| 7 | The raw-text scan covers the five components and the users `page.tsx` | yes | partly | All are in `biome.json`; a planted `aria-label` in `page.tsx` fires the rule. The `metadata.ts` entry did nothing (the plugins match JSX only) |
| 8 | Key parity holds and English is unchanged | yes | confirmed | Parity tests pass. One visible change: "It won’t be shown again" has a curly apostrophe, as the other English messages (`actions.test.tsx` updated) |
| 9 | `list.ts` has no screen text | no | can't check here | Not read in the first pass |

**Overall:** not met (rows 4, 7).

### Re-check (rows 4, 7, 9)

Witnessed: 2026-10-27 EDT, by a fresh agent (blind re-check). Commit: 291361fe plus the uncommitted tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Counts of 0, 1 and 2 follow each language's rule | yes | confirmed | `vitest run src/features/admin-users` → 71 passed; the test asserts 1 and 2 in en, pt and fr, and the empty-state text for 0 |
| 7 | The scan covers the five components and the users `page.tsx` | yes | confirmed | All files exist and are in `biome.json`; a planted `aria-label` in `page.tsx` → plugin error. The `metadata.ts` entry is removed from `biome.json` (the rule can't see a title string); its titles are covered by `admin/metadata.test.ts` (task 1) |
| 9 | `list.ts` has no screen text | no | confirmed | Read: list config, keys and enums only |

**Overall:** met.

The witness listed the actions' words (task 11) and the Help entries (task 12) as out of scope, as the request said; they are not claims of this task.

## Task 3 — A user's page and its actions

Witnessed: 2026-10-27 EDT, by a fresh agent (blind). Commit: 279b7784 plus the uncommitted tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The seven components read in en, pt and fr through messages | yes | confirmed | `git diff --stat`: all seven `.tsx` and the three `admin.json` changed; a grep of the seven for raw strings and text nodes found none |
| 2 | The raw-text scan covers `features/admin-users/**` and `app/(app)/admin/users/**` | yes | confirmed | `biome.json`; mutation: `<p>Raw English text</p>` in `EraseUserDialog.tsx` → "Text on the screen comes from the message files"; restored, `cmp` identical |
| 3 | Three-language tests exist for each dialog (reset, require change, reset two-factor, disable, erase, download) | yes | confirmed | `user-translations.test.tsx`, 15 tests; mutation: pt erase text set to English → 1 failed / 14 passed; restored, `cmp` identical |
| 4 | pt and fr leave no English behind | yes | confirmed | `englishLeaks` empty on the page, dialogs, erase, download and workspaces; `ownTextsShown` above the minimums |
| 5 | The root's own row and an SSO user read right | yes | confirmed | "Voici votre propre compte." (fr), "Root: todos os espaços de trabalho." (pt), "Gerenciado por Okta" (pt), the SCIM-managed disable form, the root erase notice |
| 6 | Counts of 0, 1 and 2 follow each language's plural rule | yes | confirmed | `admin.actions.impact`: en 1 and 2; pt 0 and 1; fr 0 and 2 (zero is singular in pt and fr, as CLDR) |
| 7 | Names and emails are shown as data | yes | confirmed | `{count} <b>x</b>` and `{x}@example.com` render escaped, braces untouched |
| 8 | `/admin/users/[id]` is in `MIGRATED_ROUTES` | yes | confirmed | `e2e/pages.ts` and `pages-coverage.test.ts` pass (the Playwright sweep runs in task 13) |
| 9 | Parity passes and English is unchanged | yes | confirmed | Full web suite: 416 files, 4882 passed; `biome check` 0 errors; `tsc --noEmit` clean. English changes: curly apostrophe in "This can’t be undone." (test updated) |

**Overall:** met.

The witness listed the actions' words (task 11) and the Help entries (task 12) as out of scope, as the request said; they are not claims of this task.

## Task 4 — Scopes and workspaces

Witnessed: 2026-10-27 11:20 EDT, by a fresh agent (blind). Commit: 37ba57b1 plus the uncommitted tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The scopes and workspaces tables, dialogs and `MoveScope` read through `admin.scopes`, `admin.workspaces` and `admin.move` in en, pt and fr | yes | confirmed | `git diff --stat`: the `.tsx` files and the three `admin.json` changed; `ScopesTable.tsx` uses `useTranslations` |
| 2 | The scopes table on a workspace's page is translated; `UNTIL_132` is gone and the e2e passes | yes | confirmed | `grep UNTIL_132 e2e src` → none; `playwright test e2e/languages-browse.e2e.ts --project=chromium` → 6 passed |
| 3 | The raw-text scan covers both folders | yes | confirmed | `biome.json`; mutation: raw JSX in `MoveScope.tsx` → "Text on the screen comes from the message files"; restored, `cmp` identical |
| 4 | Three-language tests exist and English is unchanged but for the stated deviations | yes | confirmed | `vitest run src/features/admin-scopes src/features/admin-workspaces` → 81 passed; parity 52 passed; `tsc` clean |
| 5 | Counts of 0, 1 and 2 follow each language's plural rule | yes | confirmed | Scopes 1 and 2, items outside 1 and 2, the move question; the empty state stands for 0 |
| 6 | Names, scopes and descriptions are shown as data | yes | confirmed | Tests with `{count} <b>x</b>` and typed item names |
| 7 | Deviation: curly apostrophes | yes | confirmed | Acceptable deviation. Typography only, as in task 3 |
| 8 | Deviation: "Personal (1,000+)" is grouped by the language | yes | confirmed | Acceptable deviation. en "1,000+", pt "1.000+" |
| 9 | Deviation: "(114)" dropped from the not-reviewed sentence | yes | confirmed | Acceptable deviation. A feature number that leaked into screen text |
| 10 | The translation tests fail if a pt/fr message goes back to English | yes | partly | Setting pt `scopes.search.label` and `.submit` to "Search" still passed: short texts are skipped by the leak helper and the new assertion used `toContain` |

**Overall:** not met (row 10).

### Re-check (row 10), two rounds

First re-check, 2026-10-27: not met. The search test used `toContain`, and the label and the button say the same word, so mutating one still left the other: all four mutations (pt and fr, `label` and `submit`) survived.

Witnessed: 2026-10-27 11:30 EDT, by a fresh agent (third check, row 10 only). Commit: 37ba57b1 plus the uncommitted tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | The translation tests fail if a pt/fr message goes back to English | yes | confirmed | The test now counts the search word twice (label and button) in the scopes and the workspaces tables; six mutations (pt and fr `admin.scopes.search.label`/`.submit`, pt `admin.workspaces.search.label`/`.submit`) each → 1 failed, 73 passed; unmutated 74 passed; `cmp` identical after each restore |

**Overall:** met.

## Task 5 — The Audit log: the table

Witnessed: 2026-10-27 11:35 EDT, by a fresh agent (blind). Commit: c4673f27 plus the uncommitted tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `AuditLogPage` and `EventDetails` read through `admin.audit` | yes | confirmed | `git diff`: every literal replaced by `t(...)`; only the Help ids stay English (task 12) |
| 2 | `EventDialog`, `format.ts`, `list.ts` and `audit/page.tsx` need no screen-text change | yes | confirmed | Read each: a `title` prop, data and identifiers, no text |
| 3 | en, pt and fr each have an `audit` block with the same keys | yes | confirmed | `vitest run src/features/admin-audit src/app/pages-coverage.test.ts src/i18n` → 369 passed |
| 4 | `/admin/audit` is in `MIGRATED_ROUTES` and the pinned list | yes | confirmed | `e2e/pages.ts`, `pages-coverage.test.ts` pass (the sweep runs in task 13) |
| 5 | The raw-text scan covers `admin-audit/**` and `app/(app)/admin/audit/**` | yes | confirmed | `biome.json`; a raw `<p>` in a scratch file → plugin error; file removed |
| 6 | Three-language tests exist and fail when a pt/fr message goes back to English | yes | partly | Six mutations failed the suite; pt `dialog.close` and pt `details.open` survived |
| 7 | Counts of 1 and 2 follow each language's plural rule | yes | confirmed | pt "1 evento", fr "1 événement" and "2 événements"; the empty state stands for 0 |
| 8 | Names, ids and metadata are shown as recorded | yes | confirmed | `{count} <b>x</b>` escaped and unchanged; `auth.signed_in` stays the code |
| 9 | English is unchanged | yes | confirmed | `admin-audit.test.tsx`; only "That event doesn’t exist." has a curly apostrophe |
| 10 | `tsc` and `biome check` are clean | yes | confirmed | No output / "No fixes applied" |
| 11 | Timestamps keep their numeric form | no | can't check here | `LocalTime` and `utcText` are unchanged in the diff; not rendered in a browser |

**Overall:** not met (row 6; row 11 is a statement that nothing changed, see below).

### Re-check (row 6), two rounds

First re-check (2026-10-27): partly. The unreachable `details.open` message and its `?? "Open"` fallback were removed (`targetHref` only links user, submission, item and item_version, all of which have a word); tests were added for the links, the copy button, the actor placeholder and the no-JavaScript close. Ten of eleven mutations failed the suite; pt `details.openSubmission` survived.

Witnessed: 2026-10-27 11:28 EDT, by a fresh agent (third check, row 6 only). Commit: c4673f27 plus the uncommitted tree. Machine: macOS (Darwin 27), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | A pt/fr audit message set back to its English makes a test fail | yes | confirmed | New `src/i18n/admin-untranslated.test.ts` fails when a pt or fr `admin` message equals the English one, except its SAME table (single words, placeholder patterns, symbols: checked, no untranslated sentence). Six mutations (pt `openSubmission`, pt `dialog.title`, fr `columns.actor`, pt `filters.apply`, fr `empty.none`, fr `columns.time`) each failed the run; unmutated 32 passed; `cmp` identical after each restore |

**Overall:** met.

Row 11 of the first pass is not a claim of work done: the witness only noted that the timestamp code is unchanged in the diff.
