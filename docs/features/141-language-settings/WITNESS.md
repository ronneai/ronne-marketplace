# 141 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — Decision

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 1ad89a71 plus the uncommitted diff to the 132 SPEC and MVP.md. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 "Languages" says root sets the default, whether people may choose and which languages are offered | no | confirmed | line 999: "Planned in 141 … root sets the instance default language, whether people may choose, and which languages are offered" |
| 2 | The row's older text ("no instance default language", "else English") doesn't contradict it | no | partly | the old sentence stood without saying 141 supersedes it |
| 3 | The 132 SPEC points to 141 for the instance default, in Out and in Open questions | no | confirmed | `git diff` of the 132 SPEC |
| 4 | README lists 141 under M19 with its dependencies | no | confirmed | line 361: `129, 132, 122, 007`, same as the SPEC header |
| 5 | The 141 SPEC Goal, Scope and Decisions agree with the MVP row and the 132 pointers | no | confirmed | read |
| 6 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** not met: row 2.

### Re-check

Witnessed: 2026-10-31, by a fresh agent (blind, row 2). Commit: 1ad89a71 plus the uncommitted diff. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | MVP.md:999 reads as superseded by 141 and agrees with the SPEC | no | confirmed | "there was no instance default language (a possible later feature, then planned in 141 below)" and "else English (…; the instance's default once 141 is built)" |
| 6 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** met.
