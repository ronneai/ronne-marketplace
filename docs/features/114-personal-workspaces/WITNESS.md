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

## Task 4 — Approved when submitted

Witnessed: 2026-10-10 20:28 EDT, by a fresh agent (blind). Commit: 0356a1c1 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Submit in one's own personal workspace approves at once, as the author's own approval | no | confirmed | `send`; 13/13 on each server; events `submit`, `self_approve` |
| 2 | Recorded as `self_approved` | no | partly | the code says `self_approve`; spec and plan said `self_approved` |
| 3 | Audited with `self: true` | no | confirmed | test |
| 4 | Risk flags returned to the author | no | confirmed | probe; the test asserts only `[]` |
| 5 | Submit brings dependency drafts along, approved | no | confirmed | test |
| 6 | Bulk submit (052) self-approves; tested | no | partly | holds by probe; no test calls it |
| 7 | Release marks it not reviewed | no | confirmed | test; mutation |
| 8 | A shared release stays reviewed | no | confirmed | probe; not asserted |
| 9 | The queue leaves personal workspaces out | no | confirmed | four tabs; mutations |
| 10 | The nav's Reviews count leaves them out | no | not met | `countByStatus` counts root's submission in a personal workspace |
| 11 | A shared workspace still needs a reviewer | no | confirmed | test; probe |
| 12 | Root's own submission there isn't self-approved | no | confirmed | probe; untested |
| 13 | Root's own personal workspace self-approves | no | confirmed | probe |
| 14 | Override and the queue unchanged elsewhere | no | confirmed | 324 tests |
| 15 | The conversation's label | no | confirmed | `Conversation.tsx:14` |
| 16 | Lint and types | no | confirmed | clean |

**Overall:** not met: rows 2, 6, 10.

### Adversarial pass

Witnessed: 2026-10-10 20:25 EDT, by a fresh agent (adversarial). Commit: 0356a1c1 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Self-approval by the author | no | confirmed | four dialects |
| 2 | One `self: true` audit per approval | no | confirmed | concurrent double submit: one |
| 3 | Risk flags shown at submit | no | partly | the drafts API and `rmk submit` drop them and say "submitted for review" |
| 4 | Bulk submit self-approves both | no | confirmed | probe |
| 5 | Tests cover bulk submit | no | partly | none calls it |
| 6 | `reviewed: false` in every release path | no | confirmed | group, resubmit, proposal re-release |
| 7 | `reviewed` true otherwise | no | confirmed | probe (root's override in a personal workspace is `true`, a remark) |
| 8 | No unreviewed approval outside one's own personal workspace | no | confirmed | mixed groups, root's, another's |
| 9 | Resubmit and restore re-approve | no | confirmed | events |
| 10 | A shared workspace needs a reviewer | no | confirmed | test |
| 11 | The queue leaves them out | no | confirmed | tabs, total, filter |
| 12 | Nav and home counts match the queue | no | not met | `countNeedsReview` counts personal ones |
| 13 | Override and review flow unchanged | no | confirmed | 431 + 236 tests |
| 14 | Four databases | no | confirmed | identical outputs |
| 15 | Types and lint | no | confirmed | clean |

**Overall:** not met: rows 3, 5, 12.

### Re-check 1

Witnessed: 2026-10-10 20:42 EDT, by a fresh agent (blind). Commit: 0356a1c1 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Self-approval on submit | no | confirmed | 15/15 on four databases |
| 2 | Spec and plan name `self_approve` | no | confirmed | SPEC.md:71, PLAN.md:33 |
| 3 | Audited with `self: true` | no | confirmed | test |
| 4 | Risk flags returned, tested | no | confirmed | mutation fails the bulk test |
| 5 | Bulk submit with a dependency draft, tested | no | confirmed | `submitManyDrafts` test; mutation |
| 6 | Not reviewed; shared stays reviewed | no | confirmed | test, four databases |
| 7 | Root's own submission stays submitted; after override, not reviewed | no | confirmed | test; three mutations fail it |
| 8 | Nav count leaves personal out | no | confirmed | test; mutation |
| 9 | Queue leaves personal out | no | confirmed | test |
| 10 | Shared needs another reviewer | no | confirmed | test |
| 11 | Drafts API carries `riskFlags` | no | confirmed | probe; no repo test |
| 12 | `rmk submit` line | no | confirmed | 12 cli tests |
| 13 | Unchanged elsewhere | no | confirmed | 433 tests |
| 14 | Lint and types | no | confirmed | clean |

**Overall:** met.

### Adversarial re-check 1

Witnessed: 2026-10-10 20:40 EDT, by a fresh agent (adversarial). Commit: 0356a1c1 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | Nav and home counts match the queue | yes | confirmed | probe, four dialects; test |
| 3a | Drafts API `riskFlags` with `status: "approved"` | yes | confirmed | probe, four dialects; no web test |
| 3b | `rmk submit` result line | yes | confirmed | `submitLines` on the real answer |
| 3c | An older rmk still works | yes | confirmed | unknown fields ignored |
| 3d | What the person agrees to doesn't promise a review for a personal draft | no | partly | `rmk submit`'s prompt, MCP's `check_drafts` text and `submit_drafts` title still promise reviewers |
| 5 | Bulk submit tested | yes | confirmed | test, four dialects |
| 13 | Root's override in a personal workspace → not reviewed | yes | confirmed | probe (single and group); test |
| 14 | Override elsewhere stays reviewed | yes | confirmed | probe |
| 15 | A later reviewed approval wins | yes | confirmed | probe |
| 16 | Shared releases reviewed, tested | yes | confirmed | test |
| 17 | No regressions; types and lint | no | confirmed | 433 + 187 + 51 tests; 46/46 per server |

**Overall:** not met: row 3d.

### Adversarial re-check 2

Witnessed: 2026-10-10 20:53 EDT, by a fresh agent (adversarial). Commit: 0356a1c1 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3d-1 | `personal: true` only on a draft in its author's own personal workspace | yes | confirmed | probe with tokens: Ana's shared undefined, personal true; root's own in Ana's undefined, stays submitted; four dialects |
| 3d-2 | An older registry gets the reviewers line | yes | confirmed | `submitCommand` against a fake API without the field |
| 3d-3 | The prompt in every combination | yes | confirmed | all personal (1, 2), none, mixed (1+1, 1+2, 2+1), a personal dependency, a not-ready personal draft |
| 3d-4 | MCP `check_drafts` and `submit_drafts` wording | yes | confirmed | `submit-tools.ts:67`, `server.ts:345-347`; 51 mcp tests |
| 3d-5 | Tests cover it | yes | confirmed | drafts-api and personal-release on four databases (39/39 each); 255 cli tests |
| 17 | Types and lint | no | confirmed | clean |

**Overall:** met. (Remark 2, "the others" for a single other draft, was fixed after this pass: "the other", with a cli test.)

## Task 5 — Visibility key

Witnessed: 2026-10-10 21:01 EDT, by a fresh agent (blind). Commit: a4f462bb (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Users with empty personal workspaces share one cached marketplace | no | confirmed | private-feeds-api.db.test → 11 passed; slot `claude-code` for the outsider and for a mirror naming an empty one |
| 2 | A released personal item gets its own entry | no | confirmed | slot `claude-code/<id>` after the release |
| 3 | The key counts only private workspaces with a released item | no | confirmed | `workspacesWithReleases`; `item_versions` written only on release |
| 4 | Plain and mirror paths both use it | no | confirmed | `feeds.ts:78`, `:90`; reverting either fails the test |
| 5 | Built for exactly the workspaces in its key | no | confirmed | `deps` builds repositories and key from one viewer; revision read first |
| 6 | Root unchanged | no | confirmed | viewer.test "leaves root's viewer as it is" |
| 7 | The test covers the claims | no | confirmed | four mutations, each fails it |
| 8 | Three servers; lint and types | no | confirmed | 11 passed on each; clean |

**Overall:** met.
