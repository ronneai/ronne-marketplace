# 130 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — Shared words

Witnessed: 2026-10-21 14:45 local, by a fresh agent (blind). Commit: 74c745fa plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | ItemCard renders in en, pt and fr | no | confirmed | `src/components/catalogue/translations.test.tsx` covers badges, empty description, install count and the dot-separated line in the three languages. |
| 2 | ItemPlace renders in three languages | no | confirmed | The same file has an ItemPlace block with en, pt and fr assertions ("Espaço de trabalho", "Portée"). |
| 3 | The data-table footer renders in three languages with counts 0, 1 and 2 | no | partly | `src/components/ui/translations.test.tsx` covered en 0, 1, 2; fr 0 and 2; pt 1 and 12345 only: pt with 0 and 2 were not asserted. |
| 4 | The message parity test passes | no | confirmed | Vitest after deleting the caches → 28 files, 270 tests passed; `types` and `catalogue` are in `namespaces.ts` with files in all three languages. |
| 5 | `components/catalogue` is in the raw-text scan | no | confirmed | `biome.json` overrides list it; a mutation of ItemCard to a raw `deprecated` made `biome lint` report 1 error. |
| 6 | The tests fail when a message or component goes back to English | no | confirmed | Mutation of pt `obsoleto` → 1 test failed; ItemCard `{t("deprecated")}` replaced by raw text → 4 failed; both restored, `cmp` identical. |
| 7 | A stored value that looks like a placeholder is shown as typed | no | confirmed | The ItemCard test asserts `#{x}` and `Uses {count} things.` in pt. |
| 8 | Types, roles and the other shared words are messages | no | partly | `types.json` exists in three languages with `item-types.test.ts`; the role messages were not reviewed (they are used from tasks 5 and 6). |
| 9 | The repo lint has no errors | no | not met | `pnpm exec biome check apps/web` → 1 format error in `translations.test.tsx` (a missing and a doubled `;`). |

**Overall:** not met: row 3 (pt counts), row 9 (formatting).

### Re-check (rows 3, 9)

Witnessed: 2026-10-21 14:40 local, by a fresh agent (blind re-check). Commit: 74c745fa plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The footer count and noun are asserted in en, pt and fr at counts 0, 1 and 2 | no | partly | `translations.test.tsx` now asserts en 0, 1, 2, pt 0, 1, 2 and fr 0 and 2; fr count 1 was missing. The expectations match each plural rule (pt and fr count 0 and 1 as one). |
| 3b | ItemCard installs are asserted at counts 0, 1 and 2 in the three languages | no | partly | `catalogue/translations.test.tsx` asserts en 1, 0, 2, pt 1 and 2, fr 1, 0, 2; pt 0 was missing. |
| 9 | `biome check apps/web` has no errors | no | confirmed | `pnpm exec biome check .../apps/web` → "Found 10 warnings. Found 2 infos." No errors. |
| 10 | `vitest run --project unit src/components src/i18n` passes | no | confirmed | 33 files, 293 tests passed. |

**Overall:** not met: the language-by-count grid has two cells missing (fr 1, pt 0).

### Re-check (rows 3, 3b)

Witnessed: 2026-10-21 14:41 local, by a fresh agent (blind re-check). Commit: 74c745fa plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The footer count and noun are asserted in en, pt and fr at counts 0, 1 and 2 | no | confirmed | `translations.test.tsx` lines 155-163 assert all nine cells: en "1 item<", "0 items", "2 items"; fr "0 élément<", "1 élément<", "2 éléments"; pt "0 item<", "1 item<", "2 itens". |
| 3b | ItemCard installs are asserted at counts 0, 1 and 2 in the three languages | no | confirmed | `catalogue/translations.test.tsx` lines 67-77 assert all nine cells (pt "0 instalação<", "1 instalação", "2 instalações"; fr "0 installation<", "1 installation", "2 installations"). |
| 11 | Both test files pass | no | confirmed | `vitest run --project unit` on the two files → 2 files, 22 tests passed. |

**Overall:** met.

## Task 2 — Catalogue

Witnessed: 2026-10-21 14:50 EDT, by a fresh agent (blind). Commit: 0bb06b77 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A three-language test covers the Catalogue (search, filters, sort in en, pt, fr) | no | confirmed | `translations.test.tsx` has a case per locale; `vitest run src/features/catalogue src/app src/i18n` → 24 files, 264 tests passed. |
| 2 | The test has an English-leak guard for pt and fr over the main, filtered, no-match and empty states | no | confirmed | `englishLeaks(["catalogue","types"], locale, html)` expected `[]` and `ownTextsShown` > 15. Mutating pt "Mais instalados" and "Pesquisar" to English → 2 tests failed; `t("pager.next")` replaced by the literal "Next page" → 3 tests failed and biome flagged the raw text; files restored, `cmp` clean. |
| 3 | Search, sort, filters and chips, empty states, pager and page title are messages in en, pt and fr | no | confirmed | `messages/{en,pt,fr}/catalogue.json` have `page.*` and `view.*`; `CatalogueView.tsx` and `catalogue/page.tsx` use `t(...)` and `generateMetadata`. |
| 4 | English reads the same as before, except the typographic apostrophe | no | confirmed | `git diff` of `CatalogueView.tsx` against HEAD: every old string is in `en/catalogue.json` word for word; only `it's` → `it’s` (twice). |
| 5 | Text built from pieces is whole sentences; links and `<code>` use rich tags | no | confirmed | `sort.summary`, `empty.noMatch` and `empty.how` are `t.rich` with `<value>`, `<see>`, `<mono>`; asserted in the test for pt and fr. |
| 6 | Type names stay as rmk prints them; a search text that looks like a placeholder is shown as typed | no | confirmed | The test asserts `Remover o filtro Hook`; `{total} <b>x</b>` renders as `{total}` with no `<b>`. |
| 7 | The folders are in the raw-text scan | no | confirmed | `biome.json` adds `features/catalogue/**` and `app/(app)/catalogue/**` beside `components/catalogue/**`; `biome check` on them → clean; the literal-string mutation was flagged. |
| 8 | `/catalogue` is in `MIGRATED_ROUTES` and the pinned list | no | confirmed | `e2e/pages.ts` and `pages-coverage.test.ts` each +1; `src/app` tests passed. |
| 9 | pt and fr pages do not break layouts | no | can't check here | The first pass did not run the phone sweep within its budget. |

**Overall:** not met: row 9 waits for the phone sweep.

### Re-check (row 9)

Witnessed: 2026-10-21 14:58 EDT, by a fresh agent (blind re-check). Commit: 0bb06b77 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | pt and fr pages do not break layouts (the phone sweep, signed out and as member, moderator and root) | no | confirmed | `pnpm exec playwright test mobile-sweep --project=phone -g "in (pt|fr)"` from apps/web → `10 passed (10.8s)`; `mobile-sweep.mobile.e2e.ts` filters `SWEEP_PAGES` to `MIGRATED_ROUTES` for non-English runs, and `/catalogue` is in it; each run asserts `html[lang]` and measures overflow. |

**Overall:** met.

## Task 3 — Item page: header, tabs, Tools and Propose

Witnessed: 2026-10-21 14:58 local, by a fresh agent (blind). Commit: 46e18f69 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Header, breadcrumb, badges, meta line, tabs with risk count, Tools panel and Propose button come from `item` messages in en/pt/fr, no raw JSX text | no | confirmed | `git diff` of ItemPageView, ItemTabs, ToolsPanel and ProposeButton shows `t(...)` throughout; `biome.json` lists the four files and `app/(app)/items/**`; `biome check` → 0 errors. |
| 2 | A three-language test covers each component | no | confirmed | `translations.test.tsx` covers header, tabs and Propose, the Tools tab, a placeholder-like owner and an English-leak check for pt and fr; all pass. |
| 3 | Notice variant: latest vs listed target, in each language | no | partly | The listed target was asserted in pt only. |
| 4 | Notice variant: yanked, deprecated, neither, in each language | no | partly | Yanked asserted in pt and fr; deprecated-only and neither were not asserted. |
| 5 | English unchanged apart from the typographic apostrophe; whole ICU sentences | no | confirmed | `git diff` against `en/item.json`: every notice string matches; `select` and placeholders instead of joins; rich tags for `<place>` and `<date>`. |
| 6 | Stored placeholder-looking values are shown as typed | no | confirmed | Owner `{owner} <b>x</b>` renders `por {owner} &lt;b&gt;x&lt;/b&gt;`. |
| 7 | The four item routes have translated page titles | no | partly | Read only the diffstat and the helper; no title assertion existed. |
| 8 | The four item routes are in `MIGRATED_ROUTES` and the pinned list | no | confirmed | Both diffs add the four routes; `pages-coverage.test.ts` passes. |
| 9 | The phone sweep still passes in pt and fr | no | confirmed | `pnpm exec playwright test mobile-sweep --project=phone -g "in (pt\|fr)"` → 10 passed (16.6s), on a build of this tree. |
| 10 | The tests fail when the code regresses | no | confirmed | pt `tabs.tools` and the Tools title set to English → 3 failed; restored, `cmp` identical. |

**Overall:** not met: rows 3, 4 and 7.

### Re-check (rows 3, 4, 7)

Witnessed: 2026-10-21 15:05 local, by a fresh agent (blind re-check). Commit: 46e18f69 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Notice variant: latest vs listed target, in each language | no | confirmed | The new test asserts en "not the listed version (1.1.0).", "Show 1.1.0"; pt "não a versão listada (1.1.0)", "Mostrar a 1.1.0"; fr "pas la version listée (1.1.0)", "Afficher la 1.1.0"; they match the `select` branches in `messages/{en,pt,fr}/item.json`. |
| 4 | Notice variant: yanked, deprecated, neither, in each language | no | confirmed | A deprecated-only version asserts pt "Ela está obsoleta: …", fr "Elle est obsolète : …" and the absence of the yanked sentence; the English matches HEAD apart from the apostrophe; the neither case asserts the title and the link and no state sentence in all three. Mutation: the deprecated notice call replaced by "" → the deprecated test failed. |
| 7 | Page titles for the four item routes, in each language | no | confirmed | The title test calls the four `generateMetadata` in en, pt and fr (Item/Item/Élément, Versions/Versões/Versions). Mutation: fr `item.page.item` set to "Item" → the title test failed. Files restored, `cmp` identical. |

**Overall:** met.

## Task 4 — Item page: Overview

Witnessed: 2026-10-21 15:15 local, by a fresh agent (blind). Commit: 8d337a97 plus the uncommitted working tree. Machine: macOS (Darwin), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's unit tests pass | no | confirmed | `vitest run --project unit src/features/item-page src/i18n` → 14 files, 153 tests passed, after clearing the Vite caches. |
| 2 | Lint is clean and `overview/**` is in the raw-text scan | no | confirmed | `biome check` on item-page, messages and `biome.json` → 52 files, no errors; the `biome.json` diff adds the folder. |
| 3 | The model tests run in three languages | no | partly | `translations.test.tsx` checked the model with pt and fr translators, but `model.test.ts` itself ran only in English. |
| 4 | The usage-card tests run in three languages | no | partly | `usage-card.test.tsx` had no locale; the pt and fr checks lived in the page-level test. |
| 5 | No hard-coded en-US is left in item-page | no | confirmed | `grep -rn en-US apps/web/src/features/item-page` → no output. |
| 6 | `shortDay` keeps en-GB order for English and follows the language otherwise | no | confirmed | `UsageCard.tsx:42-43` uses `locale === "en" ? "en-GB" : locale`; the test expects "1 Jan". |
| 7 | The chart's bar titles are messages | no | confirmed | `UsageCard.tsx` uses `t(runs ? "runsBar" : "installsBar", …)`; ICU plurals in en, pt and fr. |
| 8 | Every previous English string survives word for word, apart from the documented changes | no | confirmed | Diffed the removed lines of OverviewTab, UsageCard and model.ts against `en/item.json`; changes are the apostrophe, "mcp-server items", the plural messages and the argument `select`. |
| 9 | Number formats follow the language | no | confirmed | Messages use `{n, number}` and `{rate, number, percent}`; tests expect pt "13,7 por dia · 94% com sucesso" and fr "13,7 par jour · 94 % réussies". |
| 10 | Plurals use ICU for 0, 1, 2 | no | partly | pt and fr have `plural` messages; the 0 and 2 forms had no assertion. |
| 11 | Nothing English is left in model.ts | no | confirmed | The diff replaces every label, risk, role and guard string by `say(...)`; a literal grep found none; swapping one `say("guard.manual")` for raw English made a test fail. |
| 12 | Placeholder-like stored values render as typed | no | confirmed | A deprecation message "Use {count} <b>now</b>." renders escaped, as typed, in pt. |
| 13 | A pt/fr English leak is caught | no | confirmed | pt "Execuções por dia" set to "Runs per day" → 1 test failed; restored, `cmp` matched. |
| 14 | A raw English string in UsageCard is caught | no | partly | Replacing `{t("byTool")}` with `By tool` made biome report 1 error, while the unit tests stayed green. |
| 15 | The mobile sweep passes in pt and fr | no | confirmed | `playwright test mobile-sweep --project=phone -g "in (pt\|fr)"` → 10 passed. |
| 16 | The dependency canvas's node text is out of this task | no | confirmed | `DependencyGraph.tsx` changes by 10 lines (the loading text only). |

**Overall:** not met: rows 3, 4, 10 and 14.

### Re-check (rows 3, 4, 10, 14)

Witnessed: 2026-10-21 15:25 local, by a fresh agent (blind re-check). Commit: 8d337a97 plus the uncommitted working tree. Machine: macOS (Darwin), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The model tests run in three languages | no | confirmed | `model.test.ts` now has a pt and fr block: agent row labels, guardrail text, body role and the permission policy's "Bloqueia"/"Bloque" lines. |
| 4 | The usage-card tests run in three languages | no | confirmed | `usage-card.test.tsx` now has a pt and fr block on `UsageBody`: titles, peak line, table, silent-tools sentence, bar titles and `shortDay` in pt, fr and en. |
| 10 | The run plurals use the language's rules at 0, 1 and 2 | no | confirmed | `usage-card.test.tsx` expects "0 execução", "1 execução", "2 execuções" in pt and "0 exécution", "1 exécution", "2 exécutions" in fr, right for CLDR (0 and 1 are `one` in both). |
| 14 | A raw English string in JSX is caught, by the lint rule | no | confirmed | On the stated basis that lint guards raw JSX (pre-commit and CI) and the leak test guards wrong-language messages: the biome plugin reported the raw `By tool`. Mutation: fr "Pic : " set to "Peak : " → the usage-card test failed; restored, `cmp` matched. `vitest run --project unit src/features/item-page src/i18n` → 159 passed; `biome check` clean. |

**Overall:** met.

## Task 5 — Workspaces: list, join and the current-workspace line

Witnessed: 2026-10-21 15:15 local, by a fresh agent (blind). Commit: 95d2f294 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Workspaces list, request controls, join page, Showing line, AskToJoinLink and page titles read in en, pt and fr | no | confirmed | `workspaces.json` exists in the three languages with the same keys; `vitest run --project unit src/features/workspaces/translations.test.tsx` → 10 passed. |
| 2 | Dates inside sentences are placed by a message, not appended by code | no | confirmed | `WorkspacesPage.tsx` passes `t.rich("requested"/"declined"/"declinedAgain", {date, again})` and the messages hold `<date></date>` and `<again></again>`; the pt and fr tests match the date inside the sentence. Mutation: pt `"<date></date> Solicitado"` → the dates test failed; restored, `cmp` clean. |
| 3 | A pt message left in English is caught | no | confirmed | pt `"Requested on <date>"` with `src/i18n` → 1 failed, 98 passed; restored, `cmp` clean. |
| 4 | The touched folders are in the raw-text lint scan | no | confirmed | `biome.json` lists features/workspaces, features/current-workspace, components/workspaces, the workspaces `page.tsx` and `\[name\]/join/**`; `biome check` on the touched paths → no fixes, no errors; a raw `Name` in `WorkspacesPage.tsx` → "Found 1 error"; `raw-text.test.ts` passed including "lists only folders and files that exist". |
| 5 | `/workspaces` and `/workspaces/[name]/join` are in `MIGRATED_ROUTES` and the pinned list | no | confirmed | Both diffs add both routes; the unit run over features/workspaces, current-workspace, components, app and i18n → 50 files, 485 tests passed. |
| 6 | The phone sweep passes in pt and fr | no | confirmed | `pnpm exec playwright test mobile-sweep --project=phone -g "in (pt\|fr)"` → 10 passed (19s), on a build of this tree. |
| 7 | The old English strings survive word for word apart from the apostrophe glyph and the role names | no | confirmed | Diff against HEAD and the en JSON: every string matches, including "Declined on … ; ask again from …" and "Cancel your request to join {workspace}". |
| 8 | Roles come from one set of messages; the local `ROLE_LABELS` is removed | no | confirmed | `WorkspacesPage.tsx` uses `roles(w.role)`; the `ROLE_LABELS` block is deleted. |

**Overall:** met.

## Task 6 — Workspaces: members, requests and moves

Witnessed: 2026-10-21 15:40 EDT, by a fresh agent (blind). Commit: 015b75dc plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | There are three-language tests for the Members and Requests/Moves tabs, and they pass | no | not met | `vitest run --project unit src/features src/components src/app src/i18n` → 1 failed, 1247 passed: `workspace-requests/translations.test.tsx` expected "Déplacements" from `ScopeMovesTable`, which renders no heading (it is the page's). |
| 2 | The Members table footer noun is right for 0, 1 and 2 in pt and fr | no | confirmed | `workspace-members/translations.test.tsx:91-97` asserts "0 membro<", "1 membro<", "2 membros" and "0 membre<", "1 membre<", "2 membres"; removing pt's `one` form in a scratch copy made it fail. |
| 3 | The workspace page's tabs, role, visibility and notes are in messages | no | confirmed | The diff of `workspaces/[name]/page.tsx` uses `t(...)` for the tabs, the tab bar label, "All workspaces", "Scope moves", the badges and both notes; the role badge uses `common.roleTitle`; the title is `generateMetadata`; `biome check` → no errors. |
| 4 | English is unchanged apart from the documented changes | no | confirmed | Every `HEAD` string survives word for word in `en/workspaces.json`, apart from the apostrophe glyph, role names from `common.roleTitle`/`common.roles` and ICU plurals with the same text; a parity script found no missing keys or placeholder mismatches. |
| 5 | `/workspaces/[name]` and `/workspaces/requests` are in `MIGRATED_ROUTES` and the pinned list | no | confirmed | Both diffs add both routes; `pages-coverage.test.ts` is in the passing `src/app` run. |
| 6 | The touched folders are in the raw-text lint scan | no | partly | `biome.json` lists the four paths and raw `Filter` and `Renamed` in a scratch copy reported errors; the rule's identity was not read. |
| 7 | The tests catch a pt message left in English | no | confirmed | pt `members.none` set to English in a scratch copy → the members test failed; restored, `diff -r` clean. |
| 8 | The tests catch raw English in `MembersTable` | no | confirmed | `{t("filter")}` replaced by `Filter` in a scratch copy → "the filters, the columns and the count with its noun" failed. |
| 9 | The tests catch raw English in `ScopeMovesTable` | no | partly | The test that would show it was already failing on the unmutated tree (row 1). |
| 10 | The phone sweep passes in pt and fr | no | confirmed | `pnpm exec playwright test mobile-sweep --project=phone -g "in (pt\|fr)"` → 10 passed. |

**Overall:** not met: the scope-moves test (row 1), and rows 6 and 9 with it.

### Re-check (rows 1, 6, 9)

Witnessed: 2026-10-21 16:00 EDT, by a fresh agent (blind re-check). Commit: 015b75dc plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The three-language tests for Members, Requests and Moves pass | no | confirmed | `vitest run --project unit src/features src/components src/app src/i18n` → 110 files, 1248 tests passed, 0 failed. |
| 6 | The touched folders are in the raw-text lint scan | no | confirmed | A raw `Renamed` in `ScopeMovesTable.tsx` in a scratch copy → `biome check` printed "Text on the screen comes from the message files (feature 129): use `t(...)`, not a string written here." (the i18n raw-text plugin), "Found 2 errors"; `biome.json` lists the four paths. |
| 9 | The tests catch raw English in `ScopeMovesTable` | no | confirmed | The same mutation → `vitest run --project unit src/features/workspace-requests` → 1 failed, 16 passed (the pt and fr `>Renomeado<` / `>Renommé<` expectations), and the test passes on the unmutated tree; restored, `cmp` identical. |

**Overall:** met.

## Task 7 — What the actions say

Witnessed: 2026-10-21 15:35 EDT, by a fresh agent (blind). Commit: d0da2ca9 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A test per error class, in three languages | no | confirmed | `workspace-errors.test.ts` has 49 `it.each` cases over every class with a key in `errors.json`: English equals `error.message`, pt and fr differ, no `{}` or `errors.` is left, the values appear; `errors.test.ts` checks the key sets are equal and each key is a real class in the identity, workspaces or submissions domain. |
| 2 | English from `errorText` equals the old `error.message`, word for word | no | confirmed | The `it.each` asserts `expect(english).toBe(error.message)` for all 49 cases, including every `NotAMemberError` doing value and both `ProposalBaseNotFoundError` forms; only fields were added (`doing`, `versioned`, `max`, `total`). |
| 3 | An unknown error still shows its English message | no | confirmed | `errors.test.ts` "an error nobody translated…" and "a known error missing a value…"; `errors.ts` falls back to `error.message`. |
| 4 | A non-domain error still throws from the actions | no | confirmed | `action-texts.test.ts` rejects with "boom" through `requestAccessFromForm`; the `attempt` helpers rethrow. |
| 5 | The API's messages are unchanged | no | confirmed | No change under `src/server/http`; `http/errors.ts` still uses `error.message` and the explicit fields; a test compares the full `NotAMemberError(…"release")` sentence. |
| 6 | No caller of `NotAMemberError` or `requireMember` passes a free-text sentence | no | confirmed | Grep of the non-test callers: nothing, `"release"` (`publish.ts:117`, `release-group.ts:59`) or `"comment"` (`reviews.ts:216`); `membership.ts` types the argument `Doing`. |
| 7 | Success lines come from `getTranslations`; pt and fr ICU strings are well formed | no | confirmed | `results.*` has the same 10 keys in three languages; `vitest run --project unit src/i18n src/features` → 73 files, 949 tests passed, parity included. |
| 8 | A list is its items joined plus `<field>Count`; a date is its day | no | confirmed | `errors.ts` joins a string array with ", " and adds `<key>Count`; a `Date` becomes `toISOString().slice(0,10)`; tests see "@a/x, @b/y" and "2026-10-16". |
| 9 | The db tests that use `requireMember` pass on SQLite | no | confirmed | `vitest run --project db src/server/domains/submissions` → 26 files, 274 tests passed (no database servers). |
| 10 | Lint and typecheck are clean | no | confirmed | `biome check` on the changed files → no errors; `pnpm --filter @ronneai/web typecheck` → exit 0. |
| 11 | The tests fail when the code is broken | no | confirmed | In a scratch copy: renaming a pt placeholder failed 1 test; deleting a class's fr text failed 3; letting the list check accept a non-string failed 3; an unknown `doing` failed the `NotAMemberError` case. |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-21 15:40 EDT, by a fresh agent (adversarial). Commit: d0da2ca9 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every browse-screen domain error shows the person's language via `errorText` with the right values, never a raw key, a blank or an exception; an unknown error shows its English message | no | confirmed | About 23 classes × 13 hostile strings (`{`, `}`, `'{x}'`, `a''b`, `<b>x</b>`, `#`, a plural fragment, `\{`, `$&`, empty, 100000 characters) × en/pt/fr: no throw, no blank, no key, the value always appeared; English equal to `e.message`; hand-built errors with missing, wrong-typed or hostile fields fell back to the English message. |
| 2 | `errorText` turns a `string[]` into "a, b" plus `<field>Count` and a `Date` into `YYYY-MM-DD` | no | confirmed | An empty array, a non-string array, an invalid date and `new Date(8.64e15)` all fell back to the message with no `RangeError`; dropping the Date branch fails 2 tests, dropping `Count` fails 6. |
| 2b | A class name that is a prototype property or malformed shows the error's own message | no | partly | The outcome held for `toString`, `constructor`, `__proto__`, `hasOwnProperty`, `a.b`, 81-character names, with or without the `CLASS_NAME` guard (next-intl's `has` rejects them); no test depended on the guard. |
| 3 | `NotAMemberError(workspace, doing)` takes only the three values, no caller passes a sentence, and the English message is byte-identical | no | confirmed | 11 `requireMember(` callers pass nothing, "release" or "comment"; old and new messages compared for default, release, comment, both `ProposalBaseNotFoundError` forms, `InvalidWorkspaceNameError` and `WorkspaceRenameAliasError`: identical. |
| 4 | The API's messages and codes are unchanged | no | confirmed | `server/http/errors.ts` is not in the diff and does not serialise the new fields. |
| 5 | Success lines built from form input cannot throw or inject | no | confirmed | Roles and names such as `x{y}`, `__proto__`, `constructor`, `toString`, `'{a}'`, `<b>#</b>` and 200000 characters, in the three languages, through the real actions: the input appeared verbatim as a value and nothing threw; role words are translated only on an exact match. |
| 6 | Nothing new puts untrusted text into a message format string, and nothing leaks beyond the English | no | confirmed | Every call is `t(key, {values})` with a fixed key; the key is the guarded class name; the new fields are constants or counts. |
| 7 | Non-domain errors are rethrown by the actions | no | partly | Turning `throw error;` into a return in `workspace-requests/actions.ts` left all 804 tests green: no test covered that file's rethrow. |
| 8 | `NotAMemberError` with an unknown `doing` | no | partly | `new NotAMemberError("acme", "x y")` gave "to undefined." in the English and API message. |

**Overall:** not met: the test gaps in rows 2b and 7, and row 8.

### Adversarial re-check (rows 7, 2b, 3b)

Witnessed: 2026-10-21 15:50 EDT, by a fresh agent (adversarial re-check). Commit: d0da2ca9 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | Non-domain errors are rethrown by `workspace-requests/actions.ts`, and a test covers it | no | confirmed | Replacing every `throw error;` there with a return makes `action-texts.test.ts > the answer actions > rethrow what is not the domain's, for every answer` fail (1 failed, 29 passed). |
| 2b | The `CLASS_NAME` guard is covered by a test | no | partly | The new assertions pass with and without the guard (next-intl's `has` rejects those names): they document the outcome only. |
| 3b | `NotAMemberError` with an unknown `doing` falls back to "propose changes" | no | partly | Fixed for plain unknown strings; `"__proto__"` gave "to [object Object]." because `DOING[doing] ?? …` lets prototype properties through. |

**Overall:** not met: row 3b (a prototype-property `doing`).

### Adversarial re-check (rows 3b, 2b)

Witnessed: 2026-10-21 15:55 EDT, by a fresh agent (adversarial final re-check). Commit: d0da2ca9 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3b | `NotAMemberError` with an unknown or prototype-property `doing` says "propose changes", and a test guards it | no | confirmed | `errors.ts:75` uses `Object.hasOwn(DOING, doing) ? DOING[doing] : DOING.propose`; `"x y"`, `"__proto__"`, `"constructor"` and `"toString"` each gave "…to propose changes."; reverting to `DOING[doing] ?? DOING.propose` fails `workspace-errors.test.ts > the API's message is untouched` (1 failed, 144 passed); the real code passes 145 of 145. |
| 2b | A class name that is a prototype property or malformed shows the error's own message | no | confirmed | Judged on the outcome claim: `toString`, `constructor`, `__proto__`, `hasOwnProperty`, `a.b`, an 81-character name, undefined and numeric names all returned the message, with or without the `CLASS_NAME` guard (defence in depth beside next-intl's `has`); `errors.test.ts` asserts the same. |

**Overall:** met.

## Task 8 — The inline helpers

Witnessed: 2026-10-21 15:50 local, by a fresh agent (blind). Commit: d2c79a56 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The 14 moved entries' question and answer are in `en/help.json` word for word, apart from `'` to `’`, and it has exactly those 14 ids | no | confirmed | A script parsed `git show HEAD:…/Help.tsx` and compared it with `en/help.json`: all 14 questions and answers match after the apostrophe swap; en, pt and fr each have 14 keys. |
| 2 | Each of the 14 still has its href in `HELP`, and no other entry lost its words | no | confirmed | `git diff Help.tsx` removes `question` and `answer` only from the 14 ids and leaves their `href`; the test "are exactly the ones with their words in help.json" asserts the others keep both. |
| 3 | Every helper still renders (any Help id a component uses is in `HELP`) | no | confirmed | `pnpm --filter @ronneai/web typecheck` clean; the "renders a helper as its question, answer and Learn more" test covers every `HELP` id. |
| 4 | `help.test.tsx` renders a migrated and an unmigrated entry | no | confirmed | The loop renders every `HELP` id; the new block renders the 14 in en, pt and fr; `vitest run --project unit src/components src/features src/i18n` → 98 files, 1168 tests passed. |
| 5 | A parity test covers `help.json` | no | confirmed | `namespaces.ts` adds "help"; the parity test iterates `NAMESPACES`; deleting `usage` from fr made the fr parity test and two `help.test.tsx` tests fail. |
| 6 | Each moved helper's link opens the website's page in the person's language | no | confirmed | The test checks `localizedDocsHref(HELP[id].href, "pt"/"fr")` is the `<a href>` for all 14, plus an `href` override that stays localized; the phone sweep → 10 passed. |
| 7 | The pt and fr translations keep the meaning and use the glossary terms | no | confirmed | All 28 read: espaço de trabalho, escopo, moderador in pt; espace de travail, portée, modérateur in fr; no meaning errors. |
| 8 | Lint passes, with `Help.tsx` in the raw-text scan | no | confirmed | `biome check` → no errors; the diff adds the `Help.tsx` line. |
| 9 | A broken state is caught: a question put back for a moved id, a new id without words, a missing fr entry | no | confirmed | In a scratch copy: 4 failures, 2 failures and 3 failures respectively; restored. |
| 10 | A pt or fr answer left in English is caught | no | partly | Replacing pt `install.answer` with the English text left all 163 tests green: the leak guard and parity allow a text identical to English. |

**Overall:** met on the Done-when; row 10 is a gap beyond it.

### Re-check (row 10)

Witnessed: 2026-10-21 16:00 local, by a fresh agent (blind re-check). Commit: d2c79a56 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | A pt or fr question or answer left as the English text is caught | no | confirmed | `help.test.tsx` has "none of them is left as the English text in pt or fr"; baseline `vitest run --project unit src/components/help` → 16 passed; pt `install.answer` set to English → 1 failed (that test); fr `usage.question` set to English → the same test failed; restored → 16 passed. |

**Overall:** met.

## Task 9 — End to end

Witnessed: 2026-10-21 15:55 local, by a fresh agent (blind). Commit: bd6d39c5 plus the uncommitted tree. Machine: macOS (Darwin 27.0.0), Playwright 1.64.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The browse routes are in `MIGRATED_ROUTES` | no | confirmed | `e2e/pages.ts:187-197` lists `/catalogue`, the four item routes, `/workspaces`, `/workspaces/[name]`, `/workspaces/[name]/join` and `/workspaces/requests`; each has a `SWEEP_PAGES` entry. |
| 2 | The same routes are in the pinned list in `pages-coverage.test.ts` | no | confirmed | `vitest run src/app/pages-coverage.test.ts` → 3 passed. |
| 3 | An end-to-end test opens the Catalogue, an item and a workspace in Portuguese and French and sees no English left | no | partly | `playwright test languages-browse --project=chromium` → 6 passed, with positive checks; but "no English left" was a list of five words matched exactly, so a leak of any other label would pass. |
| 4 | The test covers the three screens as the spec says | no | confirmed | The Catalogue test checks a card and its install count; the item test the tabs, Install, Propose, the usage card with its peak and the helper; the workspaces test `/workspaces` and `/workspaces/global`. |
| 5 | The phone sweep runs these routes in pt and fr for each role | no | confirmed | `playwright test mobile-sweep --project=phone -g "in (pt\|fr)"` → 10 passed (signed out, member, moderator, root, no-sideways-scroll, per language); roles come from `pages.ts`. |
| 6 | The new user `browseLanguages` and its name exist | no | confirmed | `users.ts` adds the email and `E2E_NAMES.browseLanguages`; it signs in once in `beforeAll`. |
| 7 | The test fails when a pt message goes back to English | no | can't check here | The mutation could not run in a scratch copy (the harness needs a real `node_modules`). |
| 8 | The e2e project runs green (chromium and phone) on a fresh build | no | partly | Only a sample was run. |

**Overall:** not met: rows 3, 7 and 8.

### Re-check (rows 3, 7, 8)

Witnessed: 2026-10-21 16:20 local, by a fresh agent (blind, observation re-check). Commit: bd6d39c5 plus the uncommitted tree. Machine: macOS (Darwin 27.0.0), Playwright 1.64.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | An end-to-end test opens the Catalogue, an item and a workspace in Portuguese and French and sees no English left | no | confirmed | `noEnglish` now opens every `<details>`, takes the English message texts of 4+ characters with no placeholder or tag that differ in the language, drops a text the language also writes for another message, and fails when the text stands as a whole line of `body.innerText`, on the Catalogue, the item page, `/workspaces`, `/workspaces/global` and its join page. Limits stated: a pt message edited to be identical to English is not caught (left for the native review, 133); a leak inside a longer line is not caught. |
| 7 | The test fails when a pt message goes back to English | no | confirmed | With `view.sort.name.label` deleted from `messages/pt/catalogue.json` (the only change in `git diff`) and a fresh `next build`, `playwright test languages-browse --project=chromium -g "in pt.*Catalogue"` failed with "English left on /catalogue?q=security" naming `catalogue.view.sort.name.label` (inside the closed Sort panel). |
| 8 | The e2e project runs green (chromium and phone) on a fresh build | no | can't check here | Only the mutated Catalogue test ran in this pass. |

**Overall:** not met: row 8 waits for the full run.

### Re-check (row 8)

Witnessed: 2026-10-21 16:30 local, by a fresh agent (blind, row 8 re-check). Commit: bd6d39c5 plus the uncommitted tree. Machine: macOS (Darwin 27.0.0), Playwright 1.64.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | The e2e project runs green (chromium and phone) on a fresh build | no | confirmed | `git status --short messages` printed nothing; `pnpm exec playwright test --project=chromium --project=phone` → "143 passed (4.2m)", no failures, flaky tests or skips, against the build of the clean tree. |

**Overall:** met.
