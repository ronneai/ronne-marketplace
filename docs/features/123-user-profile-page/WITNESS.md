# 123 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The page's data

Witnessed: 2026-10-20 09:51 EDT, by a fresh agent (blind). Commit: 05e80d0e plus the uncommitted working-tree diff (8 identity files; no untracked files). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A read of one user for root returns the account, workspaces with roles, two-factor, SCIM state, last sign-in, and session and token counts | no | confirmed | `actions/user-admin.ts` `adminGetUser` → `service.getUser`, built on `findUserDetail` (`withRolesAndTwoFactor`) and on `countSessions` and `countActiveAccessTokens`, the counts `adminDisableImpact` uses; SCIM state from `scimAccountStates`, as the list does. Test "gives root the account, its roles, two-factor and what signing out would end" passes (workspaces `[{global, moderator}]`, twoFactor false, sessions 1, tokens 2); the scim-settings test checks managed, unmanaged and absent SCIM |
| 2 | `users.view` is checked, and a non-root is refused | no | confirmed | `getUser` calls `requirePermission(actor.user,"users.view")` first; `adminGetUser` is in the `permissions` loop of `user-admin.db.test.ts`, which expects `ForbiddenError`; passed on SQLite, PostgreSQL, MySQL and MariaDB |
| 3 | An unknown id gives not-found | no | confirmed | `getUser` throws `UserNotFoundError` when `findUserDetail` returns null; test "refuses an unknown id" passes; `findUserDetail("nobody")` returns null. The action never returns null: the page turns the error into a 404 |
| 4 | An erased account shows no last sign-in and has nothing to end | no | confirmed | `withLastSignIn` skips erased ids; sessions and tokens are 0; the test passes, and the list row is null even with a sign-in event seeded. Mutation in a scratch copy (erased exclusion removed) → that test FAILS (1 failed, 33 passed) |
| 5 | A SCIM-managed account's state is shown | no | confirmed | the scim-settings test checks `adminGetUser` for the managed user (`Acme SSO`, `managed true`), the unmanaged one and root (`scim` undefined); passes on all four databases |
| 6 | `lastSignIns(ids)` returns the latest `auth.signed_in` per actor in one grouped query; none is absent; an empty input is an empty map; other events don't count | no | confirmed | one query: `max(created_at)`, `where action='auth.signed_in' and actor_id in (…)`, `groupBy actor_id`; repository tests cover the latest of several (out of order), none, other actions, the ids asked and the empty list. Mutation (the action filter deleted) → 2 tests FAIL |
| 7 | Password, identity provider and second-step sign-ins all count; `rmk login --web` and tokens do not | no | partly | the code writes `auth.signed_in` at `session.ts:147`, `sso.ts:319` and `two-factor.ts:398`; the tests seed the event for the provider and second step, and only the password path is driven for real. Nothing would fail if a provider or two-factor sign-in stopped writing it |
| 8 | The retention purge keeps the time | no | confirmed | the test nulls `ip_address` on the events and the time stays; the purge itself wasn't run |
| 9 | The list's times come from one query for its page of rows | no | confirmed | `listUsers` calls `withLastSignIn(page.rows)`, one `repo.lastSignIns` call; read from the code, queries not counted at runtime |
| 10 | The `pageUsers` refactor changed no list behaviour | no | confirmed | the diff moves the two queries into `withRolesAndTwoFactor` unchanged; SQLite: `two-factor-reset` 13/13, `erased-user` 11/11, `erase-user` 10/10 |
| 11 | Database tests pass on all three servers | no | confirmed | one file per run: `kysely-identity-repository` 6/6, `user-admin` 35/35, `scim-settings` 4/4 on PostgreSQL, MySQL and MariaDB; SQLite 6/6, 34 passed and 1 skipped, 4/4 |

**Overall:** not met. Row 7 is `partly`: no test drives a real provider or second-step sign-in to the last sign-in read. Bugs found: none in the code.

### Re-check 1 — row 7 (the sign-in kinds)

Witnessed: 2026-10-20 09:55 EDT, by a fresh agent (re-check of one claim, with mutations in a scratch copy). Commit: 05e80d0e plus the uncommitted diff (since the last pass, only `sso.db.test.ts` and `two-factor-sign-in.db.test.ts`). Machine: macOS (Darwin), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7a | The two new assertions sit in tests that drive real flows and pass on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | `sso.db.test.ts` 40/40 and `two-factor-sign-in.db.test.ts` 24/24 on each, one file per run; the SSO test signs in through the fake OIDC server, the two-factor test completes a real TOTP second step |
| 7b | A provider sign-in counts, and a test fails if `actions/sso.ts` stops writing `auth.signed_in` | no | confirmed | in a scratch copy the action at `sso.ts:319` renamed → 2 old tests fail; with the old assertion removed, the new one fails alone (`expected undefined to be an instance of Date`, `sso.db.test.ts:172`) |
| 7c | A second-step sign-in counts, and a test fails if `services/two-factor.ts` stops writing `auth.signed_in` | no | partly | the action at `two-factor.ts:398` renamed → 3 old audit assertions fail, but the new `lastSignIns` assertion still passed: `enrolled()` signs in by password first, which already wrote an event, so the assertion was vacuous |
| 7d | `rmk login --web` and access-token use never write `auth.signed_in` | no | confirmed | `grep -rn "auth.signed_in" apps/web/src` outside tests: writers only at `session.ts:147` (password), `sso.ts:319` (provider) and `two-factor.ts:398` (second step); none in `device-grants.ts` or the access-token code |

**Overall:** not met, for 7c: the new two-factor assertion didn't discriminate. Fixed after this pass: the test deletes the `auth.signed_in` rows `enrolled()` wrote and checks there is none, before the second step completes (needs a re-check).

### Re-check 2 — row 7c (the second step)

Witnessed: 2026-10-20 10:02 EDT, by a fresh agent (re-check of claim 7c only, with a mutation in a scratch copy). Commit: 05e80d0e plus uncommitted work. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7c | A second-step sign-in counts as a user's last web sign-in, and a test fails if `services/two-factor.ts` stops writing `auth.signed_in` (line 398) | no | confirmed | unmutated: `two-factor-sign-in.db.test.ts` 24/24 on SQLite, PostgreSQL, MySQL and MariaDB (the other 23 tests pass too, so deleting the rows at the start hides nothing); mutation in a scratch copy (`two-factor.ts:398` changed to `auth.signed_out`, the test's old `events("auth.signed_in")` assertion removed) → the new assertion alone fails: `expected undefined to be an instance of Date` at `two-factor-sign-in.db.test.ts:132`; the test first deletes the rows `enrolled()` wrote and asserts none is on record, so only the second step can produce the Date (a first mutation, to `auth.two_factor_started`, isn't in the audit catalogue, made every test throw and proved nothing: discarded) |

**Overall:** met. Row 7 now stands: 7a, 7b and 7d confirmed in Re-check 1, 7c here; every other row was confirmed in the first pass and the diff since touches only the two sign-in tests.

## Task 2 — The page `/admin/users/[id]`

Witnessed: 2026-10-20 10:15 EDT, by a fresh agent (blind). Commit: 9f0eb413 plus the working tree (`user-admin.ts` modified; `UserPage.tsx`, `user-page.test.tsx` and `admin/users/[id]/page.tsx` untracked). Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass | no | confirmed | `pnpm --filter @ronneai/web exec vitest run src/features/admin-users` → 5 files, 45 tests passed, 11 of them in `user-page.test.tsx` |
| 2 | The Account section shows email, name, role, status with its date, created date, last sign-in, and the provider or SCIM badges when there is one | no | confirmed | `UserPage.tsx` Account section; tests "shows the account…", "shows two-factor, and a disabled account's date" and "shows a SCIM-managed account's provider…" pass |
| 3 | Last sign-in: "Never" when none, an en dash when erased, and a note saying what the time counts | no | confirmed | test regexes match `Last sign-in</dt><dd…>Never<` and `…>–<`; the note "A sign-in to the web app… Not rmk or a token" is rendered, tested, and hidden for an erased account |
| 4 | Sign-in and access shows two-factor On or Off, the session count and the token count | no | confirmed | regexes `Two-factor</dt><dd…>On<`, `Sessions</dt><dd…>2<`, `Access tokens</dt><dd…>3<` pass; Off is in the default render |
| 5 | Workspaces: each with its role, highest first; root shows "Root: every workspace."; none shows "None." | no | confirmed | test "lists a user's workspaces highest role first…" covers order, "None." and the root text |
| 6 | Their data: a link to `/admin/audit?actor=<email>` | no | confirmed | test asserts `href="/admin/audit?actor=sam%40example.com"`; `encodeURIComponent(user.email)` |
| 7 | Erase this account is last, apart, and only when the account can change | no | confirmed | rendered last in its own Section, only when `changeable`; absent on erased and own pages in tests |
| 8 | A back link to Users, and a header | no | confirmed | test asserts `href="/admin/users"`; the header shows name, email, role badge and Erased or Disabled badge |
| 9 | Your own page is read-only: a notice with the `own-row` helper, no action slots, no erase section, no data slot | no | partly | test passes; two differences from the spec text: the notice wasn't the spec's literal "Another root changes your account", and the data slot is hidden on your own page, which the spec didn't say |
| 10 | An erased account shows the pseudonym, "Erased on", and only the data slot | no | confirmed | test "an erased account…": "Erased on", 2026-10-10, `SLOT-DATA` present, the others absent, no "Never" |
| 11 | The SCIM-managed notice shows at the top for an account that can change | no | confirmed | test asserts "Acme SSO manages this account through SCIM."; not for a non-managed link, none without a link, not on your own page |
| 12 | The route is a 404 for non-root and signed-out users, checked before it reads the user | no | confirmed | `page.tsx`: `if (!me \|\| !can(me, "users.view")) notFound();` before `adminGetUser`; the test loops over null, user and a workspace admin, and `adminGetUser` is never called; `service.getUser` also checks `users.view` |
| 13 | The route is a 404 for an unknown id; other errors are rethrown | no | confirmed | `UserNotFoundError` becomes `notFound()`; a plain Error is rethrown; test passes |
| 14 | Mutation: the route skips `can(me,"users.view")` → the route test fails | no | confirmed | scratch copy, `if (!me) notFound();` → 1 failed |
| 15 | Mutation: the route doesn't turn `UserNotFoundError` into `notFound()` → the route test fails | no | confirmed | scratch copy, line removed → 1 failed |
| 16 | Mutation: `UserPage` shows the slots for an erased or own page → the page tests fail | no | confirmed | scratch copy, `changeable = true` → 2 failed; forcing the data slot on for your own page → 1 failed |
| 17 | The sidebar's Users item stays current on `/admin/users/<id>` | no | confirmed | `nav.ts:129-134` `section: "/admin/users"`; a probe test in the scratch copy passed (current for Users, not for Audit log); nothing in the repo guarded it |
| 18 | The page opens in a browser | no | can't check here | the app wasn't started: it needs a throwaway SQLite instance and a root login, beyond the 15-minute budget |

**Overall:** not met. Row 9 is `partly` (the notice wording, and the data slot hidden on your own page) and row 18 is `can't check here`.

### Re-check 1 — rows 9 and 18, and what the diff touched

Witnessed: 2026-10-20 10:15 EDT, by a fresh agent (blind re-check). Commit: 9f0eb413 plus uncommitted work. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | Your own page is read-only: a notice with the `own-row` helper, no action slots, no erase section, no data slot, as SPEC.md now words it | no | confirmed | SPEC.md:81-84 and `UserPage.tsx:104-108` carry the same words ("This is your own account. Another root changes your role, disables you or resets your password. Change your password in Account.", then `own-row`); `changeable = !self && !erased` (`:66`), `{self ? null : <Actions>{slots.data}</Actions>}` (`:183`); the test asserts the notice on your own page and its absence on another's |
| 18 | The page opens in a browser | no | confirmed | `pnpm --filter @ronneai/web test:e2e e2e/zz-tmp-user-page.e2e.ts --project=chromium` (a temporary spec, since removed) → 1 passed: the page text shows the back link, name, email, role badge, Account, Sign-in and access, Workspaces, Their data and Erase sections with the right values; a made-up id gives 404; the sidebar's current item is Users, and never Audit log (it appears twice, probably the sidebar and the phone menu) |
| 18a | The desktop (1440) and phone (390) screenshots look right | no | confirmed | both read: desktop in a two-column grid with Users highlighted, nothing clipped or overlapping; phone one column, all sections, exactly 390 px wide (no horizontal overflow, inferred from the image width). No action buttons show: the slots are task 3's |
| 19 | The page's two links have a keyboard focus outline | no | confirmed | `UserPage.tsx:86` and `:178` carry `outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus`; classes read, focus not tested in a browser |
| 20 | Users is current on `/admin/users/<id>` and Audit log isn't, and the new assertion fails without `section` | no | confirmed | `AppShell.test.tsx:194-196`; scratch copy with `section: "/admin/users"` removed from `nav.ts` → 1 failed, 34 passed, at line 195 |

**Overall:** met.

## Task 3 — The actions on the page

Witnessed: 2026-10-20 10:35 EDT, by a fresh agent (blind). Commit: 2635af9c plus the uncommitted diff (9 modified files; untracked `UserActionDialogs.tsx` and `UserPageActions.tsx`). Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The existing action tests pass unchanged: only import paths changed in existing tests, plus tests added | no | confirmed | `git diff --stat -- '*.test.tsx'` → only `actions.test.tsx` (+17/-3: the import split, and one new test) and `user-page.test.tsx` (+64: a `listWorkspaces` mock, a `>Provider<` assertion, 4 route tests); `admin-users.test.tsx`, `download-data.test.tsx` and `workspaces-dialog.test.tsx` untouched |
| 2 | The move to `UserActionDialogs.tsx` changed no dialog behaviour | no | confirmed | `diff <(git show HEAD:…/UserRowActions.tsx) UserActionDialogs.tsx` → only imports dropped, `Role`/`RowUser`/`Kind`/`TITLES` exported, `rowButton` and the `UserRowActions` component left behind; `ActionForm`, the notices and `DisableImpact` byte-identical |
| 3 | The list's rows (`UserRowActions`) still work | no | confirmed | same logic and shared `ActionForm`; `vitest run src/features/admin-users` → 5 files, 50 tests passed |
| 4 | Each action's server action revalidates the page as well as the list | no | confirmed | `actions.ts` adds `revalidatePath("/admin/users/[id]", "page")` in `attempt`, on success only; mutation (line removed) → "refresh one user's page as well as the list (123)" fails (1 failed, 16 passed), restored `cmp` ok |
| 5 | Another user's page mounts every dialog: Change role, Reset password, Disable or Enable, Reset two-factor only when on, Manage workspaces, Download their data, Erase | no | confirmed | `page.tsx` slots and the route tests pass; those render buttons without opening dialogs, the browser run (8) opens them |
| 6 | Root gets no Workspaces dialog; another root's page has the other actions | no | confirmed | `page.tsx`: `user.role === "root" ? undefined`, no `listWorkspaces` call; test passed; the root screenshot shows "Root: every workspace." and no button |
| 7 | Your own page and an erased account's show no action (an erased one keeps the greyed download), enforced by the page and by the route | no | confirmed | mutation 1 (`else if (true)` in the route) → the route test still passed, since `UserPage`'s `changeable = !self && !erased` also gates the slots; mutation 2 (`changeable = true`, data slot ungated, `else if (true)`) → 3 tests failed; mutation 3 (`if (false)` for the erased branch) → the route test failed; all restored |
| 8 | In a browser the page drives disable, enable, reset password, Manage workspaces, Download, change role to root and erase, showing each new state | no | confirmed | `pnpm --filter @ronneai/web test:e2e e2e/zz-tmp-user-actions.e2e.ts --project=chromium` (a temporary spec, since removed) → 1 passed (4.7s); the three screenshots show Disabled (badge, "Disabled on", Reset password and Enable), root (role root, no Manage workspaces) and erased (pseudonym, no Provider row, only a greyed "Download their data (erased)"); nothing wrong |
| 9 | Nothing relies on the page's own checks: non-roots can't reach the page or the actions | no | confirmed | no change under `apps/web/src/server`; `user-admin.ts` has `requirePermission(…, "users.manage")` at lines 130, 190, 223, 251, 277, 306, 341, 369; `erase-user.ts:122,133,214,229` and `user-data-export.ts:56-58` the same; the route 404s a non-root (tested); no scratch call of the actions as a non-root, and the workspaces membership service's check not read |
| 10 | The dialogs, server actions and rules are otherwise unchanged | no | partly | `DownloadDataDialog`, `EraseUserDialog` and `UserWorkspacesDialog` only gain a `variant` prop with the default unchanged; but `UserPage.tsx` also changed outside the actions: the Provider row is now `user.scim && !erased` (was `user.scim \|\| erased`), covered by a test but not part of the task |

**Overall:** not met, only for row 10: a side change to the page's Provider row, which the spec's erased-account line supports and the plan's notes now explain; waits for a re-check of that row.

### Re-check 1 — row 10 (the side change)

Witnessed: 2026-10-20 10:20 EDT, by a fresh agent (blind, re-check of row 10 only). Commit: 2635af9c plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | The dialogs, server actions and rules are otherwise unchanged | yes | confirmed | SPEC.md:86 says an erased account shows "its pseudonym, Erased on, and the greyed download"; SPEC.md:72 lists "the identity provider and SCIM state if any" in Account; `erase-user.ts:148` runs `repo.deleteScimRows(userId)`, so an erased account has no SCIM state and dropping its Provider row agrees with both lines; PLAN.md:67-69 explains it; `git diff -U0` of the five files shows only the `variant` props and their branches (and a doc-comment edit in `EraseUserDialog.tsx`), the `revalidatePath` line, the import path that moved with the dialogs, and `user.scim \|\| erased` → `user.scim && !erased`; `vitest run src/features/admin-users/user-page.test.tsx` → 15 passed |

**Overall:** met.

## Task 4 — The list without actions, with Last sign-in

Witnessed: 2026-10-20 10:35 EDT, by a fresh agent (blind). Commit: e153d16e plus the uncommitted working-tree diff. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The list's tests pass without action buttons (Actions column and `UserRowActions` dropped) | no | confirmed | vitest on `src/features/admin-users` and `src/components/ui/data-table` → 7 files, 69 tests passed; "lists users…" asserts no Change role, Reset password, Disable, Erase or Download their data in the list; `UserRowActions.tsx` deleted |
| 2 | Name first, then Email, the same width (`w-52`), and the column order is tested | no | confirmed | columns name, email, role, status, lastSignIn, created, open; test checks the 7 headers; mutation (swap Name and Email in a scratch copy) → that test fails; browser header widths [217,217,…] at 1440 and [208,208,…] at 1280 |
| 3 | Name links to the page, an *Open* link is added, and on a phone the email is the link covering the row | no | confirmed | `UsersPage.tsx`: Name `Link`, email `Link` with `after:absolute after:inset-0 sm:hidden`, Open link `aria-label="Open <email>"`, all asserted; browser at 1280: the name link, then "Open <email>", each land on `/admin/users/<id>`, and back keeps `?q=`; at 390 the visible headers are Email and Role |
| 4 | Role badges plain, SCIM badges kept, the Erase link beside "Deprovisioned by" gone | no | confirmed | `RoleCell` takes no `editor`, `ScimBadges` no `erase`; the SCIM and role tests pass; the screenshot shows plain role badges |
| 5 | A `nowrap` option on the data table's columns, and no cell breaks a line (tested) | no | confirmed | `DataTable.tsx` `nowrap?: boolean` → `whitespace-nowrap`; test "keeps every cell on one line" requires `truncate` or `whitespace-nowrap` on every `td`; mutation (`nowrap` removed from Last sign-in) → fails; browser, all 50 rows at 1440 and 1280: no wrapped or tall cell |
| 6 | Last sign-in: hidden on phones, *Never*, an en dash for erased, not sortable, filled by task 1's query, three states tested | no | confirmed | the column has `hideOnMobile` and `nowrap`; the test checks `2026-10-19 14:30 UTC`, `Never`, `–`, the `hidden sm:table-cell` header and no `sort=lastSignIn` link; mutation (erased check replaced by `false`) → fails; the browser seed has no signed-in or erased user on the checked rows, so the time and dash states rest on the unit tests |
| 7 | Browser at 1280 and 1440: headers Name, Email, Role, Status, Last sign-in, Created, Open | no | confirmed | a temporary spec (deleted) as root: `thead th` text at both widths |
| 8 | Browser: no button inside a row | no | confirmed | `tbody button` count → 0 at 1440 and 1280 |
| 9 | Browser: no overflowing cell at 1280 and 1440 | no | confirmed | over all 50 rows, for cells with computed overflow visible no descendant sticks out and no cell has more than one line; document scrollWidth equals innerWidth at both widths; screenshot: Email cut with an ellipsis, other cells on one line |
| 10 | Browser at 390: only Email and Role show; no horizontal scroll of the page | no | confirmed | visible headers ["Email","Role"]; scrollWidth 390, innerWidth 390 |
| 11 | The rules the removed row tests encoded are covered by tests of the user's page | no | confirmed | removed: own row has no actions and others have all, Erase on others and only the greyed download on an erased row, Reset two-factor only when on and never on your own row, the row's Download button; `user-page.test.tsx` covers them ("gives your own page no action…", "offers Enable… and Reset two-factor only when it's on", "gives another root the actions…", "mounts the actions…", "your own page is read-only"); weaker: "two-factor off or own page" only through the own-page and 2FA-off tests |
| 12 | Nothing imports the deleted file or the removed variants | no | confirmed | `git grep -n "UserRowActions\|variant=\"page\"\|variant=\"row\"\|variant=\"link\"" -- apps/web/src apps/web/e2e` → no matches |

**Overall:** met. Reported, not counted: `e2e/user-admin.e2e.ts` and `e2e/two-factor-hold.e2e.ts` still mention Erase, Download their data or Actions (known stale, task 6).

## Task 4b — Icons in the list

Witnessed: 2026-10-20 10:50 EDT, by a fresh agent (blind). Commit: ad0f59ab plus the uncommitted diff (committed as 6dc3a4b1 while it was checking; not re-diffed). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `IconLink` exists beside `IconButton`, sharing its classes; IconButton's look is unchanged by the `iconControlClasses` extraction | no | confirmed | `git diff IconButton.tsx`: the same class strings moved verbatim into `iconControlClasses`, used by both; `ui.test.tsx` checks size-8, pointer-coarse:size-11 and rounded-control on both |
| 2 | Open is a chevron `IconLink` named "Open <email>" (aria-label and title), the icon aria-hidden, no word "Open" as text | no | confirmed | `vitest run src/components/ui src/features/admin-users` → 16 files, 144 passed; browser: the link `Open <email>` has innerText "" and the right href; clicking it lands on the user's page |
| 3 | Component tests cover `IconLink` and the copy button's markup; the list test shows both icons with their names and no "Open" text | no | confirmed | scratch-copy mutations: removing aria-label and title from IconLink fails the `IconLink (123)` test and the list test; showing the word "Open" fails the list test; removing `<CopyEmailButton/>` fails "puts an icon-only copy button beside each email"; restored, 144 passed; the tests check markup only |
| 4 | Clicking the copy icon copies the email, shows a check mark, and returns to the copy icon after about 2 s | no | confirmed | a temporary spec (deleted): `navigator.clipboard.readText()` equals the email; `svg.lucide-check` visible, and after 2.3 s `svg.lucide-copy` back |
| 5 | The copy button announces "Copied" in a status region | no | partly | `<span role="status" class="sr-only">` with "Copied" in the code; the region was only read after the 2 s timeout (empty) |
| 6 | Where nothing can copy, it selects the visible email element (`[data-copy-source]:not(.hidden)`) | no | not met | at 1440 the selector returns the phone-only link (`sm:hidden`, display none); the visible span has `hidden sm:inline`, which `:not(.hidden)` excludes; on a phone it returns the visible link, correctly |
| 7 | On a phone the copy button sits above the row-wide email link: a tap copies and doesn't open, a tap elsewhere on the row opens the page | no | confirmed | at 390×844 clicking "Copy <email>" gives the clipboard the email and the URL stays on the list (button `z-10`, x 165.6–197.6); `page.mouse.click` on the row goes to `/admin/users/<id>` |
| 8 | Name and Email widen (w-60); at 1280 and 1440 no non-clipped cell sticks out, none is taller than two lines, the page has no horizontal scroll | no | partly | the spec passed with no problems at both widths; long e2e emails (31 characters) are cut with an ellipsis; at 1280 the table is wider than its panel (Created and Open cut at the edge, scrolling inside its wrapper); "longest typical email" not defined |
| 9 | Decision 6 is recorded in the spec | no | confirmed | taken from the task statement, the spec text not re-read |

**Overall:** not met. Bug found: the manual-copy fallback selects a hidden element on desktop (row 6); rows 5, 8 and 9 only partly or lightly checked.

### Re-check 1 — rows 5, 6, 8 and 9

Witnessed: 2026-10-20 10:38 EDT, by a fresh agent (blind). Commit: 6dc3a4b1 plus the uncommitted diff (`CopyEmailButton.tsx`, `copy-email.test.tsx`, SPEC.md, PLAN.md). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | With a working clipboard the `role=status` region says "Copied" while the check icon shows | no | confirmed | a temporary spec (deleted), 1440 wide, clipboard granted: right after the click the icon was `lucide-check`, the status regions included "Copied", and `navigator.clipboard.readText()` was the email |
| 6 | The manual-copy fallback selects the visible email at 1440 and 390, and the status says "Selected: copy it yourself" | no | not met | with `navigator.clipboard` undefined and `execCommand` returning false, clicking "Copy <email>" at both widths gave `getSelection().toString()` `""` and no "Selected" status; page error `Cannot read properties of null (reading 'parentElement')`: the handler read `event.currentTarget.parentElement` after `await copyText`, when React had cleared `currentTarget`, so it threw before `selectText`; the same line existed in the earlier version, so this was the first pass's bug too |
| 7a | `firstShown` skips an element with no client rects and returns the first shown one | no | confirmed | 53 tests passed; mutation (`elements[0]`) → `copy-email.test.tsx` fails (Expected "wide span", Received "phone link") |
| 7b | The new unit test covers the user-visible fallback | no | partly | it only covers the pure `firstShown` and the render; it never clicks, so it can't see the null `currentTarget` |
| 8a | The table fits its panel at 1440 and scrolls sideways inside the panel, not the page, at 1280 | no | confirmed | 1440: table scrollWidth 1134, panel clientWidth 1134, document scrollWidth 1440; 1280: table 1128, panel 974 (scrolls inside it), document scrollWidth 1280 |
| 8b | An email of about 23 characters is not cut at 1440 | no | confirmed | 23-character emails had scrollWidth <= clientWidth at 1440 and 1280; every cut one was 24 characters or more; hover text is `title={user.email}` (not hovered) |
| 8c | The Open chevron is reachable at 1280 by scrolling the panel | no | confirmed | `scrollIntoViewIfNeeded` moved it from x=1365 to x=1211, 32×32; at 1440 it sits at x=1371 |
| 9 | SPEC.md Decisions has decision 6, for every table as each is next touched | no | confirmed | SPEC.md:180-185 |

**Overall:** not met, for row 6: the handler reads `currentTarget` after an `await`. Fixed after this pass: the elements are read before waiting and the logic is `copyOrSelect`, tested with a forced "manual" result (needs a re-check).

### Re-check 2 — row 6 (the manual-copy fallback)

Witnessed: 2026-10-20 10:50 EDT, by a fresh agent (blind, re-check of one claim). Commit: 6dc3a4b1 plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Where nothing can copy, the copy button selects the email on the screen, at 1440 and 390 wide, and the status region says "Selected: copy it yourself" | no | confirmed | its own Playwright spec (chromium) → 1 passed: with `navigator.clipboard` undefined and `execCommand` false, at both widths, after clicking "Copy <email>" `getSelection().toString()` equals the email, `role=status` reads "Selected: copy it yourself", and no `pageerror` was thrown |
| 6a | Nothing is read from the event after an await | no | confirmed | the handler builds `sources` from `event.currentTarget.parentElement.querySelectorAll("[data-copy-source]")` before `await copyOrSelect(...)`; nothing from `event` is used after it |
| 6b | `copy-email.test.tsx` passes, and fails without the select call | no | confirmed | `vitest run src/features/admin-users/copy-email.test.tsx` → 4 passed; mutation (`if (result === "manual")` → `if (false)`, restored) → 2 failed ("selects the shown email when nothing can copy…", "is given its elements before it waits…") |
| 6c | With a working clipboard it still ends with "Copied" and the check icon | no | confirmed | the same spec, 1440, clipboard granted: status "Copied", `readText()` equals the email, one `svg.lucide-check` |

**Overall:** met. Limits: chromium only; the 390 case is a narrow viewport on desktop Chromium, not the phone project.

## Task 4c — Dialog sizes

Witnessed: 2026-10-20 10:55 EDT, by a fresh agent (blind). Commit: 9fffb4f3 plus the uncommitted diff and two untracked files (`dialog-sizes.md`, `help-not-in-paragraph.test.ts`). Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `Dialog` takes `small`, `medium` (default), `large`, `xlarge`, with widths 24, 32, 40 and 56rem | no | confirmed | `Dialog.tsx` diff: `DIALOG_SIZES` with `w-[min(24rem,…)]`, 32, 40 and 56; `size = "medium"` is the default |
| 2 | `fixedHeight` is a separate prop and works with any width | no | confirmed | `Dialog.tsx:103` adds `h-[min(45rem,calc(100dvh-2rem))]` only with `fixedHeight`, `:122` makes the column body only then; `ui.test.tsx:253-264` checks a framed and an unframed `large` |
| 3 | The side sheet is off the scale | no | confirmed | `size?: DialogSize \| "side"` with its own branch; `MobileMenu.tsx:102` still `size="side"`; a test covers it |
| 4 | No `size="wide"` or `size="default"` left in `apps/web/src` or `apps/web/e2e` | no | confirmed | `git grep -n 'size="wide"\|size="default"' apps/web/src apps/web/e2e` → no output |
| 5 | Move scope is `large`, the bulk dialogs `large` + `fixedHeight`, Erase user `xlarge`; every old `size="large"` still gets the fixed frame | no | confirmed | HEAD had `size="large"` only in BulkRelease:246 and BulkApprove:284 and `size="wide"` in MoveScope:460; now MoveScope `large`, BulkRelease `large` + `fixedHeight`, BulkApprove `large fixedHeight`, Erase `xlarge` |
| 6 | `DialogActions` has a top margin and no `-mb-4`; the body drops its bottom padding when it holds the bar | no | confirmed | `data-dialog-actions=""`, `mt-4`, no negative bottom margin; the body has `has-[[data-dialog-actions]]:pb-0` and `sm:has-[…]:pb-0`; in a real browser the body's bottom padding was `0px` |
| 7 | Every `DialogActions` is last in its dialog body, none outside a Dialog | no | confirmed | scanned all uses (`git grep -n DialogActions apps/web/src`, the line after each close): each is followed only by the closing `</form>`, `</div>`, `</>` or `</Dialog>`; none depends on the old `-mb-4` |
| 8 | Component tests cover the four widths and the default, `fixedHeight` apart from the width, the side sheet, and the action bar's margin | no | partly | the suite passes (74 files, 825 tests); removing `data-dialog-actions` fails 2 tests, putting `-mb-4` back fails 1; dropping `fixedHeight` from BulkApprove's Dialog fails nothing: no test guarded that the bulk dialogs keep it |
| 9 | Browser: Erase user at 1440x900 and 1280x720 is 896px wide, its body doesn't scroll, at least 24px above the buttons | no | confirmed | a temporary spec (deleted): at both sizes width 896, body `scrollHeight` 621 = `clientHeight` 621, gap 32px, bottom padding 0px, dialog height 679.6; the screenshot shows two lists side by side and the confirm field beside the reminder |
| 10 | One other dialog has the same air | no | confirmed | "Change role" gap 32px and "Download their data" gap 32px at both sizes |
| 11 | On a phone Erase user is a full-screen sheet | no | confirmed | at 390x844: width 390, height 844 at (0,0); the body scrolls (957 > 787) with the bar stuck; `dialogs.mobile.e2e.ts` on the phone project passed |
| 12 | The existing dialog browser tests still pass | no | confirmed | `test:e2e e2e/dialogs.mobile.e2e.ts e2e/move-scope.e2e.ts e2e/move-scope.mobile.e2e.ts e2e/bulk-approve.e2e.ts e2e/bulk-release.e2e.ts --project=chromium --project=phone` → 5 passed |
| 13 | The helpers in the download and reset-two-factor dialogs are moved out of the `<p>` | no | confirmed | `DownloadDataDialog.tsx:22-28` has `<Help>` as a sibling after the `</p>` inside a `div`; a multi-line regex over every non-test `src/**/*.tsx` found no `<Help`/`<HelpTip` inside a `<p>` |
| 14 | A test reads every source file for a helper inside a `<p>` | no | partly | `help-not-in-paragraph.test.ts` set `SRC = new URL("..", import.meta.url).pathname`, which from `src/components/help/` is `src/components/`, so it never read `src/features/` where the two dialogs live; putting `<Help>` back inside the `<p>` in `DownloadDataDialog.tsx` left it passing |
| 15 | `docs/knowledge/dialog-sizes.md` says which size for what | no | confirmed | a table of sizes, widths and examples, with notes on `fixedHeight`, the action bar, why no negative margin, and helpers; consistent with the code |

**Overall:** not met. Rows 8 and 14: no test failed if the bulk dialogs lost `fixedHeight`, and the helper test read only `src/components`. Fixed after this pass: `help-not-in-paragraph.test.ts` reads all of `src` (with a test of the finder and one that the features' dialogs are in the file list), and a new `dialog-usage.test.ts` checks the sizes named, the bulk dialogs' `fixedHeight` and Erase's `xlarge` (needs a re-check).

### Re-check 1 — rows 8 and 14

Witnessed: 2026-10-20 11:00 EDT, by a fresh agent (blind re-check of rows 8 and 14). Commit: 9fffb4f3 plus the uncommitted diff. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8a | Component tests cover the four widths, the default, `fixedHeight` apart from the width, the side sheet and the action bar's margin | no | confirmed | `vitest run src/components src/features` → 75 files, 830 tests passed; the `ui.test.tsx` and `touch.test.tsx` changes are in the diff (not re-read this round) |
| 8b | A guard keeps BulkApprove and BulkRelease on `fixedHeight` and `size="large"` | no | confirmed | `dialog-usage.test.ts` "keeps the bulk dialogs in a fixed-height frame" reads each file's single `<Dialog` tag; dropping `fixedHeight` from `reviews/BulkApprove.tsx` fails it, and from `releases/BulkRelease.tsx` fails it |
| 8c | Only scale sizes are used, and Erase user is `xlarge` | no | confirmed | `EraseUserDialog.tsx` `size="xlarge"` → `"large"` fails "only name sizes…" and "makes Erase user extra large"; `size="wide"` on the Erase `<Dialog>` fails the same two; the scale test reads every `<Dialog` tag under `src` |
| 14a | The helper-not-in-`<p>` scan fails when a helper is put inside a `<p>` in the two named dialogs | no | confirmed | `<Help id="download-user-data" />` inside the `<p>` in `DownloadDataDialog.tsx` → "are beside the text, never inside a <p>" fails; `<Help id="reset-two-factor" />` inside the `<p>` in `UserActionDialogs.tsx` → the same |
| 14b | The scan covers all of `src`, including `src/app` and `src/features` | no | confirmed | `SRC = new URL("../..", import.meta.url)`; a new `src/app/zz.tsx` with `<p><Help id="x" /></p>` fails with `[ 'app/zz.tsx:1' ]` |
| 14c | The file-list test names the four files | no | can't check here | not read or broken in this round; the suite is green and the `src/app` mutation was caught |
| 14d | Nothing else changed that this task owns | no | confirmed | `git diff --stat`: 13 files changed; untracked: the two new tests and `dialog-sizes.md`; nothing unexpected |

**Overall:** not met: row 14c, the file-list test, was not checked; everything else held.

### Re-check 2 — row 14c

Witnessed: 2026-10-20 11:05 EDT, by a fresh agent (re-check of row 14c only, with mutations on a copy of the test). Commit: 9fffb4f3 plus uncommitted changes. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14c | `help-not-in-paragraph.test.ts` has a test of its finder on sample strings, and a test that the scanned file list includes `DownloadDataDialog.tsx`, `UserActionDialogs.tsx`, `HelpTip.tsx` and `app/(app)/admin/users/[id]/page.tsx` | no | confirmed | read: lines 25-29 test `helpersInParagraphs` on three samples (Help in a p, HelpTip in a p, Help beside a p), lines 31-40 assert the four files are in `sources(SRC)` with `SRC = ../..`; `vitest run src/components/help` → 2 files, 6 passed; mutations on a copy of the test: regex `<Helpx(Tip)?` → the finder test fails (`expected [] to deeply equal [ 2 ]`); `SRC` `".."` → the file-list test fails; `HelpTip.tsx` renamed to `HelpTipX.tsx` → it fails |

**Overall:** met. The copy used for mutations sat beside the original (SRC is relative to the file) and was deleted; `git status` shows no leftover.

## Task 5 — Links in

Witnessed: 2026-10-20 10:58 EDT, by a fresh agent (blind). Commit: 970793d9 plus the uncommitted diff (`EventDetails.tsx`, `admin-audit.test.tsx`). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The admin-audit tests pass and cover both links | no | confirmed | `vitest run src/features/admin-audit` → 2 files, 21 passed; the new tests "links the actor and the target to the users' own pages, and an old target by search (123)" and "filters the log by an actor's email, as the user page's link asks (123)" |
| 2 | An event with targetType "user" and a targetId links to `/admin/users/<targetId>` labelled "Open the user" | no | confirmed | `EventDetails.tsx`: `if (event.targetId) return userHref(event.targetId)`, `OPEN_LABELS.user = "Open the user"`; the test asserts the href |
| 3 | An event with an actorId links the actor the same way; no actor (system, cli) has no actor link | no | confirmed | the actor row renders the link only inside `event.actorId ? …`; the test with actorId null and targetType "none" asserts no "Open the user"; the browser dialog showed one actor link to `/admin/users/<root's id>` |
| 4 | An old event with a user target but no id falls back to the list search by email; other target types are unchanged | no | confirmed | the fallback is `/admin/users?q=…`, asserted as `/admin/users?q=old%40example.com`; the diff leaves the submission, item and item_version branches alone; their tests pass |
| 5 | The user page's link `/admin/audit?actor=<email>` really filters the log | no | confirmed | `UserPage.tsx:177` builds it; `list.ts:18` parses `actor`, `auditQueryOf` passes it on; `kysely-audit-repository.ts:74-75`: `"system"` → `actor_id is null`, else a case-insensitive part-of-email match; browser: `/admin/audit?actor=root%40e2e.test` showed the actor box, the chip "Actor: root@e2e.test" and 1 row |
| 6 | An erased account's pseudonym email still filters the log | no | partly | read from code only: the filter joins the live `user` row's email, which erasing makes the pseudonym; not run |
| 7 | Mutation: the target link goes back to the email search | no | confirmed | scratch copy, the `targetId` line removed → the "links the actor and the target…" test fails (1 failed, 20 passed) |
| 8 | Mutation: the actor link is removed | no | confirmed | the same test fails |
| 9 | Mutation: the actor link also appears when actorId is null | no | confirmed | `{event.actorId ? (` → `{true ? (` → the same test fails |
| 10 | Browser: from a user's page the audit link filters the log | no | confirmed | a temporary spec (deleted): root's page → "Their events in the audit log" → URL `/admin/audit?actor=root%40e2e.test`, the actor box and chip, 1 row with root as actor; screenshot viewed |
| 11 | Browser: an event's details dialog has an actor "Open the user" link that lands on the user's page | no | confirmed | the dialog link href is `/admin/users/<root's id>`; clicking it lands on root's page with the "Account" heading |
| 12 | Browser: an event with a user target, and its "Open the user" goes to that user's page | no | can't check here | the seeded instance has no event with a user target (`action=user.` gave 2 events, each with only the actor link); the target link uses the same `userHref`; the unit test covers its href |

**Overall:** not met: rows 6 and 12 not confirmed (neither a bug). Added after this pass: a database test that an erased account's pseudonym email filters the log (run on SQLite, PostgreSQL, MySQL and MariaDB), for row 6; row 12 needs a re-check that makes a user-target event in the browser.

### Re-check 1 — rows 6 and 12

Witnessed: 2026-10-20 11:10 EDT, by a fresh agent (blind). Commit: 970793d9 plus the uncommitted diff (`EventDetails.tsx`, `admin-audit.test.tsx`, `audit.db.test.ts`). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6a | An erased account's pseudonym email still filters the audit log by actor, on SQLite | no | confirmed | `vitest run --project db src/server/domains/audit/actions/audit.db.test.ts` → 8 passed, including "finds an erased account's events by its pseudonym email, which its user page links (123)": the full pseudonym, the prefix `deleted-user-` and `other@` each return only the right actor id |
| 6b | The same on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:postgres`, `:mysql`, `:mariadb` with that file → 8 passed on each |
| 6c | The new test fails when the actor filter stops matching the email | no | confirmed | scratch copy, `kysely-audit-repository.ts:75` `containsInsensitive("actor.email", actor)` → `"actor.id"` → 2 failed (the new test and "filters by action, group, actor email…"), 6 passed |
| 6d | An erased account's user page still shows the audit link, carrying the pseudonym email | no | confirmed | `UserPage.tsx:170-182`: "Their data" isn't conditioned on `erased`; the href is `/admin/audit?actor=${encodeURIComponent(user.email)}`, and for an erased account `user.email` is the pseudonym; read from code, no browser run on an erased page |
| 12 | Browser: an audit event with a user target has an "Open the user" link in its details that goes to that user's page | no | confirmed | its own temporary spec (deleted): root disables `remember@e2e.test` from its page, then `/admin/audit?action=user.disabled`, the first row's details: two "Open the user" links, Actor and Target; the target href equals the user page's pathname and clicking it lands on that page (heading "Account", "Disabled on"); screenshot viewed |
| 13 | The Actor row's "Open the user" goes to root's page | no | confirmed | the same spec: it lands on the page headed "Root" with the "This is your own account" notice |
| 14 | The diff's component and test changes hold (target link by id, old-event fallback, no-actor case) | no | partly | `admin-audit.test.tsx` not run in this pass (budget); the e2e run confirms the target-id and actor-id cases; the fallback and no-actor cases rest on reading the unit test |

**Overall:** not met: row 14 only, the unit test file not run in this pass.

### Re-check 2 — row 14

Witnessed: 2026-10-20 11:05 EDT, by a fresh agent (blind). Commit: 970793d9 plus uncommitted changes. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | The audit event details link a user target by id to `/admin/users/<id>` labelled "Open the user"; an event with no target id falls back to the list search by email; the Actor row links to the actor's page only when there is an actor id | no | confirmed | `vitest run src/features/admin-audit` → 2 files, 21 passed; `EventDetails.tsx`: `OPEN_LABELS.user = "Open the user"`, `targetHref` returns `userHref(targetId)` with an id, else `/admin/users?q=<email>`, else null, and the Actor row's link sits inside `event.actorId ? …`; the test "links the actor and the target to the users' own pages, and an old target by search (123)" asserts the actor and target hrefs (lines 208-213), no link for `actorId: null` (215-218) and the old-event fallback (220-223); three mutations (always the email search; no fallback; the actor link with a null actorId) each fail that test |

**Overall:** met. Caveat: the agent ran its mutations on `EventDetails.tsx` in the repository itself, not in a scratch copy as instructed, restoring it from a copy taken first; the file was verified identical to that copy afterwards, the diff against HEAD is unchanged (12 insertions, 2 deletions) and the 21 tests pass. It also left a stray `/tmp/ed.bak`, since deleted.

## Task 6 — e2e and phone

Witnessed: 2026-10-20 11:28 EDT, by a fresh agent (blind). Commit: bb02ecdc plus the uncommitted diff (9 files: the e2e helpers, `scim.ts`, `two-factor-hold.e2e.ts`, `user-admin.e2e.ts`, the route page, `UserPageActions.tsx`, two unit tests, PLAN.md). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No e2e step still uses the removed row buttons or groups | no | confirmed | `git grep -n "Actions for \|Why can't I change my own account\|Workspaces of .*: [0-9]" apps/web/e2e` → no output; the remaining `Workspaces of ${email}` is the dialog's name |
| 2 | Row-button steps were moved to the page through `openUser` and `userRow` in user-admin, scim and two-factor-hold | no | confirmed | `helpers.ts:46-62`: `openUser` (search `?q=`, click "Open <email>", else the email link on a phone, wait for the "Account" heading) and `userRow`; used by user-admin.e2e.ts, scim.ts:62 and two-factor-hold.e2e.ts; nothing else searched for was left |
| 3 | Every e2e file that mentions `/admin/users` still fits the new list | no | partly | audit.e2e.ts, scopes.e2e.ts, two-factor-hold.e2e.ts:138, pages.ts and user-admin.e2e.ts's status checks fit; `sso.ts:113` and `:146` use `?search=` |
| 4 | `sso.ts` `?search=` lines (report only) | no | partly | `search` is not the list's parameter (`q`), so it is ignored and the whole list shows; line 113 ("no account for Ann yet") passes but only proves Ann is absent from the first page; line 146 can fail if Ann is not on the first page; not part of this diff |
| 5 | `pnpm test:e2e` passes on the desktop, phone and tablet projects | no | confirmed | from the repo root, exit 0: 166 passed (6.1m), no failed, flaky or skipped (chromium 77, phone 29, phone-webkit 29, tablet 29, wizard 1, wizard-nojs 1); the log-check teardown passed |
| 6 | Unit tests under features, components and app pass | no | confirmed | `vitest run src/features src/components src/app` → 87 files, 969 passed |
| 7 | `e2e/pages.ts` lists `/admin/users/[id]` and the phone sweep opens it | no | confirmed | `pages.ts:150`; the sweep loops over all `SWEEP_PAGES`, with `userId` at `mobile-sweep.mobile.e2e.ts:87`; `pages-coverage.test.ts` passes; the sweep passed on phone, phone-webkit and tablet |
| 8 | Mutation: `UserActionButton` uses `kind` instead of the remembered `opened` for the dialog's title and form | no | not met | scratch copy: `TITLES[opened ?? kind]` → `TITLES[kind]` and `kind={opened}` → `kind={kind}`: `vitest run src/features/admin-users` → 58 passed; `user-admin.e2e.ts` and `scim.e2e.ts` on chromium also passed with it built in; nothing changes `kind` while a dialog is open (Disable to Enable), so no test guarded the fix |
| 9 | Mutation: the route renders Reset two-factor only `{row.twoFactor ? … : null}` instead of `hidden` | no | confirmed | scratch copy: `vitest run src/features/admin-users src/app` → 193 passed (no unit test catches it); built with `next build --webpack` and `playwright test e2e/two-factor-hold.e2e.ts --project=chromium` → "root resets someone" FAILED on the missing result text; only the e2e run catches it |
| 10 | Mutation: `openUser` clicks only "Open <email>", no phone fallback | no | confirmed | the same built copy: `e2e/scim.mobile.e2e.ts --project=phone` → FAILED (120 s timeout waiting for the "Open kai@phone.scim.e2e.test" link at `helpers.ts:52`); chromium's `scim.e2e.ts` and `user-admin.e2e.ts` passed with it, so only the phone project catches it |

**Overall:** not met. Rows 3 and 4: `sso.ts` searches with the wrong parameter; row 8: nothing guards the dialog's remembered action. Fixed after this pass: `sso.ts` uses `?q=` and its "no account for Ann" check looks for a row; `user-admin.e2e.ts` now checks, after the page refreshes behind the Disable dialog, that the dialog is still titled "Disable user" and the page shows Enable; `user-admin`, `sso` and `sso.mobile` pass (5 tests); needs a re-check.

### Re-check 1 — rows 3, 4 and 8

Witnessed: 2026-10-20 11:55 EDT, by a fresh agent (re-check of rows 3, 4 and 8, with mutations in a scratch copy). Commit: bb02ecdc plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The SSO e2e searches the Users list with its real parameter `q` | no | confirmed | `git diff apps/web/e2e/sso.ts`: both `?search=` became `?q=` (lines 113 and 147); `list.ts:11` has `filters: { q, role, status }`, `list.ts:43` passes `search: q`; `test:e2e e2e/sso.e2e.ts e2e/sso.mobile.e2e.ts` in the real repo → 4 passed (chromium, phone, phone-webkit, tablet); mutation: line 113 back to `?search=` → fails (Expected 0, Received 50 rows) |
| 4 | "No account for Ann yet" looks for a row (`getByRole("row").filter({ hasText: ANN })`, count 0), not `getByText(ANN)`, and can fail | no | confirmed | `sso.ts:115` has the row filter; mutation: `hasText` → `"@e2e.test"` (on every e2e user) passes with `?q=ann…` (the search narrowed the list) and fails with `?search=` (Received 50), so the check searches for Ann and can fail (a first probe, `hasText: "root"`, was uninformative because the email is `root@e2e.test`) |
| 8 | The Disable dialog keeping the action it was opened for after the page refreshes is guarded (`user-admin.e2e.ts:142-143`) | no | confirmed | real repo: `test:e2e e2e/user-admin.e2e.ts` → 1 passed; scratch copy built with `next build --webpack` and a `pnpm` shim, unmutated → passed; with `UserPageActions.tsx` using `TITLES[kind]` and `kind={kind}`, rebuilt → fails at `user-admin.e2e.ts:142` (`getByRole('dialog', { name: 'Disable user' })` not found) |

**Overall:** met. Everything ran in a scratch copy; the repository was not edited by the witness.

## Task 7 — Documentation

Witnessed: 2026-10-20 12:05 EDT, by a fresh agent (blind). Commit: 95f4fa3f (marketplace) and 7af9c3f (ronne-web, branch `docs/marketplace-123-user-page`). Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | List columns in order: name, email, role, status, last sign-in, created (and Open); sortable by name, email, created; a row has no buttons | no | confirmed | `UsersPage.tsx:150-250`: name, email, role, status, lastSignIn, created, open (chevron); `sort` only on name, email, created; no Button in any column |
| 2 | The name, or the chevron, opens the user's page; on a phone the email does and covers the row; the icon beside the email copies it | no | confirmed | `UsersPage.tsx:154-163` (name Link), `:228-240` (IconLink, hidden on mobile), `:174-184` (email Link `sm:hidden after:absolute after:inset-0`), `:188` (CopyEmailButton) |
| 3 | Last sign-in counts web sign-ins only; Never when none; a dash for an erased account; rmk and token use don't count | no | confirmed | `kysely-identity-repository.ts:363-380` takes the max `created_at` of `auth.signed_in`, written only at `session.ts:147` (password), `sso.ts:319` (provider) and `two-factor.ts:398` (second step); `user-admin.ts:83-84` null for erased; `UsersPage.tsx:200-208` |
| 4 | A long name or email ends in an ellipsis, the full text on hover | no | confirmed | `truncate: true`, `title={user.name}` / `title={user.email}` (`UsersPage.tsx:150-185`) |
| 5 | The Role column: `root`, or a badge per workspace role, highest first, with a count, and the hover lists each | no | confirmed | `RoleCell`, `UsersPage.tsx:68-97` |
| 6 | SCIM badges, Erased on and status `erased`, the page warns a sync sets a change back | no | confirmed | `ScimBadges` `UsersPage.tsx:104-135`; `UserPage.tsx:100-102` renders `ScimManagedNotice`; `UsersPage.tsx:196` |
| 7 | The page's sections and where each action lives | no | confirmed | `UserPage.tsx:107-188`: five sections; slots in `[id]/page.tsx:48-62` |
| 8 | Reset two-factor shows only with two-factor on and does what the text says | no | confirmed | `[id]/page.tsx:51` `hidden={!row.twoFactor}`; `UserActionDialogs.tsx:178-186`; `user-admin.ts:346-348` |
| 9 | Reset password, Disable and Enable do what the text says | no | confirmed | `UserActionDialogs.tsx:147-165`; `user-admin.ts:314-315`; `DisableImpact` `:68-80`; `OneTimePassword` |
| 10 | Manage workspaces: global always there, roles, Remove, Add workspace, Save says what changed; root has no Manage button | no | confirmed | `WorkspaceRows.tsx`; `UserWorkspacesDialog.tsx:34-41`; `[id]/page.tsx:54-58`; the page shows "Root: every workspace." (`UserPage.tsx:153`), so "Root has no Workspaces" was loose wording |
| 11 | Their data: the audit link, Download their data, the 10-minute rule, the audit record | no | confirmed | `UserPage.tsx:171-178`; `DownloadDataDialog.tsx:21-31`; `user-data-export.ts:24-25,48` |
| 12 | Erase ends the account once its email is typed | no | confirmed | `EraseUserDialog.tsx:16-18`, `:119-138` |
| 13 | A dialog stays open until closed, showing what happened | no | confirmed | `UserPageActions.tsx:18-28`; `UserActionDialogs.tsx:108-122` |
| 14 | Your own page is read-only; an erased account's page has no actions and a greyed download | no | confirmed | `UserPage.tsx:87-91, 114, 132, 157, 178, 181`; `[id]/page.tsx:36-37`; `UserPageActions.tsx:60-68` |
| 15 | The changed sentences in privacy.tsx and scim.tsx are true | no | confirmed | `git show 7af9c3f -- en/privacy.tsx en/scim.tsx` against `UserPage.tsx` and `ScimBadges` |
| 16 | Other topics that said "Users list" or "row" for an action were updated, including Two-factor: reset | no | partly | no "Users list" or "row" wording is left in `en/*.tsx`; `en/account.tsx:134-137` ("ask a root to reset your two-factor in Users") was unchanged and is still true, but the spec said "on the user's page" |
| 17 | pt and fr carry the same structure and links as en in the Users section | no | confirmed | a script: the same 7 DocLink targets, 7 `<Code>` items, 21 `<strong>`, 5 `<li>` and 6 `<p>` in all three |
| 18 | fr has no space before `;` and no `&ldquo;` / `&rdquo;` in the changed hunks | no | confirmed | `git show 7af9c3f … \| grep '^+'` → 0 matches for ` ;` in fr and for `&ldquo;`, `&rdquo;`, `&laquo;` |
| 19 | ronne-web tests, lint and typecheck pass | no | confirmed | `pnpm test` → 30 files, 169 passed; `pnpm lint`, `pnpm typecheck` clean |
| 20 | The marketplace's helper link test passes | no | confirmed | `vitest run src/components/help/help.test.tsx src/components/ui/HelpTip.test.tsx` → 5 passed |
| 21 | No helper mentions a row or the list's buttons, and the answers still match | no | confirmed | `Help.tsx` own-row, reset-two-factor, download-user-data, erase-user, scim-managed, role-root: no "row", "list" or button wording; used in the page and its dialogs |
| 22 | `topics.ts` needed no change, and the two topics.ts files agree | no | confirmed | `git show 7af9c3f --stat` has no `topics.ts`; `admin` lists users, settings, audit in both; no test compares the whole files |

**Overall:** not met: row 16 only, the spec expecting "on the user's page" in Two-factor, whose sentence never named the list. Also found: "Root has no Workspaces" was loose. Fixed after this pass: the spec says Two-factor stays unchanged and why; en, pt and fr now say root has no *Manage workspaces* button (ronne-web commit `b778af2`, amended; needs a re-check).

### Re-check 1 — rows 10 and 16

Witnessed: 2026-10-20 11:59 EDT, by a fresh agent (blind, re-check of rows 10 and 16). Commit: 95f4fa3f plus the uncommitted SPEC.md and WITNESS.md (the marketplace); ronne-web `b778af2`. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | The Workspaces bullet says root has no **Manage workspaces** button, in en, pt and fr, and that is true against the app | no | confirmed | `grep -n "Manage workspaces" www/src/content/docs/{en,pt,fr}/admin.tsx` at `b778af2`: en 86-87 "Root has no <strong>Manage workspaces</strong> button: root works in every workspace.", pt 89 "O root não tem o botão <strong>Manage workspaces</strong>: …", fr 96 "… <strong>Manage workspaces</strong> : root travaille …"; the app: `[id]/page.tsx:49-66` hides the button when `user.role === "root"`, `UserPage.tsx:154` shows "Root: every workspace." |
| 16a | The spec's "Other topics" bullet says Privacy and SCIM use "on the user's page", and Two-factor stays unchanged | no | confirmed | `SPEC.md:136-139` |
| 16b | No docs wording is left that puts an action on a row or in the list, outside the Users section | no | confirmed | `grep -n -i "users list\|on the row\|on its row\|each row" www/src/content/docs/{en,pt,fr}/{admin,privacy,scim,account}.tsx` → 3 hits, all in `admin.tsx` lines 16-17 describing the list; `pt/privacy.tsx:185` says "na página do usuário" |
| 16c | The `account.tsx` two-factor sentence is still true | no | confirmed | `en/account.tsx:134-137` "ask a root to reset your two-factor in Users", pt:137 and fr:150-153 the same; the app's user page has a "Reset two-factor" button and a Two-factor fact (`UserPage.tsx:145`) |
| – | ronne-web tests pass | no | confirmed | `pnpm test` in `www` → 30 files, 169 passed |

**Overall:** met.
