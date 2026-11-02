# 162 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-01 19:04 EST, by a fresh agent (blind). Commit: 5bc0467f + working tree (`git diff`: docs/MVP/MVP.md, docs/features/README.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §15's "Access tokens" row says root sets the longest lifetime on the Authentication tab: 30, 90 or 365 days or no limit | no | confirmed | `git diff docs/MVP/MVP.md` → MVP.md:993 "Root sets the longest lifetime on the Authentication tab … 30, 90 or 365 days or no limit". Matches SPEC Scope |
| 2 | The row says reviewers and root get the same cap or a shorter one, counted as the two-factor policy counts them | no | confirmed | MVP.md:993 "for reviewers and root (counted as the two-factor policy counts them) the same or shorter". `grep coveredBy …/two-factor-coverage.ts` → line 12 |
| 3 | The row gives the defaults, 365 days and 90 days | no | confirmed | MVP.md:993 "defaults 365 and 90 days". Matches SPEC Scope and Decision 2 |
| 4 | The row says which ways of making a token honour the cap, and what each gives | no | confirmed | MVP.md:993 "Account › Tokens, `rmk login` and the device flow honour it (the last two give 90 days, or the cap when shorter)". Matches SPEC Scope's three paths |
| 5 | A request for more than the cap is refused with `token_lifetime_too_long` | no | confirmed | MVP.md:993. Matches SPEC Scope |
| 6 | Shorten sets the earlier expiry and never revokes | no | confirmed | MVP.md:993 "the earlier of their own and the cap, never revoking them". Matches Decision 3. Wording remark: the spec says "now plus the maximum"; "the cap" mixes a date with a duration |
| 7 | Root sees a person's tokens on their page and can revoke one | no | confirmed | MVP.md:993. Matches SPEC Scope |
| 8 | Changing your password (a box, ticked by default) and root's two-factor reset revoke the account's tokens | no | confirmed | MVP.md:993. Matches SPEC Scope and Decision 4 |
| 9 | The row presents nothing as more settled than the spec does | no | partly | SPEC Decisions 1 and 2 mark the reviewers' shorter cap and the 365/90 defaults "(Claude, to confirm)"; MVP.md:993 puts both after "(owner, 2026-11-01, [162])" with no "to confirm" |
| 10 | Nothing else in MVP.md contradicts the spec | no | confirmed | `grep -n -i` for token, expiry, revoke, sessions, two-factor and reset: :647 "optional expiry" still holds; :636 and :1009 don't say tokens survive; :860 lists the policy in M28. Remark: the spec doesn't say whether 128's forced change at `/account/password` shows the box (a spec gap, not a contradiction) |
| 11 | `docs/features/README.md` lists 162 in M28 with the spec's dependencies, a matching description and a fitting status | no | confirmed | README.md:452 M28; deps "009, 105, 107, 122, 123, 128" as the SPEC header; status `specified` → `in progress` |
| 12 | `pnpm witness:check` passes | no | confirmed | `node packages/repo-tools/src/check-witness.js; echo EXIT=$?` → `EXIT=0` |

**Overall:** not met: the row and the index say what the spec says, but MVP.md:993 credits the owner with the reviewers' shorter cap and the defaults, which the spec marks "(Claude, to confirm)".

### Re-check (rows 6 and 9)

Witnessed: 2026-11-01 19:05 EST, by a fresh agent (blind). Commit: 5bc0467f + working tree (`git diff`: docs/MVP/MVP.md, docs/features/README.md; task 2 code outside docs/ ignored). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The row says Shorten sets the earlier expiry and never revokes | no | confirmed | MVP.md:993 "Shorten sets older tokens' expiry to the earlier of their own and now plus the cap, never revoking them"; matches SPEC Scope ("the earlier of its own and now plus the maximum") and Decision 3 |
| 9 | The row presents nothing as more settled than the spec does | no | confirmed | MVP.md:993 adds "(the separate cap for reviewers and the defaults are Claude's, to confirm: 162's Decisions 1 and 2)"; `grep -n "to confirm" SPEC.md` → :117 and :119, Decisions 1 and 2. The owner's attribution now covers only what the spec credits to the owner |

**Overall:** met: with rows 1–5, 7, 8 and 10–12 of the first pass, every row is confirmed. `node packages/repo-tools/src/check-witness.js` → EXIT=0.
