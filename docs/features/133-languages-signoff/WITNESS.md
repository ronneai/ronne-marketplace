# 133 — Witness record

Passes by the `state-witness` agent, one block per task ([how it works](../../knowledge/state-witness.md)).

## Task 1 — Inventory

Witnessed: 2026-10-27, by a fresh agent (blind). Commit: f1b783a6. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The list of uncovered `.tsx` files is complete | no | confirmed | The agent's own script over the `biome.json` override's globs printed the same 9 files as the document (the three styleguide demos share a row) |
| 2 | `admin/layout.tsx` and `admin/page.tsx` have no text | no | confirmed | read both: a permission check and a redirect |
| 3 | The two workspace item pages are thin wrappers | no | confirmed | read both; their only text is a title already from `getTranslations("item.page")` |
| 4 | `app/layout.tsx` has one real hit, the static metadata | no | confirmed | `layout.tsx:19-22` |
| 5 | The styleguide is out of scope as the SPEC says | no | can't check here | files present and unmatched; the SPEC's Out was not opened |
| 6 | The `.ts` routes write no screen text | no | confirmed | `language`, `current-workspace`, and the two `data` routes read; `server/http/user-data-api.ts` not read |

**Overall:** met.

Witnessed: 2026-10-27, by a fresh agent (blind, re-check of row 5). Commit: f1b783a6. Machine: macOS (Darwin), read-only check.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | The styleguide is out of scope as the SPEC says, and is a developer reference | no | confirmed | `133 SPEC.md:19-20,59-60` and `132 SPEC.md:60-62` record it (provisional until task 8); `032 SPEC.md:22` and `features/styleguide/access.ts` (open outside production, root only in production) |
| 6 | `server/http/user-data-api.ts` writes no component screen text | no | confirmed | it writes English API error bodies for the download route (lines 45-103), under the server/API exclusion; the wording belongs to task 8's server-text decision |

**Overall:** met.

## Task 2 — The rule over the whole app

Witnessed: 2026-10-27 16:45, by a fresh agent (blind). Commit: b2dc52e0 plus the uncommitted diff. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint` passes | no | confirmed | exit 0; 44 warnings and 2 infos, the same as a clean worktree of HEAD (no new diagnostics) |
| 2 | The override is `apps/web/src/**` minus the stated exceptions | no | confirmed | `git diff biome.json` |
| 3 | A new file in a new folder fails the rule | no | confirmed | probes in `features/zzprobe` and `app/zz` gave a `plugin` diagnostic; deleted |
| 4 | The exceptions are not linted | no | confirmed | a probe in the styleguide folder gave none; the test also covers `server/` |
| 5 | A fixture test proves a new folder fails | no | confirmed | the includes-equality test and `lintAs` over three new folders and three exceptions pass; the test was not watched failing under a changed config |
| 6 | The i18n tests pass | no | confirmed | `npx vitest run src/i18n` → 18 files, 350 tests |
| 7 | The root description is served in three languages | no | confirmed | `next start` on a blank instance, curl with Accept-Language en, pt-BR, fr-CA → the three descriptions |
| 8 | The setup page still renders with no database | no | confirmed | `/setup` 200 in all three |
| 9 | No JSX screen text lives outside the new coverage | no | confirmed | only the four styleguide files are excluded |
| 10 | The remaining inventory text is moved or carries a reasoned `biome-ignore` | no | confirmed | 24 `biome-ignore lint/plugin` hits, each with a reason |

**Overall:** met.

## Task 3 — Fragment check

Witnessed: 2026-10-27 16:45, by a fresh agent (blind). Commit: 4a24a7c9 plus the uncommitted new test and allowlist. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The test passes with the reviewed allowlist | no | confirmed | 5 passed; one entry per locale, each with a reason |
| 2 | Planting " the " in a pt message fails, naming the key | no | confirmed | plain, inside a plural option and inside a select option |
| 3 | The same in an fr message, beside a `<code>` tag | no | confirmed | `auth:device.denied: the` |
| 4 | English inside `<code>` or a `{placeholder}` does not fail | no | confirmed | 5 passed |
| 5 | "a", "on", "me", "pour" do not fail | no | confirmed | not in the list; the self-test checks a French sentence |
| 6 | The word list holds no real pt or fr word | no | partly | "more" (pt), "are" and "if" (fr), "must" borderline |
| 7 | The check catches realistic half-translated messages | no | partly | 1 of 10 invented sentences: only function words were listed |
| 8 | Each allowlist entry has a reason and still needs it | no | confirmed | the second test |
| 9 | i18n tests and lint pass | no | confirmed | 355 tests; lint exit 0 |

**Overall:** not met (rows 6 and 7).

The work after this pass: the four words came out and a watch list of product nouns and verbs went in (user, workspace, settings, password, delete, create, update, submit, reset, disable, revoke, rotate, cancel, reviewer); the allowlist grew to 16 pt and 15 fr entries with reasons.

Witnessed: 2026-10-27 16:50, by a fresh agent (blind re-check of rows 6, 7 and a new row 11). Commit: 4a24a7c9 plus the uncommitted tree. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The word list holds no real pt or fr word | yes | not met | "but" is French ("le but"); the probe flagged "Le but est de réussir" |
| 7 | The check catches listed words; its limit is that unlisted words are not seen | yes | partly | 10 of 15 new invented sentences caught; the limit not yet documented |
| 11 | Every allowlist reason is true | yes | partly | two reasons inexact (the command is `reset-root-password`; the hit in rename-workspace is the `--workspace` flag) |

**Overall:** not met.

The work after this pass: "but" removed; "saved rejected failed profile dashboard loading successfully" added; the two reasons corrected; `docs/knowledge/i18n.md` records the check and its limit.

Witnessed: 2026-10-27, by a fresh agent (blind re-check of rows 6, 7 and 11). Commit: 4a24a7c9 plus the uncommitted tree. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | No word in the list is a real pt or fr word | yes | confirmed | every word judged; "reset" and "dashboard" are loanwords not used in any pt or fr message today |
| 7 | Listed words are caught; the limit is documented | yes | confirmed | 355 tests pass; the self-test; the i18n.md bullet states the limit |
| 11 | Every allowlist reason is true | yes | confirmed | all keys resolved in both languages and read |

**Overall:** met.

## Task 4 — One e2e English scan

Witnessed: 2026-10-27, by a fresh agent (blind). Commit: 649ee16c plus the uncommitted tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The new and refactored language specs run green | no | confirmed | chromium 47, wizard 2, mobile language specs on phone, tablet and phone-webkit 48 |
| 2 | No spec defines its own `noEnglish`, `loadAll` or `flat` | no | confirmed | grep: only `e2e/no-english.ts` |
| 3 | Every language spec uses the helper | no | partly | `languages.e2e.ts`, `languages.mobile` and `mobile-sweep` do not; `home.e2e` and `feedback.e2e` are English-only |
| 4 | Planting English in a table cell fails Catalogue, Reviews and Users | no | confirmed | `ItemCard.tsx`, the `QueueTable` revision cell and the Users `StatusCell` each failed their spec naming the key |
| 5 | The scan also bites on Home and Account › Tokens | no | partly | Home caught; the seeded user had no token, so the tokens table never rendered |
| 6 | `restLanguages` is seeded and signs in once | no | confirmed | `users.ts`, `seed.ts:58` seeds every entry |
| 7 | The helper opens closed `<details>` and splits on newline and tab | no | confirmed | `no-english.ts:40-45`; the cell mutations fail only because of the tab split |
| 8 | Reading every namespace is safe | no | partly | three messages whose English is also data needed exceptions in browse |

**Overall:** not met (rows 3 and 5).

The work after this pass: `languages-rest` creates one token through the UI before it scans; browse's unused imports went; the PLAN's Note defines which specs scan a whole page.

Witnessed: 2026-10-27, by a fresh agent (re-check, rows 3 and 5). Commit: 649ee16c plus the uncommitted tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | `languages-rest` scans Account › Tokens with a real row and catches English there in pt and fr | yes | confirmed | 24 passed; hard-coding `"never"` and the created header made `/account/tokens` fail in pt and fr naming `account.tokens.created` and `account.tokens.never`; restored with `cmp`, 18 passed |
| 3 | The PLAN's definition of "every language spec" is honest | yes | confirmed | the pages `languages.e2e.ts` and `languages.mobile` open are scanned in `languages-rest`; the 404 page is the one exception (a heading and a link) |

**Overall:** met.

## Task 5 — Phone sweep in every language

Witnessed: 2026-10-27 17:15, by a fresh agent (blind). Commit: 4cacab93 plus the uncommitted diff. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The sweep passes on phone, phone-webkit and tablet | no | confirmed | 45 passed: 15 per project, 15 per language |
| 2 | Every page runs in en, pt and fr, signed in and out | no | confirmed | 31 pages; only `/admin` and `/styleguide` are English-only; sign-in and two-factor are in |
| 3 | `MIGRATED_ROUTES` is removed | no | partly | gone from code and live docs; still named in feature 132's records (history) |
| 4 | A page file added without being in the sweep fails the coverage test | no | confirmed | a probe page failed "lists every page in the app" |
| 5 | An English-only entry must be a real page with a reason | no | confirmed | `/nope` failed "is not a page"; the exact-list pin fails on an added entry |
| 6 | pt and fr cover every page except the two | no | partly | `/setup` has `skip` in every language, so it was never swept on a phone in pt or fr |
| 7 | The sweep checks the page is in the language | no | confirmed | `html lang` after the cookie; it proves the attribute, not the text |

**Overall:** not met (rows 3 and 6).

The work after this pass: `setup-wizard-languages.e2e.ts` checks each wizard step for sideways overflow at 320px in pt and fr; the skip reason, a stale comment and the PLAN Note were reworded.

Witnessed: 2026-10-27, by a fresh agent (re-check). Commit: 4cacab93 plus the uncommitted tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The wizard e2e passes in pt and fr with `fitsPhone` | yes | confirmed | 2 passed |
| 2 | `fitsPhone` checks 320px at each of the 3 steps, in pt and fr | yes | confirmed | `setup-wizard-languages.e2e.ts:14-20`, called at 47, 52 and 56 |
| 3 | It fails when the width is narrowed | yes | confirmed | width 120 → 2 failed "sticks out"; restored |
| 4 | It fails on a real overflow in the wizard | yes | confirmed | `min-w-[400px]` on the form → "page is 441px wide in a 320px viewport"; restored and rebuilt |
| 5 | The phone sweep still passes | yes | confirmed | 15 passed on phone |
| 6 | Lint and typecheck are clean | yes | confirmed | no errors |

**Overall:** met. Not covered: WebKit and tablet for the wizard; only 320px and sideways overflow; steps after the third, validation errors and the success state.

Witnessed: 2026-10-27, by a fresh agent (blind). Commit: 4cacab93 plus the uncommitted tree. Machine: macOS (Darwin), Node not run (read and grep only).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| a | The `/setup` skip reason in `pages.ts` is true | no | confirmed | `pages.ts:57`; the spec loops pt-BR and fr-CA and calls `fitsPhone` after each step |
| b | The sweep's comments no longer say "migrated pages" and say every page runs in all three languages | no | confirmed | no `MIGRATED_ROUTES` in `apps` or `packages`; line 107 filters with `ENGLISH_ONLY_ROUTES` |
| c | The PLAN Note is true; no `MIGRATED_ROUTES` in code, `docs/knowledge` or `docs/runbooks` | no | confirmed | the sweep ignores `skip` pages, so `/setup` was never opened; grep finds only feature records |

**Overall:** met.

