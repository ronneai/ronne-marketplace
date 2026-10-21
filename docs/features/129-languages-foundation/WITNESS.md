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
