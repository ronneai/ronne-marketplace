# 113 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Service

Witnessed: 2026-10-10 14:30 EDT, by a fresh agent (blind). Commit: 6d810996 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The rename db tests pass on the four databases | no | confirmed | 15 passed on each (rename, visibility-guard) |
| 2 | Only root and the workspace's admins rename it | no | confirmed | `permissions.ts:47`; `workspaces.ts:168,174`; the test fails without `requirePermission` |
| 3 | `global` is refused | no | confirmed | `changeable`; `is_global = false` in `rename()` |
| 4 | Name rule, reserved and taken names (private too) | no | confirmed | test and probes (empty, 65 chars, Unicode, fullwidth) |
| 5 | Two workspaces racing for one name: the unique index decides | no | confirmed | passes on all 4; fails on PG and MySQL without the catch |
| 6 | Two renames of the same workspace at once: the second refused | no | partly | both succeeded on PG, MySQL, MariaDB (no name check after the re-read) |
| 7 | Aliases for every item; a rename back drops the own name | no | confirmed | tests; 1,201 items in chunks |
| 8 | Alias refusal lists and changes nothing | no | confirmed | test fails without the check |
| 9 | Requests joined, duplicates cancelled, own requests renamed | no | confirmed | test and probe |
| 10 | Audit event and summary line | no | confirmed | exact metadata, `targetId`; summary test |
| 11 | Catalogue revision raised | no | confirmed | probe; no repo test covers it |
| 12 | A release packed under the old name is refused | no | confirmed | test on all 4 |
| 13 | Rename racing delete: the second gets "no longer exists" | no | not met | both ok on PG (3/3) and MySQL (1/3) |
| 14 | Lint and types | no | confirmed | biome, tsc |

**Overall:** not met: rows 6, 11 (no test) and 13.

### Adversarial pass

Witnessed: 2026-10-10 14:36 EDT, by a fresh agent (adversarial). Commit: 6d810996 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only root and its admins | no | confirmed | 9/9 on all 4; probes |
| 2 | `global` never, any case | no | confirmed | probe `GLOBAL` |
| 3 | Name rule against crafted and Unicode input | no | confirmed | Cyrillic, fullwidth, NUL, 65 chars |
| 4 | Taken names, private too, say nothing more | no | confirmed | message names only the name |
| 5 | Unique index decides a race | no | confirmed | 5 rounds × 4 databases; hidden-name probe |
| 6 | Two renames of the same workspace: the second refused | no | not met | both ok on PG, MySQL, MariaDB |
| 7 | Same name in another case: nothing | no | confirmed | test |
| 8 | Aliases and chains | no | confirmed | acme→b→c→acme→b; 1,201 items |
| 9 | Alias refusal leaks nothing of the other item | no | confirmed | private probe |
| 10 | Requests | no | confirmed | test, probe; cancellations not audited (not asked) |
| 11 | Catalogue revision | no | confirmed | 0 → 1 on all 4; not asserted by the test |
| 12 | Audit event | no | confirmed | test |
| 13 | A release racing a rename is refused, no unaliased item, no deadlock | no | confirmed | 6 rounds × 4 databases |
| 14 | "Releasing again packs it under the new name" | no | not met | `name_mismatch`: the draft's ronne.yaml keeps the old workspace |
| 15 | Rename racing delete | no | confirmed | SQLite and PG orders seen |
| 16 | Done when covered on the four databases | no | confirmed | 9 passed on each |

**Overall:** not met: rows 6 and 14.

### Re-check 1

Witnessed: 2026-10-10 14:44 EDT, by a fresh agent (blind). Commit: 6d810996 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Two renames of one workspace: one goes through | no | confirmed | name check after the locks; the test fails without it on PG and MySQL; 5 pairs × 4 databases |
| 11 | Catalogue revision raised, not for a same-name rename | no | confirmed | the test fails without the bump |
| 13 | Rename racing delete or edit: the second gets "doesn't exist" | no | confirmed | lock and re-read in delete and update; the test fails without the lock on PG and MySQL |
| 15 | Unreleased submissions get the new name and release as before | no | partly | a dependency on an unreleased sibling keeps the old name (`dependency_not_found`); CRLF becomes LF |
| 16 | Touched suites pass on the four databases; lint and types | no | confirmed | 126 passed on each; biome, tsc |

**Overall:** not met: row 15.

### Adversarial re-check 1

Witnessed: 2026-10-10 14:42 EDT, by a fresh agent (adversarial). Commit: 6d810996 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Two renames of one workspace: the second refused | no | confirmed | one ok, one `WorkspaceNotFoundError` on PG, MySQL, MariaDB; rename vs delete too |
| 14 | Unreleased drafts and submissions submit and release after a rename | no | partly | base64 manifests skipped; a submit at the same moment kept the old name in its revision (1–4 in 5 on the servers) |
| 14a | The rewrite changes only the name | no | partly | the whole YAML re-serialised: CRLF to LF, flow maps re-spaced |

**Overall:** not met: rows 14 and 14a.

### Re-check 2

Witnessed: 2026-10-10 14:56 EDT, by a fresh agent (blind). Commit: 6d810996 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | The rename writes the new names (name, dependencies, a skill's agent) in place, formatting kept | no | partly | tests pass on all 4 and fail without each part; probes keep CRLF, comments, quotes, anchors; a block-scalar `name` loses its line break (invalid YAML) |
| 17 | Base64 files read and written back as utf8 | no | confirmed | test fails without `textOf` |
| 18 | Locks: a submit or save runs before or after a rename | no | confirmed | test fails without `lockOpenWorkIn` on PG and MySQL; 6 pairs × 4 databases, no deadlock |
| 19 | Touched suites on the four databases; lint and types | no | confirmed | 369 passed on each; biome; tsc |

**Overall:** not met: row 15 (block scalars).

### Adversarial re-check 2

Witnessed: 2026-10-10 14:54 EDT, by a fresh agent (adversarial). Commit: 6d810996 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | Unreleased work submits and releases after a rename, races included | no | not met | submit, save, release races hold; `createDraft` racing deadlocks on MySQL/MariaDB (2/8); drafts and proposals made during a rename keep the old name |
| 14a | Only item names change, in place | no | not met | block-scalar `name` loses its line break; a non-UTF-8 base64 manifest loses its byte |

**Overall:** not met: rows 14 and 14a.

### Re-check 3

Witnessed: 2026-10-10 15:08 EDT, by a fresh agent (blind). Commit: 6d810996 (plus the uncommitted working tree, which changed during the pass). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | New names written in place, formatting kept, block scalars too | no | confirmed | `>-`, `\|-`, CRLF, comments, end of file; the unit test fails without the trim |
| 20 | A non-UTF-8 base64 ronne.yaml is left as it was | no | confirmed | test passes on all 4; fails with a non-fatal decoder |
| 21 | A draft or proposal created during a rename gets the new name or is refused | no | confirmed | 8 rounds × 4 databases: no stale name, no deadlock; the repo test catches a missing scope lock only sometimes |
| 19 | Touched suites pass; lint and types | no | partly | 371 passed on the tree synced; the tree changed during the pass and a probe copy ("PS") failed on all 4 |

**Overall:** not met: row 19 (re-run on a stable tree).

### Adversarial re-check 3

Witnessed: 2026-10-10 15:08 EDT, by a fresh agent (adversarial). Commit: 6d810996 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | Unreleased work submits and releases after a rename, races included, without deadlocks | no | partly | pairs (submit, save, create, propose, renameDraft, release) 12 rounds × 4 databases: no stale names, no deadlock; a mixed race deadlocked on PostgreSQL in 2 of ~21 runs (rename, a first release, a proposal), raw `deadlock detected` |
| 14a | Only item names change, in place | no | confirmed | folded names kept valid; non-UTF-8 base64 untouched; odd YAML kept |

**Overall:** not met: row 14 (a rare PostgreSQL deadlock).

### Re-check 4

Witnessed: 2026-10-10 15:19 EDT, by a fresh agent (blind). Commit: 6d810996 (plus the uncommitted working tree, unchanged during the pass). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 19 | Touched suites pass on the four databases; lint and types | no | confirmed | 419 passed on each; 1171 unit; biome; tsc |
| 22 | `isDeadlock` knows real deadlocks; `retryOnDeadlock` runs up to 3 times, passes other errors on | no | confirmed | forced real deadlocks: PG `40P01`, MySQL and MariaDB 1213; both went through when wrapped |
| 23 | Rerunning those transactions is safe | no | partly | no storage, mail or auth inside; but `rewritten` in three draft services is kept outside the transaction and listed twice after a retry |

**Overall:** not met: row 23.

### Adversarial re-check 4

Witnessed: 2026-10-10 15:26 EDT, by a fresh agent (adversarial). Commit: 6d810996 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | Races end on the new name or a clean refusal, no deadlock reaches the user | no | partly | 120 PG, 10 MySQL, 10 MariaDB mixed-race runs: no deadlock; one PG run without a clean tally, not reproduced in 95 more |
| 14b | A retried rename writes everything once | no | confirmed | forced deadlock on the rename: one alias, one audit event, revision +1, manifest renamed, on 3 servers |
| 14c | Retried transactions do nothing outside the database | no | partly | `rewritten` duplicated in three draft services |
| 14d | The retry doesn't hide real errors | no | confirmed | only `40P01` and 1213; unique violations, 1205 and serialization failures pass through |

**Overall:** not met: rows 14 (one unexplained run) and 14c.

### Re-check 5

Witnessed: 2026-10-10 15:34 EDT, by a fresh agent (blind). Commit: 6d810996 (plus the uncommitted working tree, unchanged during the pass). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 23 | Rerunning the repositories' transactions after a deadlock is safe; no in-memory state survives a retry | no | confirmed | every repository transaction forced to retry once: whole db suite on SQLite 799 passed, 0 failed; PG submissions + workspaces 366 passed; the new test fails without the reset |
| 19 | Touched suites pass on the four databases; lint and types | no | confirmed | 418 passed on each (420 with an adversarial probe); 1171 unit; biome; tsc |

**Overall:** met.

### Adversarial re-check 5

Witnessed: 2026-10-10 15:40 EDT, by a fresh agent (adversarial). Commit: 6d810996 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | Races end on the new name or a clean refusal; no deadlock reaches the user | no | confirmed | mixed race, each run kept: PG 114 of 115 clean (the other never started: core's build output missing mid-rebuild), MySQL 12/12, MariaDB 12/12; no deadlock in 139 logs or the PG server log |
| 14c | `rewritten` lists each file once after a retry | no | confirmed | reset at each attempt; the forced-retry test passes 6/6 on all 4 |
| 14e | No other state outside a retried transaction changes inside it | no | confirmed | every mutation in the 15 retried call sites is local to its callback; storage writes only before the release transaction |

**Overall:** met.
