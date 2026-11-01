# 163 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-01 11:12 EST, by a fresh agent (blind). Commit: bd64ae71 + working-tree diff (docs/MVP/MVP.md, docs/features/README.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | §2's permission matrix says root's override of their own submission needs a reason | no | confirmed | `MVP.md:75` (under `## 2. Personas & roles`, line 37) → "Approve own submission (override, with a reason, audited; [163](…))", root only. This matches SPEC's Documentation line "(override, with a reason, audited)". "planned" removed (`git diff`) |
| 2 | §15's "Approval" row says the override always needs a reason, on the review page and in Approve many when the selection has overrides | no | confirmed | `MVP.md:945` → "Root's override always gives a reason, on the review page and in Approve many when the selection has overrides … ([163], owner, 2026-11-01; optional for both since 054)". The "Planned in 163" wording is replaced (`git diff`) |
| 3 | An ordinary approval's message stays optional (Scope In, Decision 1) | no | confirmed | `MVP.md:945` → "an ordinary approval's message stays optional". `MVP.md:327` (lifecycle) → "an ordinary approval's message is optional". `grep -i "optional\|message"` in MVP.md finds nothing that contradicts it |
| 4 | The lifecycle bullet agrees: self-approval is an audited override that always gives a reason | no | confirmed | `MVP.md:327` → "Root can self-approve as an audited override, which always gives a reason ([163])". `grep -n -i override MVP.md` → no other line calls the reason optional |
| 5 | Decision 1's rationale (an override is the one approval nobody else checks; 054's reason for optional messages was speed) is on the record | no | confirmed | `MVP.md:945`, rationale column → "An override is the one approval nobody else checks, so it says why"; "optional for both since 054" in the decision column |
| 6 | Decision 2: one reason covers a bulk selection that includes overrides | no | confirmed | `MVP.md:945` → "in Approve many when the selection has overrides" (the singular "a reason" for one dialog; it doesn't literally say "one reason for all"). README:460 says the same. MVP.md has no separate Approve-many row to contradict it (`grep -i "approve many\|bulk"` → only lines 337 and 964, about submit and release) |
| 7 | Scope Out: self-approval in a personal workspace stays automatic | no | confirmed | `MVP.md:76` unchanged → "submit, approved at once without review". `MVP.md:945` unchanged → "approved as it's sent … never queued" (`self_approve`). The new override sentence applies to root's override, and the row's "so is an override there" keeps the not-reviewed marking, as in the SPEC's edge case |
| 8 | Scope Out: a second root for root's own submissions is left for M31 (178, 179) | no | confirmed | MVP.md doesn't add a second-approver rule (row 945 still reads "1 approval"). `README.md:502-503` → 178 "Governance policies … (approvals …)" and 179 "Approvals by risk … two approvals", both `planned` under `### M31`. Neither names "root's own submissions" literally, but nothing contradicts the spec |
| 9 | `docs/features/README.md` lists 163 in M28 | no | confirmed | `README.md:452` `### M28 — Governance foundations`; `README.md:460` → 163 row with the spec's summary, depends "014, 054, 058, 137" (same as SPEC header), status changed `specified` → `in progress` (`git diff`) |
| 10 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check; echo exit=$?` → `node packages/repo-tools/src/check-witness.js`, no errors, `exit=0` (run on the working tree as it is now) |

**Overall:** met: MVP §2's matrix, the §4 lifecycle bullet and the §15 "Approval" row all say the override needs a reason and an ordinary approval's message stays optional. The index lists 163 in M28, and `pnpm witness:check` passes. (Its wording remark, SPEC's header still quoting the old matrix row, was fixed in the same commit.)
