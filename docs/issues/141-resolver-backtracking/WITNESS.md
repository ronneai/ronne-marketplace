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

## Task 2 — Backtracking

Witnessed: 2026-10-09 10:46 EDT, by a fresh agent (blind). Commit: d5dcebf. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every test in `packages/core` passes, including task 1's; none left as `it.fails` | yes | confirmed | `pnpm --filter @ronneai/core test` → 343 passed, 0 expected-fail; no `it.fails`/`skip`/`todo`; typecheck and biome clean |
| 2 | The old "doesn't search older versions" test is turned around on the same registry | yes | confirmed | `git diff resolve.test.ts:212-229` → registry unchanged; expects `{a:1.1.0, b:1.0.0}` instead of `resolve_conflict` |
| 3 | The module comment and the "highest version that fits" rule are updated | yes | confirmed | resolve.ts:4-12 "falls back to older ones in range (#141) … fails only when no choice within the ranges works"; `bestOf`'s comment covers set-aside and locked versions |
| 4 | The first try is today's: whenever the old resolver succeeds, the result is identical | no | confirmed | Fuzz, d5dcebf vs working tree, ~30k random registries with yanked, deprecated and locks → 0 different results, 0 old-success-new-failure |
| 5 | When nothing works, the error is the first try's | yes | confirmed | Same fuzz → identical `{code,message,details}` whenever both fail; mutation "don't map LIMIT to `first`" → 1 test fails |
| 6 | Candidates are the chosen versions that added a losing range, never the request, in name order, exclusions adding up | yes | confirmed | `blame` drops `REQUESTED`, sorts by name; `new Set(excluded).add`; mutations "reverse order" and "don't accumulate" → 1 test fails each; a 30-exclusion chain resolves in 6 ms |
| 7 | It backtracks on a dependency's `no_matching_version`, not the request's | yes | confirmed | Probe → `{a:1.0.0, b:1.0.0}`; request `^3` → unchanged `no_matching_version`. No test: mutation "no blame for no_matching_version" → all pass |
| 8 | A missing item or tag never backtracks (decision 4) | no | confirmed | `blame` only on `resolve_conflict` and `no_matching_version`; `item_not_found` and `tag_not_found` probes report the asking version |
| 9 | A locked version set aside falls back to the newest version below it; a working lock is kept | yes | confirmed | Probe: lock b@1.2.0 conflicting, b@1.3.0 available → b@1.1.0. No test: mutation `return options[0]` → all pass |
| 10 | A yanked version is never a fallback unless locked; a pre-release only when a range names one | no | confirmed | Probes; fuzz → no unlocked yanked version in any result. No test: mutation "allow yanked after an exclusion" → all pass |
| 11 | Bounded: `MAX_STEPS` across attempts plus a limit on attempts, either reporting the first conflict | yes | confirmed | `MAX_ATTEMPTS = 500`, `steps` outside `attempt`; probes stop with the first-try error. Removing `MAX_ATTEMPTS` → still passes (`MAX_STEPS` stops the explode test) |
| 12 | Deterministic; warnings from the final versions | no | confirmed | Reverse key order → 1 distinct result; fuzz → warnings equal the final versions' deprecations |

**Overall:** met: backtracking works and is bounded, the first try is identical to today on ~30k random registries, failures keep the first try's exact error, and every core test passes. Gaps: no tests pin the `no_matching_version` fallback, the below-lock rule, the yanked rule or the attempts limit; a first try that "keeps changing" isn't searched (as today).

### Re-check — after the gap tests

Witnessed: 2026-10-09 11:15 EDT, by a fresh agent (blind). Commit: d42fedc. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md (d42fedc adds only an unrelated QueueTable.tsx commit on top of d5dcebf).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | Every test in `packages/core` passes | no | confirmed | 349 passed; typecheck and biome clean |
| 14 | The `no_matching_version` fallback is tested | no | confirmed | Mutation "no blame for no_matching_version" → 2 fail |
| 15 | The below-lock rule is tested | no | confirmed | Removing `if (below) return below;` → "tries the newest version below a locked one…" fails |
| 16 | A yanked version is never a fallback, and that's tested | no | confirmed | Mutation allowing yanked after an exclusion → "never falls back to a yanked version" fails |
| 17 | The attempts limit (and `MAX_CHECKS`) is observable in a test | no | partly | Removing `MAX_ATTEMPTS`, `MAX_CHECKS` or both → 33/33 pass: `MAX_STEPS` still stops the run |
| 18 | The spec's edge case for a first try that keeps changing gives the right reason | no | partly | The behaviour holds, but the case found has no self-dependency, only cycles across several items (allowed since 112) |
| 19 | The first try is still identical to d5dcebf's after `newestFirst` and the cached missing items | no | confirmed | Fuzz, 24k registries → 0 different results, 0 different errors |
| 20 | A registry read that fails while versions are set aside fails the install with that error | no | confirmed | Rethrows non-`ResolveError`; mutation "swallow non-LIMIT errors" → 1 fails |
| 21 | Each item, missing ones too, is read once | no | confirmed | `load` caches `null`; mutation removing it → "reads a missing item once…" fails |

**Overall:** not met: no test would notice the limits going (17), and the new edge case's reason is wrong (18).

### Re-check — the single budget and the edge case

Witnessed: 2026-10-09 11:19 EDT, by a fresh agent (blind). Commit: d42fedc. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md, PLAN.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 22 | Every test in `packages/core` passes | no | confirmed | 349 passed; typecheck and biome clean |
| 23 | `MAX_ATTEMPTS` is gone; `MAX_CHECKS` is the only extra limit, only while versions are set aside | no | confirmed | `grep` → only `MAX_CHECKS = 200_000` and its check gated on `excluded.size > 0` |
| 24 | The big-registry test passes as is and fails without the budget | no | confirmed | As is → 33/33 in 449 ms; throw deleted → "stays quick on items with thousands of versions…" 53,978 ms, fails |
| 25 | The budget keeps the first try's error | no | confirmed | `toEqual` on the full first-try error passes |
| 26 | "Every attempt checks at least one version, so it also bounds the attempts" (comment, SPEC) | no | partly | A set-aside version costs no check: an attempt with `@t/a@1.0.0` set aside did 0 checks. Attempts are still bounded by `MAX_STEPS` |
| 27 | The edge case: the "keep changing" first try blames nothing, seen only with items that need each other across three or more items | no | confirmed | Fuzz → identical to d5dcebf; the only miss is that error on a 3-item cycle with no self-dependency |
| 28 | PLAN task 2's limit line matches the code | no | confirmed | Matches, with the same caveat as row 26 |

**Overall:** not met: the comment and spec say every attempt checks a version (26).

### Re-check — the bound's wording

Witnessed: 2026-10-09 11:26 EDT, by a fresh agent (blind). Commit: d42fedc. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md, PLAN.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 29 | `MAX_STEPS` bounds the attempts, since each takes a step | no | confirmed | Instrumented run: 14,651 attempts with versions set aside, at least 1 step each |
| 30 | The budget counts range checks, only while versions are set aside | no | confirmed | `Math.max(1, ranges.length)` per version; deleting the throw → 2 tests fail (52,336 ms and 11,493 ms) |
| 31 | SPEC "Bounded" reads as the code behaves | no | confirmed | Rows 29–30, and row 21 for the reads |
| 32 | PLAN task 2's limit line reads as the code behaves | no | confirmed | Matches resolve.ts:224 and :244-245 |
| 33 | Every test in `packages/core` passes | no | confirmed | 350 passed; typecheck clean |
| 34 | The change passes lint | no | not met | `biome check` → `resolve.ts:224:35 lint/suspicious/noAssignInExpressions` |

**Overall:** not met: the wording matches the code, but the budget line fails lint (34).

### Re-check — the lint fix

Witnessed: 2026-10-09 11:28 EDT, by a fresh agent (blind). Commit: d42fedc. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md, PLAN.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 35 | The budget line no longer assigns inside a condition | no | confirmed | resolve.ts:224-227 is an `if (excluded.size > 0) { … }` block |
| 36 | `biome check` passes on resolve.ts and resolve.test.ts | no | confirmed | "Checked 2 files … No fixes applied." |
| 37 | Every test in `packages/core` passes, and it type-checks | no | confirmed | 350 passed; `tsc --noEmit` clean |
| 38 | The rewrite still enforces the budget | no | confirmed | Throw deleted in a scratch copy → 2 tests fail (52,495 ms and 11,391 ms) |

**Overall:** met: the lint error is fixed, Biome is clean, the core suite passes, and the budget still bites.

Witnessed: 2026-10-09 11:11 EDT, by a fresh agent (adversarial). Commit: d5dcebf. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every test in `packages/core` passes, task 1's tests now `it` | yes | confirmed | 343 passed; no `it.fails`; typecheck and biome clean |
| 2 | The module comment states the new rule | yes | confirmed | resolve.ts:4-11 |
| 3 | The old test now resolves to the older version; no other existing test changed | yes | confirmed | `git diff` → the renamed test, the four `it.fails`→`it`, a removed comment; the six "(112)" tests untouched and passing |
| 4 | A request that resolved before resolves the same; failures give the same error | no | confirmed | Differential against d5dcebf, 120k registries (cycles, self-deps, yanked, locks, tags, pre-releases, missing items) → 0 different results; 5.4k old failures now resolve; 0 different errors |
| 5 | Deterministic whatever the key order | no | confirmed | Same 120k with keys shuffled → 0 differences |
| 6 | Sound: every chosen version fits every live range, is reachable, not yanked unless locked | no | confirmed | semver check of every new success → 0 violations |
| 7 | It fails only when no choice in range works | no | confirmed | Brute force, 20k registries (≤5 items × ≤4 versions) → 0 misses without self-dependencies. Corrected later (row 25): with ≤6 items, a first try that keeps changing misses solutions on 3-item cycles too |
| 8 | Blamed chosen versions set aside in name order, never the request, adding up | yes | confirmed | Mutations "reverse" → 1 fails; "no loop" → 5 fail; a chained re-conflict backtracks twice |
| 9 | An excluded locked version falls back to the newest below it | yes | confirmed | Probe → b 1.1.0; no test (mutation survived) |
| 10 | A yanked version is never a fallback unless locked | no | confirmed | Probes |
| 11 | A missing item or tag never backtracks | no | confirmed | Probes; the differential gives the same error on every missing-item case |
| 12 | When nothing works, the error is the first attempt's, also after a limit | yes | confirmed | Exact-pin case JSON-equal to old; limit cases → the old error |
| 13 | A registry read failure during the search is never swallowed | no | confirmed | Probes → the same Error object; no test (mutation survived) |
| 14 | Bounded, can't run for long | yes | partly | O(V²) per step in `bestOf`: 1000 / 5000 / 20000 versions → 2.6 s / 45 s / 571 s (old 12 ms / 0.2 s / 2.2 s) |
| 15 | Each item is read once | no | partly | A missing item (`null`) wasn't cached: read twice in 14 of 120k cases |
| 16 | The 112 cycle behaviour holds | no | confirmed | The "(112)" tests pass; random cycles identical to old |
| 17 | Every caller gets it at once | no | confirmed | `apps/web/…/items/services/resolve.ts` only wraps `resolve()` |

**Overall:** not met: the behaviour is right, but the search slows sharply with many versions (14) and a missing item is read more than once (15).

### Re-check — adversarial, after the speed and read fixes

Witnessed: 2026-10-09 11:23 EDT, by a fresh agent (adversarial). Commit: d42fedc. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md, PLAN.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 18 | The core suite and code checks pass | yes | confirmed | 349 passed; typecheck and biome clean |
| 19 | Successes and errors still identical to d5dcebf | no | confirmed | 120k registries → 0 different results or errors; rescued counts unchanged |
| 20 | Each item, missing ones too, is read once | no | confirmed | `gone` probe → read once; 0 multiple reads in 120k |
| 21 | Versions sorted once; `bestOf` walks them newest first | no | confirmed | `newestFirst` WeakMap; 20,000 versions → 232 ms (571 s before) |
| 22 | The below-lock and read-failure rules are pinned by tests | no | confirmed | Their mutations now fail tests |
| 23 | A budget keeps any registry from running long | no | partly | It counted versions, not range checks: 100–500 items asking one item → 10.7–55.4 s (old 0.33–4.0 s) |
| 24 | A read that fails while versions are set aside fails the install with that error | no | confirmed | Probes and the suite test |
| 25 | A first try that keeps changing blames nothing, even where older versions would work | no | confirmed | 2 cases with 3-item cycles, no self-dependency; matches the spec's edge case; corrects row 7 |
| 26 | "Every attempt checks at least one version" | no | partly | False: an attempt can check none; still bounded by `MAX_STEPS` |

**Overall:** not met: the check budget doesn't bound time when many items ask for one (23), and the bound's premise is wrong (26).

### Re-check — adversarial, the budget pinned

Witnessed: 2026-10-09 11:23 EDT, by a fresh agent (adversarial). Commit: d42fedc. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md, PLAN.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 27 | The rebuilt 20,000-version test passes, asserting the full first-try error | no | confirmed | 368 ms; `toEqual` on code, message and details |
| 28 | Deleting the `MAX_CHECKS` throw makes it fail | no | confirmed | → 52,197 ms, fails |
| 29 | A short differential against d5dcebf on the final file | no | confirmed | 120k registries → 0 differences in results or errors, 0 unsound, 0 multiple reads |

**Overall:** met: the budget is pinned and the file matches d5dcebf wherever the old one resolved. Rows 23 and 26 remained open.

### Re-check — adversarial, range checks and the bound's wording

Witnessed: 2026-10-09 11:27 EDT, by a fresh agent (adversarial). Commit: d42fedc. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md, PLAN.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 30 | The core suite passes, with the many-askers test | no | confirmed | 350 passed |
| 31 | The change passes `pnpm lint` | no | not met | `noAssignInExpressions` at resolve.ts:224 |
| 32 | The budget counts range checks, so many askers can't run long | no | confirmed | N=100/300/500 → 454 / 1159 / 4391 ms (old 359 / 1016 / 4282 ms) |
| 33 | The new test fails when checks count +1 per version | no | confirmed | → 11,543 ms, fails |
| 34 | The tighter budget changes no result | no | confirmed | 120k registries → 0 differences; rescued counts equal |
| 35 | The comment above `MAX_CHECKS` reads as the code behaves | no | confirmed | `MAX_STEPS` bounds the attempts; a zero-check attempt still takes a step |
| 36 | SPEC "Bounded" and PLAN task 2 read as the code behaves | no | confirmed | Match resolve.ts:224 and :244-249 |

**Overall:** not met: everything holds except lint (31).

### Re-check — adversarial, the lint fix

Witnessed: 2026-10-09 11:28 EDT, by a fresh agent (adversarial). Commit: d42fedc. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md, PLAN.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 37 | The budget line is the lint-clean form and behaves the same | no | confirmed | The only change is resolve.ts:224-227; same logic |
| 38 | `biome check` passes on resolve.ts and resolve.test.ts | no | confirmed | "No fixes applied", no errors |
| 39 | The core suite and typecheck pass | no | confirmed | 350 passed; typecheck clean |
| 40 | The +1-per-version mutation still fails the many-askers test | no | confirmed | → 11,351 ms, fails |

**Overall:** met: the budget line passes Biome, the suite and typecheck are green, and the many-askers test still catches a budget that counts versions.

### Re-check — missing items before a fallback

Witnessed: 2026-10-09 11:48 EDT, by a fresh agent (blind). Commit: 3c6955f. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 39 | Before anything is set aside, every item the first try was asked for is read, and a missing one is the error, naming who asked | no | confirmed | resolve.ts:432-434: in `search`, only when `excluded.size === 0`, each of `found.asked` is loaded before the loop; `asked` is built in `blame` from the attempt's `constraints`, sorted, non-empty lists only; all three `blame` calls pass `constraints`; `load` caches the missing item |
| 40 | The new test "reports a missing item the first try asked for…" passes, and fails without the fix | no | confirmed | As is → 35/35; read-ahead deleted → 1 failed; it pins `item_not_found`, "@t/z isn't a published item (asked for by @t/a@2.0.0)." |
| 41 | The error differs from today's only when a first try hit a conflict and also asked for a missing item | no | confirmed | Fuzz with `@t/gone` in 8% of versions, d5dcebf vs working tree, seeds 1–3 × 4000 → 0 different successes; every changed error is a conflict or `no_matching_version` becoming `item_not_found` for `@t/gone` |
| 42 | `pnpm --filter @ronneai/core test` passes; lint and typecheck clean | no | confirmed | 351 passed; `tsc --noEmit` clean; biome no fixes |
| 43 | SPEC Behaviour and decision 4 read as the code behaves | no | confirmed | Both match rows 39-41 |

**Overall:** met. Remarks: "asked for" means still asked for when the first try stopped; a missing item on a fallback path ends that path, as decision 4 says (both now in the spec).

### Re-check — the read-ahead's gate

Witnessed: 2026-10-09 11:53 EDT, by a fresh agent (blind). Commit: 3c6955f. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 44 | The read-ahead runs only on the first try, and only when there is a version to set aside | no | confirmed | resolve.ts:434-435 `if (excluded.size === 0 && found.versions.length > 0)` before the loop |
| 45 | "keeps today's error when only the request's range fails" passes, and fails without the gate | no | confirmed | As is → 36/36; gate removed → 1 failed; read-ahead removed → only "reports a missing item…" fails |
| 46 | Outside the gated case, results and errors are unchanged | no | confirmed | Fuzz, seeds 1–2 × 4000, with and without missing items → 0 different successes; every changed error becomes `item_not_found` for `@t/gone`; without missing items nothing changes |
| 47 | Core suite, lint and typecheck pass | no | confirmed | 352 passed; clean |
| 48 | SPEC Behaviour, decision 4 and Scope → Out read as the code behaves | no | confirmed | All match; nit: decision 4's last sentence left out "had a version to set aside" (reworded since) |

**Overall:** met: the read-ahead is gated, pinned by a test, and the spec matches the code.

### Re-check — adversarial, missing items before a fallback

Witnessed: 2026-10-09 11:51 EDT, by a fresh agent (adversarial). Commit: 3c6955f. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 41 | The base holds the last-checked resolver; suite and checks pass | no | confirmed | `git show 3c6955f:…/resolve.ts` equals the row-40 copy; 351 passed; clean |
| 42 | Every request that resolved under d5dcebf resolves identically | no | confirmed | 60k registries → 12,648 successes, 0 different; 60k with missing items possible → 12,408, 0 different |
| 43 | Errors differ only when a first try hit a conflict and also asked for a missing item | no | partly | 347 differences, all `item_not_found`; 108 were a `no_matching_version` blamed only on the request, so nothing could be set aside, yet the read-ahead ran (probe D) |
| 44 | Rescues lost to the new rule are exactly the missing-item cases | no | confirmed | 20 of 2,599 (92 of 2,333 with missing items everywhere), all among the classified differences |
| 45 | The new test fails without the read-ahead | no | confirmed | → 1 failed, 34 passed |
| 46 | The SPEC says honestly what happens to a missing item reached only after a fallback | no | partly | Scope → Out said it "stays an error, as today"; probes A, B and B2 show such a path just ends: another way resolves, or the first error doesn't name it, and older versions past it aren't tried |
| 47 | Each item, missing ones too, is still read once | no | confirmed | `[["@t/gone",1]]`; the read-once test passes |
| 48 | The timings still hold | no | confirmed | wide30×30 143 ms, deep300 43 ms, many1000/5000/20000 582/700/811 ms; many askers N=100/300/500 → 410/1030/4018 ms |

**Overall:** not met: the read-ahead ran when nothing could be set aside (43), and the spec overstated what happens after a fallback (46).

### Re-check — adversarial, the read-ahead's gate and the spec

Witnessed: 2026-10-09 11:54 EDT, by a fresh agent (adversarial). Commit: 3c6955f. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: resolve.ts, resolve.test.ts, SPEC.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 49 | The suite, typecheck and lint pass | no | confirmed | 352 passed; clean |
| 50 | The read-ahead runs only when the first try has a version to set aside | no | confirmed | resolve.ts:434-435; probe D → today's "@t/b has no published version that fits ^2 (the request)" |
| 51 | The new test pins the gate | no | confirmed | Gate removed → "keeps today's error…" fails |
| 52 | Every changed error is a first try that had a version to set aside and asked for a missing item | no | confirmed | 60k registries → 0 different successes; 239 changed errors, all `item_not_found` (208 from `no_matching_version`, 31 from `resolve_conflict`), 0 request-only; with missing items everywhere: 754 changed, 0 request-only, 0 unexpected |
| 53 | Scope → Out describes a missing item reached only on a fallback path | no | confirmed | Probes A (resolves through q), B (first error, not naming it), B2 (an older working version not tried) match the text |
| 54 | Decision 4 and Behaviour say "still asked for when it stopped" and "nothing read ahead when nothing can be set aside" | no | confirmed | Both match rows 50 and 52; nit: decision 4's last sentence said "hit a conflict" where most changes are a version-blamed `no_matching_version` (reworded since) |

**Overall:** met: the read-ahead is gated and pinned, every changed error is the case decision 4 describes, successes are unchanged against d5dcebf, and the spec describes missing items after a fallback as the probes show.

## Task 3 — The callers

Witnessed: 2026-10-09 11:41 EDT, by a fresh agent (blind). Commit: 811e178. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: apps/web/e2e/seed.ts, users.ts, rmk-fallback.e2e.ts, registry-api.db.test.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No caller changed: the CLI, the MCP server, the resolve service and the route are untouched | yes | confirmed | `git diff --stat d5dcebf HEAD -- apps/web/src/server packages/cli packages/mcp` → empty; the working-tree diff touches only tests and the e2e seed |
| 2 | `rmk install` and `rmk update` get backtracking through `resolve()` with no change | yes | confirmed | `packages/cli/src/install.ts:268` posts to `/resolve`; `operations.ts:78,112,135` use `prepareInstall`; the route → `postResolve` → `services/resolve.ts:46` calls core `resolve()` |
| 3 | The MCP server gets it with no change | yes | confirmed | `packages/mcp/src/plan-tools.ts:1-16` imports `planOperation` from `@ronneai/rmk/lib` (the same `prepareInstall`); `pnpm --filter @ronneai/mcp test` → 43 passed |
| 4 | `POST /api/v1/resolve` returns the backtracked resolution, for an install and an update from a lock with B 1.2.0 | yes | confirmed | `vitest run --project db src/server/http/registry-api.db.test.ts` → 16 passed; also on PostgreSQL 15, MySQL 8.4 and MariaDB 10.11 → 16 passed each |
| 5 | The API test catches the issue | no | confirmed | With d5dcebf's `resolve.ts` in a scratch copy → `× falls back … (#141)`, `expected 409 to be 200`; with the current one → 16 passed |
| 6 | An `rmk` command test covers the issue: install gives A 1.1.0 + B 1.1.0, and `rmk update` keeps both | yes | confirmed | `npx playwright test e2e/rmk-fallback.e2e.ts` → 1 passed, running `packages/cli/dist/bin.js` against the seeded instance and reading `rmk.lock`; the old resolver on this seed's registry gives `resolve_conflict … 1.1.0 (the request), 1.0.0 (@s/fallback-b@1.2.0)` (a probe; the old server wasn't rebuilt) |
| 7 | The new seed data and user break no other e2e test | no | confirmed | Full `npx playwright test` → 115 passed; the new test uses its own user, `versionFallback` |
| 8 | The CLI, web and core tests for install, update and resolve pass | yes | confirmed | `pnpm --filter @ronneai/rmk test` → 233 passed; the db project on `private-api` and `registry-api` → 20 passed; `pnpm --filter @ronneai/core test` → 350 passed |
| 9 | `dependencyIssues`' cycle walk still matches the resolver for what Submit refuses; Submit doesn't predict conflicts | yes | confirmed | `registry-checks.ts` unchanged since 112; its errors (a missing item, a range with no non-yanked version, a private workspace) are ones the resolver can't backtrack past at the request level; the walk follows each range's highest match, the resolver's first try, and only feeds the `dependency_cycle` warning, which Submit doesn't refuse |

**Overall:** met: every caller goes through core `resolve()` unchanged; the API test and the `rmk` end-to-end test cover the issue's install and update; the API test fails against d5dcebf's resolver; the CLI, MCP, database (all three servers) and full e2e suites pass. The `rmk` scenario is an e2e test: the CLI's own unit tests use a canned `POST /resolve`, so only `pnpm test:e2e` covers it through `rmk`. Remarks fixed before ticking: a misplaced comment in `users.ts`, and a stale SPEC line about cycles.

### Re-check — the comment and the spec's cycles line

Witnessed: 2026-10-09 11:41 EDT, by a fresh agent (blind). Commit: 811e178. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: as above, plus SPEC.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | `users.ts`: `E2E_FALLBACK_ITEMS` has its own comment; `E2E_RMK_ITEMS` has its comment back | no | confirmed | `users.ts:261-267`; `biome check` on the e2e files → no issues |
| 11 | SPEC "How cycles resolve": the 112 rules run unchanged in every attempt | no | confirmed | `attempt` holds `switches`, `settle`, the back-and-forth rule and the prune loop, reset per attempt; only `steps` is shared; vs d5dcebf only the `blame(...)` wrapping changed; `-t "112"` → 6 passed |
| 12 | Submit warns about a cycle (`dependency_cycle`) and doesn't refuse it | no | confirmed | `registry-checks.ts:334-350` returns `warning("dependency_cycle", …)`; its comment at 131-135 says the same |

**Overall:** met: the comments sit on their own constants, and the spec's cycles line matches `resolve.ts` and `registry-checks.ts`.
