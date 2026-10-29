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

## Task 4 — Dismissals

Witnessed: 2026-10-28 23:20 EDT, by a fresh agent (blind). Commit: 1f33fb19 + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration `0039_scan_dismissals` as specified, registered and typed | no | confirmed | `0039_scan_dismissals.ts:13-37`; `migrations/index.ts:85`; `schema.ts:666-676,704` |
| 2 | The migration's guard test passes | no | confirmed | 40 passed |
| 3 | A reviewer dismisses with a reason and restores (the row deleted) | no | confirmed | `dismissals.db.test.ts` on four databases; restore is a `deleteFrom` |
| 4 | Once per scan; the same position in another scan is another finding | no | confirmed | mutation removing the unique constraint → 2 tests fail; one audit event |
| 5 | Out-of-range or non-integer index, unknown scan, failed scan → not found | no | confirmed | mutation removing the range check → 2 fail. The `done` check is redundant today (no findings otherwise) |
| 6 | The author never dismisses or restores, even a moderator | no | partly | the code is right (probe), but removing the author clause leaves every test green: the test's author can't review anyway |
| 7 | An outsider is told not found; no session is forbidden | no | confirmed | mutation removing `canSeeScan` → a test fails |
| 8 | Dismissals go with their scan | no | confirmed | mutation to restrict → "goes with its scan" fails; four databases |
| 9 | Audited with name, revision, finding, rule, file (absent when none), never the text | no | confirmed | mutation → the audit test fails; exact metadata asserted |
| 10 | Audit sentences in en, pt, fr | no | confirmed | 466 passed |
| 11 | The four new errors in three languages | no | confirmed | `errors.test.ts` includes `scansErrors` |
| 12 | Only reviewers of the workspace or the author see a scan and its dismissals | no | confirmed | mutation removing the check in `reviewScan` → a test fails |
| 13 | The data download includes dismissal reasons as `false_positive` | no | confirmed | mutation → the test fails |
| 14 | Dismissals don't change the score or the gate | no | confirmed | nothing in `submissions/` reads them |
| 15 | db tests on four databases; typecheck | no | confirmed | 446 passed on each server; typecheck 7/7 |

**Overall:** not met: row 6. A db test now has a moderator author their own submission: dismiss and restore → `NotScanReviewerError`, `canDismiss` false, root still can; with the author clause removed it fails. Re-checked below.

### Adversarial pass

Witnessed: 2026-10-28 23:26 EDT, by a fresh agent (adversarial). Commit: 1f33fb19 + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration: scan FK cascade, user FK restrict, unique (scan_id, finding); guard test | no | confirmed | four databases; mutations to cascade and unique fail tests; deleting the submission cascades |
| 2 | Erasing a user who dismissed doesn't fail on the restrict FK | no | confirmed | `adminEraseUser(moderator)` ok on four databases; the rows stay |
| 3 | Reviewers may dismiss; the author never, even a reviewer | no | partly | code right (probe); removing the author clause leaves the suite green |
| 4 | An outsider or another workspace's moderator → not found; signed out refused | no | confirmed | probe: `FindingNotFoundError`, `reviewScan` empty; signed out → `ForbiddenError` before any lookup |
| 5 | Only an integer within a finished scan's kept findings | no | partly | NaN, Infinity, 1e300, 2^53, "1", [0], `valueOf` objects, true refused; removing the `done` check leaves the suite green |
| 6 | Someone who can't see the submission gets not found; `reviewScan` only for the author or a viewer of submitted work | no | not met | submit → archive → restore (a draft): a moderator's `reviewScan` returns the scan with `canDismiss` true, and `dismissFinding` succeeds, on four databases; drafts are hidden from non-authors everywhere else |
| 7 | The reason: cleaned, 1–500 code points, plain text | no | confirmed | bidi-only, BOM and zero-width-only → required; 501 emoji → too long; HTML verbatim. Remarks: U+3164 passes; stripping ZWJ splits emoji sequences |
| 8 | Once, also under concurrency; restore races end cleanly | no | confirmed | 3 parallel dismissals → one ok, two `FindingDismissedError`, one row and one audit, on four databases (PostgreSQL included) |
| 9 | Audited with name, revision, finding, rule, file only when there is one, the reason; never the text | no | confirmed | mutations dropping `reason` or writing `file: null` fail tests |
| 10 | Audit sentence and the `scan` filter group | no | confirmed | 102 passed |
| 11 | `reviewScan` returns dismissals and `canDismiss`; `canRequest` only for root | no | confirmed | probe: outsider and signed out get empty; root `canRequest` |
| 12 | Data download: the person's own reasons, merged, limit kept | no | confirmed | only the moderator's reason; `comments(id, 1)` → 1 row |

**Overall:** not met: row 6 (security), rows 3 and 5 (tests). `canSeeScan` and `canDismiss` now refuse a draft to anyone but its author (`target()` reads the submission's status), with a db test (archive, restore, then the moderator gets no scan and not found) that fails without it; a failed scan that kept findings is refused, with a test that fails without the `done` check; the author test from the first pass covers row 3. Reasons keep the zero-width joiner and need something visible (U+3164, ZWJ-only, NBSP plus U+2028 → required). 449 db tests on PostgreSQL, MySQL and MariaDB. Re-checked below.

### Re-check

Witnessed: 2026-10-28 23:35 EDT, by a fresh agent (blind). Commit: 1f33fb19 + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The author never dismisses or restores, even a moderator; root still can | no | confirmed | "an author who reviews"; removing `authorId !== user.id` → that test fails |
| 2 | Only a finished scan's findings, even when a failed one kept some | no | confirmed | removing the `done` check → that test fails |
| 3 | A draft's scan is hidden from its reviewers; its author still sees it | no | confirmed | "hides a draft's scan…"; letting reviewers see drafts → it fails |
| 4 | The reason: cleaned but the ZWJ, nothing visible refused, at most 500 code points | no | confirmed | `dismissals.ts:29-39`; stripping the ZWJ or checking only `=== ""` fails the test |
| 5 | Both events audited | no | confirmed | auditing restore as a dismissal fails the test |
| 6 | Dismissals go with their scan | no | confirmed | dropping the cascade fails the migration test |
| 7 | Guard test, typecheck, i18n and audit unit tests | no | confirmed | typecheck 7/7; 466 passed |
| 8 | The db tests on four databases | no | confirmed | SQLite 447 (+2 skipped); PostgreSQL, MySQL, MariaDB 449 each |
| 9 | Dismissals don't change the score or the gate | no | confirmed | nothing in `submissions/` reads them |

**Overall:** met. Remark: `canDismiss`'s `status !== "draft"` never decides (`canSeeScan` refuses a draft first); harmless.

### Re-check

Witnessed: 2026-10-28 23:39 EDT, by a fresh agent (adversarial). Commit: 1f33fb19 + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A draft hides its scan, dismissals and reasons from all but its author, and can't be marked | no | confirmed | probe on four databases; removing the draft clause → "hides a draft's scan…" fails |
| 2 | Scan visibility agrees with the review page for every status | no | confirmed | every status set by hand: allowed for submitted…published, refused for draft |
| 3 | Another workspace's moderator, an outsider, signed out: nothing; deletion cascades | no | confirmed | four databases |
| 4 | The author never dismisses or restores, even as moderator or root; a test fails without the clause | no | confirmed | mutation → the test fails |
| 5 | Only a finished scan's findings; a test fails without the check | no | confirmed | mutation → the test fails; odd indexes refused |
| 6 | The reason: cleaned but the ZWJ, nothing visible refused, at most 500 | no | confirmed | fillers, tags, ideographic space, soft hyphen, bidi-only refused; family emoji kept whole. Remark: U+2800 and a lone U+0301 accepted |
| 7 | Concurrent marks and restores keep rows and audit consistent | no | confirmed | 4 parallel × 12 rounds on four databases |
| 8 | Each concurrent loser gets the domain's own error | no | partly | MySQL 8.4: a three-way race returned a raw `ER_LOCK_DEADLOCK` about once in 17 rounds |
| 9 | Audit metadata never holds the finding's text | no | confirmed | probe |
| 10 | The data download has only the person's own reasons | no | confirmed | probe; but removing the `user_id` filter leaves the suite green |
| 11 | db tests and guard test on four databases; typecheck | no | confirmed | 428 on each server; typecheck 7/7 |

**Overall:** not met: row 8. Dismiss and restore now run in `retryOnDeadlock` (`db/locks.ts`), as SCIM and erasure do; the probe's three-way race on MySQL, 36 rounds over three runs, gave no deadlock. The download test now has root's reason too, and checks the moderator's download leaves it out. Re-checked below.

### Re-check

Witnessed: 2026-10-28 23:41 EDT, by a fresh agent (adversarial). Commit: 1f33fb19 + uncommitted diff. Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Racing marks and restores (2 + 2 on one finding) give success or the domain's own error | no | confirmed | 60 rounds × 4 calls, twice on MySQL 8.4 and MariaDB → 0 bad |
| 2 | The same under heavier contention: never a raw driver error | no | not met | 6 calls per finding on 2 findings, 25 rounds: MySQL 8.4 → 3, then 1 raw `ER_LOCK_DEADLOCK` once the 3 retries ran out; PostgreSQL, MariaDB, SQLite clean; no shipped test races the calls |
| 3 | Rows and audit events stay consistent under the races | no | confirmed | dismissed − restored = rows, every round, four databases |
| 4 | The data download has only the person's own reasons; a test fails without the filter | no | confirmed | mutation → the download test fails |
| 5 | A draft never reveals its scan, dismissals or reasons but to its author | no | confirmed | probe on three databases; mutation → the test fails |
| 6 | Another workspace's moderator or an outsider gets nothing | no | confirmed | scope moved to a private workspace: empty, not found, no existence oracle |
| 7 | The author never dismisses or restores, but sees the marks | no | confirmed | mutation → "an author who reviews" fails |
| 8 | Only a finished scan's findings; odd indexes and ids refused | no | confirmed | queued, running, failed refused; `' OR 1=1 --`, 1e300, 2^40 → not found |
| 9 | Unique finding, audit events and cascade each covered | no | confirmed | three mutations → three tests fail |
| 10 | db tests on four databases; guard; typecheck | no | confirmed | 38/38 on each; guard 40; typecheck 7/7 |

**Overall:** not met: row 2. Each mark and restore now locks its scan's row first (`lockScan`, `forUpdate`) in a READ COMMITTED transaction, so calls on one scan run one at a time; `retryOnDeadlock` stays for what the database may still pick. A shipped db test races 12 calls on two findings over 8 rounds and checks every outcome and that rows equal dismissed minus restored; on MySQL it fails without the lock and the retry (3 runs out of 3) and passes with them (3 of 3, and on PostgreSQL and MariaDB). The witness's 12-call probe on MySQL: 600 calls, 0 bad, twice. The comment says what the code does. Re-checked below.

### Re-check

Witnessed: 2026-10-28 23:51 EDT, by a fresh agent (adversarial). Commit: 1f33fb19 + uncommitted diff. Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Racing marks, restores and reads on one scan: success or the domain's error | yes | confirmed | 24 calls × 30 rounds per database; MySQL 558 ok, 80 dismissed, 82 not found, 0 bad; the others 0 bad |
| 2 | The same across three scans | no | confirmed | 36 calls × 20 rounds, four databases, 0 bad |
| 3 | Racing the deletion of the submission or scan: not found or success, no rows, no raw error | no | confirmed | four databases, 0 bad, 0 rows; without `lockScan`: raw `ER_NO_REFERENCED_ROW_2` (MySQL), `23503` (PostgreSQL) |
| 4 | With the lock, deadlocks don't happen | yes | confirmed | 0 retries counted; without `lockScan`, 6 in the shipped race test on MySQL |
| 5 | Rows and audit stay consistent | yes | confirmed | dismissed − restored = rows per finding |
| 6 | A shipped db test races these calls and fails without the lock | yes | partly | removing only `lockScan` leaves "racing marks and restores" green (the retry absorbs the deadlocks); no shipped test races deletion |
| 7 | A draft hides its scan from all but its author | no | confirmed | four databases; mutation → the test fails |
| 8 | Another workspace's moderator or an outsider gets nothing | no | confirmed | no existence oracle |
| 9 | The author never dismisses or restores, sees the marks | no | confirmed | mutation → the test fails |
| 10 | Only a finished scan's findings; odd indexes and ids refused | no | confirmed | four databases |
| 11 | Audit metadata as specified, never the text | no | confirmed | mutation dropping `file` → the test fails |
| 12 | The data download has only the person's own reasons | no | confirmed | mutation → the test fails |
| 13 | Dismissals go with their scan; once per (scan, finding) | no | confirmed | mutations → tests fail |
| 14 | db tests on four databases; guard; typecheck | no | confirmed | 39/39 on each; 50 passed; tsc exit 0 |

**Overall:** not met: row 6. A shipped db test now races marks and restores with the deletion of the submission or the scan, 12 rounds, and checks every outcome and that no row is left; with only the two `lockScan` calls removed it fails on MySQL (3 runs of 3) and PostgreSQL (3 of 3); with them it passes on SQLite, PostgreSQL, MySQL and MariaDB. Re-checked below.

### Re-check

Witnessed: 2026-10-29 00:06 EDT, by a fresh agent (adversarial). Commit: 1f33fb19 + uncommitted diff. Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Task 4's db tests and the migration test on four databases | no | confirmed | 19/19 on each |
| 2 | The migration guard test passes | no | confirmed | 40 passed |
| 3 | A shipped test fails with only `lockScan` removed | no | confirmed | "marks racing the scan's deletion" fails on PostgreSQL, MySQL, MariaDB |
| 4 | A shipped test fails with `retryOnDeadlock` removed | no | not met | 15/15 green on three servers, 5 times; with the lock, 0 deadlocks reach the retry in 9 instrumented runs |
| 5 | A shipped test fails with the author clause removed | no | confirmed | PostgreSQL, MySQL |
| 6 | A shipped test fails with the draft clause removed | no | confirmed | `canSeeScan`'s; `canDismiss`'s never decides (callers check `canSeeScan` first) |
| 7 | A shipped test fails with the `done` check removed | no | confirmed | PostgreSQL, MySQL |
| 8 | A shipped test fails with the download's user filter removed | no | confirmed | PostgreSQL, MySQL |
| 9 | Racing marks, restores and reads on one scan: success or the domain's errors; rows match audit | no | confirmed | 24 × 30 rounds per database, 0 bad |
| 10 | The same across three scans | no | confirmed | 36 × 20 rounds, 0 bad |
| 11 | Racing deletion: success or not found, no raw error, no rows left | no | confirmed | 24 rounds, four databases |
| 12 | Audit sentences and the four errors in three languages | no | confirmed | 260 passed |

**Overall:** not met: row 4. A unit test (`services/dismissals.test.ts`) gives `dismissFinding` and `restoreFinding` a repository whose first transaction ends in `ER_LOCK_DEADLOCK`: each runs again and audits once; with `retryOnDeadlock` replaced by a plain call, both tests fail. Re-checked below.

### Re-check

Witnessed: 2026-10-29 00:24 EDT, by a fresh agent (adversarial). Commit: 1f33fb19 + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Shipped tests on four databases; the migration's guard test | no | confirmed | 19/19 on each; guard 40; unit 684 |
| 2 | A shipped test fails without each guard (8 mutations) | no | confirmed | `lockScan`, `retryOnDeadlock`, author clause, draft clause, `done` check, download filter, unique-violation handling, restore audit: each caught |
| 3 | Races of marks, restores, reads and deletions: success or the domain's errors, consistent rows and audit | no | confirmed | four databases, `bad []`, no rows left |
| 4 | Visibility: drafts, other workspaces and outsiders see nothing | no | confirmed | every status checked |
| 5 | The author sees marks read-only, never marks or restores | no | confirmed | probes |
| 6 | Only a finished scan's findings | no | confirmed | queued, running, failed refused |
| 7 | Audit metadata never holds the finding's text | no | confirmed | four events checked |
| 8 | Hostile inputs give only domain errors and never act on a scan not named | no | not met | MySQL/MariaDB: `scanId: 1` marks the first scan (the ULID casts to 1), `scanId: true` restores; PostgreSQL: a NUL in the id → raw `invalid byte sequence`; SQLite: `{}` → raw `TypeError` |
| 9 | Reason cleaning | no | partly | a lone surrogate is accepted: the row stores U+FFFD, the audit `\ud800` |

**Overall:** not met: rows 8 and 9. `dismissFinding` and `restoreFinding` now refuse a scan id that isn't a string id (`isId`) as not found before any query, with a db test sending `1`, `true`, `{}`, `null`, a NUL-suffixed id, a lower-case id and `""` (all not found, no row, on SQLite, PostgreSQL, MySQL and MariaDB); `UNSAFE` removes lone surrogates (`\p{Cs}`), with a unit test. After five adversarial rounds the owner chose one more (2026-10-29): a new finding goes to PLAN's Notes as a follow-up. Re-checked below.

### Re-check

Witnessed: 2026-10-29 07:50 EDT, by a fresh agent (adversarial). Commit: 1f33fb19 + uncommitted diff. Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | db tests on four databases; guard; unit tests | no | confirmed | 41/41 on each; guard 40; 54 unit |
| 2 | Dismiss and restore audited with rule and file, never the text; the reason only on a dismissal; the restorer recorded | no | confirmed | 20 hostile reasons: the audit's equals the row's on four databases |
| 3 | Once per scan | no | confirmed | mutation → 3 tests fail |
| 4 | An index out of range or not an integer is not found | no | confirmed | 13 shapes on four databases; `-0` is 0 |
| 5 | Author, outsider, no session refused, for restore too | no | confirmed | probe; mutation → a test fails |
| 6 | Dismissals go with their scan | no | confirmed | mutation → 2 tests fail |
| 7 | Visibility | no | confirmed | probe; mutation → a test fails |
| 8 | Hostile scan ids give domain errors and never act on another scan | no | confirmed | 23 shapes on four databases: not found, 0 rows, 0 audit |
| 9 | `reviewScan` with a hostile revision id gives no raw driver error | no | not met | PostgreSQL: a NUL in the id → raw `invalid byte sequence` |
| 10 | Reason cleaning | no | partly | U+2800 (blank Braille) and a lone combining mark accepted |
| 11 | A shipped test fails with each guard removed | no | partly | removing `\p{Cs}` leaves every test green |
| 12 | The data download | no | confirmed | mutation → the test fails |
| 13 | Error words and audit sentences in three languages | no | confirmed | `errors.test.ts` |
| 14 | Concurrent marks, restores and deletions | no | confirmed | four databases |

**Overall:** not met: rows 9–11. As the owner chose (2026-10-29: one more round, then a new finding is a follow-up), they're fixed in this commit without another round: `reviewScan` returns no scan for a revision id that isn't one, before any query (db test with `\u0000`, a NUL-suffixed id, a lower-case one, on four databases); a reason needs a letter, digit, punctuation or symbol that isn't invisible (U+2800, U+0301 alone, U+3164, ZWJ alone refused; "é" kept); a unit test, written with escapes, fails without `\p{Cs}`. Task 4 stays unticked until task 6's adversarial pass, which changes the same code, covers them (PLAN's Notes).

## Task 5 — The card, the review page's tabs and the threshold field

Witnessed: 2026-10-29 08:03 EDT, by a fresh agent (blind). Commit: 8eb6dde2 + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Typecheck, lint, the unit suite | no | confirmed | 7/7; exit 0; 3741 passed |
| 2 | The card shows the result's real numbers | no | confirmed | `summarise`; scan-card tests; e2e |
| 3 | The card's states | no | confirmed | scan-card tests; e2e |
| 4 | Tones as specified | no | partly | the waiting gate is a warning; SPEC says an error when it blocks |
| 5 | Before a scan finishes, the Security scan tab shows the card's state | no | partly | with no scan, no root action and no gate the card returns nothing: the tab is empty |
| 6 | Tokens only, flat | no | confirmed | no raw colours or shadows |
| 7 | Tabs: Overview default, `?tab=` links with counts, unknown → Overview | no | confirmed | review-page tests |
| 8 | The Files tab's count is the files it shows | no | partly | counts `.ronne/` files the tab leaves out (read, not run) |
| 9 | A link to a file or a view opens Files | no | confirmed | review-page test |
| 10 | Stale notice, title and decisions above the tabs; "What do these do?" before the buttons | no | confirmed | `page.tsx:209,238,243`; test |
| 11 | A decision opens the Conversation tab; a queue row stays | no | confirmed | `DecisionBar.tsx:167`; review e2e |
| 12 | The findings tab | no | confirmed | scan-card tests; e2e href |
| 13 | Mark and Restore for reviewers only | no | confirmed | mutation → a test fails; e2e |
| 14 | The JSON export | no | confirmed | test |
| 15 | Override only for root when blocked | no | confirmed | `decisions.ts:69`; e2e |
| 16 | The author's read-only view | no | confirmed | tests; e2e |
| 17 | The threshold section | no | confirmed | e2e "150" → error, Save off; kept when absent |
| 18 | Three languages; no "never blocks an approval" | no | confirmed | key counts equal; grep |
| 19 | The e2e tests that read the review page | no | confirmed | 2 + 17 passed |
| 20 | The phone sweep covers every tab | no | partly | the swept submission has no scan: the card and findings are never on a phone |

**Overall:** not met: rows 4, 5, 8, 20; remark: `/submissions/[id]` gave a reviewer the author's view. SPEC's tones now say the waiting gate is a warning (it's about to pass or block); the Security scan tab always shows the card's state (`always`), with tests; the Files tab counts what it shows, with a test; a phone e2e (`skill-scan.mobile.e2e.ts`, its own root per project) has root Scan now a member's skill and checks the Overview and the Security scan tab don't scroll sideways at the project's width and 320px, passing on phone, phone-WebKit and tablet; `/submissions/[id]` gives the author's view only to the author, others a link to the review page's tab. Re-checked below.

### Re-check

Witnessed: 2026-10-29 08:18 EDT, by a fresh agent (blind). Commit: 8eb6dde2 + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Typecheck, lint and the unit suite | no | confirmed | exit 0; exit 0; 3742 passed |
| 4 | Tones: the waiting gate a warning; score, failed, none errors | no | confirmed | `ScanCard.tsx:50`; mutation → a test fails |
| 5 | The Security scan tab says "This revision wasn't scanned." whoever views it; the Overview only when there's something to say | no | confirmed | `page.tsx:365` `scanCard(true)`; mutations either way → the test fails |
| 8 | The Files count equals the files it lists | no | confirmed | `page.tsx:126-128,253,334`; mutation → the test fails |
| 20 | A phone/tablet e2e renders a finished scan's card and findings and checks sideways scrolling; the sweep covers every tab | no | confirmed | 16 passed on phone. Remark: on `?tab=scan` the wait accepted the card alone |
| 21 | `/submissions/[id]` gives the author's view only to the author | no | confirmed | `submissions/[id]/page.tsx:216-217`. Remark: no test fails if it always passed `author` |
| 12 | The findings tab | no | confirmed | tests; e2e href |
| 19 | The review-page e2e and the adjusted ones | no | confirmed | 2 + 17 passed |
| 17 | The threshold section | no | confirmed | `SkillScanForm.tsx:225-259`; test |
| 6 | Tokens only | no | confirmed | grep → none |

**Overall:** met. After it, the phone e2e waits for "Hidden Instructions" on `?tab=scan` (2 passed, phone and tablet); a test of `/submissions/[id]` as a reviewer is in PLAN's Notes for task 6.
