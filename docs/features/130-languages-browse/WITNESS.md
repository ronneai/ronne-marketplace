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
