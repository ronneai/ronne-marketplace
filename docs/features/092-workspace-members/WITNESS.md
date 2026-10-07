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
