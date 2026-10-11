# 114 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Migration

Witnessed: 2026-10-10 18:30 EDT, by a fresh agent (blind). Commit: 65f87e09 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `owner_id` nullable, unique, FK `user` RESTRICT on four databases | no | confirmed | probe on each: nullable, unique index, RESTRICT; nulls repeat |
| 2 | `reviewed` boolean, not null, default true; existing versions true | no | confirmed | probe; the test asserts the existing version only |
| 3 | Every user, roots too, a private workspace and an admin membership only | no | confirmed | test; fails with another role |
| 4 | The name rule, `-2`, `-3`… in creation order | no | confirmed | probe on 4 databases; `names.test.ts` |
| 5 | Empty base: `-2`… as the spec says | no | partly | the code gives `personal`, which the spec doesn't say |
| 6 | Batches | no | confirmed | `BATCH = 500`; 1203 users |
| 7 | A second run changes nothing | no | confirmed | test fails without the skip; probe 17→17, 14→14 |
| 8 | The test covers users, roots, clashes, reserved names, a rerun | no | confirmed | mutations each fail a test |
| 9 | db tests pass on four databases | no | confirmed | 58 passed on each |
| 10 | The migration guard passes | no | confirmed | 24 passed |
| 11 | Registered, typed, exported | no | confirmed | index, schema, core exports |

**Overall:** not met: row 5. Also found: past `-999` a 60-character base passes 64 characters.

### Adversarial pass

Witnessed: 2026-10-10 18:33 EDT, by a fresh agent (adversarial). Commit: 65f87e09 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `owner_id` added on four databases | no | confirmed | probe |
| 2 | Unique index lets nulls through, refuses a second per user | no | confirmed | probe; test |
| 3 | FK RESTRICT everywhere, SQLite with foreign keys on | no | confirmed | each database refuses the delete |
| 4 | Every user, roots too | no | confirmed | 58/58 on each |
| 5 | The name rule | no | partly | 1001 users on a 60-character base: `varchar(64)` overflow aborts on the servers; `personal` and dropped non-ASCII letters not in the spec |
| 6 | Batches | no | confirmed | "at row 500" |
| 7 | A second run changes nothing, after a partial run too | no | partly | a stop between a batch's workspaces and memberships inserts leaves owners without their admin row on SQLite, MySQL, MariaDB |
| 8 | `reviewed` | no | confirmed | each database; new rows true |
| 9 | Existing data untouched | no | confirmed | memberships identical; open requests by name unattached |
| 10 | The tests catch regressions | no | confirmed | mutations |
| 11 | The guard passes | no | confirmed | 24 passed |
| 12 | Users who have one are skipped | no | confirmed | rerun test |
| 13 | Nothing else breaks | no | confirmed | typecheck; 1984 web tests; 365 core |

**Overall:** not met: rows 5 and 7.

### Re-check 1

Witnessed: 2026-10-10 18:41 EDT, by a fresh agent (blind). Commit: 65f87e09 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | An empty base is `personal`, then `-2`…, as SPEC.md says | no | confirmed | SPEC "Its name"; probe on SQLite and MySQL |
| 12 | Accents removed, the last `@`, the spec's rule | no | confirmed | probe; `names.test.ts` 15 passed |
| 13 | `-N` always fits 64; every name valid | no | confirmed | probe at attempts up to 1,000,000: longest 64, all valid |
| 14 | A missing owner admin row comes back on the next run | no | confirmed | `ownersAsAdmins`; the test fails without it |
| 15 | A new version reads `reviewed` true | no | confirmed | test; fails with default false |
| 16 | db tests and guard on four databases | no | confirmed | 59 passed on each; guard 24 |

**Overall:** met.

### Adversarial re-check 1

Witnessed: 2026-10-10 18:38 EDT, by a fresh agent (adversarial). Commit: 65f87e09 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | Names follow the spec's rule | yes | confirmed | 20 odd emails × attempts to `MAX_SAFE_INTEGER`: none invalid, longest 64; 1001 + 1001 clashing users on four databases: all distinct and valid |
| 7 | A rerun changes nothing, after a crash too | yes | confirmed | 1100 users, crashes at four points: repaired on SQLite, MySQL, MariaDB; PG rolls back; test fails without `ownersAsAdmins` |
| 14 | `ownersAsAdmins` touches only owners missing a row | no | confirmed | no shared or second rows; another role kept |
| 15 | The pg FK check is scoped to `workspaces` | yes | confirmed | joins `pg_class` (not by schema; low risk) |
| 16 | 0021's unused import removed | yes | confirmed | biome clean |
| 10 | The db test still covers users, roots, clashes, reserved, reruns | no | confirmed | 59/59 on each; core 365 |
| 11 | The guard passes | no | confirmed | 24 passed; typecheck clean |

**Overall:** met.

## Task 2 — Created with every user

Witnessed: 2026-10-10 19:10 EDT, by a fresh agent (blind). Commit: b61a04b0 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Create user makes a private personal workspace, the user its admin, roots too | no | confirmed | `createUserWithPassword`; 5/5 on four databases; fails without the call |
| 2 | Setup's root and the next setup after `reset-setup` | no | confirmed | `createRoot` → `createUserWithPassword`; sign-up disabled |
| 3 | Same transaction as the user | no | confirmed | probe: a throw after it leaves nothing, on four databases |
| 4 | Name rule, `-2`…, ≤64, description | no | confirmed | test and probe |
| 5 | A lost race takes the next name | no | confirmed | probe with two overlapping transactions on the servers; fails without the fallback |
| 6 | The db test covers two users made at once | no | partly | Create user locks the acting root: the test never races |
| 7 | db tests cover Create user and setup | no | confirmed | 105 passed on each database |
| 8 | No Admin, Reviews or Requests in the nav for owning one | no | confirmed | `canInSomeShared`; probe; no test |
| 9 | Owning one doesn't open the Admin area | no | not met | page gates use `canInSome`: `/admin`, `/reviews`, `/workspaces/requests` open to every user |
| 10 | Users table and Workspaces dialog list shared workspaces only; a save keeps the owner's row | no | confirmed | probe |
| 11 | `listWorkspaces`: public plus private ones the reader is in; root all | no | confirmed | probe; test |
| 12 | Types and lint | no | confirmed | typecheck; biome |

**Overall:** not met: rows 6 and 9. Also found: on MySQL, INSERT IGNORE can loop for ever on a non-name error.

### Adversarial pass

Witnessed: 2026-10-10 19:20 EDT, by a fresh agent (adversarial). Commit: b61a04b0 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Create user, in the transaction, roots too | no | confirmed | 67/67 on each database |
| 2 | Setup's root | no | confirmed | real CLI setup |
| 3 | After `reset-setup` | no | confirmed | by reading |
| 4 | No path skips it | no | confirmed | one production insert; sign-up disabled |
| 5 | A failure rolls everything back | no | confirmed | probe on four databases |
| 6 | Name rule and LIKE read | no | confirmed | probe |
| 7 | A lost race takes the next name | no | confirmed | overlapping transactions; 10 concurrent |
| 8 | The test covers a race | no | partly | never reaches the lost-race branch |
| 9 | db tests cover Create user and setup | no | confirmed | 1990 web tests |
| 10 | Only name conflicts are skipped | no | partly | MySQL/MariaDB INSERT IGNORE loops for ever for an owner with one or an unknown owner |
| 11 | `personal` on the session user, stable after a rename | no | confirmed | probe |
| 12 | `personal` on the token user | no | partly | `authenticateToken` drops it |
| 13 | Nav counts shared workspaces | no | confirmed | probe; no test |
| 14 | Owning one doesn't open the Admin area | no | not met | page gates use `canInSome` |
| 15 | Users table and dialog hide the owner's row | no | confirmed | probe |
| 16 | Root can't change the owner's row or add someone by its id | no | not met | `setUserWorkspaces` demotes the owner or adds others (task 3's refusal) |
| 17 | `listWorkspaces` | no | confirmed | probe |
| 18 | Nothing else shows a personal workspace to others | no | confirmed | probe |
| 19 | Lint, types, tests | no | confirmed | clean |

**Overall:** not met: rows 8, 10, 12, 14 (and 16, task 3).

### Re-check 1

Witnessed: 2026-10-10 19:26 EDT, by a fresh agent (blind). Commit: b61a04b0 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The db tests cover two users at once, the lost race included | no | confirmed | overlapping transactions on PG, MySQL, MariaDB; fails without the fallback |
| 9 | Owning one doesn't open the Admin area | no | confirmed | layout probe: owner without AdminNav; `/admin/workspaces` 404; component test |
| 10 | `/reviews`, `/reviews/[id]`, requests, shell counts ignore it | no | confirmed | `canInSomeShared` at all four |
| 11 | Nav and `canInSomeShared` tested | no | confirmed | 181 passed; fails with `canInSome` back |
| 12 | The helper fails instead of looping | no | confirmed | test on four databases; times out on MySQL without the throw |
| 13 | `personal` reaches the token user | no | confirmed | test (null case) |
| 14 | Earlier rows still hold | no | confirmed | 116–117 passed on each database |
| 15 | Types and lint | no | confirmed | clean |

**Overall:** met.

### Adversarial re-check 1

Witnessed: 2026-10-10 19:28 EDT, by a fresh agent (adversarial). Commit: b61a04b0 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | A db test covers the race the unique index decides | no | confirmed | 57/57 on each server; fails when a 0-row insert throws |
| 10 | Hidden INSERT IGNORE errors fail instead of looping | no | confirmed | test; fails on MySQL and MariaDB with the old `continue` |
| 10a | The holder check works under the isolation Create user uses | no | confirmed | READ COMMITTED; under REPEATABLE READ it would throw (now documented) |
| 12 | `personal` on the token user | no | confirmed | probe on four databases; `/api/v1/me` doesn't send it |
| 14 | Owning one opens no Admin, Reviews or Requests | no | confirmed | pages rendered with mocked sessions |
| 13 | The nav counts shared workspaces only | no | confirmed | unit tests; 1994 web tests |
| 1–7, 9, 11, 15, 17–18 | Earlier rows | no | confirmed | same tests green |
| 19 | Lint, types, tests | no | confirmed | clean |

**Overall:** met. Row 16 (root changing an owner's row) is task 3's.

## Task 3 — The personal rules in the services

Witnessed: 2026-10-10 19:40 EDT, by a fresh agent (blind). Commit: c6a15bc3 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `PersonalWorkspaceError`; `ownerId` read | no | confirmed | errors.ts; repository |
| 2 | Adding members refused, owner and root | no | confirmed | test fails without the guard |
| 3 | Member candidates refused | no | confirmed | same |
| 4 | The owner's row never changes | no | confirmed | test; probe |
| 5 | Nobody removes the owner's row | no | confirmed | test |
| 6 | The user's dialog can't add or change, a save keeps the row | no | confirmed | test fails without guard or filter |
| 7 | Make public refused | no | confirmed | test |
| 8 | Delete refused | no | confirmed | test |
| 9 | Join requests kept by name; `unseen`; the owner `already_member` | no | confirmed | test; probe |
| 10 | A rename doesn't attach requests | no | confirmed | test |
| 11 | Root's catalogue, search, counts leave them out unless named | no | confirmed | 2 tests fail without the filter |
| 12 | Filter options | no | partly | Scope options untested |
| 13 | Home page | no | partly | most used untested |
| 14 | Root's plugin marketplace | no | confirmed | feeds test |
| 15 | Root's selects and Workspaces page | no | confirmed | test, `root-2` kept |
| 16 | Root's own stays in root's catalogue | no | partly | untested |
| 17 | Four dialects | no | confirmed | 19 passed on each |
| 18 | The 093 guard | no | confirmed | four dialects |

**Overall:** not met: rows 12, 13, 16. Also: root's dependency picker in a personal workspace misses its items.

### Adversarial pass

Witnessed: 2026-10-10 19:40 EDT, by a fresh agent (adversarial). Commit: c6a15bc3 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Adding members refused | no | confirmed | mutations |
| 2 | Owner's row: no change or removal | no | confirmed | mutations |
| 3 | `setUserWorkspaces` | no | confirmed | every `workspace_members` writer read |
| 4 | Root changes, disable, enable keep the owner's row | no | confirmed | probe |
| 5 | Make public refused either way | no | confirmed | under the lock |
| 6 | Delete refused | no | confirmed | only path |
| 7 | Requests answer like an unknown name | no | confirmed | compared results, own list, audit |
| 8 | Requests never attached and answered | no | confirmed | approval has no guard of its own (unreachable) |
| 9 | Root's catalogue and search | no | confirmed | probe; full and old names too |
| 10 | Filter options | no | partly | Scope options untested; empty when a workspace is named |
| 11 | Home page | no | partly | most used untested |
| 12 | Root's marketplace and its cache | no | not met | every root shares one cache key: one root served another's personal items |
| 13 | Workspaces page, selects | no | confirmed | mutations |
| 14 | What should still show them does | no | confirmed | by name; Admin › Scopes `?workspace=<personal>` shows none; root's dependency picker misses the workspace's items |
| 15 | Nothing new leaks | no | not met | renaming one's own workspace to a taken name tells any user the name exists |
| 16 | Tests on four databases | no | partly | gaps above |
| 17 | The 093 guards | no | confirmed | four databases |

**Overall:** not met: rows 10, 11, 12, 14, 15, 16.

### Re-check 1

Witnessed: 2026-10-10 20:01 EDT, by a fresh agent (blind). Commit: c6a15bc3 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–8 | Error, refusals, requests, approval, rename | no | confirmed | each guard removed → its test fails |
| 9–13 | Root's catalogue, search, counts, filter options, home page, root's own kept | no | confirmed | mutations fail the new tests |
| 14–15 | Root's marketplace; a cache key per root | no | confirmed | the old key fails the two-roots test |
| 16 | Dependency picker in a personal workspace | no | confirmed | the `dependableFrom` branch removed → test fails |
| 17 | Root's selects and Workspaces page | no | confirmed | test |
| 18 | Admin › Scopes `?workspace=<personal>` | no | confirmed | component test |
| 19 | SPEC: a taken name says only that | no | confirmed | Edge cases; the error names only the name |
| 20–21 | Four dialects; the 093 guard; nothing else broke | no | confirmed | 24 on each; 825 db, 1180 unit |

**Overall:** met.

### Adversarial re-check 1

Witnessed: 2026-10-10 20:07 EDT, by a fresh agent (adversarial). Commit: c6a15bc3 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | Root's marketplace; a cache entry per root | yes | confirmed | `root:<id>`; LRU of 32; old key fails the test |
| 10 | Filter options follow a named workspace | yes | confirmed | probe; mutations |
| 11 | Most used | yes | confirmed | test |
| 14 | Dependency picker; Admin › Scopes | yes | confirmed | widening adds only the draft's workspace |
| 8 | Approval refused | yes | confirmed | test |
| 15 | Nothing tells a non-owner more than "the name is in use" | yes | not met | the rename alias refusal named an item of someone else's personal workspace |
| 16 | Tests on four databases | yes | confirmed | 562 on each |
| 17 | The 093 guards | yes | confirmed | four databases |

**Overall:** not met: row 15.

### Adversarial re-check 2

Witnessed: 2026-10-10 20:11 EDT, by a fresh agent (adversarial). Commit: c6a15bc3 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | Nothing tells a non-owner more than that a name is in use; a rename alias refusal names only items the renamer sees | yes | confirmed | probe on SQLite and PostgreSQL: personal and private items counted, public and joined ones named, root sees all; mutations fail the test; only the message reaches people; other alias readers filter by viewer |
| 16 | db tests on the four databases | yes | confirmed | 109 on each; typecheck; biome |

**Overall:** met. The refusal still answers one bit to a guessed old name, as 118 accepts at submit.
