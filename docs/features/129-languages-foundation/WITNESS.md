# 129 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — Inventory and dependency check

Witnessed: 2026-10-21 01:55 UTC, by a fresh agent (blind). Commit: 105bb2b5 plus uncommitted changes (apps/web/package.json, pnpm-workspace.yaml, pnpm-lock.yaml, PLAN.md). Machine: macOS (Darwin 27), Node v24, pnpm 12.6.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `next-intl` is added to apps/web at an exact version, not older than ronne-web's | yes | confirmed | `git diff apps/web/package.json` → `"next-intl": "4.14.9"`, no `^` or `~`. `../ronne-web/www/package.json:25` → `4.14.6`. Lockfile specifier is 4.14.9. |
| 2 | Release age is at least 4320 minutes | yes | confirmed | `pnpm view next-intl@4.14.9 time` → 2026-10-02T11:05Z, about 19 days before 2026-10-21. `pnpm install --frozen-lockfile` → "Lockfile passes supply-chain policies". |
| 3 | Licence is allowed | yes | confirmed | `pnpm view next-intl@4.14.9 license` → MIT. Its new dependencies are MIT, except `@swc/core` (Apache-2.0). `pnpm licenses:check` → "345 packages checked. All licenses are allowed by the policy." |
| 4 | `pnpm audit --audit-level high` passes | yes | confirmed | `pnpm audit --audit-level high` → "No known vulnerabilities found". |
| 5 | Every package with an install script is ruled on in `allowBuilds` | yes | confirmed | Only `@swc/core@1.16.18` (postinstall) and `@parcel/watcher@2.6.0` (install) have scripts; `pnpm-workspace.yaml` sets both to `false` with a comment; `pnpm ignored-builds` → "Explicitly ignored (via allowBuilds): @parcel/watcher, @swc/core, esbuild"; the frozen install passes under `strictDepBuilds`. |
| 6 | Disabling those two builds does not break typecheck | no | confirmed | `pnpm --filter @ronneai/web typecheck` → "Types generated successfully", no tsc errors. |
| 7 | The notes list the areas that need keys | yes | confirmed | Folder counts and sizes match (app 32, components/ui 28, admin-settings 16, …; 198 non-test .tsx files, 22,942 lines in features and components). |
| 8 | The notes list the error codes that need keys | yes | confirmed | `error: "<code>"` extracted from non-test src and diffed against the notes' list → identical, 38 codes. |
| 9 | The notes' counts of constant error/label maps, domain error classes, `Intl` files and added packages are accurate | yes | not met | The notes said 17 map files, 152 error classes, 12 `Intl` files, 32 packages and named `LocalTime` as formatting; the witness counted 16 files / 18 definitions, 153 classes, 15 files, 48 package versions, and no `Intl` hit in `LocalTime`. |
| 10 | The notes describe the error path: actions return `{ error: "<code>" }`, components map it with constant maps, and the OAuth device codes stay as they are | yes | confirmed | The maps exist at `features/sign-in/types.ts`, `account-security/types.ts`, `device/types.ts` and `account/types.ts`; the seven device-flow codes are in the 38-code list. |

**Overall:** not met (row 9: five wrong counts in the notes; the dependency rows and both lists were confirmed). Fixed in the notes: the package count removed, the maps and classes given with their commands (17 files and 19 definitions; 153), the `Intl` files recounted (15), `LocalTime` described through `time-text.ts`.

### Re-check (row 9 only)

Witnessed: 2026-10-21 02:10 UTC, by a fresh agent (blind re-check). Commit: 105bb2b5 plus uncommitted changes. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | The notes' counts of maps, domain error classes, `Intl` files and the LocalTime remark are accurate | yes | confirmed | From apps/web/src: the stated maps command (tests left out) → 17 files, 19 definitions; `grep -rhE "^export class \w+ extends" server/domains` → 153; `Intl.\|toLocale` over non-test files → 15 (10 UI, 5 server); `components/ui/LocalTime.tsx:4` imports `time-text`, and `time-text.ts:26` uses `Intl.DateTimeFormat`; the package count is gone from the notes. |

**Overall:** met.

## Task 2 — The saved language

Witnessed: 2026-10-20 21:58 EDT, by a fresh agent (blind). Commit: 6e556d73 plus uncommitted changes (git diff and the untracked files 0032_user_locale.ts, locale.ts, services/locale.ts, locale.db.test.ts, locale.test.ts). Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration 0032 adds a nullable `user.locale`, one migration for all three dialects, and is registered | no | confirmed | `0032_user_locale.ts`: `alterTable("user").addColumn("locale", t.string(8))`, no `notNull`; registered in `migrations/index.ts` as `"0032_user_locale"`; `schema.ts` has `locale: string \| null`. |
| 2 | The migration guard test passes | no | confirmed | `pnpm exec vitest run src/server/db/migrations/migrations.guard.test.ts` → 33 passed. |
| 3 | `Locale` and `isLocale` exist and accept only `en`, `pt`, `fr` | no | confirmed | `models/locale.ts` and `locale.test.ts`; the service test refuses `es`, `pt-BR`, `EN`, `""`, `auto`, `undefined`, `3`, `{}`. |
| 4 | `*.db.test.ts` pass on SQLite | no | confirmed | `cd apps/web && pnpm exec vitest run src/server/domains/identity src/server/db` → 86 files, 843 passed, 10 skipped. |
| 5 | The same db tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:<kind> <path>` once per file on each kind: locale (7), user-data-export (10), erase-user (10), disabled-users (3), migrate (5) → 15 of 15 runs passed. |
| 6 | The session user carries `locale`; a stale value reads as null | no | confirmed | `findActiveUser` returns `isLocale(row.locale) ? row.locale : null`; the db test writes "de" and gets null; passes on all four kinds. |
| 7 | `setLocale` refuses an invalid value and writes nothing | no | confirmed | Service returns `invalid_locale` before any write; the test saves "pt", sends 8 bad values, the stored value is still "pt". |
| 8 | null clears; it needs sign-in; a disabled or erased account is left alone | no | confirmed | Tests for null, no headers (`not_signed_in`) and a disabled account; the repository update has `where erased_at is null`. Permission check and erased guard read in code only. |
| 9 | No other user's row changes | no | confirmed | `where id = userId`; the test "changes only the caller's own language". |
| 10 | "Your data" (104) includes the saved language | no | confirmed | `kysely-user-data-repository.ts` selects `locale`; the export test seeds "pt" and expects `account.locale: "pt"`; passes on four kinds. |
| 11 | Erasing a user clears `locale` | no | confirmed | `kysely-erase-repository.ts` sets `locale: null`; the erase test seeds "fr" and expects null; four kinds. |
| 12 | Typecheck and lint are clean | no | confirmed | `pnpm typecheck` → 7 of 7 successful; `pnpm lint` → exit 0. |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-20 22:10 EDT, by a fresh agent (adversarial). Commit: 6e556d73 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24. Mutations ran in a scratch copy of the repository.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `user.locale` exists on all three dialects, nullable, registered in order | no | confirmed | `pnpm test:db:postgres`, `:mysql`, `:mariadb` on `locale.db.test.ts` → 7/7 each; `migrations.guard.test.ts` → 33 passed; `migrate.db.test.ts` on SQLite → 5 passed. |
| 2a | `setLocale` accepts only `en`, `pt`, `fr` or null, from any caller | no | confirmed | A probe over `isLocale`: false for `"ｅｎ"`, `" en"`, `"en\n"`, `"__proto__"`, `["en"]`, objects with `toString`/`valueOf` giving "en", a 1 MB string, `"EN"`, `"pt\0"`, `new String("en")`, a Symbol, `NaN`, `true`; true for the three codes. |
| 2b | Writes only the signed-in caller's row | no | confirmed | The service uses `user.id` from `currentUser(headers)`; the action has no user-id parameter; `grep setLocale` finds no caller outside identity. |
| 2c | Never writes an erased or disabled account's row | no | partly | A disabled account is refused. With `.where("erased_at","is",null)` removed from the repository, 30/30 tests still passed: no test called `repo.setLocale` on an erased id. |
| 2d | Writes nothing on refusal | no | confirmed | Eight bad values leave "pt" stored; removing the `isLocale` check fails the test. |
| 3 | The value is on the session user; a stale value reads as null | no | confirmed | Replacing the `isLocale` guard with a cast fails the "no longer supports" test. |
| 4a | The data download contains `locale` | no | confirmed | Dropping `locale` from the select or the output fails the export test; four kinds. |
| 4b | Erasing a user clears it | no | confirmed | Removing `locale: null` fails the erase test; four kinds. |
| 5 | The tests really fail without the code | no | partly | Four of five mutations failed a test; removing the erased-row guard failed none. |
| 6 | Nothing logs or audits the value; no action can set another person's language | no | confirmed | No logger or `recordAudit` in `services/locale.ts`; the action signature has no user-id parameter. |

**Overall:** not met (rows 2c and 5: the repository's erased-row guard had no test). Fixed: three tests in `kysely-identity-repository.db.test.ts` (`setLocale (129)`), one of them calling `repo.setLocale` on an erased id.

### Re-check (rows 2c and 5), adversarial

Witnessed: 2026-10-20 22:25 EDT, by a fresh agent (adversarial). Commit: 6e556d73 plus the uncommitted working tree, now with the new tests. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2c | `setLocale` never writes an erased or disabled account's row | no | confirmed | The new test "leaves an erased account alone (103)" sets `erased_at`, calls `repo.setLocale(id, "fr")` and expects null; with the `where` line removed in the scratch copy it failed; restored, 9/9 passed. |
| 5 | The tests really fail without the code | no | confirmed | All five mutations now fail a test, the erased-row one included: unmutated 9/9, mutated 1 failed and 8 passed, restored 9/9 (SQLite); PostgreSQL 9/9. `pnpm typecheck` → 7 of 7; `pnpm lint` → no errors. |

**Overall:** met.

## Task 3 — Choosing the language

Witnessed: 2026-10-20 22:15 EDT, by a fresh agent (blind). Commit: b0c6f2a8 plus the uncommitted diff (`next.config.ts`, `layout.tsx`, untracked `apps/web/src/i18n/`). Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 1 | The order is saved → cookie → Accept-Language → `en`, first match wins | no | confirmed | `chooseLocale` uses `??` in that order; `server.test.ts` (mocked session) has saved `pt` beating cookie `fr` and browser `en`. Mutations in a scratch copy: saved and cookie swapped fails 2 tests; cookie step removed fails 4; the default changed to `fr` fails 3. |
| 2 | Unit tests cover each step | no | confirmed | `pnpm exec vitest run src/i18n` → 2 files, 16 tests passed; one `chooseLocale` case per step, and `server.test.ts` through `requestLocale`. |
| 3 | `pt-PT` → `pt`, `fr-CA` → `fr`, `es` → English | no | confirmed | `matchAcceptLanguage("pt-PT")` → `pt`, `"fr-CA"` → `fr`, `"es"` → null, `chooseLocale({acceptLanguage:"es"})` → `en`; removing the primary-subtag step breaks the tests. |
| 4 | Quality values are respected | no | partly | Sorting by weight is tested (with the sort removed, 1 test fails). Removing the `q=0` skip left all 16 tests green: a lone `fr;q=0` was never tested. |
| 5 | A stale cookie and a removed saved value are skipped | no | confirmed | `{saved:"de", cookie:"fr"}` → `fr`; `parseLocale` replaced with a cast fails 2 tests; live: `Cookie: ronne-locale=de` with `Accept-Language: pt` gives `lang="pt"`. |
| 6 | The cookie is `ronne-locale`, httpOnly, SameSite=lax, path `/`, one year, validated | no | partly | A test pins all four values; validation is `parseLocale` on every request. Nothing in this change sets the cookie yet (belongs to tasks 7 and 8). |
| 7 | `next-intl` request config without URL prefixes | no | confirmed | `request.ts` is `getRequestConfig` returning `{locale: await requestLocale(), messages: {}}`; `next.config.ts` wraps the config with `createNextIntlPlugin`; no middleware or `[locale]` segment. |
| 8 | `<html lang>` in the root layout follows the chosen language | no | confirmed | Production build on a free port with a missing env file: `curl -L /setup`: no header → `en`; `pt-PT,en;q=0.5` → `pt`; `fr-CA` → `fr`; `es` → `en`; `ronne-locale=fr` with `Accept-Language: pt` → `fr`; cookies `de` and `<x>` ignored; a 5000-character header → `en`. |
| 9 | `requestLocale` still answers when the session can't be read | no | confirmed | `server.ts` wraps `getCurrentUser` in try/catch; the test passes and the live server (no database) answers. |
| 10 | Lint and typecheck are clean | no | confirmed | `pnpm lint` → exit 0; `pnpm typecheck` → exit 0. |
| 11 | Naming: `chooseLocale` and `requestLocale` instead of the plan's `resolveLocale` | no | partly | Same behaviour; the plan text still said `resolveLocale`. |

**Overall:** not met (row 4: no test failed without the `q=0` skip; row 6: the setter belongs to later tasks; row 11: the plan's names). Fixed: two assertions in `locale.test.ts` (a lone `fr;q=0` is null), and the plan's task 3 text now names `chooseLocale` and `requestLocale` and says setting the cookie is tasks 7 and 8.

### Re-check (rows 4, 6, 11)

Witnessed: 2026-10-20 22:30 EDT, by a fresh agent (blind re-check). Commit: b0c6f2a8 plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence |
|---|---|---|---|---|
| 4 | Quality values are respected, including `q=0` meaning "not acceptable" | no | confirmed | With `weight === 0 \|\|` removed in the scratch copy, `vitest run src/i18n` → 1 failed, 15 passed (`expected 'fr' to be null`); restored → 16 of 16. |
| 6 | The cookie's name, flags and validation (it is not set here) | no | confirmed | The plan's task 3 text now scopes setting the cookie to tasks 7 and 8; flags and validation unchanged. |
| 11 | Naming matches between the plan and the code | no | confirmed | The plan names `chooseLocale` and `requestLocale`, as `locale.ts` and `server.ts` do; no `resolveLocale` is left. |
| 10 | Lint and typecheck are clean | no | confirmed | `pnpm lint` → exit 0; `pnpm typecheck` → exit 0. |

**Overall:** met.

## Task 4 — Message files and the guards

Witnessed: 2026-10-20 22:30 EDT, by a fresh agent (blind). Commit: 85c41871 plus the uncommitted working tree (messages/, src/i18n/*, the five i18n-raw-jsx-*.grit plugins, biome.json, request.ts, apps/web/package.json, pnpm-lock.yaml). Machine: macOS (Darwin 27), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Message files exist as `apps/web/messages/<locale>/<namespace>.json` for en, pt, fr | no | confirmed | `common.json` in each; `namespaces.ts` has `NAMESPACES = ["common"]`; `language.label` and `language.automatic` in each. |
| 2 | The loader merges the files at request start, and `request.ts` uses it | no | confirmed | `loadMessages` merges each namespace via `mergeWithFallback`; `request.ts` returns `messages: await requestMessages(locale)`. |
| 3 | The task's own tests pass | no | confirmed | `cd apps/web && pnpm exec vitest run src/i18n` → 6 files, 46 tests passed. |
| 4 | The parity test fails on a key missing in `pt` | no | confirmed | Scratch copy, `pt/common.json` cut to one key → `messages.parity.test.ts` fails on "pt/common has every key of English…"; unmodified → 7 passed. |
| 5 | Parity also fails on a key only in `fr`, a renamed or dropped placeholder, invalid ICU, a plural without `other` | no | confirmed | One mutation each in the scratch copy: all fail. |
| 6 | A missing key renders the English text, never a raw key | no | confirmed | `messages.test.ts` "shows English for a message the language misses, and says so once" passes; with the fallback replaced by `other as string` it fails. |
| 7 | The fallback is logged as a warning once per process and language, leaking nothing | no | confirmed | `messages.ts` logs locale, namespace, count and at most 20 key names, no message text; a `warned` Set limits it. |
| 8 | The lint rule fails on a sample file | no | confirmed | `biome lint` on a sample under `apps/web/src/i18n/`: errors on raw JSX text, `title="Hello"`, `{"Hi there"}`, ternary strings (both branches), `{n && "Shown"}`, a template literal, `title={"Braced"}`, `aria-label={n ? "a b" : t("k")}`: 14 in all. |
| 9 | The lint rule passes on a clean file | no | confirmed | `t("k")`, `<code>`, `<pre>`, `<kbd>`, `·`, `{n}`, `` {`${n}`} ``, className and id strings, and a `biome-ignore lint/plugin` line: no diagnostics. |
| 10 | Existing rules still apply in the override folder | no | confirmed | `function f() {…}` in the sample was flagged by `no-function-declaration`. |
| 11 | The guard has its folder list, and the plugins are tested on fixtures | no | confirmed | `biome.json` override `includes: ["apps/web/src/i18n/**"]` loads the 5 plugins; `raw-text.test.ts` tests the fixtures, the plugin list and that the listed folders exist. |
| 12 | The repo is green with the change | no | confirmed | `pnpm lint` → exit 0; `pnpm typecheck` → exit 0. |
| 13 | The dev dependency is exact and the license and audit checks pass | no | confirmed | `"@formatjs/icu-messageformat-parser": "3.5.21"`; `pnpm licenses:check` → 345 packages allowed; `pnpm audit --audit-level high` → none. |
| 14 | The JSON files are bundled in the production build | no | can't check here | `pnpm build` was not run and nothing imported next-intl at runtime yet, so the files were not in `.next`. |

**Overall:** not met (row 14 could not be checked: nothing used the messages at runtime). Fixed: `layout.tsx` now wraps the page in `<NextIntlClientProvider>`, which inherits the language and messages from `request.ts`, so the files are in the build.

### Re-check (row 14 and the layout.tsx diff)

Witnessed: 2026-10-20 22:40 EDT, by a fresh agent (blind). Commit: 85c41871 plus the uncommitted working tree, now with `layout.tsx` wrapping the body in `<NextIntlClientProvider>`. Machine: macOS (Darwin 27), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | The JSON message files are in the production build | no | confirmed | `find apps/web/.next/server -name '*messages*'` → `chunks/ssr/apps_web_messages_{en,fr,pt}_common_json_…js`; `.next/BUILD_ID` newer than `layout.tsx`. |
| 15 | The production server picks the language by Accept-Language, English as the fallback | no | confirmed | Own server on a free port: `curl -sL /setup`: `pt-BR` → `lang="pt"` and `Idioma`; `fr-CA` → `lang="fr"` and `Langue`; `en` → `lang="en"` and `Language`; `es` → `lang="en"` and `Language`. |
| 16 | The `ronne-locale` cookie beats Accept-Language | no | confirmed | `Cookie: ronne-locale=fr` with `Accept-Language: pt` → `lang="fr"` and `Langue`. |
| 17 | The diff did not break the checks | no | confirmed | `pnpm lint` → 0; `pnpm typecheck` → 0; `vitest run src/i18n` → 46 passed. |

**Overall:** met.

## Task 5 — Shared UI pieces

Witnessed: 2026-10-20 22:35 EDT, by a fresh agent (blind). Commit: fbca7886 plus the uncommitted working tree (the changed components and messages, and untracked `e2e/languages.e2e.ts`, `app/error.tsx`, `app/not-found.tsx`, `components/ui/translations.test.tsx`, `src/test/`). Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component tests render each shared piece in en, pt and fr | no | confirmed | `vitest run src/components/ui src/i18n` → 19 files, 157 passed; `translations.test.tsx` covers Dialog Close, CopyableCommand, PasswordInput, FieldError and FieldWarning, NewTabLink, DirtyMark, the unsaved dialog, the DataTable pager and empty state, the sr-only "Actions" header, FilterChips, and the 404 and error pages, each in three locales. |
| 2 | The Help popover frame ("Learn more") is translated and tested in the three languages | no | partly | `HelpTip.tsx` uses `t("learnMore")` and the messages exist, but no test asserted "Saiba mais" or "En savoir plus". |
| 3 | The lint rule covers `components/ui`, the 404 page and the error page (not test files) | no | confirmed | The `biome.json` override lists them with `!**/*.test.tsx`; `biome lint apps/web/src/components/ui apps/web/src/app` → no raw-text diagnostics (one `noUnusedImports` warning that is also in HEAD). |
| 4 | A raw string added to `Dialog.tsx` is flagged | no | confirmed | Scratch copy: text added after `<X/>` → "Found 1 error" at that line. |
| 5 | Lint, typecheck and the whole unit project pass, so the global next-intl mock breaks no test | no | confirmed | `pnpm lint` → 0; `pnpm typecheck` → 0; `vitest run --project unit` → 190 files, 2335 passed. |
| 6 | The 404 and error pages are new, translated, and render in the person's language in the real app | no | confirmed | `playwright test e2e/languages.e2e.ts --project=chromium` → 5 passed: 404 status and `<html lang>` right for en-US, pt-BR, fr-CA; es-ES falls back to English; the dialog Close reads "Fechar" for pt-BR. |
| 7 | Numbers follow the language; counts are ICU messages | no | confirmed | `table.count` is identical in the three files; the test asserts "12,345+ things", "12.345 things" and `12\s345 things`. |
| 8 | Timestamps keep their numeric form | no | confirmed | `time-text.ts` untouched (`YYYY-MM-DD HH:mm TZ`); `LocalTime.tsx` still sets the UTC `title`. |
| 9 | The test setup renders in English, or in another language with `inLocale` | no | confirmed | `intl-setup.ts` mocks `next-intl` and `next-intl/server` over the real message files with the English fallback; `vitest.config.ts` lists it in the unit project's `setupFiles`. |
| 10 | A key-parity or placeholder gap fails CI | no | confirmed | Scratch copy: `pt` `table.firstPage` renamed → the parity test and `translations.test` both fail. |
| 11 | The tests fail if the code goes back to hard-coded English | no | confirmed | DataTable count back to `toLocaleString("en-US")` → test fails; Dialog `aria-label` back to `"Close"` → test fails. |
| 12 | No user-facing English is left in `components/ui` that the lint rule can't see | no | partly | `FilterChips.tsx` built `{labels[key]}:` with a hard-coded colon, so French got "Nom:" instead of "Nom :". Callers still pass English `noun`, `empty`, `labels`, `header` (later tasks). |
| 13 | Portuguese (Brazil) and French (Canada) wording and punctuation are correct | no | partly | French `error.message` said "Réessayez; si" with no space before the semicolon. |
| 14 | The spec deviations are recorded in `SPEC.md` and `PLAN.md` | no | confirmed | Numbers follow the language, timestamps keep their numeric form, the new 404 and error pages, and the Done-when wording are in both files. |

**Overall:** not met (rows 2, 12, 13). Fixed: a HelpTip test in pt and fr; the French semicolon; a `table.filterLabel` message (`{label}:`, `{label} :` in French) used by FilterChips.

### Re-check (rows 2, 12, 13)

Witnessed: 2026-10-20 22:50 EDT, by a fresh agent (blind re-check). Commit: fbca7886 plus the uncommitted working tree. Machine: macOS, Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The Help popover frame ("Learn more") is translated and tested in the three languages | no | confirmed | New HelpTip test renders en, pt and fr; with `{t("learnMore")}` replaced by the literal in the scratch copy it fails (1 failed, 2 passed); restored, 158 passed. |
| 12 | No user-facing English is left in `components/ui` that the lint rule can't see | no | confirmed | `FilterChips.tsx:42` uses `t("filterLabel", { label })`; with the hard-coded colon back, the FilterChips case fails; restored, it passes. |
| 13 | Portuguese (Brazil) and French (Canada) wording and punctuation are correct | no | confirmed | `fr` `error.message` now "Réessayez ; si…"; all three `common.json` re-read: nothing else found. |

Whole suite after the change: `vitest run --project unit` → 190 files, 2336 passed; `pnpm lint` → 0; `pnpm typecheck` → 0.

**Overall:** met.
