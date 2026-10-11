# 115 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Migration

Witnessed: 2026-10-10 23:58 EDT, by a fresh agent (blind). Commit: 27a03e6c (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `scope_moves` has the twelve columns | no | confirmed | `0024_scope_moves.ts`; `ScopeMoveTable`; tsc clean |
| 2 | Goes with its scope and its target workspace | no | confirmed | test on four databases; mutation fails it |
| 3 | Source deleted → kept with no source; answerer set null | no | confirmed | test on four databases |
| 4 | Real foreign keys on every dialect | no | confirmed | guard (25); rejected inserts on the servers |
| 5 | One open per scope left to the service | no | confirmed | two plain indexes |
| 6 | `item_versions.reviewed_by` nullable, set null | no | confirmed | test; mutation fails it on postgres |
| 7 | Registered, safe to run again | no | confirmed | test; mutation fails it on mysql |
| 8 | The db test passes on four databases | no | confirmed | 11 passed on each |
| 9 | 0007's key test updated; nothing else broke | no | confirmed | 844 passed on SQLite |
| 10 | The guard passes | no | confirmed | 25 passed |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-11 00:04 EDT, by a fresh agent (adversarial). Commit: 27a03e6c (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Passes on SQLite | no | confirmed | 7 passed |
| 2 | Passes on the servers | no | confirmed | 85 tests per server |
| 3 | Guard tests pass | no | confirmed | visibility guards green; 844 on SQLite |
| 4 | Columns match the schema types | no | confirmed | information_schema probe |
| 5 | Lengths in any script | no | confirmed | 64 and 500 emoji round-trip; 65 refused on the servers |
| 6 | Keys exist on every dialect | no | confirmed | catalog probe |
| 7 | Cascade with scope and target | no | confirmed | test |
| 8 | Source deleted keeps the row | no | confirmed | test |
| 9 | Asker cascades, answerer set null, mixed case | no | confirmed | probe on four databases |
| 10 | `reviewed_by` | no | confirmed | test; MySQL key present |
| 11 | Upgrade from a 0023 instance with data | no | confirmed | probe on four databases |
| 12 | Rerun after six partial states | no | confirmed | schema snapshots equal |
| 13 | Older migration tests pass | no | confirmed | green on four |
| 14 | Nothing listing tables breaks | no | confirmed | introspected, no hard-coded lists; test:db:core green |
| 15 | Types check | no | confirmed | tsc |
| 16 | One open per scope not in the migration | no | confirmed | by design |

**Overall:** met.

## Task 2 — The checks

Witnessed: 2026-10-11 00:12 EDT, by a fresh agent (blind). Commit: 9ce9d8cc (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `moveImpact` service and action, `scopes.move` permission | no | confirmed | 17 unit tests |
| 2 | Outside dependents refuse with a private target only | no | confirmed | test; probe; mutant |
| 3 | Own dependencies on another private workspace refuse | no | confirmed | test; probes; mutants |
| 4 | Open dependents warn, private target only | no | confirmed | test; probe |
| 5 | Authors not in the target listed | no | confirmed | test; mutant |
| 6 | Not-reviewed versions listed, not refusing | no | confirmed | test |
| 7 | New names | no | confirmed | test |
| 8 | Clash or bad name refuses; a new name fixes it | no | confirmed | test; probe |
| 9 | Alias clash refuses; hidden counted; moving back allowed | no | confirmed | test; probe |
| 10 | Who asks; targets refused | no | confirmed | tests; probes; mutant |
| 11 | Reuses 093's `outsideDependents` | no | partly | a near-copy, not reused |
| 12 | Tests cover each case, public and private targets | no | partly | mutants M3 (target's own items) and M6 (moving back) survive |
| 13 | Personal source covered | no | confirmed | tests |
| 14 | Four databases | no | confirmed | 8 passed on each |
| 15 | Lint and types | no | confirmed | clean |

**Overall:** not met: rows 11 and 12.

### Adversarial pass

Witnessed: 2026-10-11 00:13 EDT, by a fresh agent (adversarial). Commit: 9ce9d8cc (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Four databases | no | confirmed | 8 passed on each |
| 2 | Outside dependents rule | no | confirmed | test; probe; mutant |
| 3 | Reuses 093's `outsideDependents` | no | partly | a separate query |
| 4 | Outside dependents name nothing hidden | no | not met | Bob's personal and private `secret` items named to Ana |
| 5 | Own dependencies rule | no | confirmed | tests; probes |
| 6 | Own dependencies leak nothing | no | not met | a hidden item's existence confirmed through a refusal |
| 7 | Open dependents warning | no | confirmed | test; probe; mutant |
| 8 | Open dependents leak nothing | no | not met | a private submission named |
| 9 | Authors not members | no | confirmed | test; mutant |
| 10 | Not-reviewed | no | confirmed | test |
| 11 | Names | no | confirmed | test; probe on four databases |
| 12 | Alias clash; hidden counted; moving back | no | confirmed | test; probe; moving back untested |
| 13 | Permissions | no | confirmed | test; probe |
| 14 | Target lookup | no | partly | NUL → PostgreSQL error; MySQL/MariaDB match accented and full-width |
| 15 | `fewerSee` | no | partly | misses the owner when root moves their personal scope |
| 16 | Large scopes batched | no | confirmed | 1200 items, fast on four databases |
| 17 | Tests cover each check, both targets | no | partly | three mutants survive; several checks only against a public target |

**Overall:** not met: rows 3, 4, 6, 8, 14, 15, 17.

### Re-check 1

Witnessed: 2026-10-11 00:26 EDT, by a fresh agent (blind). Commit: 9ce9d8cc (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–10 | As in the first pass | no | confirmed | tests and probes |
| 11 | Reuses 093's `outsideDependents` | no | confirmed | `outsideDependents(workspaceId, scopeId?)`; 093's tests pass |
| 12 | Tests cover each case, both targets | no | partly | M15 survives: a refusal from a hidden dependent alone is untested |
| 13–15 | Personal source; four databases; lint and types | no | confirmed | 15 passed on each |
| 16 | Hidden things counted, still refusing | no | confirmed | test; probe |
| 17 | Dangling dependency refuses for non-root | no | confirmed | test; probe; mutants |
| 18 | `fewerSee` covers the owner | no | confirmed | test; mutant |
| 19 | Exact target name only | no | confirmed | test; probe |

**Overall:** not met: row 12.

### Adversarial re-check 1

Witnessed: 2026-10-11 00:25 EDT, by a fresh agent (adversarial). Commit: 9ce9d8cc (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass; 093's callers work | no | confirmed | 141 on SQLite; 20 per server |
| 2 | Outside dependents named only when seen | no | confirmed | probe on four databases; mutant |
| 3 | Open dependents named only when seen | no | confirmed | probe; mutant |
| 4 | Hidden and non-existent dependencies look the same | no | confirmed | probe; mutants |
| 5 | Others' drafts counted | no | confirmed | probe; mutant |
| 6 | Hidden alias holders counted | no | confirmed | mutant |
| 7 | No oracle beyond what the spec accepts | no | confirmed | per-category counts |
| 8 | Dependencies inside the scope never refuse | no | not met | an item in review in the scope counted as dangling |
| 9 | Public items in review don't refuse | no | partly | refused for a non-root admin |
| 10 | `fewerSee` personal source | no | confirmed | test; probe; mutant |
| 11 | Exact target name, every dialect | no | confirmed | probe on four databases; mutant |
| 12 | Reuses `outsideDependents` | no | confirmed | `$call` branch |
| 13 | Tests cover each check, both targets, moving back | no | confirmed | 9 mutants each fail a test |

**Overall:** not met: rows 8 and 9.

### Re-check 2

Witnessed: 2026-10-11 00:30 EDT, by a fresh agent (blind). Commit: 9ce9d8cc (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–16, 18–19 | As in re-check 1, M15 now covered | no | confirmed | 17 passed on each database; mutants M3, M6, M15, M17 fail a test |
| 17 | A name nothing released or in review has refuses for non-root, indistinguishable | no | partly | someone else's draft resolves |
| 20 | Dependencies in review judged by where they are | no | partly | `resolveOpenSubmissions` includes drafts, unlike 056 and the spec |

**Overall:** not met: rows 17 and 20.

### Adversarial re-check 2

Witnessed: 2026-10-11 00:30 EDT, by a fresh agent (adversarial). Commit: 9ce9d8cc (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass on four databases | no | confirmed | 143 on SQLite; 22 per server |
| 2 | In review in the scope never counts | no | confirmed | probe on four databases |
| 3 | Public in review doesn't refuse | no | confirmed | probe; mutant |
| 4 | Hidden in review indistinguishable from nothing | no | confirmed | probe on four databases |
| 5 | Other people's drafts don't leak | no | not met | a draft resolves and is named or passes |
| 6 | Withdrawn and rejected aren't in review | no | confirmed | probe |
| 7 | Global forms; case on MySQL | no | confirmed | probe |
| 8 | Old workspace names in review | no | confirmed | consistent with release |

**Overall:** not met: row 5.

### Re-check 3

Witnessed: 2026-10-11 00:33 EDT, by a fresh agent (blind). Commit: 9ce9d8cc (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–16, 18–19 | As in re-check 2 | no | confirmed | 18 passed on each database; mutants fail tests |
| 17 | Nothing released or in review refuses for non-root, indistinguishable | no | confirmed | probe: a draft and a name nobody has both counted |
| 20 | In review means submitted, changes requested or approved, never a draft | no | confirmed | matches 056's lookup; test; mutant putting drafts back fails it |

**Overall:** met.

### Adversarial re-check 3

Witnessed: 2026-10-11 00:33 EDT, by a fresh agent (adversarial). Commit: 9ce9d8cc (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass on four databases | no | confirmed | 144 on SQLite; 19 per server |
| 2 | Only submissions in review resolve | no | confirmed | `resolveOpenSubmissions` |
| 3 | Someone else's draft looks like nothing | no | confirmed | probe on four databases |
| 4 | Items in review still resolve | no | confirmed | probe |
| 5 | The new test covers drafts | no | confirmed | test |
| 6 | In-scope dependencies in review don't count | no | confirmed | probe |

**Overall:** met.

## Task 3 — Asking, answering, moving

Witnessed: 2026-10-11 00:56 EDT, by a fresh agent (blind). Commit: 76fe078e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The four services and actions | no | confirmed | tsc |
| 2 | Only root or the source's admins ask | no | confirmed | probe |
| 3–6 | Each row of the table | no | confirmed | tests; probes |
| 7 | Not-reviewed versions: a request for someone else; reviewed by them | no | confirmed | test |
| 8 | Refusals at ask and at approve, each kind | no | partly | clash at approval and own dependencies through ask/approve untested |
| 9 | One open move per scope | no | confirmed | test |
| 10 | Decline, answered once, cancel, text limits, audit | no | confirmed | test; probes |
| 11 | Two answers at once | no | confirmed | test; mutation |
| 12 | Lost role | no | confirmed | test; probe |
| 13 | The move transaction | no | confirmed | tests; probe |
| 14 | Four audit actions | no | confirmed | 38 unit tests |
| 15 | A release racing a move, tested | no | partly | the dependency guard untested; the scope lock untested |
| 16 | Four databases | no | confirmed | 38 passed each |
| 17 | Lint and types | no | confirmed | clean |

**Overall:** not met: rows 8 and 15.

### Adversarial pass

Witnessed: 2026-10-11 00:49 EDT, by a fresh agent (adversarial). Commit: 76fe078e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Root types the name; nothing moves without it | no | confirmed | probe; mutation |
| 2 | `global` admin vs moderator | no | confirmed | probe; mutation |
| 3 | Others into `global`: root answers | no | confirmed | test; probe |
| 4 | Admin of both; otherwise target admins or root | no | confirmed | test |
| 5 | Own personal at once; another's never | no | confirmed | test; probe |
| 6 | Not-reviewed always a request, never the asker | no | confirmed | test; probe; mutation |
| 7 | Refusals; impact for the answerer's view | no | confirmed | test; probe; mutation |
| 8 | One open move | no | confirmed | test; mutation |
| 9 | Cancel and decline limited | no | confirmed | probe |
| 10 | Two answers at once | no | confirmed | test |
| 11 | Lost role, disabled, concurrent demotion | no | confirmed | test; probe ×10 per database |
| 12 | The move's effects | no | confirmed | tests; probes |
| 13 | Audit events; text kept out | no | confirmed | probe |
| 14 | A release racing a move tested | no | partly | race test flaky on SQLite (1 in 12); dependency guard untested |
| 15 | No `ScopeMovedError` false positives | no | confirmed | 69 release tests on SQLite and PostgreSQL |
| 16 | Races with renames, Make private, a shared name | no | confirmed | probes on four databases |
| 17 | Deleting the target counts its requests | no | not met | `workspace.deleted` had no count |
| 18 | Four databases | no | confirmed | 14 each |

**Overall:** not met: rows 14 and 17.

### Re-check 1

Witnessed: 2026-10-11 01:08 EDT, by a fresh agent (blind). Commit: 76fe078e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | Each kind of refusal at ask and at approval | yes | confirmed | new tests; mutation fails 3 |
| 15 | A release racing a move, tested | yes | confirmed | dependency-race test fails without the guard on three servers; race test 12/12 |
| 18 | Answerer re-checked under the lock | yes | confirmed | test; mutation |
| 19 | Deleting a workspace counts its open moves | yes | confirmed | test |
| 20 | Doc comment restored | yes | confirmed | errors.ts |
| 16 | Four databases | yes | confirmed | 150 per server |
| 17 | Lint and types | no | confirmed | clean |

**Overall:** met.

### Adversarial re-check 1

Witnessed: 2026-10-11 01:11 EDT, by a fresh agent (adversarial). Commit: 76fe078e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Race test no longer flaky | yes | confirmed | 25 on SQLite, 6 per server |
| 2 | Dependency-race test fails without the guard | yes | confirmed | mutation on postgres |
| 3 | Delete counts open moves | yes | confirmed | probe; mutation |
| 4 | Answerer's role re-read at approve and decline | yes | partly | a demoted root who administers global still approves into global; decline re-check untested |
| 5 | Root answers every kind of target | no | confirmed | probe |
| 6 | Clash at approval | yes | confirmed | test on four databases |
| 7 | Own dependency at ask and approval | yes | confirmed | test on four databases |
| 8 | Nothing broke; approve vs delete | no | confirmed | 72 release tests; probe ×8 per database |

**Overall:** not met: row 4.

### Re-check 2

Witnessed: 2026-10-11 01:16 EDT, by a fresh agent (blind). Commit: 76fe078e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 18 | Answerer's standing read from the database; stale sessions neither approve nor decline | yes | confirmed | two tests; mutations fail them |
| 12 | Asker's lost role still checked | yes | confirmed | test |
| 19 | Delete counts open moves; summary shows it | yes | confirmed | test; probe |
| 16 | No regression on four databases | yes | confirmed | 423 on SQLite, 424 per server |
| 17 | Lint, types, unit tests | no | confirmed | clean; 38 passed |

**Overall:** met. (A summary test for the count was added after this pass.)

### Adversarial re-check 2

Witnessed: 2026-10-11 01:15 EDT, by a fresh agent (adversarial). Commit: 76fe078e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Still root, or still admin of a shared non-global non-personal target | yes | confirmed | probes Q3, Q6 on SQLite and PostgreSQL |
| 2 | Demoted admin can't decline; disabled answerer can't approve | yes | confirmed | probe |
| 3 | The new test guards both | yes | confirmed | two mutations fail it |
| 4 | `canStillMove` uses `standing`; lost-role rule holds | yes | confirmed | test on four databases; probe |
| 5 | Summary shows the move-request count | yes | confirmed | scratch call |
| 6 | Nothing broke | no | confirmed | 20 per server; delete race probe; typecheck; lint |

**Overall:** met.

## Task 4 — After the move

Witnessed: 2026-10-11 01:24 EDT, by a fresh agent (blind). Commit: af6bad0e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–2 | Tests pass on four databases | no | confirmed | 5 passed on each |
| 3 | All five moves tested | no | confirmed | one test each |
| 4 | Catalogue, filter and search | no | confirmed | test; probe of the API list and search |
| 5 | Item page by new name; old name an alias | no | confirmed | test |
| 6 | Those who can't see get not found | no | confirmed | test |
| 7 | Registry API by both names | no | confirmed | test; 404 side by probe only |
| 8 | Resolve and download by the old name | no | confirmed | test |
| 9 | MCP and `rmk` through `renamed` | no | confirmed | 118's CLI and MCP tests |
| 10 | Feeds follow from the next request | no | partly | read only after the move; a move without the revision bump passes |
| 11 | Open submissions reach the target's queue | no | partly | only one submitted after the move |
| 12 | Versions and tags unchanged | no | partly | tags counted only; one scenario |
| 13 | Moved back | no | confirmed | test |
| 14 | Reviewed at the move | no | confirmed | test |
| 15 | The cache reset hides no bug | no | confirmed | key includes the revision; probe across moves |
| 16 | Old-name dependency in a released version | no | partly | probe only |
| 17 | Catalogue revision rose | no | confirmed | task 3's test |
| 18 | Lint and types | no | confirmed | clean |

**Overall:** not met: rows 10, 11, 12, 16.

### Re-check 1

Witnessed: 2026-10-11 01:27 EDT, by a fresh agent (blind). Commit: af6bad0e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Four databases | no | confirmed | 5 passed on each |
| 7 | API 404 by both names when hidden, 200 when seen | no | confirmed | tests |
| 10 | Feeds follow from the next request | no | confirmed | read before and after; no revision bump fails 3 tests |
| 11 | An open submission reaches the target's queue, named anew | no | confirmed | test |
| 12 | Versions and tags unchanged, exactly, every scenario | no | confirmed | test |
| 16 | Old-name dependency resolves | no | confirmed | test |
| 18 | Lint and types | no | confirmed | clean |

**Overall:** met.

## Task 5 — The Move dialog

Witnessed: 2026-10-11 01:36 EDT, by a fresh agent (blind). Commit: 5788fa1a (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Move… for root and the workspace's admins | no | confirmed | page test; everyone else gets a 404 first |
| 2 | Target select; own personal as Personal | no | confirmed | db test on four databases; component test |
| 3 | Name field and clash message | no | confirmed | component test |
| 4 | Impact shown, refusals listed, hidden counted | no | confirmed | component tests |
| 5 | Message for a request; Move scope or Ask to move; who answers | no | confirmed | component and db tests |
| 6 | One confirmation, "renamed to" when renamed | no | not met | Enter in the name field submits without it; the wording never says "renamed to" |
| 7 | Root's double confirmation, checked by the service | no | confirmed | component test; service |
| 8 | Row's open or declined move | no | confirmed | component, page and db tests |
| 9 | Component tests cover each outcome | no | partly | after-submit outcomes, the actions, Cancelled and the name hint untested |
| 10 | Checks green | no | confirmed | 50 tests; typecheck; lint |

**Overall:** not met: rows 6 and 9.

### Re-check 1

Witnessed: 2026-10-11 01:39 EDT, by a fresh agent (blind). Commit: 5788fa1a (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | One confirmation, "renamed to" when renamed; Enter can't skip it | yes | confirmed | mutation fails the wording test; the real form in Chromium and WebKit: Enter shows the confirmation |
| 9 | Component tests cover each outcome | yes | confirmed | 51 passed; after-submit states, the actions, Cancelled, the name hint |
| 11 | Personal review line | yes | confirmed | mutation fails its test |
| 10 | Checks green | no | confirmed | typecheck; lint |

**Overall:** met. (The Enter guard is checked in a browser here and by task 6's end-to-end test.)

## Task 6 — Scope moves on the Requests page

Witnessed: 2026-10-11 01:55 EDT, by a fresh agent (blind). Commit: bcb04267 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component and nav tests pass | no | confirmed | 60 passed |
| 2 | Scope moves table for root and shared admins, not moderators | no | confirmed | page test; mutation |
| 3 | Who answers which | no | confirmed | db test on four databases; mutations |
| 4 | Workspace's Requests tab: moves into it | no | confirmed | page test; mutation; db test |
| 5 | Each row's fields | no | confirmed | table test; mutation; db test |
| 6 | Approve re-checks and moves, or lists refusals | no | confirmed | action and table tests; e2e |
| 7 | Decline with a reason the asker sees | no | confirmed | action test; row from task 5 |
| 8 | Already answered; lost role | no | confirmed | table test |
| 9 | Nav count adds moves for root and shared admins | no | confirmed | shell tests; mutation; db counts |
| 10 | Audit summary lines | no | confirmed | probe (explicit tests added after this pass) |
| 11 | Dialog refreshes on close, not from its action | no | confirmed | action test; e2e |
| 12 | End to end: owner asks, team admin approves | no | confirmed | 4 projects |
| 13 | End to end: root moves with both confirmations; Enter stops at the first | no | confirmed | 4 projects |
| 14 | Dialog and table pass the phone sweep's check at three widths | no | confirmed | 4 projects |
| 15 | Lint and types | no | confirmed | clean |

**Overall:** met.

## Task 7 — Decision log

Witnessed: 2026-10-11 02:00 EDT, by a fresh agent (blind). Commit: 9e39159e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–3 | Workspaces row: who asks, who decides, listed and counted | no | confirmed | `placesOf`, `moveWay`, `mayAnswer`, pages; tests |
| 4 | "A name clash in the target renames the scope" | no | partly | a clash refuses until the asker gives a free name |
| 5–6 | Refused rather than broken; names and aliases; no one else's personal | no | confirmed | `checkMove`, locks, `performMove`; 45 tests |
| 7 | Approval row: not-reviewed versions, `reviewed_by` | no | confirmed | code; test |
| 8–10 | Old names, Scopes rows; §2 matrix row | no | confirmed | MVP.md |
| 11 | Nothing says moving isn't built | no | confirmed | grep |
| 12–13 | 090's Out and Delete point to 115 | no | confirmed | 090 SPEC |

**Overall:** not met: row 4.

### Re-check 1

Witnessed: 2026-10-11 02:02 EDT, by a fresh agent (blind). Commit: 9e39159e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | A clash refuses until the asker gives a free name, which the move takes | no | confirmed | MVP.md:912; `checkMove`, `applyMove`; tests |
| 2 | Who decides, with the not-reviewed exception | no | confirmed | MVP.md:912; `moveWay`; test |

**Overall:** met.

## Task 8 — Documentation

Witnessed: 2026-10-11 02:05 EDT, by a fresh agent (blind). Commit: 788a2c06 (plus the uncommitted working tree); ronne-web branch `docs/115-move-scopes` (uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | ronne-web checks pass | no | confirmed | lint, typecheck, 138 tests, build |
| 2 | `workspaces#moving` renders in en, pt, fr | no | confirmed | built pages |
| 3 | `moving` in both topics files | no | confirmed | both |
| 4 | Helper link test passes; helpers where the spec says | no | confirmed | 20 tests |
| 5–8 | Moving's facts match the app | no | confirmed | against `scope-moves.ts`, the dialog, tests |
| 9 | Personal: moving out needs someone else | no | partly | not for a scope with only drafts |
| 10–13 | Managing, admin, joining, scopes, rmk | no | confirmed | against pages and services |
| 14 | pt and fr say what en says | no | confirmed | side by side |
| 15 | SPEC Documentation updated | no | confirmed | diff |

**Overall:** not met: row 9.

### Re-check 1

Witnessed: 2026-10-11 02:07 EDT, by a fresh agent (blind). Commit: 788a2c06 (plus the uncommitted working tree); ronne-web branch (uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Checks pass; renders in three languages | no | confirmed | build |
| 9 | Personal: moving out | no | partly | a scope brought in already reviewed moves at once |
| 5a | Who answers not-reviewed moves | no | confirmed | `mayAnswer` |
| 14a | pt wording | no | confirmed | grep |

**Overall:** not met: row 9.

### Re-check 2

Witnessed: 2026-10-11 02:07 EDT, by a fresh agent (blind). Commit: 788a2c06 (plus the uncommitted working tree); ronne-web branch (uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Checks pass; renders in three languages | no | confirmed | build |
| 9 | Personal: "Once you've released versions in it, someone else approves" | no | confirmed | `self_approve`, `publish.ts`, `moveWay` |
| 15a | SPEC line matches | no | confirmed | SPEC.md:145 |

**Overall:** met.

## Task 9 — A workspace's page under Workspaces

Witnessed: 2026-10-11 12:05 EDT, by a fresh agent (blind). Commit: ff6f458a (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Opens for whoever sees the workspace; private ones for members and root | no | confirmed | `visibility.db.test.ts` 11 passed; probe: e2e-vault 200 for a member, 404 for others, same as an unknown name |
| 2 | Someone else's personal workspace: owner and root only | no | confirmed | db test; e2e `personal-workspace.ts:89` on four projects |
| 3 | Signed out reads nothing | no | confirmed | unit test; db test; probe redirects to sign-in |
| 4 | Description, visibility, role or Ask to join, Scopes tab | no | confirmed | unit test; probe |
| 5 | Members and Requests tabs only for those allowed; otherwise Scopes | no | confirmed | probes per role; mutation fails a test |
| 6 | Create scope, Edit, Move…, Edit description, Rename, visibility, Delete only for those allowed | no | confirmed | `can(...)` gates; unit tests per role; mutation fails a test |
| 7 | Scope actions are icon buttons on one line, named and with tooltips | no | confirmed | `IconButton.tsx`; probe at desktop and 390px; no repo test of `title` |
| 8 | Old address redirects with the query, on the same site | no | confirmed | unit test; probes incl. `%2F%2Fevil.example` |
| 9 | `requests` reserved; `requests@…` gets `requests-2` | no | confirmed | `names.ts:30`; probe; no repo test |
| 10 | `/workspaces/requests` stays the Requests page | no | confirmed | probe |
| 11 | Component tests cover each role | no | confirmed | 92 passed across five feature folders |
| 12 | e2e uses the new address | no | confirmed | 44 passed on four projects |

**Overall:** met. (Tests for `requests` and IconButton's tooltip were added after this pass.)

### Adversarial pass

Witnessed: 2026-10-11 12:03 EDT, by a fresh agent (adversarial). Commit: ff6f458a (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Private page hidden whatever the spelling | no | confirmed | probe: case, spaces, fullwidth, Cyrillic, zero-width, `../acme` |
| 2 | Personal workspace owner and root only | no | confirmed | db test |
| 3 | Members tab and data only for member managers | no | confirmed | `can()` gates; `pageMembers` refuses (probe) |
| 4 | Requests tab and data only for answerers | no | confirmed | `pendingRequests` refuses (probe); coverage gap in row 9 |
| 5 | Create scope, Edit, Move… only for root and admins | no | confirmed | mutations fail tests; server actions refuse (probe) |
| 6 | Workspace edits gated; none on global | no | confirmed | mutations fail tests; server actions refuse (probe) |
| 7 | Role, or Ask to join only where they may ask | no | partly | Ask to join shown with an open or declined request |
| 8 | Icon buttons on one line, named | no | confirmed | `IconButton.tsx`; a long decline reason may not wrap |
| 9 | Component tests cover each role | no | partly | moderator getting Edit/Move… and `?tab=requests` for anyone pass every test |
| 10 | Redirect keeps query, no open redirect | no | confirmed | probes `//evil.com`, `\\evil.com`, CRLF, malformed escapes |
| 11 | e2e uses the new address | no | confirmed | diff; `pages-coverage.test.ts` |
| 12 | e2e passes | no | can't check here | scratch-copy build failed |
| 13 | `requests` reserved | no | confirmed | probe; no repo test |
| 14 | Server actions enforce permissions on their own | no | confirmed | probe: 9 refuse a non-member, 7 a plain member |

**Overall:** not met: rows 7, 9, 12.

### Adversarial re-check 1

Witnessed: 2026-10-11 12:09 EDT, by a fresh agent (adversarial). Commit: ff6f458a (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | Requested or Declined instead of Ask to join, as on the list | yes | confirmed | `NotIn` with `ownRequests`; test; mutations M12, M13 fail it |
| 9 | Tests catch the moderator and unauthorised `?tab=requests` mistakes | yes | confirmed | 694 passed; M9, M10, M14 now fail |
| 12 | e2e passes on the new address | yes | confirmed | built in the repository; 35 passed on four projects |
| 15 | A move's state wraps under the description; actions column holds the icons | yes | confirmed | by reading: `note` prop, fixed `w-24` column |
| 16 | `requests` reserved, with a test | yes | confirmed | `names.test.ts` 15 passed |
| 17 | IconButton's name and tooltip, with a test | yes | confirmed | `ui.test.tsx` |
| 18 | Hiding and server checks unchanged | no | confirmed | `visibility.db.test.ts` 11 passed |

**Overall:** met.

## Task 10 — The list under Workspaces; Admin is root's

Witnessed: 2026-10-11 12:18 EDT, by a fresh agent (blind). Commit: 792fc350 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component and nav tests pass | no | confirmed | 13 files, 153 passed; typecheck; lint |
| 2 | Root's `/workspaces` has New workspace and Kind | no | confirmed | `workspaces/page.tsx`; probe: button 1, `#workspace-kind` 1, 51 personal rows |
| 3 | Every name links to its page | no | confirmed | `WorkspacesTable.tsx`, `WorkspacesPage.tsx`; probe; unit tests |
| 4 | Non-root: no New workspace or Kind, whatever the query | no | confirmed | unit test, 4 users; probe `?kind=personal` ignored |
| 5 | Old addresses redirect with their query | no | confirmed | `next.config.ts`; fetch: 307 with query, encoding kept |
| 6 | Redirects work for a workspace's admin | no | confirmed | before the layout; probe; `user-admin.e2e.ts` |
| 7 | Admin is root's: 404 for admins and owners | no | confirmed | `admin/layout.tsx`; probes |
| 8 | Admin nav item only for root | no | confirmed | `nav.ts`; AppShell test; probe |
| 9 | e2e uses the new pages | no | confirmed | 12 passed on chromium |
| 10 | Phone sweep uses the new pages | no | confirmed | 24 passed, 1 trace-file ENOENT under load; re-run 5 passed |

**Overall:** met. (An assertion on root's Kind filter was added after this pass.)

### Adversarial pass

Witnessed: 2026-10-11 12:18 EDT, by a fresh agent (adversarial). Commit: 792fc350 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component and nav tests pass | no | confirmed | 1215 unit passed; typecheck |
| 2 | Root's list with New workspace, Kind, links | no | confirmed | probe |
| 3 | Non-root can't reach every-workspace data by query | no | confirmed | probes as admin, owner, member; mutant fails 2 tests |
| 4 | Non-root's names link to pages | no | confirmed | unit and e2e |
| 5 | New workspace's action refused for non-root | no | confirmed | `requirePermission`; db tests 29 passed |
| 6 | Redirects keep query, no open redirect, no loop | no | confirmed | 307s; `%2F%2Fevil.com` stays same-origin; POST keeps method |
| 7 | Admin is root's, and a test catches it | no | partly | holds live, but reverting the layout fails no test |
| 8 | No Admin in the menu; no Workspaces in AdminNav | no | confirmed | tests; probe |
| 9 | Nav current item right on list, page, join, Requests, items | no | confirmed | probe; mutant fails AppShell test |
| 10 | Revalidation reaches the new pages | no | confirmed | actions; unit tests |
| 11 | Nothing left pointing at /admin/workspaces | no | confirmed | `git grep`; stale comments only |
| 12 | e2e and phone sweep use the new pages | no | confirmed | 30 + 25 passed |

**Overall:** not met: row 7. (Also noted: stale comments, and `pageWorkspaces` still open to workspace admins.)

### Adversarial re-check 1

Witnessed: 2026-10-11 12:26 EDT, by a fresh agent (adversarial). Commit: 792fc350 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | Admin is root's, and a test catches it | no | confirmed | two more subjects in `admin-users.test.tsx`; layout mutant now fails it |
| 3 | `pageWorkspaces` is root-only | no | confirmed | `requirePermission(…, "workspaces.manage")`; db tests 29 passed on SQLite, PostgreSQL, MySQL, MariaDB |
| 2 | Root's Kind filter has a test | no | confirmed | `admin-workspaces.test.tsx` |
| 11 | No stale "Admin › Workspaces" in code | no | confirmed | `git grep` |
| 1 | Nothing else broken | no | confirmed | 1215 unit passed; typecheck |
| 12 | e2e after the service change | no | confirmed | build; 21 passed |

**Overall:** met.

## Task 11 — Decision log

Witnessed: 2026-10-11 12:29 EDT, by a fresh agent (blind). Commit: 3abaf36e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §2 records the decision | no | confirmed | MVP.md:48-51 |
| 2 | The §15 Workspaces row records it | no | confirmed | MVP.md:915 |
| 3 | Matches the list page | no | confirmed | `workspaces/page.tsx:32-55` |
| 4 | Matches the workspace page | no | confirmed | `workspaces/[name]/page.tsx` |
| 5 | Matches the redirects | no | confirmed | `next.config.ts:32-33`; tests |
| 6 | Matches Admin being root's | no | confirmed | `admin/layout.tsx`; `nav.ts`; 71 tests passed |
| 7 | 090, 092, 093, 113, 114 say how to read their older text | no | confirmed | the "Since 115" note in each |
| 8 | Nothing else in MVP.md gives Admin to workspace admins | no | confirmed | grep |

**Overall:** met. (After this pass, §8's table gained a Workspaces row and 092's note names its superseded "Admins in Admin".)

## Task 12 — Documentation

Witnessed: 2026-10-11 12:31 EDT, by a fresh agent (blind). Commit: 3abaf36e (plus the uncommitted working tree); ronne-web 4325d75 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | ronne-web's checks pass | no | confirmed | `make check`: 138 tests, build |
| 2 | Helper link test passes and would catch a removed section | no | confirmed | 3 passed; `Help.test.tsx` checks every href |
| 3 | `admin#workspaces` gone from both `topics.ts`, ids match | no | confirmed | diffs; probe `IDENTICAL` |
| 4 | Nothing links to `admin#workspaces` | no | confirmed | greps in both repositories |
| 5 | Administration is root's, its Workspaces section gone, in en, pt, fr | no | confirmed | diffs; `admin/layout.tsx`, `nav.ts` |
| 6 | `workspaces#managing` describes the list | no | confirmed | en 427-434; `workspaces/page.tsx`, `WorkspacesTable.tsx` |
| 7 | It describes a workspace's page for everyone who sees it | no | confirmed | en 436-439; `[name]/page.tsx` |
| 8 | Options and tabs only for those allowed | no | confirmed | en 441-505; the page's `can(...)` gates |
| 9 | A scope's move shows under its description | no | confirmed | `ScopesTable note` |
| 10 | Old Admin addresses open these pages; Admin is root's | no | confirmed | `next.config.ts` |
| 11 | Personal, Members and roles, Joining name the workspace's page | no | confirmed | diff; no "Admin › Workspaces" left |
| 12 | pt and fr say what en says | no | confirmed | side by side |

**Overall:** met. (After this pass, the Requests bullet says the scope moves are root's and its admins', in all three languages; ronne-web 18e5dc2.)

## Task 13 — Shared and Personal as tabs

Witnessed: 2026-10-11 13:07 EDT, by a fresh agent (blind). Commit: e171d689 (plus the uncommitted working tree); ronne-web on docs/115-move-scopes (uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Kind select gone; Shared and Personal tabs above the list, current marked | no | confirmed | `KindTabs`; scratch render |
| 2 | Each tab counts what matches the search | no | confirmed | two counts in `pageWorkspaces`; db test |
| 3 | `global` counts in Shared when it matches | no | confirmed | probe with a fake repo |
| 4 | Capped counts show "+" | no | confirmed | scratch render; Shared + global could read cap + 1 |
| 5 | Switching keeps search and sort, starts at page one | no | confirmed | scratch render; `listUrl` |
| 6 | No Kind chip | no | confirmed | `hidden={["kind"]}` |
| 7 | Non-root never sees the tabs | no | confirmed | page branch; tests |
| 8 | Component tests cover tabs and counts | no | partly | search, page one and "+" untested |
| 9 | db tests cover the counts | no | confirmed | 17 passed |
| 10 | Docs say so in en, pt, fr and render | no | confirmed | `make check`; built HTML |
| 11 | 114's note mentions the tabs | no | confirmed | SPEC.md:5 |
| 12 | Types and lint | no | confirmed | one old unused import |

**Overall:** not met: row 8.

### Re-check 1

Witnessed: 2026-10-11 13:08 EDT, by a fresh agent (blind). Commit: e171d689 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | A capped Shared count stays at the cap | no | confirmed | probe: 1000 capped stays 1000 |
| 8 | Tests cover search kept, page one, "+" | no | confirmed | 54 passed; three mutations each fail one test |
| 12 | Types and lint, import gone | no | confirmed | `tsc`; `biome` clean |
| 9 | db tests | no | confirmed | 17 passed |

**Overall:** met.

## Task 14 — The Move dialog wraps, wider

Witnessed: 2026-10-11 13:05 EDT, by a fresh agent (blind). Commit: e171d689 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Dialog text wraps whatever surrounds its trigger | no | confirmed | `Dialog.tsx`; unit test; Dialog's fix alone passes move-scope |
| 2 | Move dialog 640px | no | confirmed | probe: 640 at 1280, full screen on phones |
| 3 | Row icons on one line | no | confirmed | probe with a 64-char scope name |
| 4 | e2e checks the dialog never scrolls sideways | no | confirmed | `noSideScroll`; 4 passed; only own width, not the typed step |
| 5 | e2e fails without the fix | no | confirmed | reverted: 4 failed at `noSideScroll` |
| 6 | Long names break; no sideways scroll at desktop and phone widths | no | not met | 64-char names with no hyphens: confirmation 1023>638 on desktop; select widens the form on phones |
| 7 | Other dialogs benefit | no | confirmed | fix is on `Dialog` |

**Overall:** not met: row 6.

### Re-check 1

Witnessed: 2026-10-11 13:30 EDT, by a fresh agent (blind). Commit: 1cf29536 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Text wraps, and a too-long word breaks | no | confirmed | `[overflow-wrap:anywhere]`; 151 unit tests |
| 2 | 640px wide | no | confirmed | `size="wide"` |
| 3 | Icons on one line and in view | no | confirmed | probe on desktop, Pixel 7, iPhone 15, tablet |
| 4 | No sideways scroll with 64-char names, no hyphens, every step and width | no | confirmed | probe on four projects at own width, 360, 320 |
| 5 | e2e checks it | no | confirmed | 64-char seeds; four steps; three widths; 4 passed |
| 6 | e2e fails without each fix | no | confirmed | each revert fails; the select's only in WebKit |
| 7 | Other dialogs benefit | no | confirmed | fix is on `Dialog` and `selectClasses` |

**Overall:** met. (A unit assertion on `overflow-wrap` was added after this pass.)

### Re-check 2

Witnessed: 2026-10-11 16:22 EDT, by a fresh agent (blind). Commit: c5d88dd2 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0; Linux WebKit in Playwright's container (aarch64; CI is x86_64).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | With the fix, the Move e2e passes in Linux WebKit (CI failed there) | no | confirmed | remote Playwright server; 3 passed |
| 2 | Without it, it fails there as in CI | no | confirmed | build with the containment CSS removed: 491>393 at `noSideScroll`; put back: passed |
| 3 | Passes on macOS WebKit and Chromium | no | confirmed | 4 passed |
| 4 | 640px wide | no | confirmed | `size="wide"` |
| 5 | Containment leaves other selects' layout as it was | no | confirmed | 9 selects on five projects, same sizes with and without |
| 6 | The focus ring isn't clipped | no | confirmed | same pixels outside the box with and without |
| 7 | Phone sweep, fields, dialogs | no | confirmed | 21 passed; 7 in Linux WebKit |
| 8 | Unit tests | no | confirmed | 2102 passed |
| 9 | Lint | no | confirmed | clean |

**Overall:** met.

## Task 15 — Admin › Scopes goes

Witnessed: 2026-10-11 14:17 EDT, by a fresh agent (blind). Commit: a9222644 (plus the uncommitted working tree); ronne-web on docs/115-move-scopes (uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The page is gone | no | confirmed | `git status`; `ls admin` |
| 2 | Nothing links to /admin/scopes | no | confirmed | grep: only the redirect's tests |
| 3 | AdminNav: Users, Audit log, Settings | no | confirmed | diff; test |
| 4 | Redirects, the filtered one first | no | confirmed | `next start` + curl: 307s |
| 5 | No open redirect | no | confirmed | same-origin; `..%2F..%2Fadmin` reached `/admin` |
| 6 | No workspace picker; scope goes in the page's workspace | no | confirmed | `InWorkspace`; test |
| 7 | No Workspace column or filter | no | confirmed | diffs; test |
| 8 | No dead code | no | not met | three unused imports |
| 9 | `workspace-choice` helper removed | no | confirmed | grep |
| 10 | Permissions unchanged | no | confirmed | empty diff |
| 11 | Root creates scopes on workspace pages | no | confirmed | 18 e2e passed |
| 12 | A workspace's admin creates one | no | confirmed | user-admin e2e |
| 13 | The owner creates one in their personal workspace | no | confirmed | three projects passed; phone failed on the new-draft page |
| 14 | Edit and move still there | no | confirmed | move-scope e2e |
| 15 | Unit tests cover redirects, dialog, table | no | confirmed | 742 passed |
| 16 | e2e create on a workspace's page, check redirects | no | confirmed | scopes.e2e |
| 17 | ronne-web docs | no | confirmed | `make check`; no "Admin › Scopes" |
| 18 | Older specs and MVP | no | confirmed | notes in nine SPECs; MVP.md:916 |
| 19 | Nothing mentions it as current | no | confirmed | history only |

**Overall:** not met: row 8. (Also: a stale "Admin in the menu" sentence for admins in ronne-web.)

### Re-check 1

Witnessed: 2026-10-11 14:40 EDT, by a fresh agent (blind). Commit: a9222644 (plus the uncommitted working tree); ronne-web (uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Redirects, filtered first | yes | confirmed | fresh build; curl; routes manifest |
| 5 | Only a workspace name reaches the path | yes | confirmed | `[a-z0-9-]+`; hostile values go to `/workspaces` |
| 8 | No dead code | yes | confirmed | `biome` clean |
| 13 | Owner creates a scope on every device | yes | confirmed | 26 e2e passed, phone included |
| 15 | Unit tests | yes | confirmed | 742 passed |
| 16 | e2e | yes | confirmed | scopes, drafts, user-admin |
| 17 | ronne-web docs, Admin root's | yes | confirmed | greps; `make check` |
| 2, 10 | No links; permissions unchanged | yes | confirmed | grep; empty diff |

**Overall:** met.

## Task 16 — Items name their workspace

Witnessed: 2026-10-11 15:10 EDT, by a fresh agent (blind). Commit: e38a0cdc (plus the uncommitted working tree); ronne-web on docs/115-move-scopes (uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Cards show the workspace, linked, and the scope, global too | no | confirmed | `ItemPlace` on `ItemCard`; catalogue test |
| 2 | Private: lock; personal: "(personal)" | no | confirmed | mutations fail tests |
| 3 | The item page shows the same line | no | confirmed | test for acme; probe for global and personal |
| 4 | `personalWorkspace` from `owner_id` | no | confirmed | both repositories; mutation fails a db test |
| 5 | db tests on SQLite | no | confirmed | 890 passed |
| 6 | db tests on PostgreSQL, MySQL, MariaDB | no | confirmed | 59 passed on each |
| 7 | Installs use the full name | no | confirmed | `formatItemName`; tests |
| 8 | `rmk` and MCP messages name both forms | no | confirmed | grep; 257 and 52 passed |
| 9 | Every app reference covers the workspace form | no | partly | CliAuthPanel, bundle template, two API errors |
| 10 | ronne-web Workspaces and Items topics | no | confirmed | diffs |
| 11 | Every ronne-web reference covers it | no | partly | export agent line, claude-code agent, `--to` |
| 12 | pt and fr match en | no | confirmed | diffs |
| 13 | ronne-web `make check` | no | confirmed | exit 0 |
| 14 | Phone tests close their contexts | no | confirmed | both files |
| 15 | e2e pass with the new line | no | confirmed | 31 passed |
| 16 | Lint, types, unit tests | no | confirmed | clean; 1211 passed |

**Overall:** not met: rows 9 and 11.

### Re-check 1

Witnessed: 2026-10-11 15:30 EDT, by a fresh agent (blind). Commit: e38a0cdc (plus the uncommitted working tree); ronne-web (uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The item page's line for global and personal items, with a test | no | confirmed | new test |
| 9 | Every app reference covers the workspace form | no | confirmed | diffs; grep leaves the command with its hint and an internal path list |
| 11 | Every ronne-web reference covers it | no | confirmed | diffs in en, pt, fr; grep |
| 13 | ronne-web `make check` | no | confirmed | exit 0 |
| 15 | e2e | no | confirmed | 38 passed |
| 16 | Lint, types, unit tests | no | confirmed | clean; 1212 passed |

**Overall:** met.
