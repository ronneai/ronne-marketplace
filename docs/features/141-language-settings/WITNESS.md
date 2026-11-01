# 141 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — Decision

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 1ad89a71 plus the uncommitted diff to the 132 SPEC and MVP.md. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 "Languages" says root sets the default, whether people may choose and which languages are offered | no | confirmed | line 999: "Planned in 141 … root sets the instance default language, whether people may choose, and which languages are offered" |
| 2 | The row's older text ("no instance default language", "else English") doesn't contradict it | no | partly | the old sentence stood without saying 141 supersedes it |
| 3 | The 132 SPEC points to 141 for the instance default, in Out and in Open questions | no | confirmed | `git diff` of the 132 SPEC |
| 4 | README lists 141 under M19 with its dependencies | no | confirmed | line 361: `129, 132, 122, 007`, same as the SPEC header |
| 5 | The 141 SPEC Goal, Scope and Decisions agree with the MVP row and the 132 pointers | no | confirmed | read |
| 6 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** not met: row 2.

### Re-check

Witnessed: 2026-10-31, by a fresh agent (blind, row 2). Commit: 1ad89a71 plus the uncommitted diff. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | MVP.md:999 reads as superseded by 141 and agrees with the SPEC | no | confirmed | "there was no instance default language (a possible later feature, then planned in 141 below)" and "else English (…; the instance's default once 141 is built)" |
| 6 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** met.


## Task 2 — Choosing with the instance's settings

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 48d76e23 plus the uncommitted diff. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `chooseLocale` takes the instance's offered languages and default: off returns the default; on goes saved, cookie, browser, default, skipping a language not offered at each step | no | confirmed | `instance: { default, choosing, offered }` carries the same as separate `offered` and `fallback`; removing the choosing-off return fails 1 test, the offered filter on the cookie fails 2, on the browser 2 |
| 2 | The model and service: three keys, the default always offered, garbage reads as its default, nothing stored gives the defaults | no | confirmed | dropping `wanted.add(fallback)` fails 2 model tests |
| 3 | `requestLocale` reads the settings once per request and falls back as today when it can't | no | confirmed | `requestLanguagePolicy` is wrapped in `cache` and returns null on failure; `server.test.ts`; the cache was read, not run |
| 4 | The unit tests pass | no | confirmed | 24 files, 466 tests |
| 5 | The db tests cover the settings service on SQLite and the servers | no | confirmed | 4 passed on SQLite, PostgreSQL, MySQL and MariaDB |

**Overall:** met. The witness ran its mutations in the working tree and restored them (checked byte for byte); the implementer reran the tests after.


## Task 3 — Settings › Languages

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 647b1428 plus the uncommitted working tree. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The tab is in 122's strip and `?tab=languages` renders it, for root only | no | confirmed | `tabs.ts`, `page.tsx`; `languages.test.tsx` strip and 404 |
| 2 | The default's box is ticked and locked, and the lock moves with the default | no | confirmed | removing the hidden field in a scratch copy fails "locks the default's box" |
| 3 | The switch off hides the list, and the ticks are kept when it comes back | no | confirmed | `hidden={false}` fails 2 tests |
| 4 | The "reads as off" note appears when only the default is offered and is gone otherwise | no | confirmed | forcing `readsAsOff` false fails 2 tests |
| 5 | Without JavaScript the locked default is still sent, and the server also adds the default | no | confirmed | removing `wanted.add(fallback)` fails 2 db tests |
| 6 | A default that isn't a language is refused; an empty list becomes the default alone; a non-root actor is refused | no | confirmed | `InvalidLanguageError`, `requirePermission`; db tests |
| 7 | Saving the same values twice writes no row and no audit event | no | confirmed | removing the early return fails 3 tests |
| 8 | The audit event records who, the IP, the target, and from/to (db test) | no | confirmed | cutting `to` down to `{default}` fails the test |
| 9 | The audit sentence reads correctly from empty and rich metadata in en, pt and fr | no | confirmed | `summary.test.ts`, the fixture, the key-parity tests |
| 10 | A saved `user.locale` survives a language turned off | no | confirmed | db test |
| 11 | The tests pass on SQLite and the three servers | no | confirmed | 645 unit tests; 7 db tests; 11 on each server |

**Overall:** met.


## Task 4 — What hides when choosing is off

Witnessed: 2026-11-01, by a fresh agent (blind). Commit: 2b08216d plus the uncommitted diff. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `LanguageSwitch` shows nothing with fewer than two languages and lists only the offered ones | no | confirmed | `LanguageSwitch.tsx`; `language-switch.test.tsx` |
| 2 | `AuthShell` drops the whole header when choosing is off and passes `languages` to the switch | no | confirmed | always rendering the header fails 2 tests |
| 3 | Sign-in, two-factor and setup pass `requestChoosableLocales()` to the shell | no | confirmed | read; the e2e saw no `/language` links on sign-in |
| 4 | When the settings can't be read every language shows | no | confirmed | `requestChoosableLocales` returns all languages for a null policy; read, not run against a down database |
| 5 | Account › Language is a 404 with choosing off or one language, and the tab is hidden on Password and Security | no | confirmed | removing `notFound` fails 2 tests; the tab filter fails 1; the e2e saw the 404 |
| 6 | A saved language that isn't offered is not changed; the form shows Automatic with the note, in three languages | no | confirmed | `page.test.tsx`; dropping the note fails it |
| 7 | The cookie and saved locale are ignored when not offered or with choosing off, never rewritten; `<html lang>` follows | no | confirmed | `locale.ts`; the e2e with a pt-BR browser saw `lang="fr"` |
| 8 | Component tests cover both states | no | confirmed | 93 files, 1039 tests |
| 9 | The e2e turns choosing off with French as the default and sees sign-in and Account in French with no language links | no | confirmed | `playwright test e2e/language-settings.e2e.ts --project chromium` → 1 passed |
| 10 | `requestChoosableLocales` always returning all languages is caught | no | can't check here | the scratch copy could not load core and the e2e needed a rebuild |

**Overall:** not met: row 10.

### Re-check

Witnessed: 2026-11-01, by a fresh agent (blind, row 10). Commit: 2b08216d plus the uncommitted diff. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | The tests for `requestChoosableLocales` fail if it always returns all languages, drops the `choosing` check, or returns [] for a null policy | yes | confirmed | 12 passed; in a scratch copy: always `LOCALES` fails 3, no `choosing()` fails 2, `[]` for null fails 1 |
| 11 | The settings forms' tests still pass after the checkbox markup change | yes | confirmed | `src/features/admin-settings` → 14 files, 210 tests |

**Overall:** met.


## Task 5 — Messages

Witnessed: 2026-11-01, by a fresh agent (blind). Commit: 1c515cfe plus the uncommitted line in `apps/web/e2e/pages.ts`. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The parity and raw-text tests pass | no | confirmed | `npx vitest run src/i18n src/features/admin-settings src/features/admin-audit src/features/account` → 44 files, 719 tests |
| 2 | `pnpm lint` passes, including the raw-JSX plugins | no | confirmed | 42 warnings, 4 infos, no errors |
| 3 | No raw user-facing string in the new components | no | confirmed | grepped the new components for literal JSX text and attributes |
| 4 | Every new key is in en, pt and fr with the same ICU placeholders | no | confirmed | the parity test; the diffs of `admin.json`, `account.json`, `errors.json` |
| 5 | The parity test catches a renamed placeholder | no | confirmed | `{name}` → `{nome}` in pt `account.json` failed it; restored |
| 6 | The phone sweep passes on the new tab | no | confirmed | `playwright test e2e/mobile-sweep.mobile.e2e.ts --project phone --grep "as root\|no page scrolls sideways"` → 6 passed (en, pt, fr) |
| 7 | fr typography: no straight apostrophes; a space before ':' only | no | confirmed | `git diff main -U0 -- messages/fr` grepped |
| 8 | The pt and fr copy is real translation | no | partly | natural translation; native judgement belongs to the 133 review |

**Overall:** not met: row 8.

### Re-check

Witnessed: 2026-11-01, by a fresh agent (blind, row 8). Commit: 1c515cfe plus the uncommitted line in `apps/web/e2e/pages.ts`. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | The pt and fr copy feature 141 added is a real translation that follows the written glossary and typography rules | no | confirmed | read every added string; the glossary terms match `docs/knowledge/i18n.md` (it has no entry for "language", "offered" or "default"); ’ everywhere in fr, spacing right; você and vous. The 133 native-speaker review of the new pt and fr strings is still pending: this confirms the written rules only |

**Overall:** met. The 133 native review of the new pt and fr strings is outstanding.


## Task 6 — Documentation

Witnessed: 2026-11-01, by a fresh agent (blind). Commit: bdd13d80 plus the uncommitted diff; ronne-web `docs/marketplace-141-language-settings`, uncommitted. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm docs:links` passes | no | confirmed | "Compared 37 topics with the website's." |
| 2 | The app's help and i18n tests pass | no | confirmed | 22 files, 419 tests |
| 3 | The website's tests, typecheck and lint pass | no | confirmed | 193 passed; typecheck and lint clean |
| 4 | The helper lands on a real section | no | confirmed | `Help.tsx` `"language-choice"` → `settings#languages`; both `topics.ts` list it; en/pt/fr define it |
| 5 | The helper is on the tab, in three languages | no | confirmed | `LanguagesForm.tsx`; `help.json` ×3 |
| 6 | Choosing off: everyone sees the default; Account has no Language tab (404); no language menu on sign-in, two-factor and setup | no | confirmed | `chooseLocale`, `account/language/page.tsx`, `AuthShell` |
| 7 | The default replaces English as the last step | no | confirmed | `chooseLocale` ends in `?? instance.default` |
| 8 | The offered list always holds the default; with nothing else offered it reads as off | no | confirmed | `language-policy.ts` |
| 9 | A language not offered is skipped, never erased; Account shows Automatic with a note | no | confirmed | `chooseLocale`; `notOffered` |
| 10 | Before setup or with the database down the language is chosen as before | no | confirmed | `chooseLocale` without `instance` |
| 11 | Each save is audited | no | partly | the website said "each save"; a save that changes nothing writes no event |
| 12 | The UI names the docs use match the app in en, pt and fr | no | confirmed | tab, switch, default, offered, Automatic |
| 13 | The website's Account topic step 4 reads "English, or the default language root has set", linked to `settings#languages` | no | confirmed | `account.tsx` ×3 |
| 14 | `docs/knowledge/i18n.md` has the order including the instance's settings | no | confirmed | the new section "Which language a request gets" matches `chooseLocale` |
| 15 | The pt and fr website copy follows the language rules | no | partly | no false claim; the 133 review is pending |

**Overall:** not met: rows 11 and 15.

### Re-check

Witnessed: 2026-11-01, by a fresh agent (blind, rows 11 and 15). Commit: bdd13d80 plus the uncommitted diff; ronne-web uncommitted. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 11 | Each change to the languages is audited; a save that changes nothing is not | no | confirmed | `setLanguagePolicy` returns `{changed:false}` before any write or audit; the website says so in en, pt and fr |
| 15a | The pt and fr website copy follows the written glossary and typography rules in `docs/knowledge/i18n.md` (spacing, apostrophes, você and vous, the app's UI names and terms) | no | confirmed | punctuation scan of the added fr and pt lines; straight apostrophes allowed on the website; the UI names match the app messages. Limit: a mechanical and glossary check, not a native read |
| 1 | `pnpm docs:links` | no | confirmed | "Compared 37 topics with the website's." |
| 3 | The website's tests and lint | no | confirmed | 193 passed; lint clean |

**Overall:** met. Outstanding, and no pass can do it: the 133 native-quality review of the pt and fr website copy. It is listed as an open item, not as a claim.
