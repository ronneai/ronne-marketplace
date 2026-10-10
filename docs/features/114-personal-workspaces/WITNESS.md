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
