# 194 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-23 16:52 EST, by a fresh agent (blind). Commit: 5c47d828 + working-tree diff (docs/MVP/MVP.md, docs/features/README.md, docs/features/milestones/M32-open-sign-up-and-email.md). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §15 "Web sign-in" row says a forgotten password can be reset by email, with a 6-digit code, then two-factor, then a new password | no | confirmed | MVP.md:1004 "a 6-digit code (190's email codes) that only opens the next step, then the account's two-factor when it has one, then a new password on a page that works once for 10 minutes"; matches Scope and Decision 2 |
| 2 | The §15 row says the reset never signs anyone in and never works for root | no | confirmed | MVP.md:1004 "It never signs anyone in … root accounts never get a code and reset on the server (`reset-root-password`)"; Decisions 1 and 3 |
| 3 | The §15 row agrees with Decisions 4 and 5 | no | confirmed | MVP.md:1004 "revokes access tokens unless the person unticks the box", "when root turns it on", "The setting needs working email and an Instance contact"; also "Every address gets the same answer", "ends every session", "emails a notice" |
| 4 | The MVP rows don't claim 194 is built | no | confirmed | MVP.md:1004 "(194, being built; owner, 2026-11-20)"; MVP.md:520 "once 194 is built and root turns it on"; MVP.md:1045 lists 194 only among the features that need email |
| 5 | §8's Auth row doesn't say there is no email for passwords, and describes the reset by email | no | confirmed | MVP.md:520 under `## 8. Web application`; `grep -c "there's no email in the MVP"` → 0 in the working tree and in HEAD |
| 6 | No other MVP.md line contradicts the spec | no | confirmed | `grep -n -i "no email\|without email\|no outgoing\|forgot\|reset.*email\|password reset"` → lines 520, 1004, 1045, 1029; 1029 is 128's forced change, not a reset; 462, 640–641, 1008 (root resets, `reset-two-factor`) agree with Decision 3 and Out |
| 7 | `docs/features/README.md` lists 194 in M32 | no | confirmed | README.md:323 "… \| identity \| M32 \| in progress" |
| 8 | The index row and the M32 row have the same status | no | confirmed | `git diff` → both `specified` → `in progress` (README.md:323, M32-open-sign-up-and-email.md:22) |
| 9 | `pnpm witness:check` passes | no | confirmed | exit 0 |
| 10 | `pnpm docs:check` passes | no | confirmed | exit 0 |

**Overall:** met.
