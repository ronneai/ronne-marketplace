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
