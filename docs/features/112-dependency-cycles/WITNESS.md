# 112 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The decisions

Witnessed: 2026-10-08 17:22 EDT, by a fresh agent (blind). Commit: 7242390. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: MVP.md, manifest.md, 056 SPEC.md, item-types.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §3.1 says cycles are allowed and go together; a self-dependency is still refused | yes | confirmed | `docs/MVP/MVP.md:111-113` → "an item can't depend on itself. Items may need each other (a cycle, allowed since 112…): they're submitted, released and installed together (§4.1, §4.3)" |
| 2 | MVP §4.1 says an item is submitted with the author's own drafts and released with its unreleased dependencies, all or none | yes | confirmed | `MVP.md:311-322` → new "Submitted and released together" bullet: one transaction each, another author's items excluded (089), each member still approved on its own; matches SPEC "The group" and Open questions |
| 3 | MVP §4.3 no longer says cycles are rejected; says they're allowed and installed together, self-dependency refused | yes | confirmed | `git diff` → "Cycles are rejected…" removed; `MVP.md:359-362` → "Cycles are allowed… An item can't depend on itself", plus the SPEC's reachability rule |
| 4 | MVP §4.2 records one transaction per release group (Decision 3) | yes | confirmed | `MVP.md:341-342` → "every artifact is packed and stored first, then all the versions are recorded in one transaction" |
| 5 | §15 "Resolver" and "Dependencies between types" rows updated | yes | confirmed | `MVP.md:885` → "conflicts fail; cycles resolve, one version each, since 112 (they failed until 2026-10-08)"; `MVP.md:887` → "self-dependencies are refused, and cycles are allowed since 112" |
| 6 | §15 records Decisions 1 and 2 (owner, 2026-10-08) | yes | confirmed | `MVP.md:888` → new row "Submitted and released together" covers both, with owner, date, rationale and what it replaces; one combined row. `MVP.md:917` ("Dependencies on export") updated too |
| 7 | Manifest spec §3 says cycles are allowed and go together; self-dependency still refused | yes | confirmed | `docs/spec/manifest.md:173-176`; §6 `manifest.md:218-220` "no cycles" → "a cycle is a warning, not an error (112)" |
| 8 | No doc in docs/MVP or docs/spec says cycles are refused | yes | confirmed | `grep -rniE "cycle\|circle\|circular\|go round" docs/MVP docs/spec` (excluding lifecycle) → only the new "allowed" or "until 2026-10-08" lines |
| 9 | No doc in docs/MVP or docs/spec says an own dependency goes first, and nothing contradicts "together" | yes | partly | No "first/before" wording left, but `MVP.md:647` (§11) still said `POST /drafts/submit` submits each draft "each on its own", against §4.1's groups (`MVP.md:319`) and the SPEC |
| 10 | `item-types.ts` comment updated and accurate | yes | confirmed | `packages/core/src/item-types.ts:23-26`; `grep self_dependency` → only `package-checks.ts:335`; `biome check` clean; `pnpm --filter @ronneai/core typecheck` passes |
| 11 | 056's spec notes that 112 replaces "first" with "together" for the author's own items | yes | confirmed | `docs/features/056-pending-dependencies/SPEC.md:3-4` |
| 12 | Links and anchors in the changed docs resolve | yes | confirmed | Scratchpad probe (relative paths + GitHub heading slugs) over MVP.md, manifest.md, 056 and 112 specs → "checked 151 bad 0"; a planted bad anchor was caught |
| 13 | Repository record checks still pass | no | confirmed | `pnpm witness:check` → clean |

**Overall:** not met: every listed place says cycles are allowed and items go together, with self-dependency still refused, but MVP §11's `POST /drafts/submit` row still says "each on its own".

### Re-check — claim 9

Witnessed: 2026-10-08 17:23 EDT, by a fresh agent (blind). Commit: 7242390. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff as above, with §11's two rows fixed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | No doc in docs/MVP or docs/spec says an own dependency goes first or that drafts are submitted each on its own, and nothing contradicts "together" | yes | confirmed | `MVP.md:646` `POST /drafts/check` → "…with the group it goes with… (M7, 052, 112)"; `MVP.md:647` `POST /drafts/submit` → "Submit those drafts in their groups…, each group all or none". `grep -rniE "each on its own\|one at a time\|separately\|go(es)? first\|before (its\|their) dependent" docs/MVP docs/spec` → nothing outside `MVP.md:888`'s historical "Until then"; the link probe again → "checked 152 bad 0" |

**Overall:** met: every claim of task 1 is confirmed in its latest pass.

## Task 2 — Core: the resolver and the order

Witnessed: 2026-10-08 17:33 EDT, by a fresh agent (blind). Commit: 088fe0a. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: core resolve/order and tests, registry-api, plugin-feed, bulk-release.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The resolver's final cycle walk is gone, and `dependency_cycle` is no longer in `ResolveErrorCode` | yes | confirmed | `resolve.ts:55-59`: item_not_found, tag_not_found, no_matching_version, resolve_conflict. `git grep dependency_cycle packages apps` → only the submit checks (task 3) |
| 2 | A ↔ B resolves to one version of each, both installed, from either side | yes | confirmed | "installs items that need each other…" passes; with HEAD's resolve.ts in a scratch copy it fails (dependency_cycle). Probe: request {a} → a 1.0.0, b 1.0.0 |
| 3 | A cycle of three, and two cycles joined by a plain dependency, resolve | yes | confirmed | The core test → all 5 at 1.0.0; a ring of 200 resolves |
| 4 | Only what the requests reach is kept: a pair is dropped once nothing reaches it | yes | confirmed | Mutating the prune loop to a bare `break;` → "drops a pair…" fails (1 failed / 16); the dropped pair's range on a reached item is released |
| 5 | Edge case "an install that asks for A only" | yes | confirmed | A↔B plus an unrelated C, request {A} → A and B only |
| 6 | Edge case "`rmk remove A`": B stays only if something still asks for it | yes | confirmed | Request {C} → C only; request {D}, D needs B → A, B, D |
| 7 | `dependenciesFirst` returns every item, dependencies first, with `groups` for cycles | yes | confirmed | `order.ts` returns `{ order, groups }` (Tarjan); `groups: []` mutation → 2 of 3 order tests fail; no placement → 3 of 3 |
| 8 | The tests that asserted refusal now assert the new rule | yes | confirmed | `git diff`: "refuses a dependency cycle" → "installs items that need each other…"; "reports a cycle instead of an order" → the cycle-of-three test |
| 9 | Registry API: no 409 for `dependency_cycle`; POST /resolve answers 200 for a cycle | yes | confirmed | `registry-api.ts:181-186`; "resolves items that need each other" passes on SQLite and `pnpm test:db:postgres`/`:mysql`/`:mariadb` (15/15 each); fails with HEAD's resolver |
| 10 | A plugin whose members form a cycle lists them all | yes | confirmed | "builds a plugin with items that need each other" passes on the four databases (26/26 each); fails with HEAD's order.ts (`PluginNotFoundError`) |
| 11 | `bulk-release.ts` no longer reads `cycle` | yes | confirmed | `bulk-release.ts:175-177`; no other callers of `dependenciesFirst`; no resolver cycle code in the CLI or MCP |
| 12 | Every suite, typecheck and lint pass | yes | confirmed | `pnpm test` → 8/8; `pnpm typecheck` → 7/7; `pnpm lint` → exit 0 |

**Overall:** met: the resolver and the order accept cycles, keep only what the requests reach, and the API and plugin feed work with a cycle on all four databases. Remark: `dependenciesFirst` recursed (a 20,000-item chain overflowed), as the old code did.

### Re-check after the adversarial pass's resolver fixes

Witnessed: 2026-10-08 17:44 EDT, by a fresh agent (blind). Commit: 088fe0a. Machine: macOS 27.0.1, Node v24.0.0. resolve.ts with `liveSources()`, the two-switches rule and the final range check; 3 new tests.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | A ↔ B resolves to one version of each, both installed, from either side | yes | confirmed | Core → 334 passed; probe → a, b at 1.0.0; a lockfile pinning both → kept |
| 3 | Cycles of three and joined cycles resolve | yes | confirmed | Ring of 200 resolves. Fuzz, 4,000 random cyclic registries (`scratchpad/fuzz.mjs`, 2 seeds): every success valid (bad 0); shuffled request and version order → nondet 0 |
| 4 | Only what the requests reach is kept | yes | confirmed | Prune loop → bare `break;` → "drops a pair…" and "stops going back and forth…" fail; removing the final check → "still reports a conflict a cycle really causes" fails; disabling the two-switches rule → "stops going back and forth" fails; fuzz: 0 unreached items in any result |
| 5 | Edge case "an install that asks for A only" | yes | confirmed | As before |
| 6 | Edge case "`rmk remove A`" | yes | confirmed | As before |
| 12 | Every suite, typecheck and lint pass | yes | confirmed | `pnpm test` → 8/8 (core 334); typecheck 7/7; lint exit 0; registry-api and plugin-feed db tests on postgres, mysql, mariadb → 41/41 each |

**Overall:** met. Against HEAD's resolver (6,000 cases per seed): acyclic results identical; no cyclic case went from resolved to refused; the ~935 per seed refused only as a cycle now resolve. Not this change: in ~455 of 4,000 random cases the greedy resolver refuses although an answer exists (no backtracking, issue #141), as at HEAD.

### Adversarial — Task 2

Witnessed: 2026-10-08 17:37 EDT, by a fresh agent (adversarial). Commit: 088fe0a. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `resolve()` accepts cycles and picks one version per item | yes | confirmed | a→b→c→a with c→d, d↔e: each of a–e requested → all five at 1.0.0; a 9000-item ring in 48 ms; POST /resolve A ↔ B on the four databases |
| 2 | The same answer whatever cycle member is requested and whatever the request's order | yes | partly | Request order holds. Which member is requested changes the answer: a 1.1.0→b ~1.0.0, b 1.1.0→a 1.0.0 → `{a:*}` gives a 1.1.0, b 1.0.0; `{b:*}` gives a 1.0.0, b 1.1.0. Both valid |
| 3 | Items no request reaches are dropped, with the ranges they put on others | yes | not met | P1 (a 2.0.0→p ^1, p→q ^1, q 1.0.0→p ^1, q 2.0.0, z→a <2 and q ^2; request a, z) → `resolve_conflict` on q, though a 1, z 1, q 2 is valid; with only q 1.0.0, `no_matching_version` blaming the unreached p |
| 4 | Never loops forever | yes | partly | Always stops, but P5 (root 2.0.0→x, x→y, y→x and root ^1; request root) → "The dependencies keep changing each other's versions." though root 1.0.0 alone is valid |
| 5 | Never drops an item a request reaches | yes | confirmed | `reach` walks from every request; no probe lost a reached item |
| 6 | Conflicts and missing items, tags, versions reported as before | yes | confirmed | Core → 331 passed; `registry-api.db.test.ts` conflicts test on the four databases |
| 7 | `dependency_cycle` gone from `ResolveErrorCode` and the API status map | yes | confirmed | `resolve.ts:56-60`; `registry-api.ts:181-186`; `git grep dependency_cycle -- packages` → none |
| 8 | `dependenciesFirst` returns every item once, each after what it needs in the batch | yes | partly | Correct on small batches; a 5000-item chain and an 8000-item ring throw `RangeError: Maximum call stack size exceeded` (recursive, as the old code) |
| 9 | Cycles next to each other, in the order given; `groups` in placement order | yes | confirmed | O1 groups `[["b","a"]]`; O2 `[["e","f"],["a","b","c"]]`; mutation → the two 112 order tests fail |
| 10 | The callers work with the new shape | yes | confirmed | Typecheck 7/7; plugin-feed, registry-api and submissions → SQLite 417, PostgreSQL/MySQL/MariaDB 263 each |
| 11 | A plugin whose members form a cycle lists all of them | yes | confirmed | Passes on the four databases; with cycle members left out of `order`, it fails |

**Overall:** not met: an orphaned cycle's ranges cause false conflicts while settling (3), pruning and settling bounce until MAX_STEPS (4), and `dependenciesFirst` overflows the stack at a few thousand items (8). Claim 2's "whatever member is requested" was the implementer's wording, not the spec's; both answers are valid.

### Adversarial re-check — Task 2

Witnessed: 2026-10-08 17:48 EDT, by a fresh agent (adversarial). Commit: 088fe0a. Machine: macOS 27.0.1, Node v24.0.0. resolve.ts reworked (fallbacks through `liveSources()`, the two-switches rule, the final range check).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | P1 resolves: an unreached cycle no longer causes a false conflict | yes | confirmed | P1 → a 1.0.0, q 2.0.0, z 1.0.0 |
| 2 | P2: a real error names only the ranges that block | yes | confirmed | → "@t/q has no published version that fits ^2 (@t/z@1.0.0)." |
| 3 | P5: no back and forth; the answer is found | yes | confirmed | P5 → root 1.0.0; P6 (a 2.0.0→b→a ^2, z→a <2) → a 1.0.0, z 1.0.0 |
| 4 | Real conflicts caused by a cycle are still reported | yes | confirmed | a→b ^1, b→a ^2, request a ^1 → `resolve_conflict` "^1 (the request), ^2 (@t/b@1.0.0)" |
| 5 | The fallbacks and the stays rule never break a reached range, leave out a reached item, include an unreached one, or hide a conflict | yes | confirmed | Fuzz: 20,000 random cyclic graphs (2–8 items, 10% yanked, 30% locked), every success checked → 0 unsound, 0 "keep changing", ≤2 ms per case |
| 6 | Same answer whatever the request's order | yes | confirmed | Request keys reversed → 0 of 24,000 differ |
| 7 | No regression on graphs without cycles | yes | confirmed | 5000 random acyclic cases vs `git show HEAD:packages/core/src/resolve.ts` → identical |
| 8 | Remaining errors on cyclic graphs are the existing greedy limit | yes | confirmed | Brute force over 3000 cyclic cases: 239 refusals where an answer exists; the old resolver on 3000 acyclic: 171; no backtracking, as before |
| 9 | Never loops forever | yes | confirmed | `steps` shared across passes; fuzz never hit MAX_STEPS; a 9000 ring in 63 ms |
| 10 | The new tests cover the fixes | yes | confirmed | Each part switched off in turn fails its test |
| 11 | Suites, typecheck and callers still green | yes | confirmed | Core 334; typecheck 7/7; web SQLite 417, PostgreSQL/MySQL/MariaDB 263 each |
| 12 | `dependenciesFirst` returns every item exactly once | yes | partly | Unchanged then: a 5000 chain and an 8000 ring still overflow |

**Overall:** not met: every resolver claim holds; only row 12 remains.

### Adversarial re-check — row 12

Witnessed: 2026-10-08 17:50 EDT, by a fresh agent (adversarial). Commit: 088fe0a. Machine: macOS 27.0.1, Node v24.0.0. `order.ts` iterative (explicit frames for Tarjan and the placement); a 20,000-item chain and ring test.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | `dependenciesFirst` returns every item exactly once, however large, with no stack overflow, and the same order and groups as before | yes | confirmed | Chain of 5000 → 33 ms; ring of 8000 → 1 group, 21 ms; chain of 100,000 → 311 ms. Deep mixes (10,000 chained pairs, a 20,000 ring with cross-links, one item needing 20,000, a 20,001-member cycle) pass a checker. 30,000 random batches (duplicates, outside names, self-dependencies) vs the recursive version → identical. The recursive `order.ts` put back → the 20,000 test fails. Core 335; typecheck 7/7; web plugin-feed and submissions → 402 passed |

**Overall:** met: every claim of task 2, blind and adversarial, is confirmed in its latest pass.
