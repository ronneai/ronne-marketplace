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

## Task 3 — The threshold and the gate

Witnessed: 2026-10-28 22:52 EDT, by a fresh agent (blind; it ran probes and mutations in a scratch copy). Commit: 87334c34 + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Type-checks | no | confirmed | `pnpm typecheck` → 7/7 |
| 2 | `skill_scan_block_score` saved with the tab: empty none, 1–100, anything else refused with nothing changed, left out kept | no | confirmed | `settings.ts:430-439,474-489`; `admin-settings/actions.ts:151-152` (`form.has`); db test refuses "0", "101", "7.5", "1e2", "abc", 50 with no audit |
| 3 | The threshold is audited with the tab, alone too | no | confirmed | `metadata.blockScore {from:null,to:60}`; the same value again → `changed:false`, no audit |
| 4 | Pure `scanGate` covers every state | no | confirmed | `scan-gate.ts:34-55`; unit run → 216 passed; edges 69/70/100 |
| 5 | `decisionsFor` gains the gate (Approve disabled, root's scan override, replaces 054's on root's own, stale keeps it off) | no | confirmed | `decisions.ts:59-71`; `decisions.test.ts` |
| 6 | `decide` checks the gate under the lock against the revision approved; request changes and reject aren't gated | no | confirmed | `reviews.ts:157-191`; mutation removing the check → 7/14 db tests fail; a stale-revision scan override refused; no other code sets approved |
| 7 | Queue rows and Approve many skip a blocked row, approve an open one; root's own too | no | confirmed | `queue.ts:187-198`, `bulk-approve.ts:62-65,140`; mutation → the test fails |
| 8 | The gate uses the newest scan of the **latest** revision | no | partly | code right, probes pass on four databases; but mutation dropping `latest.delete(...)` passes every repository test: none has more than one revision |
| 9 | db tests cover each approval path blocked and open | no | partly | the review page is db-tested only blocked |
| 10 | `scan_override`: root only, reason required, event and audit with score, threshold and code; refused when not blocked | no | confirmed | db tests; mutation dropping the permission → "is root's alone" fails; the author refused too |
| 11 | The threshold is read when the decision is made | no | confirmed | `actions/reviews.ts:21-25`; db test 80 vs 75 then 85 |
| 12 | Root may Scan again any time, not while one waits or runs | no | confirmed | `scans.ts:118-126`, `actions/scans.ts:131-132`; `scans.db.test.ts` |
| 13 | It works on the four databases | no | confirmed | 341 db tests on SQLite, PostgreSQL, MySQL, MariaDB; probes 7/7 on each |
| 14 | The new words are in English, Portuguese and French | no | confirmed | keys present; `vitest run src/i18n` → 367 passed |

**Overall:** not met: rows 8 and 9 (test gaps). Remarks: a hand-edited threshold that isn't valid reads as no gate; the gate's wording differed from SPEC "The gate's words". A db test now sends revisions 2 (unscanned, with revision 1 scored low → `none`) and 3 (scanned 99 → `score`), and fails with `latest.delete` removed; another checks the review page's open gate; SPEC's words now match the messages and say how a broken stored threshold reads. Re-checked below.

### Adversarial pass

Witnessed: 2026-10-28 22:49 EDT, by a fresh agent (adversarial). Commit: 87334c34 + uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The threshold: empty or 1–100, odd and hand-edited values as none, kept when left out, audited | no | confirmed | `skill-scan.db.test.ts` on four databases; a hand-set "070" reads 70 and blocks 80; 100 blocks 100 |
| 2 | `decide` blocks at or above, pending, failed, none (fails closed) | no | confirmed | four dialects; mutation dropping the throw → 7/14 fail; a failed settings read throws rather than opening |
| 3 | The gate uses the latest revision's newest scan | no | partly | code holds (probe on four dialects); mutation dropping `latest.delete(...)` passes every shipped test |
| 4 | Checked under the row's lock against the revision approved | no | confirmed | `reviews.ts:157-191`, one transaction; approving revision 1 after revision 2 → `RevisionChangedError` |
| 5 | The page and queue disable Approve with the reason; Approve many skips | no | confirmed | db tests; `ScanBlockedError` mid-batch → `not_approvable` |
| 6 | Root alone overrides, with a reason; refused when not blocked | no | confirmed | a moderator's `scan_override` and `override` → ForbiddenError; open gate → ScanOverrideNotNeededError. Remark: a reason of only U+200B passes the shared `messageFrom` (not 137's) |
| 7 | Audited with score, threshold and code; event `scan_override` | no | confirmed | db test on four dialects; `publish.ts:540`, `queue.ts:129` count it as an approval |
| 8 | Replaces 054's override on root's own blocked submission | no | confirmed | db test; `decisions.ts:69-70` |
| 9 | Personal workspaces aren't gated, and only root approves past the gate | no | not met | `scan-gate.ts:44` opened the gate for any submission in a personal workspace: a scope put in a moderator's personal workspace (as 115's move allows) let the moderator approve someone else's submission scored 99, on four dialects |
| 10 | No threshold, scanning off or a type not scanned: as before | no | confirmed | db tests; scanning off with a score of 95 → open |
| 11 | Root may Scan again unless one waits or runs | no | confirmed | `scans.db.test.ts` |
| 12 | The new messages are valid ICU with matching placeholders | no | confirmed | 583 tests passed; placeholders match across en, pt, fr |

**Overall:** not met: rows 3 and 9. The gate now opens only for the owner's own submission in their personal workspace (114's condition), and a db test with the scope in a moderator's personal workspace fails without the fix; the test gap of row 3 is the one closed after the first pass. SPEC (Out, Decision 5) and MVP §15 say "the owner's own". Re-checked below.

### Re-check

Witnessed: 2026-10-28 23:05 EDT, by a fresh agent (adversarial, blind). Commit: 87334c34 + uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only the owner's own submission in their personal workspace is exempt; anyone else's there is gated | no | confirmed | `scan-gate.ts:48` (`ownerId === authorId`); probe: team scope in the moderator's personal workspace, score 99 → `decide` refused, Approve many `not_approvable`, page blocked; mutation `ownerId`-only → the 115 test fails |
| 2 | `latestScans` counts only the latest revision's newest scan, and a shipped test proves it | no | confirmed | mutation deleting `latest.delete(...)` → "counts only the latest revision's scans…" fails |
| 3 | The review page is db-tested blocked and open | no | confirmed | `scan-gate.db.test.ts:300,382`; mutations forcing the page gate open or blocked → the page tests fail |
| 4 | No approval path gets past the gate | no | confirmed | `transition(…, "approve")` only in `submissions.ts:332` (the owner's self-approval on send); `decide` only through `actions/reviews.ts`, whose deps always carry `scanGatePolicyNow`; bulk goes through `decide` |
| 5 | The gate fails closed | no | confirmed | done with no score → `failed`; 100 at 100 → `score`; a submission the viewer can't read → `none` |
| 6 | Threshold saved and audited, bad values refused | no | confirmed | `skill-scan.db.test.ts:198-219`; mutations to the audit and the threshold-only change → tests fail |
| 7 | Unit tests cover every gate state | no | confirmed | `scan-gate.test.ts:14-66`; unit run → 584 passed |
| 8 | Override and the threshold read when deciding, on four databases | no | confirmed | 344 db tests on SQLite, PostgreSQL, MySQL, MariaDB; `pnpm typecheck` → 7/7 |

**Overall:** met. Remark (low, root only): an author's submission scanned high in a team scope, whose scope is then moved into that author's own personal workspace, skips the gate, so root approves it without the scan override's reason and audit. Recorded in PLAN's Notes.

### Re-check

Witnessed: 2026-10-28 23:03 EDT, by a fresh agent (blind; probes and mutations in a scratch copy). Commit: 87334c34 + staged `git diff --cached`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Types check | no | confirmed | `pnpm typecheck` → exit 0 |
| 2 | Unit tests cover every gate state | no | confirmed | `models/scan-gate.test.ts:14-66`; unit run → 584 passed |
| 3 | The gate uses only the latest revision's newest scan, with a db test | no | confirmed | `kysely-submission-repository.ts:512-546`; `scan-gate.db.test.ts:350,394`; mutation removing `latest.delete(...)` → 1 failed |
| 4 | Each approval path db-tested blocked and open | no | confirmed | `scan-gate.db.test.ts:145-176` decide; `:319` queue and Approve many; `:300` page blocked; `:382` page open |
| 5 | `decide` gates under the lock, against the revision approved | no | confirmed | `services/reviews.ts:179-191`; request changes and reject left alone (`:207`) |
| 6 | The threshold is read when the decision is made | no | confirmed | `actions/reviews.ts:21-25`; `scan-gate.db.test.ts:186` |
| 7 | `scan_override`: root only, reason required, event and audit, refused when not blocked | no | confirmed | `reviews.ts:113-119,148,189-191,212-214`; `scan-gate.db.test.ts:242,270,279,288` |
| 8 | Only the owner's own submission in their personal workspace is exempt | no | confirmed | `scan-gate.ts:48`; `scan-gate.db.test.ts:216`; mutation → 1 failed; SPEC:73, :190 |
| 9 | `skill_scan_block_score` saved and audited; a bad stored value reads as none | no | confirmed | `typedBlockScore`; `skill-scan.db.test.ts:197,207,224` |
| 10 | Root may Scan again any time, never while one waits or runs | no | confirmed | `scans/services/scans.ts`; `scans/actions/scans.ts`; `scans.db.test.ts` |
| 11 | Messages in en, pt, fr; SPEC's gate words match the English | no | confirmed | all keys in the three; the four blocked sentences equal SPEC:95-100 and `scanBlockedEnglish`. "Under the threshold" and the author's line are task 5's |
| 12 | The db tests pass on the four databases | no | confirmed | 30 files, 344 passed on SQLite, PostgreSQL, MySQL, MariaDB |

**Overall:** met.
