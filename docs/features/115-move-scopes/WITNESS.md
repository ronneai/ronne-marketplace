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
