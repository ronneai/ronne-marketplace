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

## Task 6 — The Audit log: the sentences

Witnessed: 2026-10-27 11:45 EDT, by a fresh agent (blind). Commit: f646c3ef plus the uncommitted tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's own tests pass | yes | confirmed | `vitest run --project unit src/features/admin-audit src/i18n` → 20 files, 378 passed |
| 2 | A test covers every event type the server writes, in three languages, and the list comes from the audit domain | yes | confirmed | `AUDIT_ACTIONS` is the source; adding `"instance.brand_new"` to it → 5 tests failed; restored |
| 3 | English is word for word what it was, but for the two deliberate changes (curly apostrophes, grouped numbers) | yes | confirmed | Old `summarize` against the new for 91 actions, 7 metadata bags, 1274 cases → 0 real differences |
| 3b | A committed test pins the English of every action | yes | partly | About 42 of 91 actions had a literal assertion |
| 4 | Counts of 0, 1 and 2 follow each language's plural rule | yes | confirmed | Sessions and conflicts in en, pt, fr; 0 is singular in pt and fr |
| 5 | An unknown action or code shows its code; names that look like placeholders show as typed | yes | confirmed | `__proto__`, `constructor`, `toString`, `user.archived` → raw code or "action (user)" |
| 6 | One ICU message per action, with `select` for the optional parts | yes | confirmed | `audit.sentences.actions` in the three files; builders only read metadata into values |
| 7 | "Never fragments joined in code" | yes | partly | The ended list, the counts, the details and the change lists are joined in code |
| 8 | The pt and fr sentences read naturally | yes | confirmed | All read; small nits only |
| 9 | Mutations fail the tests | yes | confirmed | Five pt/fr mutations each failed two tests; restored |
| 10 | `AUDIT_ACTIONS` is the source of the list | yes | confirmed | See row 2 |

**Overall:** not met (rows 3b, 7).

The work after this pass: `english-sentences.fixture.json` (the old output for every action, empty and rich bag) and a test comparing the new English to it; the colon of "provider updated" moved into the message (a space before it in French); SPEC.md Behaviour reworded to name the lists code joins. Four more checks followed, each on the rows that were not confirmed, and each found something small to name:

- Re-check: 3b confirmed (91 actions, 177 of 182 comparisons identical, the 5 differences are the 3 apostrophes and 2 number groups); `auth_provider_updated`'s colon confirmed in all three languages; the spec wording partly (four joins not named).
- Third check: 3c confirmed (pt left in English fails `admin-untranslated` and `sentences`; a missing `{provider}` placeholder fails the parity test; changes of pt/fr wording that stay translated are not pinned, by design: the native review is 133); the wording partly (the provider-update separator, `via()`'s space and the restored time format not named).
- Fourth check: the wording partly (the token expiry date, `@scope`, `name@version` and the unknown-event fallback not named).
- Fifth check: the wording partly (the brackets around "(nothing left)" alone).

Witnessed: 2026-10-27, by a fresh agent (blind, read-only, the wording row of the last round). Commit: f646c3ef plus the uncommitted tree. Machine: macOS (Darwin), Node not run.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7c | The SPEC bullets on audit sentences name every code-owned format in `summary.ts`, including the one around "nothing left" | yes | confirmed | Read `summary.ts` and the bullet: `ended()` list (:69), `via()` space (:75), `name@version` (:83), `@scope` (:86), token expiry (:98), restored time (:166), provider-update ", " (:176), SCIM "and" (:208), deleted-workspace list (:310), moved-scope counts (:365), draft details (:377), retention (:456) and notice (:472) lists, unknown-event fallback (:501), "(nothing left)" (:146); a re-scan found nothing else |

**Overall:** met.

## Task 7 — Settings: the tabs and Authentication

Witnessed: 2026-10-27 11:55 EDT, by a fresh agent (blind). Commit: e9531c09 plus the uncommitted tree. Machine: macOS (Darwin), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The tab names come from messages (`tabs.ts` holds ids and hrefs) and read in each language | yes | confirmed | `tabs.ts`; "the tabs read in each language" passes |
| 2 | Three-language tests exist for the sign-in methods, password and two-factor policy, provider list, form and notices, controls, test result and SCIM | yes | confirmed | `vitest run src/features/admin-settings src/i18n` → 22 files, 444 passed |
| 3 | The Authentication tab reads fully in the language: no raw text left in its folders | yes | confirmed | `biome check` clean; `biome.json` adds `authentication/**` and `admin/settings/**` |
| 4 | A provider's name and values are shown as stored | yes | confirmed | The "as typed" test passes |
| 5 | Parity and placeholders: en, pt and fr have the same `settings` keys | yes | confirmed | 172 `settings` leaves in each |
| 6 | Short pt/fr messages left in English are caught | yes | partly | Five mutations (pt `methods.on`, fr `providers.columns.state`, pt `scim.cancel`, fr `providerControls.delete`, pt `twoFactor.save`) each failed only the generic `admin-untranslated` test, not the screens' leak test |
| 7 | The SAME table is minimal | yes | confirmed | Only `settings.providerControls.subject` (pt, fr) and `settings.scim.token` (pt) were added |
| 8 | English is unchanged but for the curly apostrophes | yes | partly | About 106 removed phrases looked up in the en messages: none lost, but not diffed one by one |
| 9 | The SPEC says the identity domain's English text stays English | yes | confirmed | New bullet under Out |
| 10 | The pt and fr read naturally | yes | confirmed | About 18 read; fr "Faire la rotation" could be "Renouveler" |

**Overall:** met, with two caveats (rows 6 and 8, partly).

Witnessed: 2026-10-27, by a fresh agent (re-check of rows 6 and 8). Commit: e9531c09 plus the uncommitted tree. Machine: macOS (Darwin), Node 24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | A pt or fr `admin` message left identical to its English text fails `admin-untranslated.test.ts`, whatever its length; its SAME table lists the only words allowed to be the same | yes | confirmed | The whole `admin` file flattened: 722 keys in each language; the identical keys for `settings.*` are exactly the SAME entries (`subject` pt and fr, `scim.token` pt); the whole table matches (pt 9 identical keys, fr 18, all listed) |
| 8 | No English sentence of the Authentication tab or the Settings page changed, but for curly apostrophes | yes | confirmed | The HEAD version of the 12 changed non-test files parsed with swc: 84 sentences of 3+ words checked against `en/admin.json` `settings.*` and `notice.*`, 0 missing; the leftovers are paths, classes, identifiers and field names |

**Overall:** met.

## Task 8 — Settings: Usage, Plugin feeds, Privacy, Notice

Witnessed: 2026-10-27 12:10 EDT, by a fresh agent (blind). Commit: c24dcd17 plus the uncommitted tree. Machine: macOS (Darwin 27.0.0), Node 24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The usage forms, the plugin feeds and the privacy panels read their words from messages | yes | confirmed | Every visible string and aria-label in the 7 components is `t(...)`; the HEAD prose literals are all in `en/admin.json` |
| 2 | The new keys exist in en, pt and fr with the same placeholders | yes | confirmed | +75 lines in each; `vitest run src/i18n src/features/admin-settings` → 452 passed |
| 3 | English is unchanged but for the stated deviations (curly apostrophes, plural counts in the purge sentence, the retention unit following the number, numbers written by the language) | yes | confirmed | The literal check; only apostrophes changed in the old test lines |
| 4 | Three-language tests cover the purge sentence and the erasures for counts 0, 1 and 2 | yes | partly | 1 and 2 were asserted; 0 was not |
| 5 | The tests fail when a translation is left in English | yes | confirmed | Six mutations (long and short, pt and fr) each failed the generic test |
| 6 | The only message identical to English is allowed | yes | confirmed | `settings.feeds.columns.plugins` (pt, fr) is in the SAME table |
| 7 | The purge sentence reads correctly with plurals in pt and fr | yes | confirmed | Read for 1 and 2 |
| 8 | Numbers use the language's separators; MiB, KiB and "s" stay in code | yes | confirmed | `format.number` with one decimal; en "1,204" and "4.6" as before |
| 9 | The retention unit follows the typed number | yes | confirmed | `>day<`, `>dias<`, `>dia<` |
| 10 | All of `features/admin-settings` is in the raw-text scan | yes | confirmed | `biome.json` has `features/admin-settings/**`; biome clean |
| 11 | The Settings comment in `e2e/pages.ts` no longer says the rest follow in 132 | yes | confirmed | It reads "Settings (124, 132): every tab is in messages." |
| 12 | The Notice tab joins the scan | yes | confirmed | Covered by the glob |
| 13 | The pt and fr read naturally | yes | confirmed | About 12 read |

**Overall:** not met (row 4).

Witnessed: 2026-10-27, by a fresh agent (blind re-check). Commit: c24dcd17 plus the uncommitted tree. Machine: macOS (Darwin), Node not recorded.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Three-language tests cover the purge sentence and the pending erasures for counts 0, 1 and 2 (0 is singular in pt and fr; an empty list shows nothing) | yes | confirmed | The tests assert en 0, 1, 2; pt 0, 1, 2; fr 0, 1, 2 for the purge; erasures 0 render nothing; 113 passed; mutating pt `one {# endereço IP}` → 1 failed; restored, `cmp` clean |
| 5 | The three `admin.json` files differ from HEAD only by additions | yes | confirmed | `git diff --stat -- messages` → 75 insertions each, no deletions; no removed lines in `git diff -U0` |

**Overall:** met.

## Task 9 — The setup wizard

Witnessed: 2026-10-27 12:20 EDT, by a fresh agent (blind). Commit: e44a2be2 plus the uncommitted tree. Machine: macOS (Darwin 27.0.0), Node 24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every English literal a person reads in the setup folder is a message, or is deliberately the server's or a driver's | yes | confirmed | Grep of the current files against HEAD; `STEP_LABELS`, `PAGES` and the "Steps" label are gone; biome clean; both globs in the scan |
| 2 | Every `error(` / `invalid(` / notice / detail site has a `say`, or is a domain or driver message | yes | partly | form.ts 5 of 5; install.ts the ones named; `EnvMergeError`, `database_ahead` and the root account's identity messages had no `say` and were not named in the SPEC |
| 3 | Mutated pt and fr messages fail tests | yes | confirmed | Ten mutations, short and `errors.*`, each failed at least one test; restored, `cmp` identical |
| 4 | `useSay` cannot be abused | yes | partly | `__proto__`, `constructor` fell back; group keys and a message missing its values showed the path |
| 5 | The wizard renders with no database and no user | yes | confirmed | Props-only `renderToStaticMarkup`; the client path imports nothing server-only |
| 5b | `/setup` reads in the browser's language | yes | confirmed | `getTranslations` in `generateMetadata`; `requestLocale` tolerates no session; the page-level browser check is task 13 |
| 6 | `/setup` is in `MIGRATED_ROUTES` | yes | confirmed | `e2e/pages.ts`, `pages-coverage.test.ts` pass |
| 7 | The `say` design: English kept, a key beside it, `useSay` words it | yes | confirmed | `types.ts`, `install.ts`, `translations.test.tsx` renders all 20 says in three languages |
| 8 | The pt and fr read naturally | yes | confirmed | Twelve pairs read |

**Overall:** not met (rows 2 and 4).

The work after this pass: `useSay` now checks that the key is one message with its values; SPEC.md Out names the server-written messages (the database check, a driver's, the settings-file merge, the database-ahead and the root account's identity messages). Two re-checks followed; the first found that the leak scan of the test still stripped the Help-tip buttons (an edit that had not applied), and that the root account's messages were not yet named.

Witnessed: 2026-10-27, by a fresh agent (blind, re-check of rows 2 and 5). Commit: e44a2be2 plus the uncommitted tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | Every English string the wizard can show is a message with a `say`, or one the SPEC names as written by the server | yes | confirmed | SPEC.md:67-69 names the database check's explanation, a driver's message, the settings-file merge error, the database-ahead error and the root account's email, name and password messages (install.ts:282-286); the other sites carry a `say` |
| 4 | `useSay` falls back for group keys, a message missing its values and prototype keys | yes | confirmed | The probe test covers `errors`, `detail`, `page`, `errors.settings_unwritable` with no values, `errors.nope` and `errors.__proto__` in pt and fr |
| 5 | The wizard's Help-tip questions and answers are in the English-leak scan (no `replace(...)` left), and a pt/fr tip left as English fails `vitest run src/features/setup src/i18n` | yes | confirmed | `grep 'replace(' translations.test.tsx` → none; three mutations (pt `pickAnswer`, fr `helpAnswer`, pt `pickQuestion`) set to the exact English each failed `admin-untranslated`; restored, `cmp` identical |

**Overall:** met.

## Task 10 — Small pieces

Witnessed: 2026-10-27 12:35 EDT, by a fresh agent (blind). Commit: 34b29559 plus the uncommitted tree. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `CliAuthPanel.tsx` and `commands.ts` hold no screen text of their own; the commands stay as typed | yes | confirmed | Every word comes from `useTranslations("common.cliAuth")`; the test asserts every `rmkCommands(registry)` string appears verbatim (HTML-escaped) in en, pt and fr |
| 2 | `components/cli-auth/**` is in the raw-text scan | yes | confirmed | `git diff biome.json`; a planted `<p>Hello raw</p>` → "Found 2 errors"; restored, `cmp` identical |
| 3 | The three-language test passes and a pt mutation of `title` or `step2` to English fails it | yes | confirmed | `vitest run src/components/cli-auth` → 5 passed; both mutations failed "the title and the three steps read in each language"; restored, `cmp` identical |
| 4 | The pt and fr read naturally | yes | confirmed | All 10 keys read in both languages |
| 5 | The styleguide stays English and out of the scan, and the deviation is reasonable and honestly recorded | yes | confirmed | `features/styleguide` has no translator; `access.ts` allows anyone signed in outside production and only root in production; SPEC (Goal, Scope, Out, Acceptance) and PLAN say so, "decision of this feature, to be confirmed by the owner" |

**Overall:** met.

## Task 11 — What the actions say

Witnessed: 2026-10-27 12:55 EDT, by a fresh agent (blind). Commit: 58cfcc18 plus the uncommitted tree. Machine: macOS (Darwin), Node default.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every `catch` in the in-scope action files returns `errorText(error)`, no `error.message` left | yes | confirmed | `grep "\.message"` over the six action files → none; the notice actions return codes |
| 2 | Every success line in scope is a message | yes | confirmed | The diff removes every English literal; `getTranslations("admin.done.*")` and `common.roles` |
| 3 | The new classes' English equals the class message exactly | yes | confirmed | `admin-errors.test.ts` (44 instances); 639 passed |
| 4 | The pt and fr read correctly | yes | confirmed | All read in both languages, no mistranslation |
| 5 | The three class changes do not alter any `.message` | yes | confirmed | `git diff src/server`; the test pins 7 messages |
| 6 | Nothing else reads `limit`, `which` or `shape` oddly | yes | confirmed | Grep; only `valuesOf` reads them |
| 7 | No class the admin screens can raise is still untranslated, but for the named exceptions | yes | partly | Feeds, Feedback, Shelves, Submissions and `ScimRequestError` classes listed as untranslated; reach not traced |
| 8 | An action test shows an unknown error still shows the English message | yes | partly | Only the `errorText` unit test existed |
| 9 | A test per class in three languages | yes | confirmed | 44 cases in en, pt and fr, plus a per-area action test |
| 10 | The tests catch a pt/fr success line left in English | yes | partly | pt `admin.done.workspaces.deleted` set to "Deleted." left `admin-workspaces` green |
| 11 | `errorText` cannot be abused with the new classes | yes | confirmed | Name pattern, placeholder-looking values shown as typed, missing values fall back to the message |

**Overall:** not met (rows 7, 8, 10).

Witnessed: 2026-10-27 12:55 EDT, by a fresh agent (adversarial). Commit: 58cfcc18 plus the uncommitted tree. Machine: macOS (Darwin), Node 22/24 per .nvmrc.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| A | Every domain-error catch in the admin actions returns `errorText(error)`, with success lines as messages and English unchanged | yes | confirmed | Grep for `.message` and hardcoded English `done:`/`error:` finds none; reverting `errorText` to `error.message` in each of the five action files failed 1 to 4 tests each; restored |
| B | The `.message` of every domain class is unchanged, so the API and `rmk` messages are unchanged | yes | confirmed | HEAD and new identity and settings `errors.ts` side by side: 814 constructions (17 argument shapes against every class), `message`, `name`, constructor and logged form identical; no diff in `items` errors |
| C | `errorText` never shows a key, an empty text or a crash for the new classes | yes | confirmed | Every class with an `errors.<Name>` key in en, pt, fr with 24 hostile values (ICU plural text, `<b>{x}</b>`, 200 KB strings, NaN, Date, null, NUL and RTL characters, `__proto__`): no throw, no empty output, no key shown |
| D | The actions still refuse non-root as before; no secret or driver text newly reaches the browser | yes | confirmed | The diff only changes the catches and the `done` text; `InvalidProviderConfigError` fields and the setup's driver messages are passed as before |
| E | The three modified classes behave the same for every caller, and logging or serialising them leaks nothing new | yes | confirmed | Callers use `message`, `reason` or `instanceof` only; `errorFields` writes name, message, code and stack, `message` is `[hidden]` for the people-facing classes; no `JSON.stringify` of a domain error anywhere; the new values are non-secret constants |

**Overall:** met.

Witnessed: 2026-10-27 13:05 EDT, by a fresh agent (blind re-check, rows 7, 8 and 10). Commit: 58cfcc18 plus the uncommitted tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | No class the in-scope actions' catches can raise is untranslated, except the named exceptions | yes | confirmed | The catches only test `instanceof` for the identity, workspaces, items and settings base classes (the one exception, `ScopeMoveRefusedError`, returns its impact); Feeds, Feedback, Shelves, Submissions, Usage and Audit errors extend their own bases and would be rethrown; `ScimRequestError` extends `Error` |
| 8 | Each admin area has an "untranslated error in each language" action test | yes | confirmed | `vitest run` of the four admin features and `src/i18n` → 35 files, 646 passed |
| 10 | Every admin success line is translated in pt and fr | yes | confirmed | pt `admin.done.workspaces.deleted` set to "Deleted." → 1 failed (`admin-untranslated`); restored, `cmp` identical. The workspaces `deleted` and `renamed` lines never reach a screen (the actions redirect), so that test is the only cover for them |

**Overall:** met.

## Task 12 — The inline helpers

Witnessed: 2026-10-27 13:20 EDT, by a fresh agent (blind). Commit: 68e8baf3 plus the uncommitted tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The 32 en messages equal the HEAD question and answer text (modulo ’ and the erase-user quoting) | yes | confirmed | Parsed `git show HEAD:…/Help.tsx` against `messages/en/help.json`: 32, no missing, no differences |
| 2 | erase-user renders exactly `deleted-user-<id>` in en, pt and fr | yes | confirmed | intl-messageformat probe |
| 3 | The 32 pt and 32 fr pairs are accurate and natural, with the right glossary words | yes | partly | All 64 read: no fact changed; one fr sentence had no subject ("Déprovisionner désactive le compte; ne l’efface jamais.") |
| 4 | `Help.tsx` holds no question or answer text, and `HELP` entries are only `{ href }` | yes | confirmed | `satisfies Record<string, { href: string }>`; the test asserts `"question" in HELP[id]` and `"answer" in HELP[id]` are false |
| 5 | The 32 hrefs are unchanged vs HEAD | yes | confirmed | `git diff -U0` shows no `docsHref` line changed |
| 6 | Each helper's link opens the website's page in the language | yes | confirmed | The "read in the person's language" test over all ids |
| 7 | `help.json` keys equal the HELP keys, and the parity test covers them | yes | confirmed | `help.test.tsx`, `help-untranslated.test.ts` |
| 8 | Mutating pt or fr to English makes tests fail | yes | partly | A whole message identical to English fails; a hybrid answer (part English) passes every test |
| 9 | Every `<Help id=…>` use still type-checks and renders | yes | confirmed | `tsc` clean; 383 tests passed |
| 10 | The six admin translations tests now scan the helper texts | yes | confirmed | `NS` has "help", the workaround is gone; four swaps of a pt answer for another helper's English text each failed a test |

**Overall:** not met (rows 3 and 8).

The work after this pass: the fr sentence is fixed; `help.test.tsx` also asserts the rendered answer (a check of the wiring, as its comment now says). A re-check followed.

Witnessed: 2026-10-27, by a fresh agent (blind, re-check of rows 3 and 8). Commit: 68e8baf3 plus the uncommitted tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | All 32 pt and 32 fr pairs are accurate and natural; the grammar slip is fixed | yes | confirmed | fr `scim-provider` now reads "Le déprovisionnement désactive le compte; il ne l’efface jamais."; `role-root`, `audit-actor` and `retention` re-read in both languages |
| 8a | A pt helper answer left identical to its English text fails `vitest run src/components/help src/i18n` | yes | confirmed | pt `audit-actor` answer set to English → 2 failed (`help-untranslated`, `help.test`); restored, `cmp` identical |
| 8b | A fr helper question left identical to its English text fails the same command | yes | confirmed | fr `retention` question set to English → the same 2 failed; restored, `cmp` identical |
| 8c | The rendered-answer assertion in `help.test` checks that `Help` renders the message of its id | yes | confirmed | It compares the render with the answer read from the same JSON, so it catches a wiring fault, not a wrong text. An earlier wording of this claim ("a wrong pt text now fails") was false: a swapped pt answer passes; the witness showed it |
| 8d | A hybrid answer (part English, part translated) is not detectable by any test, here or in the other namespaces, and is left to the native review (feature 133) | yes | confirmed | No test catches it; the whole-text checks only fail when the text equals the English |

**Overall:** met.

## Task 13 — End to end

Witnessed: 2026-10-27 EDT, by a fresh agent (blind). Commit: 7ad1d25c plus the uncommitted tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The e2e files run green on a fresh build: chromium and phone | yes | confirmed | `pnpm build` then `playwright test` on `languages-admin`, `setup-wizard-languages`, `setup-wizard`, `setup-nojs`, `languages-browse` and `mobile-sweep.mobile` → 61 passed across chromium, phone, phone-webkit, tablet, wizard and wizard-nojs; a full run before it had shown 14 failures, all in older tests whose English changed (curly apostrophes, the Users page's button now translated) and one real layout fix (see below) |
| 2 | Users, a user's page, Audit log and every Settings tab show no English left in pt and fr | yes | partly | Hard-coding `Actor` in a filter label made the Audit tests fail; hard-coding the column header did not: the scan split the page text on newlines only, and table cells are tab-joined |
| 3 | `/setup`, `/admin/users`, `/admin/users/[id]`, `/admin/audit` and `/admin/settings` are in `MIGRATED_ROUTES`, and the sweep runs them in pt and fr | yes | confirmed | `e2e/pages.ts:211-216`; the sweep filters `SWEEP_PAGES` by `MIGRATED_ROUTES`; "in pt:" and "in fr:" pass for root, member, moderator and signed out on phone, phone-webkit and tablet; `grep UNTIL_132 e2e` → none |
| 4 | The wizard on a fresh instance shows in the browser's language, with no database and no user | yes | confirmed | `setup-wizard-languages.e2e.ts`: `/` redirects to `/setup`, `html lang`, heading, warning and the scan on each of the three steps; both tests pass |
| 5 | The new files run in the right order and do not race | yes | confirmed | `workers: 1`, `fullyParallel: false`; the languages file sorts before the English install and only reads |
| 6 | The new root `adminLanguages` is seeded and signs in once | yes | confirmed | `users.ts` adds it to `E2E_USERS`, `E2E_NAMES` and `E2E_ROOTS`; `beforeAll` signs in once and reuses `storageState` |

**Overall:** not met (row 2).

The work after this pass: both new specs split the page text on tabs as well as newlines.

Witnessed: 2026-10-27, by a fresh agent (blind, re-check of row 2). Commit: 7ad1d25c plus the uncommitted tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The `noEnglish` scan now sees English in table headers and cells, so a hard-coded English string in a table fails the Audit and Users tests | yes | confirmed | Hard-coding `header: "Actor"` in `AuditLogPage.tsx` failed the Audit test in pt and fr listing `admin.audit.columns.actor`; hard-coding "Never" in `NeverSignedIn` failed the Users test listing `admin.users.never`; restored, `cmp` identical, rebuilt, 6 passed |

**Overall:** met.

## Task 14 — Documentation and records

Witnessed: 2026-10-27, by a fresh agent (blind). Commit: 59ca0245 plus the uncommitted tree (ronne-web b3bec56). Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The pt pages name the app's labels exactly | no | confirmed | 104 quoted labels compared with `messages/pt/*.json`: 94 exact, the rest placeholder forms, glosses or prose; none invented |
| 2 | The fr pages name the app's labels exactly | no | confirmed | 110 labels: 97 exact, the rest placeholder forms or glosses; straight apostrophe on the site is documented |
| 3 | No topic or section changed | no | confirmed | `topics.ts` not in the diff; section ids kept |
| 4 | ronne-web tests, lint, typecheck, build pass | no | confirmed | 183 tests, lint, tsc, build all green |
| 5 | Glossary rows match the app; index row says done; `en/privacy.tsx` true to the app | no | confirmed | rows read against pt/fr values; README row done; `schedulerOff` message matches |
| 6 | fr pages read coherently | no | partly | two slips: "est activé" and « de utilisateur » (the app's own sentence) |
| 7 | PLAN Done note written | no | not met | not yet written |

**Overall:** not met (rows 6 and 7).

The work after this pass: ronne-web f95d8ac fixes "activée", the stray space and the audit example; the app's fr `role_changed` and `member_role_changed` now say « du rôle … au rôle … »; PLAN "Done (2026-10-27)" written.

Witnessed: 2026-10-27, by a fresh agent (blind, re-check of rows 6 and 7). Commit: 59ca0245 plus the uncommitted tree (ronne-web f95d8ac). Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | App and docs French agree; the slips are fixed | yes | confirmed | `git show f95d8ac`; `messages/fr/admin.json:648,679` read "du rôle {from} au rôle {to}" |
| 7 | PLAN Done section is true; checks pass | yes | confirmed | five claims spot-checked; ronne-web lint, typecheck, 183 tests; marketplace 388 tests; `pnpm witness:check` exit 0 |

**Overall:** met.

