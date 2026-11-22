# 191 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-22 11:07 EST, by a fresh agent (blind). Commit: 79633e4c + working-tree diff (only `docs/MVP/MVP.md`). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 has a "Who may create accounts" row for option C | no | confirmed | `git diff` → new row at MVP.md:1037, "(owner, 2026-11-20, option C)", linking to 191's SPEC.md |
| 2 | The row says what the Goal and Decision 1 say: a block list that applies to every way in and always wins, over per-way-in settings | no | confirmed | MVP.md:1037; the panel's name and place match Scope |
| 3 | The row gives Scope's rule in Scope's order, throwaway domains only with *Any domain* (Decision 7) | no | confirmed | MVP.md:1037 against SPEC Scope steps 1–4 |
| 4 | Decisions 2–6 are in the row | no | confirmed | MVP.md:1037: exact match, new accounts only, no link by email with *Any domain*, root's ways not governed and Create user warns, no groups while waiting |
| 5 | The row names 106's Decisions 8 and 9 and describes them correctly | no | confirmed | MVP.md:1037 against 106 SPEC Decisions 8 and 9 |
| 6 | The row records `user.created_via` and the no-change migration | no | confirmed | MVP.md:1037 |
| 7 | §14.3's design point is updated for 191 | no | confirmed | MVP.md:855. Remark: "never with link by email" leaves out 192's authority rule, an omission, not a contradiction |
| 8 | §9.5's identity providers bullet points to 191 without saying it's built | no | confirmed | MVP.md:646–648 "Once 191 is built" |
| 9 | Nothing in MVP.md says 191 is built | no | confirmed | `grep -n 191 docs/MVP/MVP.md` → 4 hits, none says built |
| 10 | No other MVP row contradicts 191 | no | confirmed | the SSO and Self-registration rows; greps for `throwaway`, `block list`, `any domain`, `created_via` |
| 11 | `docs/features/README.md` lists 191 in M32, matching the spec | no | confirmed | README.md:527, 533, order line 525 |
| 12 | `pnpm witness:check` passes | no | confirmed | exit 0 |
| 13 | `pnpm docs:check` passes | no | confirmed | exit 0 |

**Overall:** met.

Fix after the pass (wording, row 7's remark): MVP.md §14.3 says "never with link by email, except 192's authority rule".

### Re-check 1

Witnessed: 2026-11-22 11:08 EST, by a fresh agent (blind, wording only). Commit: 79633e4c + working-tree diff of docs/MVP/MVP.md. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | §14.3 "Root keeps control." carries 192's authority rule as the only exception, and says neither 191 nor 192 is built | no | confirmed | MVP.md:855 against SPEC.md:43–44; "Being built", "will"; `grep -n 192 docs/MVP/MVP.md` → only line 855 |
| 8 | `pnpm witness:check` and `pnpm docs:check` still pass | no | confirmed | exit 0 each |

**Overall:** met.
