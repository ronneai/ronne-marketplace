# 137 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-10-28 22:29 EDT, by a fresh agent (blind). Commit: 4d4bb5bb + uncommitted `git diff` (MVP.md, 135 SPEC, 137 PLAN and SPEC, features README). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §12 "Security scan in review" says, as planned in 137, a threshold can block approval | no | confirmed | `docs/MVP/MVP.md:739` → "advisory by default. Planned in [137](…): root can set a threshold score, and a revision that scores at or above it, or has no finished scan, can't be approved except by root's audited override" |
| 2 | MVP.md §15 "Security scan" row says, as planned, a threshold can block approval | no | confirmed | `MVP.md:1006` → "Planned in [137](…) … fails closed … except by root's override, with a reason, audited; with no threshold, the default, it stays advisory. Not in personal workspaces…" |
| 3 | Nothing else in those rows still says "never blocks" unqualified | no | not met | `MVP.md:1006` still opens "It is advisory, never a gate", and its rationale says "decides nothing", unqualified |
| 4 | 135's decision 1 points at 137 | no | confirmed | `135-skill-scanner/SPEC.md:253-255` → "Changed by [137](…)". Remark: Scope's "**Advisory.** … never blocks anything" has no pointer |
| 5 | features README lists 137 in M20 | no | confirmed | `README.md:375`, "in progress" |
| 6 | The M20 intro no longer says it never blocks | no | partly | qualified, but in present tense for a feature not built; the same paragraph words 136 as planned |
| 7 | The new relative links resolve | no | confirmed | `test -f` on every target → all exist |
| 8 | 137's SPEC and PLAN point at 135's decision 1 | no | confirmed | "decision 4" → "decision 1" in four places; decision 1 is "SkillSpector, on the server, advisory" |
| 9 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** not met: rows 3 and 6. The §15 row's "never a gate" and "decides nothing" are qualified (until 137, unless root sets a threshold), the M20 intro says "once 137 lands", and 135's Scope "Advisory" points at 137. Re-checked below.

### Re-check

Witnessed: 2026-10-28 22:30 EDT, by a fresh agent (blind). Commit: 4d4bb5bb + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §12 says a threshold can block approval, as planned | no | confirmed | `MVP.md:739` → "advisory by default. Planned in [137](…)…" |
| 2 | MVP §15 decision column qualifies "never a gate" | no | confirmed | `MVP.md:1006` → "never a gate (until 137, below: a gate only with root's threshold)" |
| 3 | MVP §15 rationale qualifies "decides nothing" | no | confirmed | "decides nothing (unless root sets a threshold, planned in 137)" |
| 4 | 135's decision 1 points at 137 | no | confirmed | `135 SPEC:254-256` → "Changed by [137](…)"; no "decision 4" left in 137's docs |
| 5 | 135's Scope "Advisory" bullet is qualified | no | confirmed | "(changed by [137], planned: root's threshold can block approval)"; remark: "behave as before" in the next sentence is unqualified |
| 6 | README lists 137 in M20 | no | confirmed | the M20 table row, "in progress" |
| 7 | The M20 intro no longer says it never blocks | no | confirmed | "once 137 lands, blocks an approval only when root sets a threshold score" |
| 8 | 137 is worded as planned everywhere | no | partly | present tense in `135 SPEC:254` ("Changed by [137]: … blocks approval") and `MVP.md:1006` rationale ("137 makes it a gate") |
| 9 | What is said matches the 137 SPEC | no | confirmed | threshold, fail closed, root's override with reason and audit, advisory by default, no gate in personal workspaces: no contradiction |
| 10 | Relative links resolve | no | confirmed | `ls` of every target; `#15-decision-log` → `MVP.md:929` |
| 11 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** not met: row 8, wording only. 135's decision 1 now says "To be changed by 137 (planned) … will block", its Scope's "behave as before" says "(until 137)", and MVP §15's rationale says "137 will make it a gate". Re-checked below.

### Re-check

Witnessed: 2026-10-28 22:31 EDT, by a fresh agent (blind). Commit: 4d4bb5bb + uncommitted `git diff docs/`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §12 says a threshold can block approval, as planned | no | confirmed | `MVP.md:739` → "advisory by default. Planned in [137](…)…"; "never blocks" gone |
| 2 | §15 decision column says the gate is planned and matches the 137 SPEC | no | confirmed | `MVP.md:1006` → "never a gate (until 137, below…)"; "Planned in [137](…)… fails closed… with a reason, audited… Not in personal workspaces" |
| 3 | §15 rationale no longer says "decides nothing" unqualified | no | confirmed | "decides nothing (unless root sets a threshold, planned in 137)"; "137 will make it a gate…" |
| 4 | 135's decision 1 points at 137 as planned; 137 cites decision 1 | no | confirmed | `135 SPEC:254-256` → "To be changed by [137](…) (planned): … will block approval"; no "decision 4" in 137's docs |
| 5 | 135's Scope "Advisory" bullet is qualified as planned | no | confirmed | `135 SPEC:33-35` → "(changed by [137](…), planned…)… behave as before (until 137)" |
| 6 | README lists 137 in M20; the intro no longer says it never blocks | no | confirmed | `README.md:375` row, "in progress"; `:368-369` "once 137 lands, blocks an approval only when root sets a threshold score" |
| 7 | Nothing else says "never blocks" or "decides nothing" unqualified | no | confirmed | `grep -rniE "never blocks|never a gate|decides nothing"` → only the qualified lines above |
| 8 | The new relative links resolve | no | confirmed | `ls` of each target; `#15-decision-log` → `MVP.md:929` |
| 9 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** met.

## Task 2 — Remediation in the kept result

Witnessed: 2026-10-28 22:33 EDT, by a fresh agent (blind). Commit: 8389c9c5 + uncommitted diff (task 2 files only). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `parseSkillScan` keeps each finding's `remediation` from a real report | no | confirmed | `parse-skill-scan.ts:134` `remediation: text(issue.remediation)`; core skill-scan tests → 64 passed; mutation to `null` → 3 tests fail |
| 2 | Remediation is cleaned like explanation (control, format, invisible characters stripped; tab and newline kept) | no | confirmed | same `text()` helper; probe strips every planted invisible character, keeps "One.\n\tTwo."; mutation keeping the raw string → the cleaning test fails |
| 3 | Remediation is cut like the other text | no | confirmed | probe → `SKILL_SCAN_MAX_TEXT` code points ending in "…", no lone surrogate; identical to explanation for the same input |
| 4 | A missing or non-string remediation reads as null | no | confirmed | probe → `42`, `[]`, `{}`, `true`, `null`, missing → `null` |
| 5 | A stored row without remediation reads as `null`, not `undefined` | no | confirmed | `kysely-content-scan-repository.ts:33-36`; `scans.db.test.ts` "reads a scan stored before 137…"; db scans tests → 21 passed; mutation removing the mapping → it fails |
| 6 | The same on the database servers | no | confirmed | `pnpm test:db:postgres` / `:mysql` / `:mariadb -- src/server/domains/scans` → 21/21 on each |
| 7 | Nothing else is newly kept: no quoted item content or code snippets | no | confirmed | a finding's keys are exactly the nine expected; a planted `code_snippet` doesn't appear; none of bad-skill's snippets or URLs in the result |
| 8 | Types and their users updated | no | confirmed | `SkillScanFinding.remediation: string \| null`; fixtures updated; `pnpm typecheck` → 7/7 |

**Overall:** met.
