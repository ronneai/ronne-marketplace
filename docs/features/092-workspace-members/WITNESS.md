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

## Task 4 — The workspace's page for admins, and its Members

Witnessed: 2026-10-07 12:40 EDT, by a fresh agent (blind). Commit: e28882b + working tree (19 modified files, new `apps/web/src/features/workspace-members/`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component tests pass | no | confirmed | `npx vitest run --project unit` in a scratch copy → 108 files, 1055 tests passed; touched areas (workspace-members, admin-workspaces, app-shell, help, admin-scopes) → 6 files, 63 passed; `tsc --noEmit` → exit 0 |
| 2 | End-to-end: root makes someone admin of a workspace, who adds a member as moderator, creates a scope, and can't open another workspace or Users | yes | confirmed | `pnpm test:e2e` (scratch copy) → 91 passed, EXIT 0, including `user-admin.e2e.ts:19`. The test makes `workspace-admin@e2e.test` admin of e2e-acme through the user's Workspaces dialog. The admin adds `member-to-add` as moderator (asserts `toHaveValue("moderator")`), removes them after the confirm, and creates `@acme-admin-tools`. `/admin/workspaces/global`, `/admin/users`, `/admin/scopes` and `/admin/audit` → status 404 |
| 3 | The Admin area opens to a workspace's admin; Admin in the main nav goes to /admin/workspaces; /admin redirects them there | yes | confirmed | `admin/layout.tsx:20` allows `canInSome(user,"members.manage")`; `nav.ts:50-58` adds an Admin item that root doesn't get (`unless: "users.view"`); `admin/page.tsx:9` redirects non-root users. AppShell test "gives a workspace's admin Admin, opening their workspaces" passes; e2e asserts URL `/admin/workspaces$` after clicking Admin |
| 4 | Admin nav shows them only Workspaces | yes | confirmed | `AdminNav.tsx` filters out the root-only tabs. Unit test "shows a workspace's admin only Workspaces" passes; e2e `adminNav.getByRole("link")` → `["Workspaces"]` |
| 5 | Users, Scopes, Settings, the audit log and a workspace they don't administer are 404 for them | yes | confirmed | Each page checks a root-only permission: `users/page.tsx:20` users.view, `scopes/page.tsx:18` scopes.manage, `audit/page.tsx:21` audit.view, `settings/page.tsx:20` settings.manage. `findWorkspace` returns null outside their workspaces (`services/workspaces.ts:246`). e2e: global, users, scopes and audit → 404. Settings is not in the e2e; I checked it in the code only |
| 6 | The list shows only their workspaces, without New workspace | no | confirmed | `workspaces/page.tsx` shows `CreateWorkspaceDialog` to root only. Unit test "a workspace's admin gets their list, without New workspace" passes; e2e: e2e-acme is visible and a global link has count 0 |
| 7 | The workspace page has a Members table (name, email, role, added), Add members (search, pick a role), change role, and remove with a confirm | yes | confirmed | `MembersSection.tsx` has Name/Email/Role/Added columns; `MemberControls.tsx` has the role select that submits on change, Remove opening a "Remove member" dialog, and Add members with a search plus a role select. Unit test "an admin's workspace page has Members…" passes; the e2e drives search, Pick, role, add, change and remove-confirm |
| 8 | Nobody changes or removes their own row; nobody is removed from global; root isn't listed | yes | confirmed | `MembersSection.tsx` shows the user's own row as a Badge with no Remove, and gives global rows no Remove. Mutation check: I changed the own-row check to `false` → unit test fails (`not to contain 'aria-label="Role of a@example.com"'`). Test "global's page has members' roles but no Remove" passes; the repository leaves roots out (`members()` contract) |
| 9 | Add members search (memberCandidates) returns only people not in the workspace, not root, not disabled, matched by email or name case-insensitively; refused in another workspace and to a moderator; works on all three dialects | yes | confirmed | `vitest --project db src/server/domains/workspaces` → 40 passed on SQLite; `scripts/test-db.mjs postgres\|mysql\|mariadb` → 40/40 on each. Mutation check: I dropped the `disabled_at is null` filter → db test fails, receiving `"gone@example.com"`. The test also checks `"%"` → [], beta → Forbidden, moderator → Forbidden |
| 10 | Admins create the workspace's scopes and edit its description; only root deletes | yes | confirmed | `[name]/page.tsx` shows Edit to holders of `workspace.edit` and Delete to `workspaces.manage` only, and Create scope to holders of `scopes.create`. `services/scopes.ts:35-41` checks scopes.create in that workspace. Unit test asserts Edit description and Create scope are shown and `>Delete<` isn't; e2e creates the scope as the admin |
| 11 | "What can each role do?" helper on Add members links to roles#permissions | no | confirmed | `MemberControls.tsx` `<Help id="member-roles" />` next to Role; `Help.tsx` member-roles uses `docsHref("roles","permissions")`; help.test "links every helper to a topic section that exists" passes (topics.ts:131 `permissions`). No test renders it inside the open dialog |
| 12 | The pages pass the phone sweep (065) | no | confirmed | `pnpm test:e2e` → mobile-sweep "as root" passes on phone, phone-webkit and tablet, and the sideways-scroll check passes. `pages.ts` sweeps `/admin/workspaces/global` and `/admin/workspaces/e2e-acme`, so the Members table is included. The sweep runs as root only: the workspace admin's view and the open Add members dialog aren't swept on their own |

**Overall:** met: the Admin area for workspace admins, the Members table and its controls, Create scope and Edit description for admins, and the 404s outside their workspaces all hold in unit, db (three dialects) and e2e runs. Remark taken: the e2e now also requests `/admin/settings` as the admin (404).

### Adversarial pass

Witnessed: 2026-10-07 12:21 EDT, by a fresh agent (adversarial). Commit: e28882b + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component tests for the task pass | yes | confirmed | `vitest run src/features/workspace-members src/features/admin-workspaces src/components/app-shell src/features/admin src/features/admin-scopes` → 11 files, 106 passed. Typecheck clean; lint shows warnings only |
| 2 | The tests cover the claims, not just pass | no | confirmed | Two mutations, each caught: (a) show Delete to admins in `[name]/page.tsx` → "an admin's workspace page … not Delete" fails; (b) drop the `member.userId === me` guard in `MembersSection.tsx` → the same test fails (1 failed / 20 passed) |
| 3 | The end-to-end test runs the flow: root makes someone admin, who adds a member as moderator, creates a scope, and can't open another workspace or Users | yes | confirmed | `pnpm test:e2e` (scratch) → 91 passed (2.4m). `user-admin.e2e.ts:138-195` covers each step, then gets 404 for `/admin/workspaces/global`, `/admin/users`, `/admin/scopes`, `/admin/audit` |
| 4 | Admin is in the nav for root and for workspace admins, never twice, and never for a moderator or plain user | yes | confirmed | e2e probe: admin → 1 "Admin" link; root → 1; moderator of e2e-acme → 0. `nav.ts:51-58` uses `unless: "users.view"`; `AppShell.test.tsx` checks the href |
| 5 | /admin opens the right page: users for root, workspaces for an admin, 404 for others | no | confirmed | e2e probe: admin `/admin` → 200 at `/admin/workspaces`; root → `/admin/users`; moderator `/admin` → 404 |
| 6 | An admin sees only the Workspaces tab and only their workspaces; everything else under /admin is 404 | yes | confirmed | e2e: admin tabs = ["Workspaces"]; list = e2e-acme only. 404 for `/admin/settings`, `/admin/users/x`, `/admin/workspaces/e2e-team`, `E2E-TEAM`, `GLOBAL`, `nope`. db probe: `pageWorkspaces` → "acme" (with search "global" → empty); `findWorkspace` for beta, BETA, global → null; root sees all 4 workspaces |
| 7 | Services refuse an acme admin anything in beta or global, and anything root-only, even with another or case-changed id | no | confirmed | db probe, same result on SQLite, PostgreSQL, MySQL and MariaDB. Forbidden for: list, candidates, add, change and remove in beta (id upper-cased too) and in global; createScope in beta, in BETA-id and with no workspace; edit a beta scope; updateWorkspace beta/BETA; deleteWorkspace acme; createWorkspace; userMemberships; setUserWorkspaces |
| 8 | The server actions can't be pointed at another workspace by tampering with form fields | no | confirmed | e2e: set the role select's hidden `workspaceId` to global and change role → "ERR: … (members.manage)". Set Add members' `workspaceId` to e2e-team's id → same error; root's e2e-team page still shows "Members 0" |
| 9 | A moderator, a plain user and someone signed out can't use any of it | no | confirmed | db probe: moderator of acme (admin of beta) → Forbidden for list, add, candidates, createScope and updateWorkspace in acme. Plain user and no-cookie headers → Forbidden. e2e: moderator gets 404 on all three admin pages |
| 10 | Nobody changes or removes their own membership; nobody is removed from global | yes | confirmed | UI: own row is a badge, with no select or Remove. Services: OwnMembershipError, also when the id is sent lowercased (all 4 dialects). removeMember from global by a global admin and by root, id upper-cased too → GlobalMembershipError. Root's global page has 0 Remove buttons |
| 11 | Root can't be made a member | no | confirmed | db probe: add or change root in acme → RootMembershipError (all 4 dialects) |
| 12 | Add members search: only non-members who aren't root or disabled; ignores case; `%` and `_` match literally; at most 10 | yes | confirmed | db probe on all 4 dialects: "EXAMPLE.COM" and "UMA" match; "%" and "_" match only the address that contains them; "u%a" and "u_@" → none; root, root2, disabled and existing members never listed; 15 matches → 10; 5000-char query → []; "  " → [] |
| 13 | The search gives the same results on every dialect | yes | partly | Same on PostgreSQL, MySQL and MariaDB. On SQLite, the name "Ölaf Ünal" is not found by "Ölaf", "ölaf", "ÖLAF" or "ünal". Cause: `src/server/db/search.ts` lowercased the term in JS and SQLite's `lower()` only folds ASCII |
| 14 | Members table follows the spec: DataTable, sorted by name, filtered by role | yes | partly | `MembersSection.tsx` used the plain `Table`, with no role filter and no paging. On root's global page that is 49 rows in one table |
| 15 | An admin's workspace page has Edit description, Create scope (in that workspace only) and Members, but not Delete | yes | confirmed | e2e: admin page buttons = Edit description, Add members, Remove×2, Create scope, Edit×2; Delete count 0. The create dialog shows "In e2e-acme" (a hidden id, refused elsewhere: row 7) |
| 16 | Root's pages work as before: New workspace, every workspace, Delete | no | confirmed | e2e: root `/admin/workspaces` has New workspace and 4 rows; e2e-team page has Delete and Edit description; root tabs are all 5 |
| 17 | The remove confirm says what happens to open submissions | yes | confirmed | `MemberControls.tsx` RemoveForm: "They stop proposing and reviewing there; what they already submitted stays." e2e confirms then removes |
| 18 | The workspace page with Members fits at phone width without sideways scroll | no | confirmed | e2e at 360px: admin page, Add members dialog with 10 results, root's global with 49 members → scrollWidth = viewport. The mobile-sweep projects pass for `/admin/workspaces/[name]` (root view) |

**Overall:** not met: access control holds everywhere tried (pages, the /admin redirect, every action, tampered ids, all four databases). Rows 13 and 14 are partly: the Members table wasn't the spec's DataTable with a role filter, and the search couldn't find a non-ASCII name typed as stored on SQLite. Fixed: the members are a server data table under a Members tab; `containsInsensitive` lowers the term in SQL. Re-check below.

### Re-check — rows 13 and 14, and what the change touches

Witnessed: 2026-10-07 12:49 EDT, by a fresh agent (adversarial). Commit: e28882b + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | Add members' search and the members search find a name as typed, the same on every dialect (beyond-ASCII case folding is the database's, and documented) | yes | confirmed | `search.ts` now does `lower(col) like lower(pattern)`. db probe on SQLite, PostgreSQL, MySQL and MariaDB: memberCandidates "Ölaf" → found on all four; pageMembers (global) "Ölaf" → same on all four; "x%" literal, "u_@" none, "DUP1" → dup1 on all four. The only difference is lowercase "ölaf" ([] on SQLite), SQLite's ASCII-only `lower()`, stated in the helper's comment and `helpers.db.test.ts`. `helpers.db.test.ts` + `admin-role.db.test.ts` + probe → 19 passed on each server; full SQLite db suite 610 passed / 8 skipped |
| 14 | The Members table is a server DataTable under a Members tab (`?tab=members`): sorted by name or by date added, searched by email or name, filtered by role, 50 a page | yes | confirmed | `MembersTable.tsx` uses `DataTable` with a GET filter form (q, role); `list.ts` has `fixed: {tab:"members"}`, sorts name and added, default 50. e2e: "WES" → `?tab=members&sort=added&size=25&q=WES&role=`, 1 row. Root global `?tab=members&size=25` → 25 rows and a Next link that keeps `tab=members`. db probe: walking pages of 2 over 9 members (7 with the same name), both sorts and both directions → 9 unique each; an unknown role → no filter; size 100000 → capped; a garbage cursor → no error |
| 19 | The Scopes tab keeps its own addresses, and Create scope still works there | yes | confirmed | e2e: Scopes tab links are `/admin/workspaces/e2e-acme?dir=desc` and `?sort=created` (no `tab`); its filter form has no `tab` field; the Members tab's links and forms all carry `tab=members`; current tab is marked. The e2e creates `@acme-admin-tools` from the Scopes tab. Root's e2e-team page buttons: Edit description, Delete, Create scope |
| 20 | Nobody but root or that workspace's admins can read the members list (pageMembers), through the page or the service | no | confirmed | db probe on all 4 dialects: acme admin on beta, on BETA-id and on global → Forbidden; moderator, plain user and no session → Forbidden. e2e: admin gets 404 for `/admin/workspaces/e2e-team?tab=members`, `global?tab=members` and `e2e-team?tab=scopes`. Tampering the role select's `workspaceId` to global → "ERR: … (members.manage)" |
| 21 | Own row read-only and no Remove in global, in the new table | yes | confirmed | `MembersTable.tsx` role and actions columns guard on `me` and `isGlobal`. e2e: "(you)" row shows a badge; root's global members tab has 0 Remove buttons |
| 22 | The Members tab fits on phones | no | confirmed | e2e scrollWidth vs viewport for admin `?tab=members`, admin Scopes tab and root `global?tab=members` at 320, 360 and 390 px → equal every time |
| 23 | The checks pass with the fixes | yes | confirmed | `vitest run` (web) → 183 files, 1666 passed / 8 skipped; `pnpm test:e2e` → 91 passed; typecheck clean; `pnpm lint` exit 0 (warnings only) |

**Overall:** met: rows 13 and 14 now hold, and nothing around them broke: the Scopes tab, Create scope, access to the members list, phones. Remarks taken: the phone sweep now visits `/admin/workspaces/global?tab=members` (e2e 91 passed), and SPEC.md states that folding case beyond ASCII is the database's, which SQLite doesn't.

## Task 5 — Documentation

Witnessed: 2026-10-07 13:04 EDT, by a fresh agent (blind). Commit: ceb823c (plus the uncommitted Help.tsx and topics.ts diff; ronne-web branch docs/092-workspace-members, uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The docs render tests pass in ronne-web | no | confirmed | `npx vitest run` in ronne-web/www → 29 files, 136 tests passed. `docs.test.ts` checks every topic and section has a title and body in en, pt and fr. `tsc --noEmit` exited 0 and `biome check` exited 0 |
| 2 | The helper link test passes here | no | confirmed | `pnpm exec vitest run src/components/help` → 3 passed. `help.test.tsx:18-23` checks every HELP href against topics.ts sections and includes failing cases (`scopes#nope`, `/nope`). Biome on `components/help` exited 0 |
| 3 | The helpers: "Why is global always there?" in the user's Workspaces dialog → `workspaces#global`; "What can each role do?" on Add members → `roles#permissions` | yes | confirmed | `WorkspaceRows.tsx:56` `<Help id="global-always" />` in the Workspaces fieldset. `MemberControls.tsx:251` `<Help id="member-roles" />` next to Add members' Role. `Help.tsx:33,39` hrefs. Both sections exist in the app's topics.ts and ronne-web's topics.ts |
| 4 | `workspaces#roles`: user/moderator/admin per workspace, `global` for everyone, who manages members (root everywhere, admins in theirs), Add members, role change, Remove with confirm, nobody changes their own row, nobody leaves `global`, root can't be added, disabled users keep memberships, all audited | yes | confirmed | `members.ts`: `requireManagerNow`, `notOwn`, `GlobalMembershipError`, `RootMembershipError`, and audit on add, change and remove. `permissions.ts` `members.manage: ["admin"]` (root bypasses). The only delete of membership rows is `removeMember`, so disabling a user keeps them. The non-member message matches `submissions/exceptions/errors.ts:52` |
| 5 | `roles`: the roles in a workspace (user, moderator, admin) and the matrix with an admin column that matches the permissions | yes | confirmed | en `roles.tsx` has 13 rows × 4 columns. The admin column is ✓ for review, release and versions, ✓ for members, scopes and description (`members.manage`, `scopes.create`, `workspace.edit`), and – for override, workspaces, users and settings (all root-only in `INSTANCE_PERMISSIONS`) |
| 6 | `admin#workspaces`: what an admin sees (only Workspaces, only theirs, no Delete; Users, Scopes, Settings and audit 404), the Members table (name, email, role, added; sort by name or added; 50 a page; search; role filter), Create scope on the page; the Moderators column counts admins | yes | confirmed | `AdminNav.tsx` filters to Workspaces when not root. `admin/layout.tsx`: `canInSome(members.manage)`. `[name]/page.tsx`: Delete needs `workspaces.manage`, Create scope `scopes.create`, Edit `workspace.edit`, and `global` shows neither. `workspaces.ts:246` returns null for a workspace the admin doesn't run. `list.ts`: default size 50. Repo counts `role in (moderator, admin)` |
| 7 | `admin#users`: the Role cell (root, or user + n workspaces + "admin in …" / "moderator in …"), the Workspaces dialog (global always there, role per row, Remove, Add workspace defaulting to user, Save says what changed, none for root), a new user starts in `global` | yes | confirmed | `UsersPage.tsx:72-98`. `WorkspaceRows.tsx`: `global` shows "Always", and Add workspace uses `role: "user"`. `actions.ts:85-90`: "Saved: … added/changed/removed". The identity repo inserts `global`/user for a non-root user |
| 8 | The other edited sections are right: workspaces#global and #managing, scopes (root and admins create scopes; admins edit scope descriptions), export, install (root) | yes | confirmed | `scopes.ts:31-41,97`: `scopes.manage` or `scopes.create` in the workspace, for both create and edit. `[name]/page.tsx` shows `EditScopeButton` on the Scopes tab. Admin › Scopes `CreateScopeDialog` still has the workspace select |
| 9 | The changed helper answers say what the app does (scope, workspace-choice, global-always, queue-workspaces, join, after-submit, role-root, member-roles) | yes | confirmed | `git diff Help.tsx` read against `permissions.ts`. The review queue uses `submissions.review` (moderator and admin). Root holds every workspace permission |
| 10 | pt and fr say the same things as en | yes | confirmed | `git diff` of pt and fr read line by line against en: same paragraphs, bullets and facts. Probe `matrix.mjs` → en, pt and fr each have 13 rows with identical ✓/–/own patterns |
| 11 | The topics are in step: the app's topics.ts and ronne-web's match | yes | confirmed | The app's topics.ts changes only the roles summary, the section title "The roles" and the admin summary, which match en `roles.tsx` and `admin.tsx`. Section ids are unchanged in both. ronne-web's `topics.ts` holds only ids, so it needs no change |
| 12 | No page of the Documentation contradicts the new admin role | no | partly | `grep -i moderator` in `en/*.tsx`: `scopes.tsx:51` "nothing is published until a moderator of that workspace, or root, approves it"; `review.tsx:305,346`; `items.tsx:134`; `overview.tsx:47`; `versions.tsx:90,119` still say only moderators or root review, release or move tags, though admins do. The `after-submit` helper says "moderator or admin" but links to `review#reviewing`, which said "a moderator or root" |

**Overall:** not met (row 12): everything the spec lists is accurate in all three languages, but other topics still said only moderators or root review, release and move tags. Fixed: every such passage names admins, in en, pt and fr, and the matrix row says "change instance roles (root)". Re-check below.

### Re-check — row 12, and the ronne-web tests and lint

Witnessed: 2026-10-07 13:08 EDT, by a fresh agent (blind). Commit: ceb823c (plus the uncommitted Help.tsx and topics.ts; ronne-web branch docs/092-workspace-members, uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | No page of the Documentation leaves admins out of who reviews, approves, releases or manages versions, in en, pt and fr | yes | confirmed | `grep -n -i moderator en/*.tsx` → every who-reviews/releases passage now names admins: `scopes.tsx:51`, `review.tsx:41,270,273,306,347`, `items.tsx:134`, `overview.tsx:47`, `versions.tsx:90,119`, `workspaces.tsx:143`. `grep -i "moderator or root\|moderators and root" en/*.tsx` → none. In pt and fr, every moderador/modérateur line without "admin" is a line break with admin on the next line, a role name, or the same text as en ("a moderator's own", `usage.tsx`, the Moderators bullet) |
| 13 | The roles matrix row now says the root-only role change is the instance role | yes | confirmed | en `roles.tsx:19` "change instance roles (root)"; pt `:31` "mudar papéis na instância (root)"; fr `:31` "changer les rôles sur l'instance (root)" |
| 14 | pt and fr say the same as en in the new changes | yes | confirmed | `git diff -U0` of items, overview, review, versions, scopes and workspaces in pt and fr, read against en: the same facts in each |
| 15 | ronne-web's docs tests, lint and typecheck still pass, and so does the helper link test here | no | confirmed | ronne-web/www `npx vitest run` → 29 files, 136 tests passed; `biome check` exited 0; `tsc --noEmit` exited 0. Here, `vitest run src/components/help` → 3 passed |

**Overall:** met: rows 1–11 hold, and row 12 is confirmed in all three languages, with tests, lint and typecheck green.
