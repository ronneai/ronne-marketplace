# 136 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-10-28 16:00 EDT, by a fresh agent (blind). Commit: 26edfd61 + uncommitted diff to docs/MVP/MVP.md, docs/features/135-skill-scanner/SPEC.md, docs/features/README.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §15's "Security scan" row describes 136 as its SPEC does | no | partly | The new text matches SPEC Scope and Decisions 1–3, but the row's earlier sentences ("the key never goes in the database or the web") and its rationale ("both stay with the operator") still contradict it |
| 2 | The wording fits a feature that isn't built yet | no | partly | §15 says "Since NNN" only for shipped features (118, 036, 093) and "Planned as …" otherwise; "**Since 136**" in §15 and "since 136" in §12 read as shipped |
| 3 | MVP §12's "Security scan in review" bullet matches 136 | no | confirmed | `MVP.md:739` → provider set by the operator, or by root in Admin › Settings, key encrypted at rest |
| 4 | 135 decision 3 points at 136 and says what 136 keeps | no | confirmed | "136 keeps this: root picks a command only from the operator's list." |
| 5 | 135 decision 5 points at 136 and says what changes | no | confirmed | "Changed by [136](…): root sets the provider and its key in the web too, the key encrypted at rest; the environment still wins." |
| 6 | README M20 lists 136 with the right dependencies and status | no | confirmed | `README.md:372` → "135, 106, 098, 099", as the SPEC header; `in progress` |
| 7 | The new relative links resolve | no | confirmed | `test -f` on both targets → ok |
| 8 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** not met: rows 1 and 2. The §15 row's old sentences and rationale are marked "until 136", and 136 is worded as planned in §15 and §12; README's M20 intro is updated too. Re-checked below.

### Re-check

Witnessed: 2026-10-28 16:01 EDT, by a fresh agent (blind). Commit: 26edfd61 + uncommitted `git diff docs/`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The §15 row no longer contradicts itself | no | confirmed | `MVP.md:1006` → "(until 136, below)", "(until 136)"; the rationale keeps only the command with the operator |
| 2 | 136 is worded as planned in §15 and §12, as MVP.md words unbuilt work | no | confirmed | `grep -n 'Since 136\|since 136'` → nothing; "Planned in [136] (owner, 2026-10-28): root will set …"; §12 "or, planned in [136], by root" |
| 3 | The row and the §12 bullet agree with each other and with 136's SPEC | no | confirmed | Write-only key, AES-256-GCM from `AUTH_SECRET`, `rotate-secret`, `https://` and not internal unless allowed, command from `RONNE_SKILL_SCANNERS`, environment wins |
| 4 | Sentence breaks are right | no | confirmed | "… ([135]). Planned in [136] …" |
| 5 | README's M20 intro no longer says only the operator sets up a provider | no | confirmed | "by the operator; by root too once 136 lands" |
| 6 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** met: the §15 row and §12 bullet agree, 136 is worded as planned throughout, and the README matches. (The remark "136 moves them" now reads "will move".)
