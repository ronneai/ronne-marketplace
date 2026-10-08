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
