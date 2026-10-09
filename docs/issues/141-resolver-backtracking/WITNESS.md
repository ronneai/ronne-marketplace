# #141 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The failing tests

Witnessed: 2026-10-09 10:40 EDT, by a fresh agent (blind). Commit: df134ca. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.test.ts, SPEC.md, PLAN.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The resolver is unchanged in this task, so the tests run against the code on `main` | no | confirmed | `git diff HEAD --stat -- packages/core/src/resolve.ts` → nothing; only resolve.test.ts (+115, 0 removed), SPEC.md and PLAN.md changed |
| 2 | The issue's install case is encoded faithfully, and `^1.1.0` is the right request | yes | confirmed | resolve.test.ts:390-404 builds the Report's registry. Probe on today's code: `^1.0.0` → `{a:1.0.0}`, no conflict, so it can't reproduce the issue; `1.1.0` and `^1.1.0` → the Report's `resolve_conflict` "…(the request), 1.0.0 (@t/b@1.2.0)" |
| 3 | The `it.fails` install test fails on `main` with the conflict the spec describes | yes | confirmed | Scratch copy with `it.fails`→`it` → `ResolveError: No version of @t/a fits every range asking for it: ^1.1.0 (the request), 1.0.0 (@t/b@1.2.0).` (resolve.ts:299) |
| 4 | With a lock of A 1.1.0 + B 1.2.0, `it.fails` fails on `main` with the same conflict | yes | confirmed | The same run → the same `@t/a` conflict naming `@t/b@1.2.0` |
| 5 | With a lock of A 1.1.0 + B 1.1.0, a plain `it` passes today | yes | confirmed | resolve.test.ts:406-411 passes; probe → `{a:1.1.0, b:1.1.0}` (lock preference) |
| 6 | The two-exclusions test needs both exclusions, and fails on `main` for that reason | yes | confirmed | p@1.1.0 and q@1.1.0 each add `@t/z ^2` against the request's `^1`; scratch run → `No version of @t/z fits …: ^1 (the request), ^2 (@t/p@1.1.0), ^2 (@t/q@1.1.0).` (resolve.ts:237) |
| 7 | Spec edge case "two items both cause the conflict": it resolves when excluding **either** one works | no | partly | Only the "both needed" half is encoded; no registry where one exclusion is enough |
| 8 | An unsolvable conflict keeps today's code, message and details | yes | confirmed | `toEqual` on the full error; passes today; no solution exists with backtracking either (excluding b@1.0.0 leaves no B, excluding a@1.1.0 leaves no A in `^1.1.0`) |
| 9 | A registry built to explode stops with the first conflict within a test timeout | yes | confirmed | 40×40 versions, all wanting `z ^2`; asserts `resolve_conflict`, item `@t/z`, under 5 s. Passes today by design; proves its point only after task 2; asserted the code and item, not the full message |
| 10 | A missing item an older version would avoid is still reported (decision 4) | yes | confirmed | `item_not_found`, `details {item:'@t/gone', from:['@t/a@1.1.0']}`; plain `it`, passes |
| 11 | Every other test, old and new, passes | yes | confirmed | `pnpm --filter @ronneai/core test` → 38 files, 339 passed, 3 expected fail; the old "doesn't search older versions" test unchanged and passing |
| 12 | The commit would pass the code checks | yes | confirmed | `typecheck` clean; `biome check` on the test file → no fixes |

**Overall:** not met: the spec's "either one" half of the two-items edge case has no test (7).

### Re-check — the either case and the limit message

Witnessed: 2026-10-09 10:46 EDT, by a fresh agent (blind). Commit: df134ca. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.test.ts (+146), SPEC.md, PLAN.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | The new `it.fails` "resolves when setting either of two clashing versions aside is enough" encodes the "either" half and expects name order | no | confirmed | p@1.1.0 wants `z ^1.5` (only 1.6.0), q@1.1.0 wants `~1.2` (only 1.2.0), the request puts no range on z: either exclusion works alone; it expects `{p:1.0.0, q:1.1.0, x:1.0.0, z:1.2.0}`, @t/p first in name order |
| 14 | It fails on `main` for the stated reason | no | confirmed | Scratch `it.fails`→`it` → `No version of @t/z fits every range asking for it: ^1.5 (@t/p@1.1.0), ~1.2 (@t/q@1.1.0).` (resolve.ts:237); the other three still fail as rows 3, 4 and 6 |
| 15 | The limit test asserts the full first-try error | no | confirmed | `toEqual` with `resolve_conflict`, "No version of @t/z fits every range asking for it: ^1 (the request), ^2 (@t/p@1.39.0), ^2 (@t/q@1.39.0).", and the three ranges; passes today; keeps the < 5 s check |
| 16 | The core suite and code checks stay green | no | confirmed | `pnpm --filter @ronneai/core test` → 339 passed, 4 expected fail; typecheck clean; biome no fixes; resolve.ts unchanged |

**Overall:** met: the "either" case is encoded and fails on `main` with the spec's conflict, the limit test pins the first-try error exactly, and every other core test passes. Turning the `it.fails` into `it`, and the limit test proving its point, are checks for task 2.
