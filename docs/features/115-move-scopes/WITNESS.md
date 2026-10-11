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
