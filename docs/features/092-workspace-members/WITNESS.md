# 092 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Membership services

Witnessed: 2026-10-07 09:38 EDT, by a fresh agent (blind). Commit: 3789580 + working tree (uncommitted diff on feat/092-workspace-members). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `addMembers` adds several users with one role, leaves an existing member as they are, and audits each add as `workspace.member_added` | yes | confirmed | `services/members.ts:98-129`; "adds people with one role…" in `members.db.test.ts`; `vitest run --project db src/server/domains/workspaces` → 26 passed (SQLite); `node scripts/test-db.mjs postgres\|mysql\|mariadb src/server/domains/workspaces src/server/domains/audit src/features/admin-audit` → 33 passed on each |
| 2 | `changeMemberRole` changes a role (in `global` too), audits from and to, does nothing for the same role, refuses a non-member and a bad role | yes | confirmed | `members.ts:132-162`; 2 role_changed events after 3 calls, `NotAWorkspaceMemberError`, `InvalidMemberRoleError`; mutant dropping its audit → that test fails |
| 3 | `removeMember` removes and audits `workspace.member_removed` with the role; removing someone's last non-global workspace is allowed and they keep `global` | yes | confirmed | `members.ts:168-183`; the test leaves `{global:"user"}`; probe: removing twice → 1 event, no error |
| 4 | Nobody is removed from `global` (removeMember refuses; setUserWorkspaces keeps it when it isn't listed) | yes | confirmed | `members.ts:177` `GlobalMembershipError`, `members.ts:236` skips global; mutants without either → their tests fail |
| 5 | `setUserWorkspaces` applies the difference (add, change, remove) in one transaction, one event per change | yes | confirmed | `members.ts:194-243` in `repo.transaction` (`db.transaction()`); counts `{1,1,0}` then `{0,1,2}`, 2+2+2 events; mutant outside the transaction → "changes nothing, and records nothing, when a step fails" fails |
| 6 | Only root manages members: a user, a moderator and no session are refused on all six entry points, and nothing changes | yes | confirmed | `permissions.ts:15` `"workspaces.manage": ["root"]`; every service `requirePermission`; "is root only" loops over asUser, asModerator, `new Headers()`; mutant without addMembers' check → fails |
| 7 | A disabled user can be added (from their user page), and their memberships stay and show as disabled | yes | confirmed | `members.ts:37-42` refuses only root and unknown users; the test adds a disabled user, `listMembers` shows `disabled: true`; mutant refusing disabled users → fails |
| 8 | Root's own memberships aren't managed or offered | yes | confirmed | `members.ts:40` `RootMembershipError`; "refuses root's own memberships", "refuses root and unknown users" |
| 9 | Three audit actions exist and have summaries | yes | confirmed | `audit-event.ts`; `summary.ts:117-136`; probe rendered "Added u@… to a4 as user", "Changed … from moderator to user", "Removed … from a1" |
| 10 | Deleting a workspace removes its memberships, and `workspace.deleted` counts them | yes | confirmed | `services/workspaces.ts:148-158` (`countMembers` before the delete, FK CASCADE from 0020); metadata `{name:"acme", members:2}`; summary "(2 members)", "(1 member)", "" when missing |
| 11 | Two roots editing the same user at once: an upsert or delete per row, the later write wins per row, both audited | no | confirmed | `putMember` upserts on `(workspace_id,user_id)`; probe with 2 concurrent `setUserWorkspaces` + 2 concurrent `addMembers` on all 4 databases → no errors or deadlocks, all 6 changes audited, one row per workspace |
| 12 | The action adapters are thin and pass the session actor | yes | confirmed | `actions/workspaces.ts:55-90` |
| 13 | Lint, types and the related unit tests pass | yes | confirmed | typecheck clean; `biome check` clean; `vitest run src/features/admin-audit src/server/domains/{workspaces,audit}` → 62 passed |
| 14 | Full db suite green on each server: 74 files / 602 tests | yes | partly | SQLite `--project db` → 74 files, 594 passed / 8 skipped; `node scripts/test-db.mjs postgres` and `mysql` → 74 files, 602 passed each; `mariadb` → 608 tests (the tree had gained tests since the notes), first run 1 failed / 607, then 3 reruns all 608 passed; the failing test wasn't captured |

**Overall:** not met (row 14): rows 1–13 hold — the four services, the `global` rule, root-only access, disabled users, the audit events and the delete count hold on SQLite, PostgreSQL, MySQL and MariaDB, and mutants show the db tests catch breaking each rule. Row 14: the count moved because tests were added during the pass (the race fixes below); the full suites on every server are re-run in the re-check. Remark taken: two `addMembers` of the same person at once both said "added" and the later one changed the role; adding now inserts only when absent (see the adversarial pass and its re-check).

### Re-check — row 14

Witnessed: 2026-10-07 10:04 EDT, by a fresh agent (blind). Commit: 3789580 + uncommitted working tree (task 1 files plus the next task's Create user changes). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | The full db suite passes on SQLite, PostgreSQL, MySQL and MariaDB, with the member services' tests | yes | confirmed | `vitest run --project db` (SQLite) → 74 files, 600 passed / 8 skipped (608); `pnpm test:db:postgres` → 74 files, 608 passed; `:mysql` → 608 passed; `:mariadb` twice → 608 passed both times; no failures; `members.db.test.ts` (13 tests) in every run; the first pass's one MariaDB failure didn't recur in these 2 runs or 3 earlier reruns |

**Overall:** met: the full db suite, with the member services' tests, passes on all four databases at 608 tests.

Witnessed: 2026-10-07 09:42 EDT, by a fresh agent (adversarial). Commit: 3789580 (+ uncommitted working tree on feat/092-workspace-members). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `addMembers`, `changeMemberRole`, `removeMember`, `setUserWorkspaces` exist in the workspaces domain, with thin action adapters | yes | confirmed | `services/members.ts` exports all four plus `listMembers`, `userMemberships`; `actions/workspaces.ts:55-90`; `tsc --noEmit` → exit 0; `biome check` → no issues |
| 2 | Root only: a user, a global moderator, the workspace's own moderator, signed out, and a token are refused | yes | confirmed | `permissions.ts:15` `"workspaces.manage": ["root"]`; every service calls `requirePermission` first; probe: acme's moderator → ForbiddenError; root's PAT as Bearer → ForbiddenError (session-only actor); "is root only"; mutant without the check → 1 test fails |
| 3 | Nobody is removed from `global` (removeMember, setUserWorkspaces with `[]`, global's id spelled otherwise, deleting global) | yes | confirmed | removeMember(global) → GlobalMembershipError; probe: `setUserWorkspaces([])` → removed 0, global stays; spaced, short, `"O"×26`, `"global"` ids → WorkspaceNotFound (MariaDB `"000…0 "` → GlobalMembershipError); `deleteWorkspace` → GlobalWorkspaceError; mutants removing either check → 1 test fails each |
| 4 | Root's own memberships aren't managed; unknown users refused; a disabled user can be added | yes | confirmed | RootMembershipError for add, `userMemberships(root)`, `setUserWorkspaces(root)`; unknown → MemberUserNotFoundError; a disabled user added and listed `disabled: true`; mutants → tests fail |
| 5 | A root's kept rows are ignored and not offered (a user made root, or demoted) | yes | partly | Probe on 4 DBs: after `adminChangeRole(u, "root")`, `listMembers(acme)` still listed u (moderator) and `removeMember` refused with RootMembershipError |
| 6 | `setUserWorkspaces` applies the difference, an event per change, with correct events | yes | partly | SQLite/PostgreSQL right; **MySQL/MariaDB**: `[{workspaceId: acme.toLowerCase(), role:"moderator"}]` → `{added:1, removed:1}`, the user removed from acme; MariaDB `GLOBAL_ID+" "` audited as `member_added`. Cause: the input id was written and compared, not the stored `workspace.id` |
| 7 | One transaction: a failing step writes nothing and audits nothing | yes | confirmed | "changes nothing… when a step fails" on all 4; probe `addMembers([user, root])` → RootMembershipError, no row, 0 events; mutant without the transaction → fails |
| 8 | Two roots at once: later write wins per row, both audited | yes | not met | Probe: two concurrent `setUserWorkspaces` on one user → PostgreSQL and SQLite fine; **MySQL 8.4 and MariaDB: 5 of 6 runs one call fails with `Deadlock found when trying to get lock`**, rolled back; four concurrent `addMembers` of one user → all `added`, the role overwritten |
| 9 | Audit events member_added / _role_changed / _removed, with no secrets | yes | confirmed | `audit-event.ts`; metadata `{workspace, email, role}` or `{…, from, to}`, target the user, actor root; summaries typed by `Record<AuditAction>`; mutants → tests fail |
| 10 | Deleting a workspace removes its rows; the event counts them | yes | confirmed | `{name:"acme", members:2}`, rows gone (FK cascade, 0020) on all 4; mutant `members: 0` → fails |
| 11 | Invalid roles refused | yes | confirmed | `"Moderator"`, `" user"`, `"root"`, `""`, a zero-width space → InvalidMemberRoleError, no write |
| 12 | Done when: db tests cover each service, the global rule, a disabled user, a non-root actor | yes | confirmed | `members.db.test.ts` 10 tests; `vitest --project db` on workspaces and identity → 106 passed on each of the 4; 9 mutants each fail a test; concurrency and ids as sent weren't covered (6, 8) |

**Overall:** not met: on MySQL and MariaDB two concurrent edits of one user usually deadlocked, a mis-cased workspace id removed the user from it, and a root's kept rows were still listed. Fixed: every change locks the users' rows first (`lockUsers`, in id order) in a READ COMMITTED transaction; `setUserWorkspaces` keys by the stored id; the members list leaves roots out; tests for each. Re-check below.

### Re-check: rows 5, 6, 8 and what the fixes touch

Witnessed: 2026-10-07 09:59 EDT, by a fresh agent (adversarial). Commit: 3789580 (+ uncommitted working tree on feat/092-workspace-members, with the next task's changes, ignored but where they touch these services). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | A root's kept rows are left out of the members list and count again once they're not root | yes | confirmed | `kysely-workspace-repository.ts:219` `.where("user.role", "!=", "root")`; probe on 4 DBs: after `adminChangeRole(u, "root")`, acme and global list only `o@example.com`; after demotion, acme lists u again; mutant without the filter → 1 test fails on MySQL and MariaDB, 3/3 runs |
| 6 | `setUserWorkspaces` keys by the stored id, so an id spelled another way removes nothing and is audited correctly | yes | confirmed | `members.ts:209-212` (`findById`, keyed by `workspace.id`); MySQL/MariaDB: `[{acme.toLowerCase(), moderator}]` → `{changed:1, removed:0}`, one `member_role_changed`; MariaDB `GLOBAL_ID+" "` → role_changed in global; `[acme, acme.lower, acme+" "]` → one change; SQLite/PostgreSQL → WorkspaceNotFound, no change; mutant keyed by `choice.id` → fails, 3/3 on each MySQL server |
| 8 | Two roots at once: no deadlock, both apply, both audited; a second concurrent add answers `already_member` | yes | confirmed | Probe: 4 rounds a run of 8 calls at once (2× `setUserWorkspaces(u)`, `addMembers` ×4, `changeMemberRole(global)`, `removeMember(beta)`): 6 runs MySQL 8.4 → 24/24 rounds, 0 errors; 6 runs MariaDB → 24/24, 0 errors; PostgreSQL and SQLite 0 errors; `lockUsers` locks FOR UPDATE in id order first; mutant with `lockUsers` doing nothing → the new test fails on MySQL and MariaDB, 3/3 |
| 13 | Transactions run at READ COMMITTED | yes | confirmed | `kysely-workspace-repository.ts:92-95` `readCommittedTransaction`; remark: going back to a plain transaction still passes (the first non-locking read comes after `lockUsers`), so the lock alone serialises the edits today |
| 14 | A workspace deleted during an add or set leaves no partial write | no | confirmed | Probe: `addMembers(gamma,[u,o])`, `deleteWorkspace(gamma)` and `setUserWorkspaces(u,[gamma])` at once → 0 rows left on all DBs; remark: the losing call threw the raw foreign-key error instead of WorkspaceNotFoundError (now mapped: `changing` in members.ts) |
| 15 | Tests, typecheck and lint after the fixes | yes | confirmed | `vitest --project db` on workspaces, identity, audit → 123 passed on each of the 4; `members.db.test.ts` 13 tests; `tsc --noEmit` → exit 0; `biome check` → warnings only, none in workspaces or audit |

**Overall:** met: a root's kept rows stay out of the members list, `setUserWorkspaces` uses the stored ids, and the user-row lock serialises concurrent edits with 0 deadlocks in 48 rounds on MySQL and MariaDB.

## Task 2 — The admin role

Witnessed: 2026-10-07 10:36 EDT, by a fresh agent (blind). Commit: afa4d40 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `WorkspaceRole` gains `admin`, and stored rows accept it | yes | confirmed | `identity/models/user.ts:13,28`; `db/schema.ts:112`; 0020 has no CHECK on `role`; admins inserted on all 4 dialects |
| 2 | The permission-matrix test has an admin column (all workspace permissions in A, none in B, `account.manage_own` only instance-wide) | yes | confirmed | `permissions.test.ts:20,35`; `vitest run permissions.test` → 10 passed; mutants `members.manage` += moderator, `versions.manage` −admin → fail |
| 3 | `members.manage`, `scopes.create`, `workspace.edit` are held by admin and root only; `workspaces.manage`, `users.manage`, `scopes.manage` stay root's | yes | confirmed | `permissions.ts:15,17,40-44`; the matrix and the full-list test (`permissions.test.ts:72-90`) |
| 4 | Admin holds every moderator permission in their workspace and none elsewhere | yes | confirmed | `permissions.ts:30-38`; "reviews and releases there"; mutant (admin dropped from `versions.manage`) → db and unit tests fail |
| 5 | An admin lists, adds, changes (to admin too) and removes members of their workspace, other admins included; audited as them | yes | confirmed | admin-role test on 4 dialects; probe: add as admin, demote and remove another admin → ok; add root → RootMembershipError |
| 6 | Not in another workspace; a user's whole set stays root's; no session refused | yes | confirmed | `members.ts:129,249` keep `workspaces.manage`; "does nothing to another workspace's members"; mutant without `requireManagerOf` in addMembers → fails; `beta.toLowerCase()` on MySQL → Forbidden; empty headers → Forbidden |
| 7 | An admin never changes or removes their own membership (the last admin can't remove themselves) | yes | partly | Holds on SQLite and PostgreSQL; **MySQL/MariaDB**: `changeMemberRole(asAdmin,{acme, userId: adminId.toLowerCase(), role:"user"})` → ok (self-demoted), `removeMember(… adminId.toLowerCase())` → ok, row gone; `members.ts:80-81` compared the raw input before the user was looked up |
| 8 | An admin of `global` manages global's roles, can't remove anyone from global, and sees global listed | yes | confirmed | "an admin of global"; probe → `["global","acme"]`, count 2 |
| 9 | Creating a scope accepts admins in their workspace, refuses another workspace or global | yes | confirmed | `scopes.ts:35-41,274`; mutant removing the in-workspace check → db test fails |
| 10 | Editing a scope's description accepts admins in their workspace and refuses them in another | yes | partly | Probe on 4 dialects: acme's → ok; global's or beta's → Forbidden; but no test shows the refusal: mutant removing `requireScopeManagerIn(actor, scope.workspace.id)` (`scopes.ts:289`) → the suite still passes |
| 11 | Editing the workspace description: an admin edits theirs; another → Forbidden; global → GlobalWorkspaceError | yes | confirmed | `workspaces.ts:125-130`; mutant removing the in-workspace check → fails |
| 12 | An admin can't delete or create workspaces | yes | confirmed | probe: deleteWorkspace / createWorkspace → Forbidden (workspaces.manage) |
| 13 | `pageWorkspaces` and `findWorkspace` give an admin only theirs (others null); a moderator is refused | yes | confirmed | "lists and opens only…"; search "beta" → 0, count 0; `findWorkspace("ACME")` on MySQL → acme; mutants → fail |
| 14 | The Moderators count includes admins (not disabled, not root) | yes | confirmed | `kysely-workspace-repository.ts:68-70`; test expects 2; mutant back to moderator only → fails |
| 15 | Admin › Users names a user's admin workspaces | yes | confirmed | `UsersPage.tsx:74-87`; `admin-users.test.tsx:111`; admins sorted first |
| 16 | The db tests pass on all four dialects | yes | confirmed | SQLite `vitest run --project db workspaces/ memberships.db items/` → 83 passed; postgres, mysql, mariadb → 83 each |
| 17 | No regressions; typecheck and lint pass | yes | confirmed | `vitest run` (web) → 1646 passed, 8 skipped; `tsc --noEmit` clean; `biome check` no errors |
| 18 | MVP.md §2 and §15 record the decision | yes | confirmed | §2 admin paragraph, roles row, matrix rows; §15 Roles names admin (092, owner 2026-10-07); data model `admin/moderator/user` |

**Overall:** not met: on MySQL/MariaDB an admin could change or remove their own membership by sending their id in another case (7), and no test covered refusing a scope-description edit in another workspace (10). Remark: `InvalidMemberRoleError` still said "Use moderator or user."
Fixed: the own-membership check compares the stored user id after the lookup; a test refuses an admin editing beta's scope description; the message lists admin. Re-check below.

### Re-check

Witnessed: 2026-10-07 10:59 EDT, by a fresh agent (blind). Commit: afa4d40 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | An admin never changes or removes their own membership, whatever case or padding the id is sent in, on all four databases | yes | confirmed | `notOwn(actor, user)` after `memberUser`, comparing the stored `user.id`; probe (own id lowercased, own id plus a space, through change and remove): SQLite and PostgreSQL → MemberUserNotFoundError ×4; MySQL → OwnMembershipError (lowercase), MemberUserNotFoundError (space); MariaDB → OwnMembershipError ×4; still admin afterwards; mutant comparing the input id → `admin-role` fails on MySQL and MariaDB |
| 10 | Editing a scope's description: accepted for an admin in their workspace, refused in another, and a db test shows the refusal | yes | confirmed | `admin-role.db.test.ts:157-162` (`beta-tools` created by root, the admin's edit → ForbiddenError); probe on 4 databases: acme's ok, global's and beta's Forbidden; mutant removing `requireScopeManagerIn(actor, scope.workspace.id)` → `admin-role` fails |
| 16 | The whole db suite passes on all four databases | yes | confirmed | `vitest run --project db` → 75 files, 607 passed, 8 skipped (SQLite); `scripts/test-db.mjs postgres\|mysql\|mariadb` → 615 passed each (the notes said 614) |

**Overall:** met: the own-membership check holds on MySQL and MariaDB, and the refused scope-description edit is covered by a test that fails without the check.

Witnessed: 2026-10-07 10:45 EDT, by a fresh agent (adversarial). Commit: afa4d40 + uncommitted working tree (feat/092-workspace-members). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `WorkspaceRole` gains `admin`, and sessions and tokens load it | yes | confirmed | `user.ts:13,28`; `schema.ts:112`; no CHECK on the role column (0020); session and token loaders use `loadMemberships`; "reviews and releases there" builds `getCurrentUser` from a real session → passes on 4 dialects |
| 2 | `members.manage`, `scopes.create` and `workspace.edit` are held by admin and root only | yes | confirmed | `permissions.ts`; mutants giving members.manage to moderator, scopes.create to user, workspace.edit to moderator → `permissions.test.ts` 1 failed each |
| 3 | Admin holds every moderator permission, in their own workspace only | yes | confirmed | the matrix row `"admin in A": { a: WORKSPACE, b: [] }`; removing admin from versions.manage or view_submitted → fails; probe on 4 dialects: acme's admin approved, released and deprecated in acme; beta's `decide`/`publishSubmission`/`yank` → refused |
| 4 | Root's instance permissions don't reach admins; admins can't create or delete workspaces or use a user's whole set | yes | confirmed | probe: an admin's instance permissions = `['account.manage_own']` on 4 dialects; `deleteWorkspace`/`createWorkspace` → ForbiddenError; `userMemberships`/`setUserWorkspaces` → ForbiddenError |
| 5 | An admin adds members, changes roles (granting admin included) and removes them in their workspace, all audited | yes | confirmed | "adds members, makes another admin…": 4 events with actorId = admin, on 4 dialects |
| 6 | An admin does nothing to another workspace's members (nor `global` unless its admin), whatever spelling the id uses | yes | confirmed | probe ×4 dialects with beta's id lowercased or space-padded, `GLOBAL_WORKSPACE_ID.toLowerCase()`: add, list, change → WorkspaceNotFoundError or ForbiddenError, nothing changed; mutants removing the manager check from add, change, remove → fail |
| 7 | An admin never changes or removes their own membership | yes | not met | MySQL and MariaDB: `changeMemberRole(asAdmin,{acme, userId: adminId.toLowerCase(), role:"user"})` → OK (self-demoted), `removeMember(…)` → OK; SQLite/PostgreSQL → MemberUserNotFoundError; `notOwn` compared the id as sent before the lookup |
| 8 | An admin can't act on root | no | confirmed | probe ×4: change root's role in acme, add root to acme → RootMembershipError |
| 9 | Admin of `global` manages its roles but can't remove anyone from it | yes | confirmed | "an admin of global" ×4 |
| 10 | An admin creates scopes in their workspace, not in another or in `global` | yes | confirmed | admin-role ×4; probe: beta's id lowercased → not found or Forbidden; global → Forbidden; mutant without `requireScopeManagerIn` in createScope → fails |
| 11 | An admin edits their own scopes' descriptions, and the db tests show it refused for another workspace's scope | yes | partly | The behaviour holds (probe ×4: `updateScopeDescription({name:"beta"})` → Forbidden, unchanged), but a mutant deleting `requireScopeManagerIn(actor, scope.workspace.id)` survived the whole db suite (606 passed) |
| 12 | An admin edits their workspace's description; not another's; `global` never | yes | confirmed | admin-role ×4; probe "BETA", " beta " → Forbidden, unchanged; mutant without the in-transaction check → fails |
| 13 | An admin lists and opens only the workspaces they administer | yes | confirmed | probe `pageWorkspaces({search:"beta"})` → 0 rows, count 0; `findWorkspace("BETA")` → null ×4; mutants → fail |
| 14 | The Moderators count includes admins (active, not root) | yes | confirmed | `kysely-workspace-repository.ts:68`; probe ×4: an active admin, a disabled admin, root with an admin row → 1; mutant → fails |
| 15 | The permission-matrix test has the admin column | yes | confirmed | `permissions.test.ts:20,35`; 5 matrix mutants killed |
| 16 | Concurrent admin actions stay consistent and give a clean answer | no | partly | Two admins demoting each other at once: MySQL and MariaDB → raw `Deadlock found when trying to get lock` (6 of 6 runs); PostgreSQL 1 of 3 runs both succeeded → no admin left; two roots at once → no deadlock (5/5) |

**Overall:** not met: on MySQL/MariaDB an admin changed or removed their own membership by sending their id in lowercase; no test refused an admin editing another workspace's scope description; admins changing each other at once hit a raw deadlock (MySQL/MariaDB) or left no admin (PostgreSQL). Fixed: `notOwn` compares the stored id after the lookup; member changes lock the changed users and the actor, then re-read the actor's role under the lock (`requireManagerNow`); tests for each; stale messages updated. Re-checks below.

### Re-check — rows 7, 11, 16 and what the fixes touch

Witnessed: 2026-10-07 11:09 EDT, by a fresh agent (adversarial). Commit: afa4d40 + uncommitted working tree (`toLock`, `requireManagerNow`, stored-id `notOwn`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | An admin never changes or removes their own membership, whatever spelling the id uses (row 7) | yes | confirmed | probe: MySQL → OwnMembershipError; MariaDB → OwnMembershipError, also with a trailing space; PostgreSQL, SQLite → MemberUserNotFoundError; role stays admin, 2 runs each; mutant comparing the raw id → admin-role fails on MySQL and MariaDB |
| 2 | The db tests show an admin refused when editing another workspace's scope description (row 11) | yes | confirmed | mutant deleting `requireScopeManagerIn(actor, scope.workspace.id)` → admin-role 1 failed; probe ×4 → Forbidden |
| 3 | Two admins demoting each other at once: one succeeds, the other is refused cleanly, one admin remains (row 16) | yes | confirmed | probe, 16 runs per server, ids as stored: always `ok \| ForbiddenError`, one admin left, on all 4, no deadlock; mutants (no re-read under the lock; not locking the actor) → fail on MySQL and MariaDB (the first survived 1 PostgreSQL run, a race) |
| 4 | The same race with one id sent in another case gives a clean answer | no | partly | one admin still remains, but **MariaDB 9 of 16 runs** → raw `Deadlock found…`; MySQL 16/16 clean; PostgreSQL, SQLite → MemberUserNotFoundError; `lockUsers` sorted the ids as sent, so the two transactions locked in opposite orders |
| 5 | An admin removed mid-flight by another admin (root also acting) is refused afterwards | yes | confirmed | probe "MIX", 16 runs per server: every outcome matches a serial order; no raw errors |
| 6 | The error messages are current | yes | confirmed | `errors.ts:84`; `memberships.ts` "three known ones" |
| 7 | Admin › Users lists admins first, then moderators, then users | yes | confirmed | `user-admin.db.test.ts`; mutant dropping the `ROLE_ORDER` sort → fails |
| 8 | Someone who holds the permission nowhere is refused before any lookup | yes | confirmed | `requireManagerSomewhere`, `requireScopeManagerSomewhere`, `canInSome` first in `workspaces.ts:125,204,244`; "a moderator" → Forbidden for list, add, scope, edit, page |
| 9 | MVP §2 and §15 record the decision | yes | confirmed | `git diff afa4d40 -- docs/MVP/MVP.md` |
| 10 | Checks green; db suite on each server | yes | confirmed | SQLite 607 passed / 8 skipped; postgres, mysql, mariadb 615 each (notes said 614); `tsc` exit 0; `biome check` 0 errors |
| 11 | The fixes don't reopen the first pass's escalation paths | no | confirmed | the first pass's attack probe re-run ×4: same refusals; beta's and global's rows unchanged |

**Overall:** not met: the self-change bypass, the scope-edit gap and the two-admin race are fixed, but on MariaDB the race with one id sent in lowercase still deadlocked (9 of 16). Fixed: `lockUsers` locks in the ids' canonical order (trimmed, uppercase); the race test repeats six times, with the lowercase variant. Second re-check below.

### Second re-check — the cross-case race and the race test's strength

Witnessed: 2026-10-07 11:17 EDT, by a fresh agent (adversarial). Commit: afa4d40 + uncommitted working tree (`lockUsers` sorting by `id.trim().toUpperCase()`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Two admins demoting each other at once, one id sent in lowercase, get a clean answer with one admin left | yes | confirmed | Probe "XCASE", 24 runs per server: MariaDB 24/24 `ok \| ForbiddenError`, 0 deadlocks (was 9/16); MySQL 24/24 clean (one run both refused, both stayed admin); PostgreSQL 24/24 `MemberUserNotFoundError \| ok`; the same-case and mixed races 24/24 each, no raw errors, one admin left |
| 2 | The admin-role race test catches the race (six rounds, alternating the lowercase id) | yes | confirmed | mutant dropping the re-read under the lock → `-t 'at once'` 1 failed in 3/3 runs on postgres, mysql, mariadb; mutant sorting ids as sent → fails 3/3 on mysql and mariadb; unmutated `src/server/domains/workspaces` → 39 passed on all 4 |

**Overall:** met: the cross-case race locks in one order (no deadlock in 24 MariaDB or 24 MySQL runs, one admin always left), and the race test fails reliably without the re-read or the canonical order.

## Task 3 — The user's Workspaces dialog

Witnessed: 2026-10-07 11:54 EDT, by a fresh agent (blind). Commit: 67b995c + working tree (feat/092-workspace-members). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The component tests pass | no | confirmed | `npx vitest run src/features/admin-users src/components/help` (apps/web) → 4 files, 24 passed. `tsc --noEmit` → exit 0. `biome check` on the changed paths → 0 errors, 1 warning (`noFilters` unused in admin-users.test.tsx:37, already there at HEAD) |
| 2 | The tests cover the dialog: global has no Remove, it shows "Always", and the help is there | no | confirmed | In a scratch copy, making line 88 of WorkspaceRows.tsx `false ?` (Remove shown for global) → 1 test failed (`to contain '>Always<'`). Removing `<Help id="global-always" />` → 1 failed. Both files restored and diffed equal to the repo afterwards |
| 3 | In the Role column, a user's cell shows how many workspaces they're in, and names the ones they administer and moderate | yes | confirmed | UsersPage.tsx RoleCell: `{all.length} workspace(s)` plus `admin`/`moderator in …` lines. admin-users.test.tsx checks "4 workspaces", "1 workspace<" and the named lines. In a scratch copy, setting the count to 0 → 1 failed. Probe e2e after a save: row text "user 2 workspaces moderator in e2e-acme" |
| 4 | The number opens that user's Workspaces dialog, where root can add a workspace, change a role and remove one | yes | confirmed | Probe `e2e/zz-probe.mobile.e2e.ts` (scratch, on the phone, phone-webkit and tablet projects) → 3 passed. Clicking "1 workspace" opened dialog "Workspaces of <email>". Add workspace, role set to moderator, Save → "Saved: 1 workspace added."; button became "2 workspaces". Remove, Save → "Saved: 1 workspace removed." |
| 5 | `global` is always listed and can't be removed; adding picks a workspace not yet listed, as `user` by default | yes | confirmed | WorkspaceRows.tsx: global row shows a name and "Always" with no Remove button. `unused` holds the workspaces not listed; Add uses `unused[0]` with `role: "user"`. Probe screenshot shows `global \| User ▾ \| Always`. Gap: changing the default role to "moderator" in a scratch copy left every test passing, so no test checked the default (fixed; see the re-check) |
| 6 | Save applies the difference in one transaction, with an event per change | yes | confirmed | actions.ts `saveUserWorkspacesFromForm` → `setUserWorkspaces`. members.ts:266-316 works inside `deps.repo.transaction` and writes an audit event per add, change and remove. `vitest --project db members.db.test.ts` → 13 passed (SQLite only; this service was witnessed in task 1) |
| 7 | A root's row shows "root" and no dialog | yes | confirmed | RoleCell returns `<Badge>root</Badge>` before the editor. Probe → root's row had 0 "Workspaces of" buttons in all 3 projects |
| 8 | Only root reaches the page and the actions | no | confirmed | page.tsx: `notFound()` unless `can(me,"users.view")`, and permissions.ts:10 gives that to `["root"]` only. `userMemberships` and `setUserWorkspaces` require `workspaces.manage` (root) |
| 9 | The helper "Why is global always there?" is in the dialog and links to `workspaces#global` | no | confirmed | Help.tsx `global-always` → `docsHref("workspaces","global")`. Probe → link `https://www.ronne.ai/marketplace/docs/workspaces#global`. ronne-web topics.ts:11 has the `global` section. Its wording is left for task 5 |
| 10 | Create user is unchanged, and a new user is a `user` in `global` (a new root has no memberships) | yes | confirmed | `git log -- CreateUserDialog.tsx` → last change 3789580 (091); not in the diff. `vitest --project db user-admin.db.test.ts` → 25 passed, including "puts a new user in global, and a new root nowhere" (`[{global, user}]`, `[]`) |
| 11 | The pages pass the phone sweep (065) | no | confirmed | `pnpm test:e2e` in a scratch copy → 91 passed. The only failures were my own first probe's selector errors, fixed and then 3/3 passed. The sweep loads /admin/users but doesn't open the dialog; the probe's phone screenshot of the dialog shows everything fits at 412px |
| 12 | After saving, the dialog says what changed | yes | confirmed | workspaces-dialog.test.tsx checks "Saved: 1 workspace added, 2 roles changed." and "Nothing changed.". Probe → "Saved: 1 workspace added." and "Saved: 1 workspace removed." |
| 13 | The full e2e run passes (91) | yes | confirmed | `pnpm test:e2e` (scratch copy, before the new user-admin step) → 91 passed, apart from my own probe |

**Overall:** met: the Role cell's workspace count, the user's Workspaces dialog (add, change role, remove, global fixed, root excluded), its helper and the unchanged Create user all hold. The component tests pass and catch the main breakages. Remark taken: no test clicked Add or checked its default role; the user-admin e2e test now goes through the dialog (re-check below).

### Re-check — the dialog in the user-admin e2e test

Witnessed: 2026-10-07 12:00 EDT, by a fresh agent (blind). Commit: 67b995c + working tree (adds the step in apps/web/e2e/user-admin.e2e.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The new user-admin e2e step passes: root opens the new user's count, global is "user" with no Remove, adds e2e-acme (default "user"), sets moderator, saves, sees "moderator in e2e-acme", then removes it and saves | yes | confirmed | Synced the working tree's src and e2e to the scratch copy (`diff -r` clean), then `next build && playwright test user-admin --project chromium` → 1 passed (2.9s). user-admin.e2e.ts:53-77 has these steps. `biome check` on the file → clean |
| 2 | The step catches a wrong default role when a workspace is added | yes | confirmed | Scratch copy, WorkspaceRows.tsx:108 changed to `role: "moderator"`, rebuilt → 1 failed: `getByLabel('Role in e2e-acme')` expected "user", received "moderator". File restored, `diff` against the repo shows no difference |

**Overall:** met: the e2e step covers adding, the default role, changing the role and removing, and it fails when the default is wrong. Still open, not a failure: the phone sweep doesn't open this dialog; the first pass's probe checked it on phones and the tablet.
