# 093 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The viewer

Witnessed: 2026-10-07 14:43 EDT, by a fresh agent (blind). Commit: 6afecdf (plus the uncommitted working tree: `workspaces/{models,repositories,actions}/viewer*.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `Viewer` holds the user id, a root flag, the visible workspace ids (sorted) and the private ones among them (sorted) | yes | confirmed | `models/viewer.ts:9-21` has `userId`, `root`, `workspaceIds`, `privateWorkspaceIds`. Breaking the sort in a scratch copy (`[...ids]` instead of `.sort()`) → 2 of 6 unit tests failed |
| 2 | `visibleWorkspaces` returns every public workspace plus the private ones the user is a member of, in any role | no | confirmed | `models/viewer.ts:38-40` (`Object.hasOwn(user.workspaces, w.id)`). The unit test loops over user, moderator and admin. Removing the membership check → 2 failed; making every workspace count as public → 4 failed |
| 3 | Root sees every workspace, private ones included, without being a member; `seesWorkspace` is true for root | no | confirmed | `viewer.ts:37,52`. Removing `root \|\|` from the filter → 1 failed; removing it from `seesWorkspace` → 1 failed |
| 4 | A non-member doesn't see a private workspace, even when they moderate or administer other workspaces | no | confirmed | Unit test "non-member … whatever they moderate elsewhere" checks `["g","pub"]` and `seesWorkspace(acme)=false`. The same holds on a real DB (`viewer.db.test.ts` outsider case) |
| 5 | Someone who isn't signed in sees nothing (no anonymous access) | yes | confirmed | `viewer.ts:36` and `repositories/viewer.ts:15` return empty lists for a null user. Making a null user see the public workspaces → 1 failed |
| 6 | The visibility key is the sorted ids of the private workspaces the caller sees, and it's empty for anyone who sees only public ones | yes | confirmed | `viewer.ts:55-56`. The tests expect `"acme,beta"`, and `""` for two different public-only users. Keying on all private workspaces instead of the visible ones → 3 failed |
| 7 | The Viewer is loaded from the database with the user's memberships (091); a visibility value that isn't recognised counts as private | yes | confirmed | `repositories/viewer.ts:16-23`. Session and token users both carry `loadMemberships`. `npx vitest run --project db …viewer.db.test.ts` → 3 passed on SQLite; `scripts/test-db.mjs postgres\|mysql\|mariadb` → 3 passed on each |
| 8 | Built once per request: `viewerFor(headers)` and `viewerOf(user)` are the request entry points | yes | confirmed | `actions/viewer.ts:7-16`. Each call runs one `SELECT id, visibility FROM workspaces`. Nothing memoises it per request, and nothing calls it yet, so using it once per request is up to the reads in tasks 2–3. These two wrappers have no test of their own |
| 9 | Done when: unit tests cover root, a member, a non-member and a public-only user | no | confirmed | `npx vitest run …models/viewer.test.ts` → 6 passed: root, a member (3 roles), a non-member and public-only users, plus signed-out and stale-membership cases. All 7 mutations tried made at least one test fail |
| 10 | The new code passes lint and typecheck | no | confirmed | `pnpm exec biome check apps/web/src/server/domains/workspaces` → 17 files, no issues; `npx tsc --noEmit -p apps/web` → exit 0 |

**Overall:** met: the Viewer and `visibleWorkspaces` behave as the spec says for root, a member in any role, a non-member, a public-only user and someone signed out, the tests catch each mutation tried, and the loader passes on SQLite, PostgreSQL, MySQL and MariaDB.

### Adversarial pass

Witnessed: 2026-10-07 14:46 EDT, by a fresh agent (adversarial). Commit: 6afecdf + working tree (untracked `workspaces/{models,repositories,actions}/viewer*.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Done when: unit tests cover root, a member, a non-member and a public-only user | no | confirmed | `vitest run models/viewer.test.ts` → 6 passed; root, a member in each of user/moderator/admin, a non-member who moderates elsewhere, two public-only users |
| 2 | Viewer holds user id, root, and the visible **workspace and scope ids** (PLAN task 1 line) | yes | partly | `models/viewer.ts:9-21` has `userId`, `root`, `workspaceIds` and `privateWorkspaceIds`, but no scope ids. SPEC Behaviour still said "a `scope_id IN (…visible scopes)` join" |
| 3 | Every public workspace, plus the private ones the user is a member of in any role; nothing else | no | confirmed | sqlite plus `test-db.mjs postgres/mysql/mariadb` with a scratch probe: a member sees acme, a non-member doesn't. A membership row whose role is unknown (`"Admin"`) gives no access (fail-closed, from `loadMemberships`). Mutation "a member with role `user` excluded" was caught by 3 tests |
| 4 | Root sees every workspace without being a member; `seesWorkspace` is true for root on any id | no | confirmed | Probe with 10 odd-visibility workspaces: root got all 11. Mutations "drop `root \|\|`" in the filter (2 tests failed) and in `seesWorkspace` (1 failed) were caught |
| 5 | Signed out or disabled sees nothing | yes | confirmed | Probe through `viewerFor(headers, app)`: no cookie, a bogus cookie, a disabled user's session and a DB role `"Root"` → empty; `loadViewer(null)` ran 0 queries. Both signed-out mutations were caught |
| 6 | An unexpected visibility value hides the workspace instead of showing it | yes | confirmed | Probe stored `Public`, `PUBLIC`, `public `, ` public`, `private `, `Private`, `""`, `public\n`, fullwidth `ｐｕｂｌｉｃ` on all four databases: an outsider saw only global (key `""`). `repositories/viewer.ts:21` uses strict `=== "public"`. Test gap: no test kept a close value hidden (fixed; see the re-check) |
| 7 | A non-member can't get a private workspace through odd memberships (case or whitespace in ids, deleted workspace, demoted root) | no | confirmed | Lowercase membership id: accepted by the FK on MySQL/MariaDB but ignored by the case-sensitive `Object.hasOwn`; refused by the FK on PostgreSQL and SQLite. Trailing space: cut to the real id on PostgreSQL, a duplicate on MySQL/MariaDB; leading space too long everywhere. A deleted workspace's membership cascades away; a demoted root sees only global |
| 8 | The visibility key is the sorted private ids the viewer sees; empty for public-only users; stable whatever order the inputs come in | yes | partly | Behaviour holds (40 workspaces, 13 private memberships, reversed order → same key on all four databases), but deleting `sorted()` from `privateWorkspaceIds` left all tests green |
| 9 | Two different sets can't produce the same key (no id contains `,`) | no | confirmed | Ids come only from `newId()` (ULID, `db/ids.ts:12`) and the fixed `GLOBAL_WORKSPACE_ID`; neither can contain a comma. Mutation "separator `""`" was caught |
| 10 | Built once per request: one query, then a plain value whose readers don't query again | yes | confirmed | A Kysely plugin counted the queries: `loadViewer` ran 1 query (0 signed out). `seesWorkspace` and `visibilityKey` are pure. `viewerFor` isn't memoised per request: "once" depends on callers passing the value along |
| 11 | The tests catch mistakes (mutation run) | no | partly | 15 mutants: 10 killed; 5 survived. M1 (key not sorted) and M7 (lenient `.trim().toLowerCase() === "public"`) matter; M5, M11 and M12 behave as the original for real ULID ids and valid roles |
| 12 | Lint and typecheck clean; existing tests pass on four databases | no | confirmed | `biome check` on 5 files → no fixes. `tsc --noEmit -p apps/web` → exit 0. `viewer.db.test.ts` → 3/3 on sqlite, postgres, mysql and mariadb |

**Overall:** not met: the access rules hold under every attack tried on all four databases, but the task line and SPEC still said the Viewer holds scope ids, and the tests didn't check that the key is sorted or that odd visibility values stay hidden. Fixed: tests for both; SPEC and PLAN say the viewer lists workspaces, and reads filter on the scope's workspace. Remarks recorded in PLAN's notes: membership is decided in the viewer, never by a SQL join (MySQL matches ids ignoring case); build the viewer once per request.

### Re-check — rows 2, 8 and 11

Witnessed: 2026-10-07 14:48 EDT, by a fresh agent (adversarial). Commit: 6afecdf + working tree (SPEC.md, PLAN.md and the viewer tests changed; `models/viewer.ts`, `repositories/viewer.ts` and `actions/viewer.ts` byte-identical to the first pass's copy, `cmp`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The Viewer holds what the task says: user id, root, the visible workspace ids and the private ones among them; no scope ids, with the spec saying how reads filter instead | yes | confirmed | `models/viewer.ts:9-21` has exactly those four fields. PLAN task 1 line: "visible workspace ids, the private ones among them … no scope ids are listed". SPEC Visible paragraph: "the scope's workspace among the visible ones: a join, or a `scope_id IN (select … where workspace_id IN (…))` subquery; the viewer lists workspaces, not scopes" |
| 8 | The visibility key is the sorted private ids the viewer sees, whatever order the workspaces come in, and a test proves it | yes | confirmed | `viewer.test.ts:67-71` reverses the workspace list and asserts `["acme","beta"]`, sorted `workspaceIds` and key `"acme,beta"`. Mutant M1 (drop `sorted()`) → 1 failed / 8 passed |
| 11 | The tests catch mistakes (mutation run) | no | confirmed | 15 mutants → 12 killed, M1 and M7 among them. Two extra repository mutants, `.toLowerCase() === "public"` and `.trim() === "public"`, each → 1 failed. Survivors M5, M11 and M12 behave as the code for real ULID ids and valid roles. `viewer.test.ts` → 6 passed; `viewer.db.test.ts` → 3/3 on sqlite, postgres, mysql and mariadb; `biome check` → no fixes |

**Overall:** met: the key is sorted and tested, close-to-"public" values are tested hidden on all four databases, and the spec, the plan and the Viewer agree on workspace ids instead of scope ids.
