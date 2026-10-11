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
