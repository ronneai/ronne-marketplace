# 126 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — The state table

Witnessed: 2026-10-21 22:20 local, by a fresh agent (blind). Commit: bb596efe plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration `0034_user_onboarding` creates `user_onboarding` (`user_id` PK, `hidden_at`, `install_confirmed_at`, `completed_seen_at`, `updated_at`), is registered, and is safe to rerun | no | confirmed | `0034_user_onboarding.ts`, `index.ts` and `schema.ts` (`UserOnboardingTable`) read; "is safe to run again" passes on SQLite, PostgreSQL, MySQL and MariaDB. |
| 2 | The foreign key to `user` cascades on delete | no | confirmed | "has one key, to the user, that cascades" and "goes with them" pass on all four databases. |
| 3 | No row gives defaults; writes don't touch other users or columns; the first time is kept for a confirmed install and a seen "You're set up"; concurrent writes don't undo each other | no | confirmed | `kysely-onboarding-repository.db.test.ts` → 8 tests passed; the implementation (an upsert plus an "is null" update) read. |
| 4 | "Your data" (104) includes the row, and null when there is none | no | confirmed | `privacy.db.test.ts` "the data file" (2 tests) through `exportUserData`: null, filled, and not another person's. |
| 5 | Erase (103) removes the row and leaves others' | no | confirmed | Removing `repo.deleteOnboarding` from `erase-user.ts` made "deletes the person's row and leaves everyone else's" fail (1 failed, 3 passed). |
| 6 | `*.db.test.ts` pass on SQLite and, once, on the other servers | no | confirmed | SQLite: 35 files, 402 tests passed; `pnpm test:db:postgres`, `:mysql`, `:mariadb` on onboarding and 0034 → 3 files, 15 tests each; typecheck clean. |
| 7 | The data-export and erase tests are extended | no | partly | No existing export or erase test file was modified: the coverage was in a new file. |
| 8 | MVP.md's table list and the 103 and 104 SPECs are updated | no | confirmed | `git diff` shows one line in each. |

**Overall:** not met: row 7.

### Re-check (row 7)

Witnessed: 2026-10-21 22:35 local, by a fresh agent (blind re-check). Commit: bb596efe plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The data-export and erase tests are extended | yes | confirmed | `erase-user.db.test.ts` and `user-data-export.db.test.ts` now seed a `user_onboarding` row; the erase list has `user_onboarding`, the export asserts `data.onboarding`. SQLite and PostgreSQL → 20 of 20 passed. Removing `deleteOnboarding` failed the existing erase test; removing `onboarding,` from the export failed the existing export test; both restored, `cmp` matched. |

**Overall:** met.

## Task 2 — Reading the steps

Witnessed: 2026-10-21 22:25 local, by a fresh agent (blind). Commit: 8fe52798 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The service returns each step's state and the panel's visibility (`hidden`, `completed_seen_at`); signed out is refused | no | confirmed | `services/getting-started.ts` reads the facts and the state, and `gettingStartedOf` returns `done`, `count`, `current`, `complete`, `hidden`, `panel`; a test covers `ForbiddenError`. |
| 2 | Step 1 is a token that isn't revoked, the person's own | no | confirmed | The tests (revoked, a second one that isn't, `rmk login --web`, someone else's) pass; removing the revoked filter in a scratch copy failed 2 tests. |
| 3 | Step 2 is a used token (even revoked since) or an approved or spent device grant, not pending, denied or expired; the person's own | no | confirmed | The tests cover each grant status and someone else's data; dropping the grant branch failed the grant test. |
| 4 | Step 3 is the person's word only; a usage `install` total ticks nothing | no | confirmed | A `usage_daily` row with `event: install`, `count: 9`, plus a used token → `install` false; `confirmInstall` ticks it for that person only. |
| 5 | Step 4 is a draft or a submission in any status, the person's own | no | confirmed | Another person's draft leaves it false; a rejected one still counts. |
| 6 | "N of 4", the first undone step, step 4 doesn't block completion, a draft alone doesn't complete | no | confirmed | `models/getting-started.test.ts` covers 0, 1, 2, 3 and 4 done. |
| 7 | "You're set up" once, then null; an account with only a token sees step 1 ticked | no | confirmed | "a long-time account with everything done": `setUp`, then null; "only a token": `steps`, count 1. |
| 8 | Hiding wins, finished or not; showing again brings back what is true | no | confirmed | The unit test "hiding wins" and the db test "hides, and shows again". |
| 9 | Tests pass on SQLite and the three servers | no | confirmed | SQLite → 4 files, 33 tests; `pnpm test:db:postgres`, `:mysql`, `:mariadb` → 15 of 15 each. |
| 10 | SPEC.md's "Existing accounts" wording matches the behaviour | no | confirmed | The diff says a long-time user sees "2 of 4" until they confirm or hide, then "You're set up" once. |

**Overall:** met.

## Task 3 — Actions

Witnessed: 2026-10-21 22:25 local, by a fresh agent (blind). Commit: 1008254b plus the uncommitted working tree. Machine: macOS (Darwin), SQLite only.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Hide hides the panel for the signed-in person only | no | confirmed | `hideGettingStarted` calls `onboarding.hide(signedIn(actor).id, …)`; "hides, and shows again, for the person alone" passes. |
| 2 | Confirm installed ticks step 3, keeps the first time, changes no one else | no | confirmed | "confirms an install…": two calls, the first time kept, uma true and ben false. |
| 3 | Show again clears hidden and seen, keeps the confirmed install, and a finished person gets "You're set up" | no | confirmed | "shows 'You're set up' again…" gives `setUp`; `show` sets only `hidden_at` and `completed_seen_at` to null (the repository test covers the install staying). |
| 4 | `markSetUpSeen` marks only while the panel is "setUp", and the panel is gone next visit | no | confirmed | Removing the `state.panel !== "setUp"` guard made "marks 'You're set up' seen only when it is being shown" fail; restored. |
| 5 | One person can't change another's; signed out is refused | no | confirmed | No action takes a person's id; `actions.test.ts` asserts one `Headers` argument; "refuses every one of them when nobody is signed in" leaves `user_onboarding` empty. |
| 6 | The form actions are plain forms, refresh the pages, and let a refusal through | no | confirmed | Three `serverAction`-wrapped `(): Promise<void>` actions; `actions.test.ts` covers each and the refusal. |
| 7 | The `serverAction` guard test passes with the new file | no | confirmed | `vitest run src/server/http/server-action.test.ts …` → 58 passed. |
| 8 | Action tests cover each action and cross-person isolation | no | confirmed | Rows 1–5. |

**Overall:** met.

## Task 4 — The panel

Witnessed: 2026-10-21 22:35 local, by a fresh agent (blind). Commit: 41044c6e plus the uncommitted working tree. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Four steps, each with one sentence and one action | no | confirmed | `GettingStartedPanel.tsx` has four `StepRow`s linking `/account/tokens`, `/catalogue`, `/submissions/new` and the export docs; "links the steps to where they happen" passes. |
| 2 | "N of 4 done", ticked steps, first undone highlighted, step 4 optional | no | confirmed | Tests for 0, 1, 2 and 3 of 4 and "all done" check `aria-current="step"` and the Done / Not done yet text; 53 tests passed. |
| 3 | Commands carry the instance address, including `--web`, each with a copy button | no | confirmed | `rmk login --registry https://market.example --web` and the `--token <token>` line via `CopyableCommand`; `<url>` with no address; Home passes `loadConfig().publicUrl`. |
| 4 | Commands are shared with the tokens page | no | confirmed | `commands.ts` `rmkCommands`; `CliAuthPanel.tsx` builds every line from it; a test finds the same lines in both. |
| 5 | The npm install line only while the person has no token | no | confirmed | `state.done.token ? null : install`; the test passes. |
| 6 | No token value anywhere | no | confirmed | Only the `<token>` placeholder; a test checks for no `rmk_…` string; the component takes no token. |
| 7 | Hide and "I've installed one" are forms | no | confirmed | `<form action={…FromForm}>` with `type="submit"`; 2 forms undone, 1 once said. |
| 8 | "You're set up": links, no steps, no forms | no | confirmed | The test passes; the link text is "Propose item", the app's own label. |
| 9 | Hidden or already seen draws nothing | no | confirmed | Tests for `hiddenAt` and `completedSeenAt` get "". |
| 10 | Home marks "set up" seen only when it shows it | no | confirmed | Making the call unconditional failed 2 page tests; restored. |
| 11 | Root with no scope sees one extra line; others don't | no | confirmed | Tests for root with 0 and with a scope, and a user (no `pageScopes` call). |
| 12 | The panel fills 124's slot | no | confirmed | `HomeView.tsx` slot `gettingStarted`, filled by `page.tsx`. |
| 13 | Messages in en, pt and fr; the lint scan covers the folder | no | confirmed | Same `gettingStarted` keys in all three; `biome.json` scan folder; `pnpm lint` exits 0. |
| 14 | Typecheck passes | no | confirmed | `pnpm --filter @ronneai/web typecheck` → no errors. |
| 15 | The `install-tick` helper and the Overview section | no | partly | Not checked: the pt and fr help text. |

**Overall:** not met: row 15.

### Re-check (row 15)

Witnessed: 2026-10-21 22:40 local, by a fresh agent (blind re-check). Commit: 41044c6e plus the uncommitted working tree. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | The helper has its words in en, pt and fr, links to a section that exists in `topics.ts`, and the helper and parity tests pass | no | confirmed | `install-tick` in all three `help.json`; `Help.tsx` links `docsHref("overview","getting-started")`; `topics.ts` has the section; `vitest run src/i18n src/components/help` → 13 files, 176 tests passed. |

**Overall:** met. (The website's section is task 8 and the phone layout tasks 6–7.)

## Task 5 — Account's "Show getting started again"

Witnessed: 2026-10-21 22:50 local, by a fresh agent (blind). Commit: 4df526c0 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A component test covers the section: title, button, one form with a submit button, pt and fr text | no | confirmed | `vitest run src/features/getting-started src/i18n` → 14 files, 182 tests passed; `show-again.test.tsx`. |
| 2 | The action test: show again acts for the request's person, refreshes and ends on Home; hide and confirm don't redirect | no | confirmed | `actions.test.ts` "show again ends on Home…" → `redirect("/")` once. |
| 3 | The end-to-end step: hide on Home, hidden next visit, Show again on Account ends on Home with "0 of 4 done" | no | confirmed | `next build`, then `playwright test e2e/getting-started.e2e.ts e2e/setup-wizard.e2e.ts --project chromium --project wizard` → 2 passed. |
| 4 | The unit and e2e tests fail when Show again doesn't clear hidden | no | confirmed | Replacing `deps.onboarding.show(...)` failed 2 db tests; after a rebuild the e2e failed at `checklist toBeVisible`; restored, `cmp` identical. |
| 5 | The button works without JavaScript | no | confirmed | A throwaway probe with `javaScriptEnabled: false` hid the checklist, clicked the button and expected `/` with the checklist; 1 passed; the probe was moved out of `e2e`. |
| 6 | A person who hid it and finished everything sees "You're set up" after Show again | no | partly | Only the service-level db test covered it. |
| 7 | Lint and typecheck are clean | no | confirmed | `pnpm lint` → no errors; typecheck → no errors. |
| 8 | Messages in en, pt and fr, and the `home.json` rename holds | no | confirmed | The i18n tests pass; `home.noScope.action` is "Open the global workspace". |

**Overall:** not met: row 6.

### Re-check (row 6)

Witnessed: 2026-10-21 23:00 local, by a fresh agent (blind re-check). Commit: 4df526c0 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Hid, then finished everything, then Show again shows "You're set up": the rule, the service and the page | no | confirmed | The rule test "hiding wins…" checks hidden and setUp states, and fails when `hidden` stops winning (restored, `cmp` identical); the db test fails without `onboarding.show`; `page.test.tsx` "shows 'You’re set up' and marks it seen" passes. |

**Overall:** met.
