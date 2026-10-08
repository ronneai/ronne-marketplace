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

## Task 3 — The checks

Witnessed: 2026-10-08 18:00 EDT, by a fresh agent (blind). Commit: f02ba3d. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: 11 files.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Submit's checks no longer give an error for a cycle | yes | confirmed | `registry-checks.ts:324-331` returns `warning("dependency_cycle", …)`; `DependencyCycleError` gone; grep "go round in a circle" in `apps/web/src` → none. The warning turned back into an error → 5 tests fail |
| 2 | The cycle warning uses the spec's words, with severity warning | yes | confirmed | `registry-checks.test.ts` `toEqual` on severity, code and message for 2- and 3-item cycles; `registry.db.test.ts:239-240` |
| 3 | The owner's report: two of the author's drafts naming each other show `dependency_draft` plus `dependency_cycle` as warnings on save | yes | confirmed | `registry.db.test.ts:244-262` on the four databases; unit "finds a cycle through your own drafts" |
| 4 | An own-draft dependency is a warning on save (`together`), an error when submitted alone | yes | confirmed | `drafts.ts:343-346` `{ together: true }`; `submissions.ts:175` doesn't; `codes(skillDraft)` → `["dependency_draft"]`; `submitDraft` probe → "The draft has 1 problem to fix…"; `together: false` mutation → the owner's-report test fails |
| 5 | Another author's draft stays an error (089); a draft is private to its author | yes | confirmed | `kysely-registry-lookup.ts:110-127` filters `author_id`, `draft`, `isReadableSubmission`; db test → `["dependency_not_found"]`; without the `author_id` filter it fails; `visibility-guard.db.test.ts` probes `ownDraftNamed` |
| 6 | An own draft in another private workspace is still refused (093) | yes | confirmed | `registry-checks.ts:207-215`; probe, draft in private `w2` → `dependency_not_visible` |
| 7 | Unit and submissions db tests pass on SQLite | yes | confirmed | Unit 28; db (3 files) 33; `vitest run src/server src/features src/components` → 1637 passed |
| 8 | The same db tests pass on PostgreSQL, MySQL and MariaDB | yes | confirmed | `pnpm test:db:{postgres,mysql,mariadb} -- <3 db files>` → 33 passed each |
| 9 | Save (#142) shows the same warnings, with their severities | yes | confirmed | `DraftEditor.tsx:199,287`; `errorCount` counts errors only |
| 10 | The canvas shows the same: the cycle warning and "your draft" as warnings on a node | yes | not met | `composer.ts:105-108` keeps only `issue.message`; `nodes.tsx:71-76` prints red "ERR:" for every problem, `:166` `border-error`, `:189` `invalid`; no test checks severity on the canvas |
| 11 | The dependency marks agree | yes | confirmed | Own draft → `{kind:"waits",status:"not_submitted"}`; `seen` stops at a cycle. Comment at `dependency-marks.ts:34` out of date |
| 12 | An item on itself is still refused, and the checks don't contradict that | yes | partly | `self_dependency` error, but `submitIssues` also "@team/selfy is your draft: …" and "@team/selfy need each other: …" |
| 13 | Typecheck and lint are clean | yes | confirmed | `pnpm --filter @ronneai/web typecheck` → no errors; `biome check` → no fixes |

**Overall:** not met: the canvas shows the warnings as red errors, and a self-dependency gets contradicting advice. Also: at release, an own draft's error reads "submit it with this item" (task 6's).

### Re-check (claims 2, 3, 10, 11, 12, and the wording rule)

Witnessed: 2026-10-08 18:34 EDT, by a fresh agent (blind). Commit: f02ba3d. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: 20 files, SPEC.md included.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The cycle warning uses the spec's words, worded by what comes next | yes | confirmed | `registry-checks.ts:333-350`; SPEC.md:84-90; unit "words a cycle by what comes next" (`editable` true/false); mutation (`withAuthor` always true) → it fails |
| 3 | The owner's report on save | yes | confirmed | "…they're submitted for review together."; `pnpm test:db:{postgres,mysql,mariadb}` → 33 passed each; SQLite passes |
| 10 | The canvas shows warnings as amber `WARN:`, no red border, range not invalid; errors still red | yes | confirmed | `composer.ts` splits `problems` and `warnings`; `nodes.tsx` `WARN:` in `text-warning-text`; `composer.db.test.ts` → own draft in `warnings`, cycle in `warnings`, on the four databases; component test with an error control; mutation (border red on warnings) → it fails |
| 11 | The dependency marks agree, and the comment is fixed | yes | confirmed | `dependency-marks.ts:32` "stops at a cycle (allowed since 112)"; tests pass |
| 12 | An item on itself is left to the package checks | yes | confirmed | `registry-checks.ts:200-203`; probe on the four databases → `issues` `self_dependency`, `submitIssues` `[]`; unit test; mutation → it fails |
| 14 | Wording: "submitted for review together" while a member is a draft or sent back, "released together" once all are in review or approved | yes | confirmed | Probes on the four databases via save and `getReview`: sent back → review wording; both in review → "released together"; approved → "released together"; `isEditable` = draft or `changes_requested`; the canvas passes `editable: true` |
| 15 | Typecheck and lint stay clean | yes | confirmed | Typecheck → no errors; `biome check` on the 19 changed files → no fixes |

**Overall:** met. Remarks: the doc comment at `registry-checks.ts:135` still said "released together" (fixed in this commit); "released together" is pinned by the unit test only; the release wording is task 6's.

## Task 4 — Submit together

Witnessed: 2026-10-08 18:57 EDT, by a fresh agent (blind). Commit: 9f1b304. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: submit-group.ts (new), submissions.ts, bulk-submit.ts, actions, tests.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Submit on A submits a chain A → B → C (→ D), dependencies first, in one go | yes | confirmed | `submit-together.db.test.ts` chain test: order `[d,c,b,a]`, 4 submitted, 4 audit events; the four databases |
| 2 | A cycle A ↔ B is submitted together from either item | yes | confirmed | Test passes; probe A→B→C→A from A → `with` 2, all `submitted` on the four databases |
| 3 | Each member is checked as if the group were in review | yes | confirmed | `withIncoming` in `checkGroup`; dropping it → 6 tests fail |
| 4 | A group with one member not ready submits none, and says which | yes | confirmed | `group_member_not_ready` "@team/c isn't ready…", all `draft`, 0 events; mutation → 6 tests fail |
| 5 | A failure inside the transaction submits none | yes | confirmed | 2nd `createRevision` throws → both `draft`, 0 events; outside a transaction → the test fails |
| 6 | Bulk submit works in groups, and groups sharing a draft merge | yes | confirmed | "joins groups that share a draft" passes; groups per selected id → it fails |
| 7 | Bulk submit is all or none per group, the failure on each member | yes | confirmed | `bulk-submit.ts` `sendGroup` in one transaction; lonely and broken both `not_ready` |
| 8 | Another author's items are never submitted by someone else | yes | confirmed | Probe: the other's draft → group of 1, `dependency_not_found`, both stay `draft`; the other user bulk-submitting A → `not_found` (four databases) |
| 9 | Db tests pass on the four databases | yes | confirmed | `pnpm test:db:{postgres,mysql,mariadb} -- domains/submissions/` → 228 passed each |
| 10 | A dependency already in review isn't in the group | yes | confirmed | Probe A→C, B→C: A sends C; B then goes alone with `dependency_pending` |
| 11 | `rmk submit`/MCP, the UI and the drafts API still work | yes | confirmed | Typecheck clean; drafts-api, features → 229 passed; `rmk` 183, mcp 40 |
| 12 | Concurrent submits of two groups sharing a draft: one goes whole, the other none | yes | confirmed | `Promise.allSettled` ×3 on PostgreSQL, MySQL, MariaDB → C never twice; the loser's wording wrong ("@team/c isn't ready") |
| 13 | A group over the bulk limit is refused with why, not cut | yes | not met | A 105-draft chain → all 105 submitted; no size check; the spec's "50 to submit" didn't match MAX_BULK (100) |

**Overall:** not met: no group limit. Also: a stale group after a concurrent submit gave a wrong reason; a doc comment above `DELETABLE` was deleted.

### Re-check

Witnessed: 2026-10-08 19:18 EDT, by a fresh agent (blind). Commit: 9f1b304. Machine: macOS 27.0.1, Node v24.0.0. With `MAX_GROUP`, the drop-after-lock, real reasons, `stillNeeded`, duplicate names, `sentDependencies`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Chain | yes | confirmed | Passes on the four databases; dropping `withIncoming` → fails |
| 2 | Cycle (and A→B→C→A) | yes | confirmed | Test and probe on the four databases |
| 3 | Checked as if all in review | yes | confirmed | Mutation `together = deps` → 6 tests fail |
| 4 | One not ready → none | yes | confirmed | Mutation on the blocker check → fails |
| 5 | Failure in the transaction → none | yes | confirmed | Without a transaction → "promise resolved instead of rejecting" |
| 6 | Groups merge | yes | confirmed | Groups per id → 2 tests fail |
| 7 | All or none per group in bulk | yes | confirmed | As before |
| 8 | Another author's never | yes | confirmed | Probe P3 on the four databases |
| 9 | Db tests on the four databases | yes | confirmed | 232 passed each |
| 10 | A dependency in review isn't in the group | yes | confirmed | Probe P2; "leaves out a draft of a dependency already released or on its way" passes; dropping `stillNeeded` → it fails |
| 11 | Callers still work | yes | confirmed | Typecheck; 229 / 183 / 40 passed |
| 12 | Concurrent groups sharing a draft: no double submit, the second goes on | yes | confirmed | Probes P6, P7 on PostgreSQL, MySQL, MariaDB → both ok, C once |
| 13 | A group over `MAX_GROUP = 100` is refused with why, not cut | yes | confirmed | 101 refused, 0 sent; 100 sent; bulk 101 all `not_ready` `group_too_large`; SPEC says 100 |
| 14 | Two drafts of one name in a group are refused | yes | confirmed | `name_taken` "…in this group twice…"; mutation → fails |
| 15 | A resubmit reads the saved files | yes | confirmed | Test passes; `sentDependencies` → `dependenciesOf` → fails |
| 16 | The `DELETABLE` comment is back | yes | confirmed | `submissions.ts:368` |

**Overall:** met. Notes: the drop-after-lock had no repository test; the limit test's parts weren't ready anyway.

### Re-check 2

Witnessed: 2026-10-08 19:48 EDT, by a fresh agent (blind). Commit: 9f1b304. Machine: macOS 27.0.1, Node v24.0.0. After the adversarial round 2 fixes.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Groups merge | yes | confirmed | Probe a2, b2 → c2 (four databases); mutation → 2 tests fail |
| 10 | A met dependency isn't in the group, brought in or selected | yes | confirmed | Both tests pass; removing `stillNeeded` → both fail |
| 10a | A name resolves to the selected draft, then a proposal before a new item's draft | yes | confirmed | "resolves a name to the selected draft…" and "takes the proposal of a published dependency…" pass; each mutation fails its test |
| 12 | Concurrent groups sharing a draft | yes | confirmed | "sends the rest when a draft brought in was submitted meanwhile" passes; removing `live` → it fails; probes P6, P7 |
| 13 | Group limit, each member saying so once | yes | confirmed | Probe: 101 refused, ≤2 issues per member; 100 sent; bulk 101 refused |
| 14 | Two new-item drafts of one name refused; proposals of one item go together | yes | confirmed | Tests pass; mutation applying `name_taken` to proposals → fails |
| 17 | SPEC.md states the duplicate-name rule as built | yes | partly | SPEC.md:163 had no exception for proposals |
| 9 | Db tests on the four databases | yes | confirmed | 237 passed each |

**Overall:** not met: SPEC.md behind on the proposals exception.

### Re-check 3

Witnessed: 2026-10-08 19:50 EDT, by a fresh agent (blind). Commit: 9f1b304. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | Group limit refused with why, each member saying so once | yes | confirmed | Limit test asserts one `group_too_large` and no `group_member_not_ready` per member; `pnpm test:db:{postgres,mysql,mariadb} -- submit-together proposals` → 30 passed each; mutation → fails |
| 17 | SPEC.md states the duplicate-name and name-resolution rules as built | yes | confirmed | `SPEC.md:163-166` match `checkGroup` and `ownDraftsByName` (ordered `updated_at desc, id desc`) |

**Overall:** met. Correction: the per-member noise it had remarked on never happened (`group_too_large` already makes every member `not_ready`); the guard added for it was dead code and was removed.

### Adversarial — Task 4

Witnessed: 2026-10-08 18:58 EDT, by a fresh agent (adversarial). Commit: 9f1b304. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Sends the item with every one of the author's own drafts it needs | yes | confirmed | 5 passed (SQLite); 53 passed each on PostgreSQL, MySQL, MariaDB; P3 group [y, x2, x1] |
| 2 | Never another author's draft | yes | confirmed | P4 on the four databases |
| 3 | Never a draft it doesn't need | yes | not met | P1: an unchanged proposal of a released dependency pulled in, blocking the item; P2: a second draft of a name in review, `name_taken`, blocking it |
| 4 | Never a draft in a workspace it can't submit to | yes | confirmed | P5 |
| 5 | All or none when a member isn't ready | yes | confirmed | Mutation → 2 tests fail |
| 6 | All or none on a failure in the transaction | yes | confirmed | The four databases; P9 |
| 7 | A name another author takes meanwhile is caught | yes | confirmed | C3, 6 runs × 3 servers |
| 8 | A name taken inside the group is caught | yes | not met | P3/P3b: two drafts of `@team/x` both submitted |
| 9 | Members don't block each other | yes | confirmed | Removing `withIncoming` → 5 tests fail |
| 10 | A needed draft outside the group stops it | yes | confirmed | P7 `dependencies: false` → `dependency_draft` |
| 11 | A resubmit takes what it needs now | yes | not met | P6: a dependency draft added after changes were requested → refused (`dependenciesOf` read the revision) |
| 12 | A resubmit with nothing new works | yes | confirmed | P6b |
| 13 | The check agrees with submit | yes | confirmed | P1–P6, P10 |
| 14 | Bulk in groups, per-draft results | yes | confirmed | Tests on the four databases |
| 15 | One group's thrown failure doesn't stop another | yes | partly | P9: rejects after group 1 committed (as before 112) |
| 16 | MAX_BULK holds | yes | confirmed | P11 |
| 17 | A group over the limits is refused | yes | not met | P8, P11: 105 and 103 submitted |
| 18 | No deadlock between groups sharing scopes | yes | confirmed | C2, 5 runs × 3 servers |
| 19 | The same group submitted twice at once | yes | partly | C1: integrity holds; the loser got "0 problems" with `[]` |
| 20 | A member submitted elsewhere meanwhile | yes | partly | C4: no double submit, but "isn't ready" for a member in review |

**Overall:** not met: drafts it doesn't need pulled in, two same-name drafts sent together, a resubmit missing a new draft, no group limit, poor errors on a concurrent loser; a deleted doc comment.

### Adversarial re-check — Task 4

Witnessed: 2026-10-08 19:12 EDT, by a fresh agent (adversarial). Commit: 9f1b304. Machine: macOS 27.0.1, Node v24.0.0. With the first round of fixes.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass on the four databases | yes | confirmed | 86 passed, 2 failing probes (R1, R2) |
| 2 | Single submit leaves out a met dependency's draft | yes | confirmed | P1, P2 on the four databases; mutation → fails |
| 3 | `stillNeeded` doesn't leave out a needed draft | yes | confirmed | R4: `^2.0.0` with a changed proposal → both sent |
| 4 | Bulk never links a draft the item doesn't need | yes | not met | R1, R2 (`{all:true}`, or `dependencies:false`): a selected met draft blocks the item |
| 5 | Two drafts of one name can't both go | yes | confirmed | P3, P3b, R5 |
| 6 | The duplicate refusal refuses nothing allowed before | yes | partly | R6: two proposals of one item refused; R3: a name resolved to a newer draft than the selected one |
| 7 | A resubmit takes a new dependency draft | yes | confirmed | P6, P6b |
| 8 | Group over 100 refused; 100 goes | yes | confirmed | R7, P8 |
| 9 | MAX_BULK cuts a selection | yes | confirmed | P11 |
| 10 | Concurrent double submit: the loser gets a status error | yes | confirmed | C1, R12 |
| 11 | A member sent just before the lock is dropped, the rest goes | yes | confirmed | R9, R14, C4; no repository test then |
| 12 | Dropping after the lock loses nothing | yes | confirmed | R10, R11, R13 |
| 13 | No deadlock | yes | confirmed | C2 |
| 14 | Another author's name taken concurrently caught | yes | confirmed | C3 |
| 15 | Not-member drafts never go, nor count as on their way | yes | confirmed | P4, P5 |
| 16 | Each blocker says its real reason | yes | confirmed | `blockedBy` |
| 17 | The checks agree with submit | yes | confirmed | P1–P7, P10, R1–R7 |
| 18 | A thrown error in one bulk group | yes | partly | R8, as before 112 |
| 19 | The `DELETABLE` comment is back | yes | confirmed | `submissions.ts:368` |

**Overall:** not met: R1, R2, R3, R6.

### Adversarial re-check 2 — Task 4

Witnessed: 2026-10-08 19:31 EDT, by a fresh agent (adversarial). Commit: 9f1b304. Machine: macOS 27.0.1, Node v24.0.0. With `stillNeeded` on selected drafts, `chosen`, the proposals exception, and the drop-after-lock test.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests and probes on the four databases | yes | confirmed | 112 passed on each |
| 2 | R1 fixed | yes | confirmed | a goes alone |
| 3 | R2 fixed | yes | confirmed | a submitted, b2 `not_ready` |
| 4 | R3 fixed | yes | confirmed | [x1, y]; x2 stays draft |
| 5 | R6 fixed | yes | confirmed | d, p1, p2 submitted |
| 6 | Two new-item drafts of one name never both go | yes | confirmed | R18, R5 |
| 7 | Selected cycle members stay together | yes | confirmed | R15 |
| 8 | A selected draft needed by one item and met for another | yes | confirmed | R16 |
| 9 | A proposal and a new-item draft of one name: the group takes the one that can go | yes | partly | R17: single Submit took the newer new-item draft over the proposal |
| 10 | The drop-after-lock has a test | yes | confirmed | Mutation → "sends the rest…" fails |
| 11 | The races still hold | yes | confirmed | R9, R14, R10, C1, C3, C4 |
| 12 | Earlier fixes hold | yes | confirmed | P6, P8, P11, P1, P2 |
| 13 | A thrown error in one bulk group | yes | partly | R8, as before 112 |

**Overall:** not met: R17; row 13 by choice.

### Adversarial re-check 3 — Task 4

Witnessed: 2026-10-08 19:43 EDT, by a fresh agent (adversarial). Commit: 9f1b304. Machine: macOS 27.0.1, Node v24.0.0. With a proposal preferred over a new-item draft, and SPEC.md on unexpected errors.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests and probes pass on the four databases | yes | confirmed | 117 passed on each |
| 2 | R17: a single Submit takes the proposal, not a newer new-item draft | yes | confirmed | Group [p, a] on the four databases; removing the preference → "takes the proposal of a published dependency…" fails |
| 3 | Two proposals plus a new-item draft stay deterministic | yes | confirmed | R19: the newest proposal is taken (refused with its own reason if it isn't ready; bulk can pick the older); R6 still goes |
| 4 | A proposal of an all-yanked item still goes with its dependent | yes | confirmed | R20 on the four databases |
| 5 | A group too large says so once per member | yes | confirmed | R21: ≤2 errors per member, refused |
| 6 | Row 13 against SPEC.md: an unexpected error stops the run, groups sent stay sent, running again picks up the rest | yes | confirmed | R22: rejects, a submitted, b draft; again → b submitted |
| 7 | Earlier fixes hold | yes | confirmed | R1, R2, R3, R6, R18, P1, P2, P6, races |

**Overall:** met: every claim of task 4, blind and adversarial, is confirmed in its latest pass. Remark R19 (the newest of two proposals is taken) stays as built.
