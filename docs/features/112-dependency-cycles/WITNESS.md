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

## Task 5 — The Submit dialog

Witnessed: 2026-10-08 20:01 EDT, by a fresh agent (blind). Commit: 3386401. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: SubmitDialogs.tsx, actions.ts, types.ts, the test, Help.tsx, submissions.ts (`checkSubmitGroup`), rmk.e2e.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The dialog lists each draft that goes with the item, with what brings it in | yes | confirmed | `GroupList`; test asserts "Needed by @team/agent and @team/skill"; probe `checkSubmitGroup` (SQLite) → neededBy right |
| 2 | A cycle's members are marked as needing each other | yes | confirmed | "needs each other" badge; removing it → the test fails; probe `cycles` [[a,b]], a 3-cycle one group. The action's mapping untested then |
| 3 | Each member's checks are shown | yes | confirmed | ready / not ready badge and `IssueList` |
| 4 | Submit is off while a member has an error, saying why | yes | confirmed | `submitBlocked` → `disabledReason`; exact strings tested |
| 5 | Each member links to its draft | yes | confirmed | `href="/submissions/id-@team/skill"`; problems sit under the link |
| 6 | The dialog shows the outcome | yes | partly | Success shown; on a refusal the group list disappeared, only the item's issues left |
| 7 | Component tests cover the list, a cycle, a member not ready and the outcome | yes | not met | Outcome untested: changing its text failed nothing |
| 8 | One button, worded as the spec says | yes | partly | "Submit with N draft(s)", but SPEC.md:102 still said "Submit for review" |
| 9 | Inline helper "Why do these go together?" → `review#dependencies` | yes | confirmed | `Help.tsx` `submit-together`; the section exists in `topics.ts` and ronne-web |
| 10 | The changed e2e step passes | yes | confirmed | `playwright test e2e/rmk.e2e.ts -g "exports an agent with its skill"` → 1 passed |
| 11 | Tests, lint and typecheck green | yes | confirmed | 131 passed; lint 0 errors; typecheck clean |

**Overall:** not met: the outcome untested, the refused outcome losing the group, SPEC.md behind on the button; the action's mapping untested.

### Re-check of claims 6, 7, 8 and the mapping

Witnessed: 2026-10-08 20:07 EDT, by a fresh agent (blind). Commit: 3386401. Machine: macOS 27.0.1, Node v24.0.0. With `SubmitOutcome`, the re-check on refusal, "Submit with N more draft(s)", `toPreview`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The outcome: what went, or on a refusal why and each draft as it stands | yes | confirmed | `SubmitOutcome`; the refusal branch re-checks (by reading) |
| 7 | Component tests cover the list, a cycle, a member not ready and the outcome | yes | partly | Success outcome covered (mutation fails it); the refused path wasn't |
| 8 | The button's words match the spec | yes | confirmed | `submitLabel`; SPEC.md says it; removing " more" → fails; e2e passes |
| 12 | `toPreview` gives neededBy, inCycle, ready, issues and the item's own, tested | yes | confirmed | Four mutations each fail "shapes the service's group…" |
| 13 | Lint and typecheck green | yes | confirmed | Lint 0 errors; typecheck clean; `next build` exit 0 |

**Overall:** not met: the refused path untested. Also: the refusal message stayed stale after a clean re-check.

### Re-check 2 of claim 7 and the refused path

Witnessed: 2026-10-08 20:09 EDT, by a fresh agent (blind). Commit: 3386401. Machine: macOS 27.0.1, Node v24.0.0. With `afterSubmit` and `CHANGED_SINCE_CHECK`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Refused: "Something changed since the check…", a new check, each draft as it stands; sent along: what went; else close | yes | confirmed | `SubmitDialogs.tsx:55-64` `afterSubmit`; the handler wiring by reading; SPEC.md:108-111 |
| 7 | Component tests cover the list, a cycle, a member not ready and the outcome, refusal included | yes | confirmed | 134 passed; three mutations of `afterSubmit` each fail its test; the three-line handler wiring is read only (no DOM environment) |
| 13 | Lint, typecheck and tests green | yes | confirmed | Lint 0 errors; typecheck exit 0; 134 passed |

**Overall:** met: every claim of task 5 confirmed in its latest pass.

## Task 6 — Release together

Witnessed: 2026-10-08 20:30 EDT, by a fresh agent (blind). Commit: 0deeea4. Machine: macOS (Darwin 27.0.0), Node v24.0.0. Working-tree diff: publish.ts, release-group.ts (new), bulk-release.ts, actions, the Release dialog and pages, tests.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Preparing (pack, store) apart from recording, a group's versions in one transaction | yes | confirmed | `releaseTogether`; one transaction per member (mutation) → 3 tests fail |
| 2 | Each range checked against the versions going out | yes | confirmed | `withReleasing`; plain registry (mutation) → 8 tests fail |
| 3 | The group: the item plus every dependency with no matching release, all approved, through chains and cycles | yes | confirmed | `release-group.ts:108-128`; chain and cycle tests |
| 4 | db test: a chain from one item | yes | confirmed | a, b, c 1.0.0 and `published` |
| 5 | db test: a cycle, each version pointing at the other | yes | confirmed | `version_dependencies` a→b, b→a |
| 6 | db test: a member not approved, refused with why | yes | confirmed | "It can't be released yet: it waits on @team/b, which is submitted."; mutation → fails |
| 7 | db test: a member the person may not release, refused with why | yes | confirmed | Moderator of global vs `@acme/b`; mutation → fails |
| 8 | db test: a failure while recording releases nothing | yes | confirmed | Second `insertVersion` throws → both `approved`, no versions |
| 9 | db test: bulk with a group and something depending on it | yes | confirmed | ping↔pong + user published, held `not_releasable`; mutation → fails |
| 10 | Bulk in groups, all or none; what depends on a failed group `skipped` (SPEC then) | yes | partly | Probe A→B approved, A→C submitted, bulk [A] → B published alone; `skipped` no longer produced; a stale message in a failed cycle |
| 11 | Release db tests on the four databases | yes | confirmed | 66 passed (SQLite); 36 passed each on PostgreSQL, MySQL, MariaDB |
| 12 | The Release dialog lists the group with versions; component tests | yes | confirmed | `groupVersions`, `ReleaseGroupList`; "previews what's released with it…" |
| 13 | The pages pass the group and its block reason | yes | confirmed | `releaseGroupFor`; "Publish: It waits on @team/github, which is submitted." |

**Overall:** not met: bulk could release part of a group; SPEC behind on `skipped`.

### Re-check: claim 10 and the fixes after the adversarial pass

Witnessed: 2026-10-08 20:47 EDT, by a fresh agent (blind). Commit: 0deeea4. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | Bulk in groups, all or none; a refused item takes back what it brought; dependents are in the group, `not_releasable` with why (SPEC updated) | yes | confirmed | Probes: [A] → only A refused, B stays approved; A↔B likewise; [D,A] → D refused, A and B together; mutation → "in bulk, takes back…" fails; SPEC.md:141-146 |
| 14 | An outside dependency locked and re-checked; a yank meanwhile refuses | yes | confirmed | "No published version of @team/x matches ^1.0.0."; mutation → fails |
| 15 | A leftover artifact doesn't block the version (`<version>-<sha12>.tgz`) | yes | confirmed | `artifact_path` matches; mutation → fails |
| 16 | A member's range against another's planned version, in plain words | yes | confirmed | "@team/b goes out as 1.0.0-beta.1, which @team/a's range ^1.0.0 doesn't match."; mutation → fails |
| 17 | A stale proposal keeps 017's error | yes | confirmed | `SubmissionStaleError` on the four databases |
| 18 | Two proposals of one item in one batch: the second refused | yes | confirmed | "Another change to @team/github is in this batch…"; mutation → fails |
| 19 | Publish off when a member gets no version | yes | confirmed | `groupBlockedBy`; mutation → fails |
| 20 | The "publishd" typo fixed | yes | confirmed | `publish: "published"` |
| 11 | Release tests on the four databases after the fixes | yes | confirmed | 89 passed (SQLite); 58 each on the servers |

**Overall:** met. Remarks (fixed after): a stale comment in `release-group.ts`; capitals inside nested reasons.

### Adversarial — Task 6

Witnessed: 2026-10-08 20:39 EDT, by a fresh agent (adversarial). Commit: 0deeea4. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Releases every approved, unmet dependency through chains and cycles | yes | confirmed | S10 3-cycle; 68/68 on the four databases; dropping `withReleasing` → 5 of 6 fail |
| 2 | …and nothing else | yes | partly | S1 bulk: an unselected dependency of a refused item published |
| 3 | All or none at every step | yes | confirmed | S7, S4, S5, S12b on the four databases |
| 4 | All or none when an outside dependency is yanked concurrently | yes | not met | S3: released against a yanked-only dependency |
| 5 | A failed release's artifact is harmless | yes | not met | S7: `StorageConflictError` for a later, different b 1.0.0 |
| 6 | Ranges against the versions going out, readably | yes | partly | A pre-release missing `^1.0.0` refused with "isn't released yet… Release it first." |
| 7 | Refused readably when not approved or not allowed | yes | confirmed | Tests |
| 8 | A single release keeps 015's errors | yes | partly | S2: stale proposal → `SubmissionInvalidError` instead of `SubmissionStaleError` |
| 9 | Bulk groups, a failing group doesn't stop another | yes | partly | S1; S18 two proposals of one item grouped wrongly |
| 10 | MAX_BULK_RELEASE holds | yes | confirmed | S13 |
| 11 | The dialog's preview uses the server's rule | yes | confirmed | `groupVersions` = `planReleases` |
| 12 | Publish blocked exactly when the server refuses | yes | not met | S12b, S6; SPEC since revised: Publish off when a member gets no version, other refusals said when pressed |
| 13 | A proposal in a group gets its item's next version and tag | yes | confirmed | S9 |
| 14 | Concurrent overlapping releases: one wins, nothing doubles | yes | confirmed | S11; the loser read "publishd" |

**Overall:** not met: 3 not met, 4 partly.

### Adversarial re-check — Task 6

Witnessed: 2026-10-08 20:50 EDT, by a fresh agent (adversarial). Commit: 0deeea4. Machine: macOS 27.0.1, Node v24.0.0. Fixes 1–8.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Chains and cycles | yes | confirmed | S10; 72/72 on the four databases |
| 2 | Nothing else, in bulk too | yes | confirmed | S1, S23; mutation → fails |
| 3 | All or none at every step | yes | confirmed | S7, S4, S5, S12b |
| 4 | A concurrent yank refuses | yes | confirmed | S3, S20 |
| 5 | A leftover artifact doesn't block; artifacts never change | yes | confirmed | S7 `team/b/1.0.0-24cc712b77d7.tgz`; S21, S22 |
| 6 | Ranges among members, readably | yes | confirmed | S6 |
| 7 | Refused readably | yes | confirmed | S1, permission test |
| 8 | 017's stale error | yes | confirmed | S2 |
| 9 | Bulk groups; one proposal per item per batch | yes | confirmed | S18 |
| 10 | MAX_BULK_RELEASE | yes | confirmed | S13 |
| 11 | The dialog's preview | yes | confirmed | 50/50 |
| 12 | Publish off when a member gets no version (revised SPEC) | yes | confirmed | S12b |
| 13 | Proposals, versions, tags | yes | confirmed | S9 |
| 14 | Concurrent overlapping releases | yes | confirmed | S11, S21 |
| 15 | The outside-dependency lock adds no deadlock | yes | not met | S19 (px of x needs y, py of y needs x, at once): raw deadlock on PostgreSQL, MySQL, MariaDB; all or none held |

**Overall:** not met: row 15.

### Adversarial re-check 2 — Task 6

Witnessed: 2026-10-08 20:57 EDT, by a fresh agent (adversarial). Commit: 0deeea4. Machine: macOS 27.0.1, Node v24.0.0. Item locks taken first in one sorted order.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Items depending on each other's: no deadlock, either order | yes | confirmed | R2a, R2b slowed 400 ms; S19; the four databases |
| 2 | Overlapping groups | yes | confirmed | S11, R2e |
| 3 | A concurrent yank serialised | yes | confirmed | S3, S20, R2f |
| 4 | A member that's another group's outside dependency | yes | confirmed | R2d |
| 5 | Two groups creating new items at once | yes | confirmed | R2e |
| 6 | The take-back clears `includedFor` | yes | confirmed | S23 |
| 7 | Nested reasons lower-cased | yes | partly | Only a leading "It " |
| 8 | No deadlock between concurrent releases | yes | not met | R2c: workspace locks per member in opposite orders → raw deadlock on the three servers |
| 9 | Release tests pass | yes | confirmed | 72/72 on the four databases |

**Overall:** not met: row 8.

### Adversarial re-check 3 — Task 6

Witnessed: 2026-10-08 21:05 EDT, by a fresh agent (adversarial). Commit: 0deeea4. Machine: macOS 27.0.1, Node v24.0.0. One sorted `lockWorkspaces` after the sorted item locks; nested reasons lower-cased.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Groups needing workspaces in opposite orders don't deadlock | yes | confirmed | R2c and its mirror R3a, slowed 400 ms, on the four databases |
| 2 | Items depending on each other's, either order | yes | confirmed | R2a, R2b, S19 |
| 3 | Overlapping groups: one wins, the losers read well | yes | confirmed | S11 |
| 4 | A concurrent yank serialised | yes | confirmed | S20, R2f |
| 5 | A workspace turned private meanwhile can't gain an outside dependent | yes | confirmed | S5, R3b, R3c |
| 6 | Nested reasons lower-cased | yes | confirmed | S18 "…with it: another change to @team/x is in this batch…" |
| 7 | Release tests pass | yes | confirmed | 72/72 on the four databases; probes 29/29 each |

**Overall:** met: every claim of task 6, blind and adversarial, is confirmed in its latest pass.

## Task 7 — The order hints

Witnessed: 2026-10-08 22:21 EDT, by a fresh agent (blind). Commit: b280885 + working-tree diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `rmk export` prints a line saying a cycle's items are released together | yes | confirmed | `togetherOf` + `reportOrder` say `togetherLine` per cycle and set `together` in JSON; probe of the built lib with a↔b → "@team/a and @team/b need each other: they're submitted and released together." |
| 2 | The export hint no longer contradicts itself for a cycle, and fits how Submit works now (groups, all or none) | yes | confirmed | Same probe → "rmk submit @team/a takes @team/b with it, all or none." and the reverse, plus the together line; matches `bulk-submit.ts` groups and `submit-group.ts`; the old "must be in review first" text is gone from packages/ |
| 3 | The MCP export tool (`export_items`) says the cycle hint | yes | confirmed | `orderLines(order, together)` in the text, `together` in structuredContent |
| 4 | `rmk submit` says "released together" for a cycle | yes | not met | Probe `planSubmit` with a↔b: no cycle line, under "Included, as dependencies, and submitted first"; `submit.ts` never calls `togetherLine` |
| 5 | The MCP submit tools (`check_drafts`, `submit_drafts`) say it for a cycle | yes | not met | They use `planSubmit`'s preview (row 4); `planData` has no `together` |
| 6 | The CLI tests cover a cycle's hint | yes | partly | 231 passed; only the helpers tested; removing `out.say(togetherLine(...))` from `export-command.ts` still passes |
| 7 | The MCP tests cover a cycle's hint | yes | partly | 41 passed; `exportItemsTool` given `together = []` still passes |
| 8 | Updated old-hint tests match the built text | yes | confirmed | `cli.test.ts`, `submit.test.ts`, `export-tools.test.ts` expect the new words and pass |
| 9 | SPEC.md's wording follows the built text | no | not met | SPEC.md still said "`@team/a` and `@team/b` are released together" |

**Overall:** not met: `rmk submit` and the MCP submit tools say nothing about a cycle, the export hint isn't tested at command or tool level, and SPEC.md's quoted words don't match the built line.

### Re-check — claims 4–7 and 9

Witnessed: 2026-10-08 22:32 EDT, by a fresh agent (blind). Commit: b280885 + working-tree diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | `rmk submit` says "released together" for a cycle | yes | not met | The fix reads each draft's `needs`, but `checkedJson` in `drafts-api.ts` doesn't send it: the real `checkDrafts` response (a↔b bundles, SQLite) fed to `planSubmit` → no line, `together: []`; only the fake sends `needs` |
| 5 | The MCP submit tools say it for a cycle | yes | not met | Same `planSubmit` (row 4) |
| 6 | The CLI tests cover a cycle's hint | yes | partly | 233 passed; mutations of the export line, the preview line and `out.set("together")` fail tests; the submit test runs on a fake the server didn't match (row 4) |
| 7 | The MCP tests cover a cycle's hint | yes | partly | 43 passed; mutations fail tests; `check_drafts` only against the fake's `needs` |
| 9 | SPEC.md's wording follows the built text | no | confirmed | SPEC.md quotes `orderLine`, `waitLine` and `togetherLine` as built |

**Overall:** not met: `/api/v1/drafts/check` doesn't return the `needs` the fix reads.

### Re-check 2 — claims 4–7

Witnessed: 2026-10-08 22:44 EDT, by a fresh agent (blind). Commit: b280885 + working-tree diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | `rmk submit` says "released together" for a cycle | yes | confirmed | `drafts-api.ts` sends `needs`; the real `checkDrafts` response (a↔b bundles, SQLite) fed to the current `planSubmit` → "@team/a and @team/b need each other: they're submitted and released together.", `together: [["@team/a","@team/b"]]`; header "Included, as dependencies, and submitted with them (1):" |
| 5 | The MCP submit tools say it for a cycle | yes | confirmed | `check_drafts` returns the preview and `together`; mcp 43 passed; mutations fail `submit-tools.test.ts` |
| 6 | The CLI tests cover a cycle's hint | yes | confirmed | cli 233 passed; `drafts-api.db.test.ts` "says which of your drafts each one needs…" passes and fails without `needs`, so the fake matches the real contract; `order-hints.test.ts` covers `reportExportOrder`. Remark: `exportCommand`'s call site is checked by reading it |
| 7 | The MCP tests cover a cycle's hint | yes | confirmed | `exportedAnswer` with `together = []` fails "export_items' answer (112)"; `exportItemsTool` returns `exportedAnswer` |

**Overall:** met: `rmk submit`, `check_drafts`/`submit_drafts`, `rmk export` and `export_items` all name a cycle, and the tests cover it on a fake that matches what `/api/v1/drafts/check` returns.

## Task 10 — Database tests set up once

Witnessed: 2026-10-08 22:02 EDT, by a fresh agent (blind). Commit: b280885 + working-tree diff (test-db.ts, test-db.db.test.ts, catalogue-revision.db.test.ts, vitest.config.ts, new db-setup.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | On a server, the database is migrated once and reused, not migrated per test | yes | partly | `createTestDb()` migrates once and later calls run `reset(shared)`; it's one database per test **file** (dropped by `db-setup.ts`'s `afterAll`), but PLAN.md and SPEC.md said "per test worker" |
| 2 | Tables are emptied before each test, and the migrations' own rows come back | yes | confirmed | `reset` made a no-op in a scratch copy → "gives each test a database just migrated" fails on PG and MySQL; dropping the baseline re-insert → the full PG suite fails 487 tests |
| 3 | SQLite in memory is unchanged | yes | confirmed | The SQLite branch is as at HEAD; `vitest run --project db` → 86 files, 706 passed, 8 skipped |
| 4 | `migrate: false` (and `fresh: true`) still give a database of their own | yes | confirmed | Always using the shared database → 3 failures |
| 5 | Every db test passes on all four databases in parallel | yes | confirmed | PG 714/714 (71.7 s), MySQL 714/714 (twice), MariaDB 714/714 (54.4 s), SQLite as in row 3 |
| 6 | Every db test passes alone | yes | confirmed | `--no-file-parallelism`: MariaDB, PG and MySQL (416 s) 714/714 each |
| 7 | MySQL time measured before and after, and faster | yes | confirmed | HEAD's code in a scratch copy → 454.6 s; after: 188.8 s, then 113.9 s (load average 8–27) |
| 8 | Shared databases are dropped after each file, with nothing left on the servers | yes | confirmed | MySQL and MariaDB had 0 `ronne_test_%` after normal runs; the PG leftovers came from mutation runs, a killed run and the benchmark |
| 9 | `createTestDb` outside Vitest (`scripts/feed-benchmark.ts`) still cleans up | yes | not met | `pnpm bench:feeds --items 5 --tools codex --db postgres` → one more `ronne_test_%` each run: the shared path's `cleanup` was a no-op |

**Overall:** not met: the benchmark leaves a database behind (row 9), and the docs said "per test worker" (row 1).

### Re-check — claims 1, 7, 8 and 9, plus the full suites on the changed code

Witnessed: 2026-10-08 22:45 EDT, by a fresh agent (blind). Commit: b280885 + working-tree diff frozen at 22:34 (`test-db.ts` with the schema check, pool tracking and `db-global-setup.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | One migrated database per test file, put back to just migrated before each test, and the docs say so | yes | confirmed | `createTestDb` runs `reset(shared)` or `prepare()`; a schema mismatch drops and migrates again; PLAN.md and SPEC.md say "per test file" |
| 7 | MySQL time measured before and after | yes | confirmed | Before (HEAD's code): 454.6 s, and 717.8 s under load 24. After: 106.5 s (717/717) and 169.5 s (720/720, load about 30). Every after-run at least 2.7x faster |
| 8 | Nothing is left on the servers, and stale databases are dropped | yes | confirmed | MariaDB 0; MySQL's 13 all from the HEAD-code timing run whose timed-out tests skipped cleanup; a database with an old ULID name is dropped by the next run's global setup; the `dropStaleTestDbs` test passes on the three servers |
| 9 | The benchmark cleans up after itself | yes | confirmed | `feed-benchmark.ts` uses `createTestDb({ fresh: true })`; runs on MySQL and PG leave no `ronne_test_%` |
| 10 | Every db test still passes on the four databases after the fixes | yes | confirmed | PG 720/720 (86 s), MariaDB 720/720 (97 s), MySQL 720/720 (169 s), SQLite 712 passed + 8 skipped |

**Overall:** met: one database per file with a reset (or a fresh migration after a schema change) before each test, the docs match, the benchmark and interrupted runs leave nothing behind, all 720 tests pass on the four databases, and MySQL is at least 2.7x faster.

### Adversarial — Task 10

Witnessed: 2026-10-08 22:05 EDT, by a fresh agent (adversarial). Commit: b280885 + working-tree diff (test-db.ts, db-setup.ts, vitest.config.ts, test-db.db.test.ts, catalogue-revision.db.test.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | On each server, a test starts with the migrations' rows put back exactly (values, types, dates, booleans, instance id) | yes | confirmed | Probe p1 (a test changes `workspaces.name`/`is_global` and `catalogue_revision.revision`/`instance`, then two resets) → 4/4 passed on PostgreSQL, MySQL and MariaDB. The typed rows and the raw text match: PG `(…,t,,"2026-10-09 01:39:11.826+00",…)`, MySQL `…\|1\|NULL\|2026-10-09 01:39:10.779\|…`, `is_global` boolean on PG and 1 on MySQL, the same instance ULID |
| 2 | Rows a previous test wrote are gone | yes | confirmed | Shipped `test-db.db.test.ts` passes. With `reset()` turned into a no-op in a scratch copy, the test "gives each test a database just migrated…" fails (1 failed, 3 passed) |
| 3 | Session settings left on pooled connections don't leak into the next test | yes | not met | Probe p2 sets settings on all 10 pooled connections. PG, next test: 9 of 10 connections still `session_replication_role=replica`, all 10 `TimeZone=Asia/Tokyo`, and orphan `workspace_members` inserts were refused 0 of 10 (foreign keys off). MySQL and MariaDB: 9 of 10 `@@foreign_key_checks=0`, all `sql_mode=''`, `@leak=42`, refused 0 of 10 |
| 4 | An open transaction or lock from a failed or timed-out test doesn't break the next test | yes | not met | Probe p5 (a transaction updates `workspaces` and never ends). PG: next test "Test timed out in 15000ms" (the `truncate` in `reset()` waits on the lock), then the setup file's `afterAll` "Hook timed out in 30000ms". MySQL and MariaDB: next test timed out after 15s |
| 5 | A test that drops a table can't break the next one | yes | not met | Probe p4 (`drop table plugin_feeds`) → every later test in the file fails. PG: `relation "plugin_feeds" does not exist` at test-db.ts:79. MySQL/MariaDB: `Table 'ronne_test_….plugin_feeds' doesn't exist` |
| 6 | Extra tables, views, columns or sequences a test creates don't leak | yes | not met | Probe p3 (`create table probe_extra`, `create view probe_view`, `alter table scopes add column probe_col`, PG `create sequence`) → next test sees `{"extra":true,"view":true,"col":true}` on all three servers |
| 7 | A test that closes the db it was given doesn't break the next one | yes | not met | Probe p10 (`t.db.destroy()`) on PG → next test: `Error: driver has already been destroyed` |
| 8 | `{ migrate: false }` and `{ fresh: true }` give a separate database that `cleanup()` drops; the shared one survives its no-op `cleanup()` | yes | confirmed | Probe p7 on PG, MySQL and MariaDB → passed: 3 distinct URLs, the `migrate:false` database has 0 tables, the fresh one has the `global` workspace, both are gone from `pg_database`/`information_schema.schemata` after `cleanup()`; also `{fresh:true, migrate:false}` |
| 9 | SQLite (in memory and file) behaves exactly as before | yes | confirmed | `git diff test-db.ts`: the SQLite branch is unchanged. In the repo, `vitest run --project db` with no URL → 86 files, 706 passed, 8 skipped. With `TEST_DATABASE_URL=file:…` → the same counts |
| 10 | The shared database is dropped after its file, also when a test fails; full runs leave nothing | yes | confirmed | Probe p6 (a failing assertion) on all three servers → count of `ronne_test_%` unchanged. Full repo runs on PG, MySQL and MariaDB → count unchanged before and after each run |
| 11 | Nothing piles up after an interrupted run or a hook timeout | yes | not met | Probe p9 (3 files, each marks its database and waits 60s), SIGINT to vitest and its workers after 15s → 3 `ronne_test_%` databases with the markers `adv-marker-a/b/c` left after the processes exited. p5 on PG left one database per run (2 runs → 2 left). The old per-test design also leaked on interrupt; the claim as stated doesn't hold |
| 12 | Test files running in parallel never share a database | yes | confirmed | Probes p8a/b/c (3 files × 3 tests, each logs `t.url`) run together on PG, MySQL and MariaDB → 3 distinct URLs per server, one per file, each file's 3 tests on the same URL |
| 13 | `scripts/feed-benchmark.ts` still works with `createTestDb` | yes | partly | `tsx scripts/feed-benchmark.ts --db postgres --items 3,4 --tools codex` → exit 0, the expected table. It then leaves its database: `ronne_test_01m4f52gcf…` with `bench@example.com` and 4 items. Outside Vitest nothing calls `dropSharedTestDb()` and `cleanup()` is a no-op. The header comment ("drops both after") is now false. Two more bench databases from other runs (`…zwyr…`, `…50fy…`) are on the PG server |
| 14 | The whole db suite passes on all four databases | yes | confirmed | In the repo: PG 86 files / 714 passed (51s), MySQL 714 passed (90s), MariaDB 714 passed (51s), SQLite 706 passed + 8 skipped |
| 15 | The speed-up is real | yes | confirmed | Same scratch copy, HEAD versions vs the working tree, same runs: MySQL 467s → 105s, MariaDB 249s → 63s, PG 105s → 53s. Timings are noisy: other agents were running database tests at the same time. The 4 `scripts/*` files fail in both copies alike for a copy-only `pnpm exec` reason |

**Overall:** not met: rows, baseline rows, `fresh`/`migrate:false`, parallel files and normal runs hold. Isolation between tests doesn't: settings left on pooled connections, open transactions or locks, dropped, added or altered schema, and a destroyed pool all leak into the next test. Interrupted runs and the feed benchmark leave databases behind.

### Adversarial re-check — Task 10

Witnessed: 2026-10-08 22:30 EDT, by a fresh agent (adversarial). Commit: b280885 + working-tree diff (test-db.ts, db-setup.ts, db-global-setup.ts, vitest.config.ts, feed-benchmark.ts, test-db.db.test.ts, catalogue-revision.db.test.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Each test starts with the migrations' rows put back exactly | yes | confirmed | p1 on PG, MySQL and MariaDB → 4/4; typed rows and raw text identical after two resets |
| 2 | Rows a previous test wrote are gone | yes | confirmed | Shipped test passes; `reset()` as a no-op makes it fail |
| 3 | Session settings left on pooled connections don't leak into the next test | yes | partly | p2: the test's own pools are clean on the three servers. But p13 sets `session_replication_role = replica` (PG) or `foreign_key_checks = 0` on `getAppDb(t.url)`, which `closePools` doesn't track: the next test reads it, and on PG the drop fails "being accessed by other users" |
| 4 | A transaction a test leaves open doesn't break the next test | yes | not met | p5 on PG: next test times out at 15 s and the database is left; MySQL and MariaDB pass |
| 5 | A test that drops a table doesn't break the next one | yes | confirmed | p4 → the next two tests pass on the three servers; the "migrates afresh…" test fails with the schema check removed |
| 6 | Extra tables, views and columns don't leak | yes | confirmed | p3 → `{"extra":false,"view":false,"col":false}` on the three servers |
| 7 | Other schema or database changes a test makes don't leak | yes | not met | p11 (a dropped foreign key, a unique index, a trigger) → kept for the next test on the three servers; p12 `alter database … character set latin1` → kept on MySQL and MariaDB |
| 8 | A test that closes its own handle doesn't break the next one | yes | confirmed | p10 → the next test passes on the three servers |
| 9 | `fresh: true` and `migrate: false` give separate databases that `cleanup()` drops | yes | confirmed | p7 on PG, MariaDB and MySQL |
| 10 | SQLite, in memory and file, is unchanged | yes | confirmed | 86 files, 709 passed and 8 skipped, both ways |
| 11 | Shared databases are dropped after their file, even when a test fails | yes | confirmed | p6 → counts unchanged; exceptions on PG are rows 3 and 4 (the drop isn't forced) |
| 12 | Nothing piles up across runs, interrupted runs included | yes | confirmed | SIGINT leaves 3 databases until two hours pass; the global setup drops old ones (one held open by `psql` too) and keeps a 90-minute-old one and a non-ULID name |
| 13 | Test files running in parallel never share a database | yes | confirmed | p8a/b/c → one URL per file on each server |
| 14 | `feed-benchmark.ts` works and leaves nothing | yes | confirmed | `--db postgres` and `--db mysql` → exit 0, no database left |
| 15 | The whole db suite passes on all four databases | yes | confirmed | PG, MySQL and MariaDB 717/717; SQLite 709 passed and 8 skipped |
| 16 | The speed-up is real | yes | confirmed | MySQL 467→105 s, MariaDB 249→63 s, PG 105→53 s (paired runs) |
| 17 | The shipped tests catch regressions | no | confirmed | Schema check removed → "migrates afresh…" fails; `STALE_MS = Infinity` → the stale-cleanup test fails |
| 18 | A file keeps working when one test asks for a database in `beforeAll` and a later test calls `createTestDb()` | no | not met | p14 → the `beforeAll` handle fails with `driver has already been destroyed`; the doc comment didn't say so |

**Overall:** not met: rows 3, 4, 7 and 18.

### Adversarial re-check 2 — Task 10

Witnessed: 2026-10-08 22:45 EDT, by a fresh agent (adversarial). Commit: b280885 + working-tree diff (test-db.ts, db-setup.ts, db-global-setup.ts, vitest.config.ts, test-db.db.test.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Session settings left on pooled connections, the app pool `getAppDb(shared.url)` included, don't reach the next test | yes | confirmed | p2 clean on the three servers; p13 → next test reads `APPDB origin` on PG and `APPDB 1` on MySQL and MariaDB; no drop failure, nothing left |
| 4 | A transaction a test leaves open doesn't break the next test | yes | not met | p5 on PG: the next test times out at 15 s; the forced drop then raises 2 unhandled `57P01` errors, failing the run. MySQL and MariaDB pass |
| 7 | Changes to schema or database settings don't reach the next test | yes | confirmed | p11 → no index, no trigger, the dropped foreign key back, on the three servers; p12 → `utf8mb4` on MySQL and MariaDB, `UTC` on PG |
| 11 | Shared databases are dropped after their file, even with a connection left open | yes | confirmed | No database from p5 or p13 left on PG; no `55006` failure |
| 18 | A later `createTestDb()` closing a `beforeAll` handle is documented, and `fresh: true` gives one handle per file | yes | confirmed | The doc comment says so; p14 shows it as documented; p15 (`beforeAll` with `fresh: true`) → 3/3 on PG and MariaDB |

**Overall:** not met: row 4 on PostgreSQL.

### Adversarial re-check 3 — Task 10

Witnessed: 2026-10-08 22:49 EDT, by a fresh agent (adversarial). Commit: b280885 + working-tree diff (test-db.ts, db-setup.ts, db-global-setup.ts, vitest.config.ts, test-db.db.test.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | A transaction a test leaves open doesn't break the next test, and the run reports no unhandled errors; on PostgreSQL the held database is left, named in a warning, for the next run to drop | yes | partly | p5 → exit 0, 2 passed, no unhandled errors on the three servers; PG left one database, which a later run's global setup dropped; p13 guard passes. But the `console.warn` shows only with `--silent=false`: Vitest hides a passing file's console output, piped, under a terminal and with `CI=true` |

**Overall:** not met: the warning naming the held database isn't seen in a normal run.

### Adversarial re-check 4 — Task 10

Witnessed: 2026-10-08 22:50 EDT, by a fresh agent (adversarial). Commit: c1aebf8 + working-tree diff (test-db.ts, db-setup.ts, db-global-setup.ts, vitest.config.ts, test-db.db.test.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | A transaction a test leaves open doesn't break the next test, and the run reports no unhandled errors; on PostgreSQL the held database is left, named in a warning, for the next run to drop | yes | confirmed | PG piped and with `CI=true` → exit 0, 2 passed, no unhandled errors, the warning names the held database; the PG count rose by exactly the two named; MySQL guard → 2 passed, no warning; the next run's global setup dropped both once renamed to old ULIDs |

**Overall:** met: in a default run the next test starts clean, nothing is unhandled, and the warning names the held PostgreSQL database; a later run drops it.

## Task 11 — The servers where they matter

Witnessed: 2026-10-08 22:54 EDT, by a fresh agent (blind). Commit: f5b1c38 + working tree (changes.yml, database.yml, package.json, db-scope.js, db-scope.test.js; ci.yml ignored). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `changes.yml` exposes a `database` output, set by `db-scope.js` on pull requests | yes | confirmed | `workflow_call.outputs.database` ← `jobs.detect.outputs.database` ← `steps.detect.outputs.database`; the detect step pipes `git diff --name-only HEAD^1 HEAD` into `node packages/repo-tools/src/db-scope.js` |
| 2 | A non-pull-request event (push to main, weekly, manual) runs everything | yes | confirmed | `EVENT != pull_request` → `database=all`; database.yml runs `pnpm test:db` for anything but `core` |
| 3 | A failed or empty detection runs everything | yes | confirmed | Only `SCOPE=core` narrows (simulated `core`/`all`/empty/`garbage`); `printf '' \| node db-scope.js` → `all`; the test job keeps `if: !cancelled()` |
| 4 | On a pull request without database code, the servers run only the database code's tests | yes | confirmed | `test:db:core` filters → `vitest list --project db --filesOnly` → 29 files |
| 5 | A pull request that changes database code runs every database test | yes | confirmed | 86 files; 18 of 40 recent commits' real file lists → `all`, docs-only ones → `core` |
| 6 | The rule matches the spec's definition of database code | yes | partly | `packages/config/vitest.js` → `core`; 11 of the 57 non-core `*.db.test.ts` → `core`; a deleted file that queried → `core`; `apps/web/scripts/migrate.ts` → `core` and its server test isn't in the core set |
| 7 | Dry run of each case lists the tests it would run, and the core set runs on a server | yes | confirmed | Core on MySQL → 29 files, 149 passed (43.7 s); on SQLite → 29 files, 142 passed, 7 skipped |
| 8 | The required check names stay the same | yes | confirmed | `Database tests (${{ matrix.database }}…)` and the matrix are unchanged |
| 9 | `db-scope.js` has tests that catch a broken rule | yes | confirmed | 5 passed; an empty list made `core` in a scratch copy → 1 failed |

**Overall:** not met: the rule misses some of what the spec counts as database code (claim 6).

### Re-check — claims 4, 6 and 7

Witnessed: 2026-10-08 22:57 EDT, by a fresh agent (blind). Commit: f5b1c38 + working tree (db-scope.js, db-scope.test.js, package.json, SPEC.md, database.yml). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | On a pull request without database code, the servers run only the database code's tests (db layer, migrations, repositories, setup, the scripts that run against the database) | yes | confirmed | `test:db:core` has the same filters as `CORE_TESTS`; `vitest list` → 33 files, the setup smoke test included, so database.yml's comment holds in both modes |
| 6 | The rule matches the updated spec | yes | confirmed | → `all`: `packages/config/vitest.js`, `apps/web/scripts/migrate.ts`, `scripts/migrate.db.test.ts`, `http/health.db.test.ts`, a deleted `.ts`, a `.mts` with `from "kysely"`, `from 'kysely'`; all 86 db test paths → `all`. → `core`: `Help.tsx`, `packages/cli/src/{cli,apply}.ts`, a deleted `docs/gone.md`, 0deeea4's diff, `ci.yml`. Reverting the deleted-file rule fails a test. Remark: `*.db.test.tsx` isn't matched; none exist |
| 7 | Dry run of each case lists the tests it would run, and the core set runs on a server | yes | confirmed | `vitest list` → core 33, all 86; `pnpm test:db:core` → 33 files, 155 passed, 8 skipped; the 4 new core files on MariaDB → 14 passed |

**Overall:** met: core is 33 files including the scripts and the setup smoke test, the rule covers everything the updated spec lists, and the dry runs and the server run pass.

## Task 12 — End-to-end in two jobs

Witnessed: 2026-10-08 23:02 EDT, by a fresh agent (blind). Commit: f5b1c38 + working-tree diff (.github/workflows/ci.yml). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The two shards share no test | yes | confirmed | `playwright test --list --shard=1/2` → 51 tests in 29 files; `--shard=2/2` → 50 in 12 files; 0 shared tests or files |
| 2 | Together the shards are the whole suite, every project | yes | confirmed | `--list` → 101 tests in 41 files; both shards sorted and diffed against it → identical; shard 1 chromium only, shard 2 the rest of chromium and every other project |
| 3 | `pnpm test:e2e --shard=N/2` gets to Playwright | yes | confirmed | A scratch workspace with the same two-level scripts: pnpm adds the flag to the last command of the `&&` chain, so the build runs without it and `playwright test` gets it |
| 4 | CI runs two parallel e2e jobs, each with its own build and instance, and every step runs per shard | yes | confirmed | `e2e` has `matrix.shard: [1,2]`, `fail-fast: false`; each runs `pnpm test:e2e --shard=${{ matrix.shard }}/2`; artifact names differ per shard |
| 5 | A job named exactly "End-to-end (Chromium)" reports on every PR, documentation-only ones too, and passes only when both halves pass | yes | confirmed | `e2e-result`: that name, `needs: e2e`, `if: always()`, `test "$RESULT" = "success"`; docs-only legs succeed with skipped steps; nothing else refers to the old job |
| 6 | The same, seen on GitHub (branch protection accepts the renamed matrix plus `e2e-result`) | no | can't check here | Needs a real Actions run on a PR |
| 7 | Each shard passes on its own instance | yes | can't check here | Shard 1 → 51 passed. Shard 2 → 10 failed while another process rebuilt `.next` mid-run; one failure, the new task 8 phone test at sign-in, came first |

**Overall:** not met: shard 2 has no clean run here and the GitHub behaviour is unchecked.

### Re-check — claim 7

Witnessed: 2026-10-08 23:11 EDT, by a fresh agent (blind). Commit: a05f9ab + working-tree diff (ci.yml, e2e/mobile.ts, e2e/users.ts, the new e2e/submit-together*.ts, SubmitDialogs.tsx, actions.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The two shards share no test | yes | confirmed | `--list --shard=1/2` → 55 tests in 31 files; `--shard=2/2` → 50 in 12 files; 0 shared |
| 2 | Together the shards are the whole suite, every project | yes | confirmed | `--list` → 105 tests in 43 files; the two shards together are identical to it |
| 6 | The same, seen on GitHub | no | can't check here | Needs a real Actions run on a PR |
| 7 | Each shard passes on its own instance | yes | confirmed | The existing build, unchanged across both runs: `--shard=1/2` → 55 passed (1.6m); `--shard=2/2` → 50 passed (1.1m); no flaky or retried tests. The task 8 tests have users of their own |

**Overall:** not met: claims 1, 2 and 7 hold; claim 6 needs a real GitHub Actions run, so the task stays unticked until a pull request's run confirms it.

## Task 13 — Which runs where

Witnessed: 2026-10-08 23:14 EDT, by a fresh agent (blind). Commit: 5d485ee + working-tree diff (CLAUDE.md, new docs/knowledge/test-runs.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A note in `docs/knowledge/` says what runs on SQLite, on the servers and end to end, locally and in CI | yes | confirmed | `test-runs.md` has the three-kinds table, "On a pull request (CI)" and "While working" |
| 2 | It says why the database tests stay | yes | confirmed | Matches the SPEC "Database tests stay" bullet; the e2e webServer is a SQLite instance |
| 3 | The note describes task 10 correctly | yes | confirmed | `test-db.ts` `reset()`, `schemaOf`, `STALE_MS = 2h`, `drop()` to stderr when `stuck`; `db-setup.ts`; `db-global-setup.ts` |
| 4 | The note describes task 11 correctly | yes | confirmed | `database.yml` only narrows on `SCOPE=core`; `changes.yml` non-PR → `all`; `db-scope.js` as the note lists it |
| 5 | "33 of the 86 files" | yes | confirmed | `vitest list` → 86, with the core filters → 33; `pnpm test:db:core` → 33 files, 155 passed, 8 skipped |
| 6 | "about 36 s on MySQL instead of 2–3 min" | yes | partly | Recorded: 43.7 s for core (29 files); 36 s is neither recorded nor reproduced |
| 7 | "On MySQL that took the full run from about 400 s to about 100 s" | yes | partly | Recorded: 454.6 s and 467 s before, 105–106.5 s after |
| 8 | The note describes task 12 correctly | yes | confirmed | `ci.yml` matrix `shard: [1, 2]`, `--shard=${{ matrix.shard }}/2`, `e2e-result` named "End-to-end (Chromium)" |
| 9 | "Locally each half took about 1.3 min, against 2.9 min for the whole" | yes | partly | Recorded: 1.6 and 1.1 min; 2.9 min isn't recorded |
| 10 | CI facts (Node 22 and 24, db on SQLite, docs-only skips, everything on main, weekly and manual runs) | yes | confirmed | `ci.yml`, `database.yml`, `changes.yml` |
| 11 | `pnpm test:db:mysql -- <path>` runs only that path | yes | confirmed | One file → 1 file, 6 passed |
| 12 | CLAUDE.md's Commands | yes | confirmed | The `test:db:core` row, `-- <paths>`, `--shard=1/2`, the CI paragraph |
| 13 | CLAUDE.md's rules, with a link to the note | yes | confirmed | The `createTestDb()` paragraph; the link resolves |
| 14 | The CI starting times in the note match the spec | yes | confirmed | "about 9 minutes, end-to-end about 6" vs SPEC "8.6 min, 5.6 min" |

**Overall:** not met: three numbers in the note aren't backed by a recorded or reproduced measurement (rows 6, 7 and 9).

### Re-check — claims 6, 7 and 9

Witnessed: 2026-10-08 23:14 EDT, by a fresh agent (blind). Commit: 5d485ee + working-tree diff (CLAUDE.md, docs/knowledge/test-runs.md as revised). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | "29 of them took 44 s on MySQL, against about 105 s for all 86 after task 10" | yes | confirmed | WITNESS task 11 row 7 (43.7 s, 29 files); task 10 (105 s, 106.5 s) |
| 7 | "from about 450 s to about 105 s" on MySQL | yes | confirmed | WITNESS task 10: 454.6 s and 467 s before, 105 s and 106.5 s after |
| 9 | "Locally the halves took 1.6 and 1.1 min." | yes | confirmed | WITNESS task 12 re-check row 7; no unbacked figure left in the note or CLAUDE.md |

**Overall:** met: the three figures are the ones recorded, and every other claim held in the first pass.

## Task 9 — Documentation

Witnessed: 2026-10-08 23:12 EDT, by a fresh agent (blind). Commit: a05f9ab + working tree (marketplace); ronne-web 622723a (branch `docs/112-dependency-cycles`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The ronne-web branch has the 112 Documentation in en, pt and fr | yes | confirmed | `git diff --stat main...622723a` → 17 files: export/items/review/rmk/versions in en, pt and fr, `product-facts.md`, `DependencyCards.tsx`; pt and fr match en paragraph by paragraph; the branch is unmerged until the release |
| 2 | `items#dependencies` says items may need each other, go through submit and release together, and never depend on themselves | yes | confirmed | `en/items.tsx:113-115` card "Each other, never itself"; the install line matches `resolve.ts:274` and `registry-api.db.test.ts:447` |
| 3 | `items#canvas` shows the cycle warning and "your draft" on a node, in the app's words | yes | confirmed | The quotes match `registry-checks.ts:233,349`; the canvas sends warnings with `together: true` and `composer.test.tsx` renders them |
| 4 | `review#checks` has no cycle refusal, and covers "your draft" and the group in the Submit dialog | yes | confirmed | Every quoted string matches `SubmitDialogs.tsx`; `e2e/submit-together.ts` uses the same strings |
| 5 | `review#dependencies` says items are submitted and released together, all or none, with the Publish dialog's words | yes | confirmed | The quotes match `PublishDialog.tsx`, `publish.ts:230` and `release-group.ts`; "Publish stays off" holds through `blocked` |
| 6 | `review#many` covers groups (all or none) and `rmk submit --no-deps` | yes | confirmed | `bulk-submit.ts:126-160`; `--no-deps` gives "is your draft: submit it with this item."; `submit.ts` matches the quotes |
| 7 | `versions#release-many` says groups are released in one transaction each, and that an item's own Publish releases its group | yes | confirmed | `en/versions.tsx:133-151` matches `bulk-release.ts:123` and `release-group.ts:104-106` |
| 8 | `rmk#installing` says items that need each other are installed together | yes | confirmed | `en/rmk.tsx:132-133`; the `export.tsx` hints match `orderLine`/`togetherLine` |
| 9 | The Submit and Release dialogs' group lists have the "Why do these go together?" helper, linking to `review#dependencies` | yes | confirmed | `Help.tsx:89-94`, used in `SubmitDialogs.tsx` and `PublishDialog.tsx`; 3 test files, 53 passed |
| 10 | The helper's words match how the app behaves in both dialogs | yes | partly | It said "they're your drafts", but the Publish dialog lists approved submissions, which can be another author's when a moderator releases them |
| 11 | Every help link points to a section that exists on the website | yes | confirmed | Each `docsHref` in `Help.tsx` against ronne-web `topics.ts` → 46 links, 0 missing |
| 12 | The docs tests pass in ronne-web | yes | confirmed | `pnpm test` → 29 files, 138 passed; lint and typecheck clean |

**Overall:** not met: the shared "submit-together" helper calls the Release dialog's members "your drafts".

### Re-check — claim 10

Witnessed: 2026-10-08 23:13 EDT, by a fresh agent (blind). Commit: 5d485ee + working tree (marketplace); ronne-web 622723a. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | The helper's words match how the app behaves in both dialogs, and the website's `review#dependencies` doesn't contradict them | yes | confirmed | Submit: "the drafts of yours it needs go with it", all or none, as the submit group (`submit-group.ts`, `bulk-submit.ts`). Publish: "the approved ones it needs that aren't released yet", all or none, no author named, as `release-group.ts:115-130` and `releaseTogether`. The site's `en/review.tsx:265-320` says the same. 3 test files, 53 passed |

**Overall:** met: the helper holds in both dialogs and agrees with the website, and every other claim was confirmed in the first pass.

## Task 8 — End to end

Witnessed: 2026-10-08 23:12 EDT, by a fresh agent (blind). Commit: 5d485ee + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm test:e2e` passes on desktop and phone | yes | confirmed | `pnpm test:e2e` → `105 passed (2.5m)`, exit 0, including submit-together on chromium, phone, phone-webkit and tablet |
| 2 | The new tests are stable when run on their own | yes | confirmed | `playwright test submit-together` → 4 passed (11.7s) |
| 3 | Two drafts that need each other: each skill's `ronne.yaml` names the other, and both are still drafts | yes | confirmed | `uploadCycle`: ping needs `^1.0.0` of pong and pong of ping, uploaded through `POST /api/v1/drafts`, never submitted |
| 4 | Submitted together from one item's page, with the group listed, one button and the outcome | yes | confirmed | `submitTogether` asserts "Goes with 1 of your drafts:", the link, "needs each other", "ready", "Submit with 1 more draft" and "Submitted A for review, with B." (`SubmitDialogs.tsx`); B's approval works only if B was submitted too |
| 5 | Approved by a moderator who isn't the author | yes | confirmed | A seeded moderator per project (`together*Moderator`); "approved it" for both ids |
| 6 | Released together from one Release dialog | yes | confirmed | B in "Released with it", "Publish 1.0.0", `Published A 1.0.0 as latest, with B 1.0.0.`. Remark: the version next to each member wasn't checked |
| 7 | Installed with `rmk`: one `rmk install A` installs both, once each, and the lock records A → B 1.0.0 | yes | confirmed | The built `bin.js` in a temporary HOME and project; both `SKILL.md` files and `rmk.lock` checked |
| 8 | The test fails if the behaviour breaks (the SubmitDialogs/actions fix reverted) | yes | confirmed | Reverted in a scratch copy and rebuilt: chromium, phone and tablet fail at the outcome line; phone-webkit still passed (timing) |
| 9 | The submitted state shows after a group submit when the dialog is closed with Escape, Close or × | yes | confirmed | Scratch probe against the built app: each way, the page shows "Submitted for review on" with Withdraw; B's page and My submissions show B submitted |
| 10 | Other submit flows aren't broken by removing `revalidatePath` from `submitDraftAction` | yes | confirmed | A lone submit still refreshes on close; `submit.e2e.ts` and `bulk-submit.e2e.ts` pass; `submitDraftAction` has one caller |
| 11 | The new seeded users don't disturb other tests | yes | confirmed | Full suite passed, `user-admin.e2e.ts` included |
| 12 | The changed files pass lint, typecheck and unit tests | yes | confirmed | `biome check` clean; web typecheck exit 0; `vitest run src/features/draft-editor` → 134 passed |

**Overall:** met: the end-to-end test covers a two-draft cycle submitted together from one page, approved, released together from one dialog and installed with `rmk`, on desktop, phone, iOS WebKit and tablet, and it fails on 3 of 4 projects when the dialog fix is reverted.

Afterwards, from the remarks: the test also closes the Submit dialog with Escape and checks the page shows it submitted (rows 8 and 9), and checks "Released with it" reads "B 1.0.0" (row 6); `playwright test submit-together` → 4 passed.
