# 140 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — Decision

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 5f78b1b0 (tree clean). Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 has an "Upgrade check" row | no | confirmed | `grep -n -i "upgrade check" docs/MVP/MVP.md` → line 1011 |
| 2 | The row agrees with the SPEC's Goal and Decisions | no | confirmed | root only, notification center, per-install instructions, off switch, silent offline; Decisions 2-4 are left out, not contradicted |
| 3 | README lists 140 in M21 with its dependencies | no | confirmed | line 393: `139, 122, 102, 005, 035, 082, 085`, same as the SPEC header |
| 4 | The README row says what the SPEC says | no | confirmed | covers the daily request, lease, one notification per version, the tab, the mark, the switch |
| 5 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** met.
