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

### Re-check

Witnessed: 2026-10-29 08:57 EDT, by a fresh agent (adversarial; within task 6's adversarial pass, as PLAN's Notes said). Commit: 54e7fcb4 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `reviewScan` returns no scan for a revision id that isn't an id, before any query | no | confirmed | NUL, NUL-suffixed, 5000×x, SQL, 123, {}, "", null → no scan on four databases; removing `isId` → the PostgreSQL test fails |
| 2 | A reason needs a visible letter, digit, punctuation or symbol | no | partly | 16 invisible inputs refused on four databases; but U+1D159 (a blank-drawing symbol) accepted |
| 3 | A shipped test fails without `\p{Cs}` | no | confirmed | "drops lone surrogates" fails |
| 4 | Visibility | no | confirmed | four databases |
| 5 | The author rule | no | confirmed | four databases |
| 6 | Races | no | confirmed | four databases; a two-kind race → 1 row, 1 event |
| 7 | Hostile scan ids and finding indexes | no | confirmed | four databases, 0 rows |
| 8 | Audit: one event per mark | no | confirmed | four databases |

**Overall:** not met: row 2. U+1D159 is now refused with U+2800, with a unit test (also "  𝅙 𝅙 "). Re-checked below, with task 6's re-check.

### Re-check

Witnessed: 2026-10-29 09:20 EDT, by a fresh agent (adversarial; with task 6's re-check). Commit: 54e7fcb4 + uncommitted diff. Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | db tests on four databases; guard and unit tests | no | confirmed | 65/65 on PostgreSQL, MySQL, MariaDB; SQLite 455 |
| 2 | A reason with nothing visible is refused | no | confirmed | 25 inputs on four databases (U+2800, U+1D159, marks alone, fillers, joiners, lone surrogates, tags, private use…); an emoji ZWJ sequence kept; removing U+1D159 or U+2800 from `VISIBLE` → a test fails each |
| 3 | A shipped test fails without `\p{Cs}` | no | confirmed | 1 failed |
| 4 | Hostile scan and revision ids: not found or no scan, never a driver error | no | confirmed | 12 shapes on four databases; removing `isId` from `reviewScan` → the PostgreSQL test fails |
| 5 | The author refused, an outsider not found, visibility | no | confirmed | four databases |
| 6 | Races | no | confirmed | four databases |
| 7 | Finding indexes | no | confirmed | 10 shapes; -0 is 0 |

**Overall:** met. Remark: a bad kind is refused before the access check, which reveals nothing about the scan.

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

## Task 6 — The findings: by file, and their actions

Witnessed: 2026-10-29 08:52 EDT, by a fresh agent (blind). Commit: 54e7fcb4 + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Grouped by file, by path, none last, each with its count and link | no | confirmed | `groupByFile`; mutation → the test fails; e2e |
| 2 | By line, then most severe; an `L10` column linked to the line | no | confirmed | test; author's page as text |
| 3 | Filters by category, severity and status | no | confirmed | test; e2e "Marked (2)" |
| 4 | Mark false positive and Accept the risk visible to reviewers; kind, by whom, why; Restore | no | confirmed | tests; e2e |
| 5 | Ask the author to fix it, prefilled; several or all open; only for whoever may request changes | no | confirmed | tests; e2e (cancelled). Remark: a selection goes stale when a finding is marked or filtered out |
| 6 | Copy link's permalink opens and highlights the finding | no | partly | nothing tests the link (a mutation stays green) |
| 7 | Migration 0040 | no | confirmed | four databases |
| 8 | The kind validated, stored, shown and audited | no | confirmed | db tests |
| 9 | The download's kinds | no | confirmed | mutation → the test fails |
| 10 | db tests on four databases | no | confirmed | 580 / 582 passed |
| 11 | The audit log tells the kinds apart | no | partly | nothing tests it (a mutation stays green) |
| 12 | Messages in three languages; tokens only | no | confirmed | 3752 unit passed |
| 13 | Task 5's note: `/submissions/[id]` as a reviewer | no | confirmed | mutation → the test fails |
| 14 | The e2e covers accepting a risk and asking for a fix | no | confirmed | 1 passed |
| 15 | The phone sweep | no | confirmed | 16 passed |
| 16 | Typecheck and lint | no | confirmed | exit 0 |

**Overall:** not met: rows 6, 11, and the stale selection. `findingLink` is a tested function, and the e2e opens `?tab=scan#finding-1` and checks it's `:target`; a sentences test tells an accepted risk from a false positive (and a mark without a kind); `chosenFindings` asks only for selected findings still open and shown, with a test. Re-checked below.

### Adversarial pass

Witnessed: 2026-10-29 08:57 EDT, by a fresh agent (adversarial). Commit: 54e7fcb4 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Grouping with odd data | no | confirmed | 158 findings, 154 groups, null last, none lost |
| 2 | Sorting | no | confirmed | probe; mutation → the test fails |
| 3 | Filters | no | confirmed | probe; mutation → the test fails |
| 4 | A kind accepts only `false_positive` or `accepted` | no | confirmed | 23 hostile kinds refused, 0 rows, four databases |
| 5 | What the browser sends is validated on the server | no | confirmed | the service doesn't trust the type |
| 6 | Migration 0040 on four databases | no | confirmed | NOT NULL, default, old rows false positives |
| 7 | Old or odd stored kinds read as false positives | no | confirmed | `'ACCEPTED'` → false positive |
| 8 | Audited with `metadata.kind`; sentences tell the kinds apart | no | confirmed | three languages |
| 9 | The download's kinds | no | confirmed | mutations → tests fail |
| 10 | Two kinds raced: one mark, one event | no | confirmed | four databases |
| 11 | Only reviewers mark, whatever the kind | no | confirmed | 0 rows |
| 12 | A mark's kind, by whom, why; the author can't mark | no | confirmed | probe; test |
| 13 | The ask message from untrusted text never breaks ICU or adds markup | no | confirmed | braces, quotes, `<script>`, newlines verbatim in three languages |
| 14 | Ask quotes only selected findings still open and shown | no | confirmed | mutation → the test fails |
| 15 | The prefilled Request changes can be sent | no | partly | 30 long findings → 7612 characters; the server's limit is 5000 |
| 16 | Ask only for whoever may request changes | no | partly | the code is right; no test fails if it's always offered |
| 17 | Copy link keeps the tab and `#finding-<n>` | no | confirmed | mutation → the test fails |
| 18 | The author's page | no | confirmed | mutation → the test fails |
| 19 | Neither kind moves the score or the gate | no | confirmed | grep |
| 20 | db tests for the kind on four databases | no | confirmed | 25/25 each |
| 21 | The e2e and the phone sweep | no | can't check here | told not to run Playwright alongside another witness |

**Overall:** not met: rows 15, 16, 21. The quote stops before `ASK_FIX_MAX_LENGTH` (equal to `REVIEW_MESSAGE_MAX_LENGTH`, a test says so) with "…and N more findings: see the Security scan tab.", tested with 200 long findings; a review-page test offers Ask to a reviewer and not on their own submission, and fails if it's always offered; the e2e (2 passed) and the phone sweep with the scan test (48 passed on phone, phone-WebKit and tablet) ran after the fixes; `markFalsePositive`/`restoreFalsePositive` answer a request that isn't an object with words, with a test. Re-checked below.

### Re-check

Witnessed: 2026-10-29 09:25 EDT, by a fresh agent (blind). Commit: 54e7fcb4 + uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0. (The filters were put on one row while it ran, owner 2026-10-29: layout only.)

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Copy link's permalink keeps the page and tab, `#finding-<n>` | no | confirmed | two mutations → the test fails |
| 2 | Opening it highlights the finding | no | confirmed | e2e `:target`; the built CSS has the rules |
| 3 | The audit sentence tells the kinds apart | no | confirmed | mutation → the test fails |
| 4 | Ask quotes only selected findings still open and shown | no | confirmed | two mutations → the test fails |
| 5 | The prefilled message stays within the server's limit | no | confirmed | both 5000 code points; two mutations → the test fails |
| 6 | Ask only for whoever may request changes | no | confirmed | mutation → 2 tests fail |
| 7 | Grouped by file | no | confirmed | mutation → the test fails |
| 8 | By line, then the most severe | no | confirmed | mutation → the test fails |
| 9 | Filters by category, severity and status | no | partly | removing the severity filter leaves every test green: the fixture is all High |
| 10 | Mark and Accept for reviewers; a mark's kind, by whom, why; Restore | no | confirmed | two mutations → tests fail; e2e |
| 11 | The kind audited and in the download | no | confirmed | two mutations → the test fails |
| 12 | Migration 0040 and the db tests on four databases | no | confirmed | 580 / 582 passed |
| 13 | The export includes the marks | no | partly | an accepted risk exports under `falsePositives`, with no kind |
| 14 | The e2e covers accepting a risk and asking for a fix | no | confirmed | 1 passed |
| 15 | The phone sweep | no | confirmed | 16 passed |
| 16 | Typecheck, lint, unit suite | no | confirmed | exit 0; exit 0; 3759 passed |

**Overall:** not met: rows 9 and 13. A test filters a mix of Low, High and Critical by Low (it fails with the severity filter removed); the export writes `marks`, each with its `kind`, tested with both kinds. Re-checked below.

### Re-check

Witnessed: 2026-10-29 09:20 EDT, by a fresh agent (adversarial). Commit: 54e7fcb4 + uncommitted diff. Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's unit and component tests | no | confirmed | 639 passed |
| 2 | Grouped by file, sorted by line then severity | no | confirmed | two mutations → tests fail |
| 3 | The ask message within the server's limit in three languages | no | confirmed | 200 findings at the caps → 4134 / 4151 / 4166 code points; 300 random runs ≤ 5000; "…and N more" right |
| 4 | Hostile finding text never breaks ICU or adds markup | no | confirmed | verbatim in three languages; shown as plain text |
| 5 | `chosenFindings` | no | confirmed | probe; mutation → the test fails |
| 6 | `findingLink` and `:target` | no | confirmed | probe; mutation → the test fails |
| 7 | The prefilled Request changes can be edited and sent | no | partly | counted in code points; the textarea's `maxLength` counts UTF-16 units: 4180 code points of astral titles are 8180 units, so after an edit Send is blocked |
| 8 | Ask only for whoever may request changes | no | confirmed | mutation → 2 tests fail |
| 9 | No Ask on a marked finding | no | partly | the code is right; no test fails without it |
| 10 | The actions answer a request that isn't an object with words | no | confirmed | mutation → the test fails |
| 11 | The kind, migration 0040, audit, sentences, download on four databases | no | confirmed | 65/65; an upgrade from 0039 keeps old marks false positives; hostile kinds refused |
| 12 | Two kinds raced; the author sees kinds read-only | no | confirmed | four databases |
| 13 | The e2e and the phone sweep | no | can't check here | not run alongside another witness |

**Overall:** not met: rows 7, 9, 13. The quote now counts UTF-16 units (never fewer than code points) and takes at most 4500 of the 5000, leaving room for the reviewer's words, tested with 200 findings of astral titles; a test checks the marked findings have no Ask (it fails without the check); the e2e and the phone sweep run in the next re-check. Re-checked below.


### Re-check

Witnessed: 2026-10-29 09:16 EDT, by a fresh agent (adversarial). Commit: 3db05612. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's unit and component tests | no | confirmed | 902 passed |
| 2 | The prefill fits the textarea (UTF-16) and the server (code points), 500 left, three languages | no | confirmed | 12 hostile texts × 200 findings → ≤ 4500 units and code points; three mutations → the test fails |
| 3 | Hostile text never breaks ICU or adds markup | no | confirmed | verbatim in three languages |
| 4 | `chosenFindings` | no | confirmed | two mutations → the test fails |
| 5 | `findingLink` | no | confirmed | mutation → the test fails |
| 6 | No Ask on a marked finding | no | confirmed | mutation → the test fails |
| 7 | Ask only for whoever may request changes | no | confirmed | mutation → 2 tests fail |
| 8 | Filters with mixed data | no | confirmed | mutation → the test fails |
| 9 | Grouping and sorting | no | confirmed | three mutations → the test fails |
| 10 | The export's marks carry their kind | no | confirmed | mutation → the test fails |
| 11 | The kind validated, audited, read back, downloaded | no | confirmed | six db mutations → a test fails each |
| 12 | Migration 0040 on four databases | no | confirmed | upgrade from 0039 on four databases |
| 13 | The actions answer a request that isn't an object | no | confirmed | mutation → the test fails |
| 14 | Visibility and the author rule | no | confirmed | mutations → tests fail |
| 15 | The e2e and the phone sweep | no | can't check here | not run beside another witness (the re-check below ran them: 2 + 16 passed) |

**Overall:** not met: row 15, which the re-check below ran on the same commit and met. Remarks: only the e2e covered `DecisionDialog`'s `initialText`, and no test checked the severity chips list only those present: both now have a unit test.

### Re-check

Witnessed: 2026-10-29 09:24 EDT, by a fresh agent (blind). Commit: 3db05612. Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Grouped by file | no | confirmed | mutation → the test fails; e2e |
| 2 | By line, then most severe; `L<n>` linked | no | confirmed | mutation → the test fails |
| 3 | Severity filter on mixed data | no | confirmed | mutation → the test fails |
| 4 | Category and status filters on one row | no | confirmed | test; e2e "Marked (2)" |
| 5 | Mark and Accept; kind, by whom, why; Restore | no | confirmed | e2e |
| 6 | No Ask on a marked finding | no | confirmed | mutation → the test fails |
| 7 | Ask only for whoever may request changes | no | confirmed | mutation → 2 tests fail |
| 8 | Ask quotes one or several findings, editable | no | confirmed | e2e; `chosenFindings` test |
| 9 | Quote length in UTF-16 units, ≤ 4500 of 5000 | no | confirmed | mutation to code points → the astral test fails |
| 10 | Copy link's permalink, opened and highlighted | no | confirmed | test; e2e `:target`. Remark: removing the `target:` classes stays green |
| 11 | The export's marks with their kind | no | confirmed | mutation → the test fails |
| 12 | Migration 0040 | no | confirmed | mutation → the test fails |
| 13 | The kind validated, stored, audited | no | confirmed | mutations → the test fails |
| 14 | The download's kinds | no | confirmed | mutation → the test fails |
| 15 | The audit sentence, three languages | no | confirmed | mutation → the test fails |
| 16 | db tests on four databases | no | confirmed | 580 / 582 passed |
| 17 | The scan and review e2e | no | confirmed | 2 passed |
| 18 | The phone sweep | no | confirmed | 16 passed |
| 19 | Typecheck, lint, unit suite | no | confirmed | exit 0; exit 0; 3759 passed |

**Overall:** met (on 3db05612). Since then, on the owner's word (2026-10-29): the actions are icons down each finding's right side, with a modal for what needs words or a confirmation (mark, accept, restore); the rule and category sit at the bottom of the finding; "Ask the author to fix" is always shown, off with nothing selected. Re-checked below.

### Re-check

Witnessed: 2026-10-29 09:36 EDT, by a fresh agent (adversarial). Commit: 3db05612 + working tree (diff as of 09:31). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Unit and component tests, and the shared `IconButton` | no | confirmed | 748 passed; biome clean |
| 2 | Icons with no words; rule and category at the bottom | no | confirmed | mutations → tests fail |
| 3 | Each icon named for its finding, unique | no | partly | two findings with one title at one line (SkillSpector's `bad-skill.json`) share names |
| 4 | Hostile titles add no markup | no | confirmed | escaped; `{action}` literal |
| 5 | No mark icons without rights or for the author | no | confirmed | probe |
| 6 | Ask and Clear shown, off with nothing selected | no | confirmed | three mutations → tests fail |
| 7 | Disabled states after marking or filtering | no | partly | the toolbar went when every finding was marked; Clear off while a hidden selection was held |
| 8 | Mark modal: Cancel, Esc, a failed mark | no | partly | code right, but no test fails without it; Cancel live while pending |
| 9 | Restore's confirmation | no | partly | no test fails without it |
| 10 | Double submits; racing marks | no | confirmed | db tests 41 passed |
| 11 | Copy link's icon shows it | no | partly | the name sticks at "Link copied", losing the finding |
| 12 | Nothing weakens task 4 or 6 | no | confirmed | no server code changed; 41 passed |
| 13 | e2e and phone sweep | no | can't check here | not run |

**Overall:** not met. Fixed since: names carry the file, line and finding number, with a test on `bad-skill.json` that every name is unique; Copy link keeps the finding's name and resets after 4 s; Cancel and Esc are off while saving; the toolbar stays when every finding is marked, Select all is off with no open finding shown, Clear is on while anything is held; the e2e now cancels a mark and cancels then confirms a restore. Re-checked below.

### Re-check

Witnessed: 2026-10-29 09:26 EDT, by a fresh agent (blind). Commit: 3db05612 + `git diff` as of 09:26. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Icon-only actions, named and with tooltips | no | confirmed | probe: no text in the column; `aria-label` = `title` |
| 2 | Modals for mark, accept, restore | no | confirmed | probe; e2e passed |
| 3 | Ask prefilled; Copy link copies, icon shows it | no | confirmed | e2e; probe clipboard. Remark: name lost after copying |
| 4 | Rule and category at the bottom | no | confirmed | probe; unit test |
| 5 | Toolbar always shown, disabled states | no | confirmed | probe; mutation → test fails |
| 6 | `initialText` and severity chips tested | no | confirmed | two mutations → tests fail |
| 7 | Task 6 still holds | no | confirmed | 3760 passed; e2e |
| 8 | Tokens, keyboard, screen reader | no | confirmed | lint; focus into and back from the dialog |
| 9 | Phone layout | no | confirmed | 16 passed |

**Overall:** not met: the tree changed during the pass (colours, `IconButton`'s `tone`). Re-checked below with the fixes above.

### Re-check

Witnessed: 2026-10-29 09:41 EDT, by a fresh agent (adversarial). Commit: 3db05612 + `git diff` as of 09:35. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every name unique, three languages | no | confirmed | three reports × en/pt/fr, hostile titles → no duplicates |
| 2 | Hostile titles and paths can't break ICU or markup | no | confirmed | `select` keywords as paths, `<script>` → plain text |
| 3 | Token colours; `IconButton` without `tone` unchanged | no | confirmed | probe; mutation → a test fails |
| 4 | Modals can't close while saving | yes | not met | Esc closes the native `<dialog>` before `close`; the guard can't undo it; no test |
| 5 | Restore confirms; mark asks in a modal | no | confirmed | code; e2e only |
| 6 | Copy link's result and reset | no | partly | a failed copy shows the check; the timer isn't cleared; no test on the reset |
| 7 | The toolbar's disabled states | no | partly | right in code; Select all's untested |
| 8 | Task 4 and 6 guarantees | no | confirmed | server code untouched; tsc clean |
| 9 | Tests fail when each behaviour goes | no | partly | the guards, the reset and Select all survive removal |

**Overall:** not met. Fixed since: `Dialog` takes `busy`, which refuses Esc (`cancel` prevented, and reopened should the browser close it anyway), turns off the close button and the backdrop, with a unit test; the scan's modals pass `busy={pending}`; Copy link shows the check only when copied, and its timer is cleared on a new click and on unmount; a unit test that the toolbar stays, all three buttons off, when every finding is marked; the e2e checks Copy link comes back after a few seconds. (A blind re-check started at 09:40 was stopped, as these fixes came in.) Re-checked below.

(Two re-checks started at 09:50 were stopped when the owner asked for more changes, 2026-10-29: the tooltip only the action, a light background on an open finding's row under the mouse, the hand cursor on the icon buttons. Re-checked below.)

### Re-check

Witnessed: 2026-10-29 09:47 EDT, by a fresh agent (adversarial). Commit: 3db05612 + `git diff` as of 09:47. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tooltip only the action; names unique; hostile titles | no | confirmed | 1,009 findings × 3 languages → 5,047 names, no duplicates; four titles |
| 2 | `IconButton` for other callers | no | confirmed | same classes plus `cursor-pointer`; title = label; mutations → tests fail |
| 3 | `Dialog` `busy` | no | partly | `open` false while busy: reopened, and stays open after busy ends (no current caller) |
| 4 | Modals stay open while saving; errors inside; success closes | no | confirmed | code; 465 passed |
| 5 | Copy link's check and reset, timer cleared | no | confirmed | code |
| 6 | Toolbar's disabled states | no | confirmed | mutations → tests fail |
| 7 | Hover on open rows only | no | confirmed | built CSS; mutation → a test fails |
| 8 | Task 4 and 6 guarantees | no | confirmed | no server change; 465 passed |
| 9 | Each behaviour has a failing test | no | not met | the busy guards and the check icon survive removal |
| 10 | e2e and phone | no | can't check here | not run |
| 11 | SPEC wording | no | not met | "named for the finding (its label and tooltip)" against "tooltip is only its action" |

**Overall:** not met. Fixed since: `Dialog` reopens only while `busy && open`, and closes once no longer busy if `open` turned false (the effect follows `busy` too); the SPEC line is gone; the e2e holds the mark's save back (`page.route`), checks Cancel and Close are off, presses Esc twice and sees the modal stay, then lets it land and close; with the Esc guard removed, that e2e fails (run by the implementer).

### Re-check

Witnessed: 2026-10-29 09:47 EDT, by a fresh agent (blind). Commit: 3db05612 + `git diff` (sha256 0ec48fe6…eada5, unchanged start to end). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Icon-only; tooltip only the action | no | confirmed | probe: 4 icons, no text, titles the action words |
| 2 | Names unique | no | confirmed | 10 of 10 distinct; unit test on `bad-skill.json` |
| 3 | Hand cursor | no | confirmed | computed `cursor: pointer` |
| 4 | Token colours, no red | no | confirmed | computed colours = `--fg`, `--warning-text`, `--accent-strong`, `--muted` |
| 5 | `IconButton` for other callers | no | confirmed | 3763 passed |
| 6 | Hover on open rows; marked keep their tint | no | confirmed | computed `--canvas` on hover; mutation → a test fails |
| 7 | Modals for mark, accept, restore | no | confirmed | probe; e2e |
| 8 | Can't close while saving | no | partly | holds in the browser (actions delayed 3 s); no test fails without the Esc guard |
| 9 | Ask prefilled | no | confirmed | e2e; unit |
| 10 | Copy link | no | confirmed | check, then back after 4.4 s |
| 11 | Rule and category at the bottom | no | confirmed | probe; unit |
| 12 | Toolbar | no | confirmed | probe |
| 13 | Task 6 still holds | no | confirmed | 2 e2e passed; 3763 unit |
| 14 | Other dialogs as before | no | confirmed | Request changes closes on Esc |
| 15 | Keyboard and focus | no | confirmed | focus into the modal and back |
| 16 | Phone | no | confirmed | 16 passed |
| 17 | Typecheck, lint, build | no | confirmed | exit 0 |

**Overall:** not met: row 8's test gap, closed by the e2e above. Remark: a finding selected and then marked stays held (Clear stays on), and comes back checked if restored. Re-checked below.

### Re-check

Witnessed: 2026-10-29 10:00 EDT, by a fresh agent (adversarial). Commit: 3db05612 + `git diff` (sha256 823231dfb0ee…). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Icons only; tooltip the action; names unique | no | confirmed | hostile names in three languages; mutations → tests fail |
| 2 | Token colours, `tone`, cursor; other callers unchanged | no | confirmed | mutations → tests fail |
| 3 | `Dialog` `busy` in every order | no | confirmed | state model, 10 sequences, StrictMode |
| 4 | Modals stay open while saving; error inside; close on success | no | confirmed | code |
| 5 | Copy link: check only when copied; reset; timer cleared | no | confirmed | code |
| 6 | Toolbar under every filter | no | confirmed | mutation → a test fails |
| 7 | Hover on open rows only | no | confirmed | mutation → a test fails |
| 8 | Each behaviour has a failing test | no | partly | nothing fails without "check only when copied"; the e2e can't tell a refused Esc from a close and reopen |
| 9 | The e2e's route hold | no | confirmed | glob and `next-action` header checked against Playwright 1.64.1 and Next 16.4.3; fails rather than hangs |
| 10 | SPEC wording | no | confirmed | matches the code |
| 11 | Task 4 and 6 guarantees | no | confirmed | untouched; 465 passed |
| 12 | Unit, lint, typecheck | no | confirmed | 465 passed; clean |
| 13 | e2e | no | can't check here | not run |

**Overall:** not met: row 8. Fixed since: the e2e grants the clipboard and asserts "Link copied" and the check, then takes the clipboard and the copy command away and asserts "Copy the link from the address bar." with no check; it counts the dialog's `close` events after one Esc while saving (0), so removing `preventDefault` alone fails it (run by the implementer: "Expected 0, Received 1"). Restore's `busy` stays covered by the code only.

### Re-check

Witnessed: 2026-10-29 10:01 EDT, by a fresh agent (blind). Commit: 3db05612 + `git diff` (sha256 823231df…8b36, unchanged start to end). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Checks green | no | confirmed | typecheck, lint, 3763 unit, build |
| 2 | Icon-only; tooltip the action | no | confirmed | code; test |
| 3 | Names unique | no | confirmed | mutation → the test fails |
| 4 | Token colours; hand cursor | no | confirmed | code; test |
| 5 | `IconButton` for other callers | no | confirmed | 3763 passed |
| 6 | Hover on open rows | no | confirmed | mutation → a test fails |
| 7 | Modals; Cancel keeps the state | no | confirmed | 2 e2e passed |
| 8 | Can't close while saving | no | confirmed | code |
| 9 | The e2e fails without the guard | no | confirmed | mutated build → fails at `expect(mark).toBeVisible()` |
| 10 | Other dialogs as before | no | confirmed | e2e; unit |
| 11 | Ask prefilled | no | confirmed | e2e; unit |
| 12 | Copy link | no | confirmed | code; e2e |
| 13 | Rule at the bottom; toolbar | no | confirmed | tests |
| 14 | Keyboard and focus | no | partly | after Cancel, or a save, focus falls to `<body>`: the modal unmounts without the native close |
| 15 | Phone | no | confirmed | 16 passed |

**Overall:** not met: row 14. Fixed since: closing a modal puts focus back on the icon that opened it, and after a save, once the refresh swaps the icons, on the finding's first action (Restore); the e2e asserts both (`toBeFocused`). Re-checked below.

### Re-check

Witnessed: 2026-10-29 10:08 EDT, by a fresh agent (adversarial). Commit: 3db05612 + `git diff` (uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Unit tests | no | confirmed | 465 passed |
| 2 | Icons; tooltips; unique names, hostile titles | no | confirmed | code; tests |
| 3 | Token colours; hand cursor | no | confirmed | code; tests |
| 4 | Hover on open rows | no | confirmed | test |
| 5 | Can't close while saving | no | confirmed | code; e2e covers Esc, the close count, Mark's busy |
| 6 | Focus back to the opener | no | confirmed | code; the e2e's Cancel step |
| 7 | Focus after a save, without stealing it | no | partly | the refocus flag is left on after a Cancel, so a later refresh can move focus to another finding (modelled) |
| 8 | The e2e's clipboard steps | no | confirmed | the override dies with the next `goto` |
| 9 | The close-event count | no | confirmed | listener before the first Esc |
| 10 | Toolbar | no | confirmed | code; tests |
| 11 | Task 4 and 6 guarantees | no | confirmed | untouched |
| 12 | e2e | no | can't check here | not run |

**Overall:** not met: row 7. Fixed since: the modals call `onClose(true)` only after a save, and every Cancel or close calls `onClose()` with nothing, so the flag is set only by a save.

### Re-check

Witnessed: 2026-10-29 10:17 EDT, by a fresh agent (blind). Commit: 3db05612 + `git diff` (sha256 7a7dd9ce…3c20c, unchanged start to end). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–15 | Icons, names, colours, cursor, hover, modals, focus, Ask, Copy link, rule, toolbar, task 6, other dialogs, keyboard, phone | no | confirmed | probe in Chromium (computed colours, focus after each close, clipboard); 2 e2e passed; 16 phone passed |
| 16 | The e2e fails without the focus return | no | confirmed | mutated build → fails at `toBeFocused()` |
| 17 | The e2e fails without `preventDefault` on `cancel` | no | confirmed | "Expected: 0, Received: 1" |
| 18 | The e2e fails without check-only-when-copied | no | not met | the no-check assertion waited 5 s, past the 4 s reset |
| 19 | Typecheck, lint, unit, build | no | confirmed | exit 0; 3763 passed |

**Overall:** not met: row 18. Fixed since: that assertion waits 1 s, and the link icon is asserted within 1 s too. (The owner then asked for the author's page to match the review page; that is task 8, not part of this re-check.)

### Re-check

Witnessed: 2026-10-29 10:39 EDT, by a fresh agent (blind). Commit: 3db05612 + the uncommitted diff (sha256 of `git diff` 0fa8064a…df24c, the same at start and end). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Icons down the right side, no words | no | confirmed | code; unit 3763 passed |
| 2 | Tooltip only the action; names unique | no | confirmed | code; the `bad-skill.json` test |
| 3 | Token colours, never red | no | confirmed | `ACTION_TONE`; tests |
| 4 | Hand cursor; other icon buttons as before | no | confirmed | `git diff IconButton.tsx`; test |
| 5 | Hover on open rows | no | confirmed | test |
| 6 | Modals can't close while saving | no | confirmed | e2e: held save, Esc twice, 0 close events |
| 7 | Focus back to the opener; after a save, the first action | no | confirmed | e2e passed |
| 8 | Ask prefilled | no | confirmed | unit; e2e |
| 9 | Copy link's states | no | confirmed | e2e with the clipboard granted, then taken |
| 10 | The e2e fails without check-only-when-copied | no | confirmed | mutated clone → fails at `toHaveCount` (expected 0, received 1) |
| 11 | Rule and category at the bottom | no | confirmed | test |
| 12 | Toolbar | no | confirmed | test |
| 13 | Task 6 still holds | no | confirmed | `skill-scan.e2e.ts` passed |
| 14 | Other dialogs as before | no | confirmed | `review.e2e.ts`; `ui.test.tsx` |
| 15 | Phone layout | no | confirmed | 16 passed |
| 16 | Typecheck, lint, build | no | confirmed | 7/7; no errors; exit 0 |

**Overall:** met.

### Re-check

Witnessed: 2026-10-29 10:44 EDT, by a fresh agent (adversarial). Commit: 3db05612 + `git diff` (sha256 0fa8064a92c1…, unchanged start to end). Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Unit tests | no | confirmed | 465 passed |
| 2 | Only a save calls `onClose(true)` | no | confirmed | every other path wraps `() => onClose()` |
| 3 | The refocus flag only after a save | no | confirmed | model: Cancel on A then a save on B ends on B |
| 4 | Later refreshes don't move focus | no | confirmed | code; model |
| 5 | `Dialog` `busy`; other dialogs unharmed | no | confirmed | 50 uses read |
| 6 | Unique names, action-only tooltips, hostile titles | no | confirmed | probe, 1001 findings, three languages |
| 7 | Colours, cursor, hover | no | confirmed | mutations → tests fail |
| 8 | Toolbar | no | confirmed | mutations → tests fail |
| 9 | Task 4 and 6 guarantees | no | confirmed | server untouched |
| 10 | A test fails when each behaviour goes | no | partly | nothing fails when a Cancel sets the refocus flag; Restore's `busy` untested |
| 11 | The 1 s no-check wait | no | confirmed | read |
| 12 | Typecheck, lint | no | confirmed | clean |

**Overall:** not met: row 10. Fixed since: the e2e cancels Restore on the first finding, then restores the second with its save held back (Cancel and Close off while it saves) and checks the focus lands on the second's Mark false positive; with `refocus.current = true` for every close, it fails at that check (run by the implementer). `Dialog`'s close button now calls `onClose()` with nothing, for every caller. Re-checked below.

### Re-check

Witnessed: 2026-10-29 10:58 EDT, by a fresh agent (adversarial). Commit: 3db05612 + `git diff` (shasum 45d6a263…49, unchanged start to end). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The scan e2e passes on the current tree | no | confirmed | `next build`, `playwright test e2e/skill-scan.e2e.ts --project chromium` → 1 passed |
| 2 | A Cancel setting the refocus flag fails the e2e | no | confirmed | mutation → fails at `toBeFocused` (`:220`) |
| 3 | Restore's Cancel passing its event fails the e2e | no | confirmed | mutation → fails at `:220` |
| 4 | Restore with `busy={false}` fails the e2e | no | confirmed | mutation → fails at `toBeDisabled` (`:217`) |
| 5 | Without `preventDefault` the e2e fails | no | confirmed | close events 1, expected 0 |
| 6 | Focus back to the opener after Cancel | no | confirmed | mutation → fails at `:152` |
| 7 | Check only when copied | no | confirmed | mutation → fails at `:143` |
| 8 | `hold()` holds one action, doesn't leak or hang | no | confirmed | rows 4–5; a never-released hold still ended in 17.9 s |
| 9 | Dialog's change leaves every caller as before | no | confirmed | 50 uses in 36 files read |
| 10 | Nothing else regressed | no | confirmed | web tests 5561 passed; typecheck clean; lint 0 errors |

**Overall:** met. Remark: the same Cancel-passes-its-event mutation on the mark modal's Cancel survives (an unmarked finding's `dismissal` stays `null`, so nobody could notice); the code is right.

## Task 8

Witnessed: 2026-10-29 11:26 EDT, by a fresh agent (blind). Commit: a764f192 + uncommitted diff (sha256 of diff and untracked files 6d106661…214e, same at start and end). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both routes render `SubmissionScreen` with the same header, tabs and content | no | confirmed | both pages call it; `diff -w` against the old review page shows only route-dependent lines |
| 2 | The review page as before for reviewers | no | confirmed | same diff; gate unchanged; review-page tests pass |
| 3 | The author's actions | no | confirmed | code; probes (Withdraw, Restore, Delete for good) |
| 4 | No decision buttons on the author's page unless allowed | no | confirmed | probe |
| 5 | `?edit=1` on one that can't be changed | no | partly | holds in probes; no test fails without `isEditable` |
| 6 | Edit files opens the editor; a draft stays the editor | no | confirmed | unit test; e2e |
| 7 | Page tests for both routes | no | partly | the author's notices and decision filtering untested (mutations stay green) |
| 8 | The e2e on the new screen | no | confirmed | 13 passed |
| 9 | The phone sweep | no | confirmed | 16 passed; it doesn't visit the author's submitted page |
| 10 | Access unchanged | no | confirmed | same `viewSubmission`/`getReview` calls |
| 11 | Text in three languages | no | confirmed | parity tests; lint |
| 12 | Typecheck, lint, unit, build | no | confirmed | exit 0; 3765 passed |

**Overall:** not met: rows 5 and 7.

Witnessed: 2026-10-29 11:30 EDT, by a fresh agent (adversarial). Commit: a764f192 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | One screen, per-route links | no | confirmed | probe: no `/reviews/` link on the author's page; mutation → a test fails |
| 2 | No new access | no | confirmed | gate kept; `viewSubmission` 404s as before. Gap (older): removing the gate fails no test |
| 3 | `?edit=1` only when the author may change it | no | partly | holds; dropping the guard or the member check fails no test |
| 4 | A draft stays the editor | no | confirmed | probe |
| 5 | Withdraw and Edit files | no | confirmed | probe; tests |
| 6 | Author notices, once each | no | partly | hold; `notices: null` fails no test; a removed member is told to edit with no way to |
| 7 | Decisions on the author route | no | partly | root's own: Override with three disabled buttons |
| 8 | Links from `/submissions/<id>` | no | partly | Scan again revalidates only `/reviews/<id>` |
| 9 | Nothing lost | no | partly | the approved box's sentence gone (its keys dead); a moderator on `/submissions/<id>` gets "My submissions" and no stale notice |
| 10 | Page tests | no | partly | mutations survive (rows 3, 6, 7) |
| 11 | e2e, phone sweep | no | can't check here | not run |

**Overall:** not met. Fixed since:
- Scan again revalidates both pages.
- The author's page shows only the decisions someone may make.
- Someone else's `/submissions/<id>` leads back to Reviews and shows the stale notice. The author's own page uses its proposal bar for that.
- A removed member gets the not-a-member notice (with Ask to join) and, under it, why it was sent back.
- The approved box's keys are removed: the read-only notice already says "Approved. It's ready to release…".
- The stray doc comments in `DraftEditor.tsx` are moved with their code.
- Page tests now cover:
  - `?edit=1` on every status, for a non-member and for someone else;
  - the notices;
  - Restore, Delete and Withdraw;
  - the decisions filtered;
  - the way back and the stale notice.
- The review page's 404 test now checks that `getReview` isn't reached.
- The implementer's mutations (any `?edit`, no member check, no `isEditable`, no notices, all decisions, no stale notice, a fixed way back) each fail a test.
- The phone sweep visits the author's submitted page, every tab: 45 passed on phone, phone WebKit and tablet.

### Re-check

Witnessed: 2026-10-29 11:38 EDT, by a fresh agent (blind). Commit: a764f192 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx` (sha256 of diff and untracked files 1f4c0dd5…caa4, same at start and end). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | One screen, only the actions differing | no | confirmed | both pages call `SubmissionScreen` |
| 2 | The author's four tabs, Overview first | no | confirmed | test; e2e |
| 3 | A reviewer sees every decision | no | confirmed | mutation → 2 tests fail |
| 4 | Withdraw while it can be withdrawn | no | confirmed | mutation → 2 tests fail |
| 5 | Edit files and `?edit=1` only while it may be changed | yes | confirmed | four mutations → tests fail |
| 6 | Sent back or read-only; a removed member's notices | yes | partly | the removed member is still told "Edit the files, then Resubmit for review." |
| 7 | Archived: Restore and Delete | yes | confirmed | mutation → a test fails |
| 8 | The rebase bar | no | confirmed | e2e; no page test |
| 9 | Publish | no | confirmed | mutation → tests fail; e2e |
| 10 | Only allowed decisions on the author route | yes | confirmed | mutation → a test fails |
| 11 | Page tests fail when each behaviour goes | yes | partly | rebase bar and draft-stays-editor survive |
| 12 | Someone else: back to Reviews, stale notice | yes | confirmed | mutations → tests fail |
| 13 | Scan again refreshes both pages | yes | confirmed | code; no test |
| 14 | A draft stays the editor | no | confirmed | code; e2e |
| 15 | The e2e on the new screen | no | confirmed | 13 passed |
| 16 | The phone sweep, author's tabs included | yes | confirmed | 16 passed |
| 17 | Typecheck, lint, unit | no | confirmed | 3770 passed |

**Overall:** not met: rows 6 and 11.

### Re-check

Witnessed: 2026-10-29 11:46 EDT, by a fresh agent (adversarial). Commit: a764f192 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx` (sha256 of diff+untracked 1f4c0dd53362). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both routes, links on their own route | no | confirmed | mutation → 2 tests fail |
| 2 | Access no wider | no | confirmed | server unchanged; probes |
| 3 | The review page's 404 before reading | yes | confirmed | mutation → the test fails |
| 4 | `ownPage` decides whose notices show | yes | partly | notices for everyone survives the tests |
| 5 | Decisions per route | yes | confirmed | mutations → tests fail |
| 6 | `?edit=1` | yes | confirmed | odd values, every status; mutations fail |
| 7 | Notices: none missing or duplicated | yes | partly | the stale notice shown twice on the author's page survives the tests |
| 8 | Scan again revalidates both | yes | partly | no test |
| 9 | Other actions refresh from `/submissions/<id>` | no | confirmed | code read |
| 10 | The removed messages unused | yes | confirmed | `git grep` |
| 11 | Page tests | yes | partly | rows 4, 7, 8 |
| 12 | Lint, typecheck | no | confirmed | clean |
| 13 | SPEC describes the new screen | no | partly | two passages still describe the old author page |
| 14 | e2e, phone | yes | can't check here | not run |

**Overall:** not met. Fixed since:
- A removed member's feedback notice keeps why and the link to the conversation, without "Edit the files, then Resubmit".
- New page tests:
  - the rebase bar, with the stale notice once on the author's own page;
  - a draft stays the editor, with `getReview` never called;
  - someone else gets none of the author's notices;
  - the removed member's wording.
- A unit test for `askForScan` checks both paths are refreshed.
- Each of the six mutations named above fails a test (run by the implementer).
- SPEC's two passages now describe the shared screen.
- Unit suite: 3775 passed; the 13 e2e passed.

### Re-check

Witnessed: 2026-10-29 11:50 EDT, by a fresh agent (blind). Commit: a764f192 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts` (sha1 of diff+untracked b4b8a60c3bbd, same at start and end). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | One screen, only the actions differing | no | confirmed | mutation → a test fails |
| 2 | A reviewer sees every decision | no | confirmed | mutation → 2 tests fail |
| 3 | Withdraw | no | confirmed | mutation → 2 tests fail |
| 4 | Edit files and `?edit=1` | no | confirmed | mutations → tests fail; e2e |
| 5 | Notices; a removed member's, without telling them to edit | no | confirmed | mutations → tests fail |
| 6 | Archived: Restore and Delete | no | confirmed | mutation → a test fails |
| 7 | The rebase bar, the stale notice once | no | confirmed | mutation → a test fails; e2e |
| 8 | Publish for whoever may | no | partly | hiding it on the author route alone fails no page test (e2e only) |
| 9 | Only allowed decisions on the author route | no | confirmed | mutation → a test fails |
| 10 | Someone else: none of the notices, back to Reviews, stale notice | no | confirmed | mutations → tests fail |
| 11 | Scan again refreshes both | no | confirmed | mutation → `scan-actions.test.ts` fails |
| 12 | A draft stays the editor | no | confirmed | mutation → a test fails |
| 13 | Page tests | no | partly | Publish, the Files tab and the Conversation tab on the author route alone: e2e only |
| 14 | The e2e on the new screen | no | confirmed | 13 passed |
| 15 | The phone sweep, the author's tabs included | no | confirmed | 16 passed |
| 16 | SPEC describes the shared screen | no | confirmed | grep for the old wording finds nothing |
| 17 | Typecheck, lint, unit, build | no | confirmed | 3775 passed |

**Overall:** not met: rows 8 and 13 (test gaps).

### Re-check

Witnessed: 2026-10-29 11:50 EDT, by a fresh agent (adversarial). Commit: a764f192 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts`. Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both routes, own links | no | confirmed | mutation → 2 tests fail |
| 2 | Access no wider | no | confirmed | gate and reads unchanged; probes |
| 3 | `?edit=1` | no | confirmed | probes; mutation → a test fails |
| 4 | Decisions per route | no | confirmed | mutations → tests fail |
| 5 | Notices, once each, every status and role | no | confirmed | 23-case matrix |
| 6 | The feedback wording per reader | no | confirmed | probes; mutations → tests fail |
| 7 | Every action refreshes `/submissions/<id>` | no | confirmed | code read |
| 8 | `scan-actions.test.ts` | no | confirmed | mutation → it fails |
| 9 | Page tests fail when each behaviour goes | no | partly | the personal-review helper, the self-approved computation, a removed member's "Rejected is final" survive |
| 10 | SPEC matches the code | no | confirmed | read |
| 11 | Unit, i18n, lint, typecheck | no | confirmed | 335 + 367 passed; clean |

**Overall:** not met: row 9 (test gaps). Remark, older than this task: an archived submission by a removed member says "Restore it to edit and submit it again." with no Restore and no not-a-member notice (as in the editor before).

Fixed since: page tests on the author route for Publish (shown with `can.publish`, not without), a file on the Files tab, an event on the Conversation tab, a removed member's "Rejected is final", and the personal workspace's "Approved by you" with its helper (and a plain approval's "Approved."); each of the six mutations named above fails a test (run by the implementer). The owner asked for one more round (2026-10-29). Then, on the owner's word, an archived submission by a removed member says they must rejoin to restore it (`archivedNotMember`, with Ask to join), with no Restore and Delete still offered where allowed; a page test covers it and fails without it. (A round started for the tests alone was stopped for this change.)

### Re-check

Witnessed: 2026-10-29 12:04 EDT, by a fresh agent (blind). Commit: a764f192 + uncommitted diff and 3 untracked files (diff hash `7365683b5b2b…01bd` at start and end, the same). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Typecheck, lint, unit, build | no | confirmed | exit 0; 3778 passed; build compiled |
| 2 | Publish on the author route for whoever may | no | confirmed | mutation → the test fails |
| 3 | The author route's Files and Conversation tabs | no | confirmed | two mutations → the test fails |
| 4 | A removed member: "Rejected is final" | no | confirmed | mutation → the test fails |
| 5 | "Approved by you" with its helper; "Approved." otherwise | no | confirmed | two mutations → the test fails |
| 6 | A removed member's archived notice | no | confirmed | three mutations → the test fails; the key in three languages |
| 7 | `?edit=1` | no | confirmed | mutation → the test fails |
| 8 | A draft stays the editor | no | confirmed | mutation → the test fails |
| 9 | Someone else: no notices, back to Reviews, stale notice | no | confirmed | mutations → tests fail |
| 10 | Only allowed decisions on the author route | no | confirmed | mutation → the test fails |
| 11 | Scan again refreshes both | no | confirmed | mutation → `scan-actions.test.ts` fails |
| 12 | The e2e on the new screen | no | confirmed | 13 passed |
| 13 | The phone sweep | no | confirmed | 16 passed |

**Overall:** met.

### Re-check

Witnessed: 2026-10-29 12:04 EDT, by a fresh agent (adversarial). Commit: a764f192 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts`. Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Unit tests | yes | confirmed | 492 passed; biome clean |
| 2 | A removed author's archived notice: rejoin, Ask to join, no Restore | yes | confirmed | probe; the server refuses a non-member's restore |
| 3 | Delete still offered where allowed | yes | confirmed | probe both ways |
| 4 | A member's archived one as before | no | confirmed | probe in three languages |
| 5 | Someone else: no notices | no | confirmed | mutation → a test fails |
| 6 | A workspace they can't rejoin | no | confirmed | the join page says so |
| 7 | `archivedNotMember` ICU | yes | confirmed | probe; the parity test catches a broken tag |
| 8 | The new tests fail when their behaviour goes | yes | confirmed | eleven mutations; two older ones on 114's event filter survive |
| 9 | Scan again | yes | confirmed | mutation → the test fails |
| 10 | Access, decisions, `?edit=1` | no | confirmed | mutations → tests fail |
| 11 | Notices right for every status a removed author sees | no | not met | a removed author's rejected one: "withdraw it… can still decide it" above "Rejected is final" (this task's) |

**Overall:** not met: row 11. Fixed since: a rejected submission shows only why it was rejected, member or not; the test asserts no not-a-member or "can still decide it" text; a test that the latest approval decides "Approved by you" (root's override after the author's own isn't theirs), which kills the two surviving filter mutations. Each fails a test when undone (run by the implementer). On the owner's word (2026-10-29) the older wording is fixed too: a removed author's approved one says they can withdraw it but not release it, and a moderator still can (`notMemberApproved`); a published one that it never changes and can't be withdrawn, and to rejoin to propose a change (`notMemberPublished`), in three languages, with a test that fails on the old text. The owner asked for one more round.

### Re-check

Witnessed: 2026-10-29 13:17 EDT, by a fresh agent (blind). Commit: a764f192 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts` (diff sha256 5bb6629e…2c2df3d at start and end). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Typecheck, lint, unit | no | confirmed | exit 0; 3779 passed |
| 2 | Build | no | confirmed | exit 0 |
| 3 | The e2e (chromium) | no | confirmed | 13 passed |
| 4 | The phone tests | no | confirmed | 16 passed |
| 5 | A rejected one shows only why | no | confirmed | mutation → the test fails |
| 6 | The rejected wording true for a removed member | no | partly | "start a new draft" needs membership (`createDraft` → `requireMember`) |
| 7 | `notMemberApproved` true | no | confirmed | withdraw, publish rules read; mutation → the test fails |
| 8 | `notMemberPublished` true | no | confirmed | status and proposal rules read; mutation → the test fails |
| 9 | `notMember` true for submitted and changes requested | no | partly | changes requested: "its moderators can still decide it" is false |
| 10 | New keys in three languages | no | confirmed | parity tests |
| 11 | The latest approval decides "Approved by you" | no | confirmed | two mutations caught; `scan_override` untested |
| 12 | Tests fail when each behaviour goes | no | partly | a doubled rejection notice and `scan_override` survive |
| 13 | Everything else holds | no | confirmed | tests; e2e |

**Overall:** not met: rows 6, 9, 12.

### Re-check

Witnessed: 2026-10-29 13:22 EDT, by a fresh agent (adversarial). Commit: a764f192 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts` (sha1 of diff+untracked 66288b82cb95). Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Unit, i18n, lint | no | confirmed | 493 passed; clean |
| 2 | A rejected one: only why, once | yes | confirmed | matrix probe; mutation → the test fails |
| 3 | The rejected wording for a removed author | no | partly | "start a new draft" needs membership |
| 4 | `notMemberApproved` | yes | confirmed | rules read; mutation → the test fails |
| 5 | `notMemberPublished` | yes | confirmed | rules read; mutation → the test fails |
| 6 | `notMember` for submitted and changes requested | yes | not met | changes requested: no moderator can decide it |
| 7 | The editor, which shares the text | no | partly | a removed author's draft: "its moderators can still decide it" |
| 8 | ICU of the new keys | yes | confirmed | formatted in three languages |
| 9 | The latest approval decides | yes | confirmed | mutations → the test fails |
| 10 | No notice contradicts or repeats another | no | partly | row 6 |
| 11 | Tests fail when each behaviour goes | no | partly | a doubled rejection notice survives |
| 12 | Someone else gets no notices | no | confirmed | matrix; mutation → the test fails |
| 13 | Access, decisions, `?edit=1`, refreshes | no | confirmed | four mutations → tests fail |

**Overall:** not met: row 6. Fixed since:
- A removed author's read-only text is worded for each status:
  - changes requested (`notMemberChanges`): back with them, withdraw only, rejoin to fix and resubmit;
  - their draft (`notMemberDraft`): read only, rejoin to work on it;
  - approved and published as before.
- A rejection tells a removed author to rejoin to try with a new draft (`feedback.rejectNotMember`, with Ask to join); a member keeps "start a new draft". All three languages.
- Tests now check each wording, the rejection notice shown once, and `scan_override` counted among approvals.
- Each of the five mutations fails a test (run by the implementer).
- The leftovers are wording, so one more scoped round runs without asking (the owner's rule).

### Re-check

Witnessed: 2026-10-29 13:28 EDT, by a fresh agent (blind). Commit: a764f192 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts` (sha256 of diff+untracked 73a8d1038d55…eebe7, same at start and end). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Removed, submitted: read, withdraw; moderators decide | no | confirmed | member checks read |
| 2 | Changes requested (`notMemberChanges`) | no | confirmed | `status.ts`; `requireMember` on resubmit and edits |
| 3 | Their draft (`notMemberDraft`) | no | confirmed | true; remark: doesn't mention Withdraw, which the editor offers |
| 4 | Approved (`notMemberApproved`) | no | confirmed | `publish.ts` |
| 5 | Published (`notMemberPublished`) | no | confirmed | `status.ts`; `proposals.ts` |
| 6 | Rejected, removed: rejoin for a new draft | no | confirmed | `drafts.ts` |
| 7 | The rejection once | no | confirmed | the count test |
| 8 | Three languages | no | confirmed | diff read; parity tests |
| 9 | Each wording's test fails without it | no | confirmed | 8 mutations, one test each |
| 10 | `scan_override` counted | no | confirmed | mutation → the test fails |
| 11 | Typecheck, lint | no | confirmed | exit 0 |
| 12 | Unit | no | confirmed | 3779 passed |
| 13 | Build | no | confirmed | exit 0 |
| 14 | e2e chromium | no | confirmed | 13 passed |
| 15 | e2e phone | no | confirmed | 16 passed |

**Overall:** met.

### Re-check

Witnessed: 2026-10-29 13:40 EDT, by a fresh agent (adversarial). Commit: a764f192 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts`. Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Task tests, i18n, no regression | no | confirmed | 493 passed; the copy's 3 `reset-setup` failures are `pnpm exec` refusing a scratch copy |
| 2 | Removed author's draft | no | confirmed | matrix; mutation → a test fails |
| 3 | Changes requested, removed | no | confirmed | matrix; three mutations fail |
| 4 | Submitted, removed | no | confirmed | a stale one can still be rejected or sent back |
| 5 | `notMemberApproved` for every approved one | no | partly | a stale approved proposal: "a moderator can still release it" is false (rebase first); the member's `approved` text says the same |
| 6 | `notMemberPublished` | no | confirmed | matrix; mutation → a test fails |
| 7 | Rejected, removed | no | confirmed | two mutations fail |
| 8 | Archived, removed | no | confirmed | two mutations fail |
| 9 | `scan_override` | no | confirmed | mutation → the test fails |
| 10 | Someone else, personal workspace | no | confirmed | matrix |
| 11 | Three languages, ICU, glossary | no | partly | fr `rejectNotMember` "Le refus" where the glossary has rejeter ("Un rejet") |
| 12 | Nothing contradicts or repeats | no | partly | row 5 |
| 13 | Tests fail when each behaviour goes | no | confirmed | 11 mutations |

**Overall:** not met: rows 5, 11 (wording). Fixed since: an approved stale proposal says it can't be released before a rebase, for a removed author (`notMemberApprovedStale`: they'd need to rejoin; a reviewer can send it back) and a member (`approvedStale`); fr `rejectNotMember` reads "Un rejet est définitif…"; `notMemberDraft` says they can withdraw it too; pt and fr use the glossary's "fazer rebase" and "faire un rebase". Tests for both stale wordings fail when undone (run by the implementer). Unit suite 3779 passed. Wording only: one more scoped round, under the owner's rule.

### Re-check

Witnessed: 2026-10-29 13:41 EDT, by a fresh agent (blind, scoped: wording). Commit: 370e4714 + uncommitted diff (sha256 of `git diff` + untracked files 06035cbe…5759e5, the same at start 13:36 and end 13:41). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `notMemberApprovedStale` true for a removed author | yes | confirmed | `publish.ts` `requireCurrent`; rebase needs membership; withdraw doesn't; `request_changes` from approved |
| 2 | An approved stale proposal tells a member it needs a rebase | yes | partly | a self-approved one (personal workspace) still says "It's ready to release." |
| 3 | `notMemberDraft` mentions withdrawing | yes | confirmed | `canWithdraw`; no member check |
| 4 | fr `rejectNotMember` | yes | confirmed | read |
| 5 | pt and fr say the same, glossary | yes | confirmed | read |
| 6 | Each test fails without its behaviour | yes | confirmed | four mutations |
| 7 | Typecheck, lint, unit | no | confirmed | exit 0; 3779 passed |
| 8 | Build, desktop e2e | no | confirmed | 13 passed |
| 9 | Phone e2e | no | confirmed | 16 passed |

**Overall:** not met: row 2.

### Re-check

Witnessed: 2026-10-29 13:41 EDT, by a fresh agent (adversarial). Commit: 370e4714 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts` (sha1 of diff+untracked 48523946f19d). Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Task tests, i18n parity, ICU | no | confirmed | 666 passed |
| 2 | Removed author, approved stale | no | confirmed | matrix; mutation → the test fails |
| 3 | Member, approved stale | no | confirmed | matrix; two mutations fail |
| 4 | The same in a personal workspace | no | not met | self-approved stale: "It's ready to release." under the bar |
| 5 | A removed author's draft: withdraw | no | confirmed | two mutations fail |
| 6 | fr rejection texts | no | partly | nothing tests fr `rejectNotMember` |
| 7 | Three languages | no | confirmed | glossary, punctuation |
| 8 | Nothing contradicts or repeats (63 cases) | no | partly | row 4; and, older, a released, rejected or archived proposal still shows as out of date |
| 9 | Tests fail when each behaviour goes | no | partly | the panel mock is always stale, so an up-to-date proposal is untested |

**Overall:** not met: rows 4, 6, 8, 9. Fixed since:
- A self-approved stale proposal says it can't be released before a rebase, and can still be withdrawn (`selfApprovedStale`, three languages).
- A proposal that's released, rejected or archived no longer shows as out of date: no stale badge, notice or proposal bar, on either route.
- The panel mock can be set per test.
- New tests: the self-approved stale wording; no rebase talk once released, rejected or archived (author and someone else); an up-to-date approved proposal is "ready to release"; the French `rejectNotMember`.
- Each of the four mutations fails a test (run by the implementer).
- Unit suite 3782 passed; proposals, review, rmk, personal-workspace and withdraw e2e passed (14).

The owner asked for one more round (2026-10-29).

### Re-check

Witnessed: 2026-10-29 13:51 EDT, by a fresh agent (blind, scoped). Commit: 370e4714 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts` (sha256 of `git diff` + untracked files 012707b7…49b0ed, the same at start 13:45 and end 13:50). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Self-approved stale: `selfApprovedStale` | yes | confirmed | `publish.ts` `requireCurrent`; rebase and withdraw from approved |
| 2 | Three languages, glossary | yes | confirmed | read |
| 3 | The proposal bar only while open | yes | confirmed | mutation → the test fails |
| 4 | The screen's stale badge and notice only while open | yes | confirmed | mutation → the test fails |
| 5 | Test: self-approved stale | yes | confirmed | mutation → it fails |
| 6 | Test: up-to-date approved | yes | confirmed | mutation → it fails |
| 7 | Test: French `rejectNotMember` | yes | confirmed | mutations → it fails |
| 8 | Typecheck, lint, unit | no | confirmed | exit 0; 3782 passed |
| 9 | Build, desktop e2e | no | confirmed | 21 passed (8 files, rmk included) |
| 10 | Phone sweep | no | confirmed | 16 passed |

**Overall:** met.

### Re-check

Witnessed: 2026-10-29 13:50 EDT, by a fresh agent (adversarial). Commit: 370e4714 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts` (sha1 of diff+untracked df634f918b49, the same at start and end). Machine: macOS 27.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Unit, lint, typecheck | no | confirmed | 3779 passed (the copy's 3 `reset-setup` failures are `pnpm exec` in a scratch copy) |
| 2 | Self-approved stale wording | no | confirmed | matrix; mutation → the test fails |
| 3 | The bar only while open | no | confirmed | mutation → the test fails |
| 4 | The badge and notice only while open | no | partly | the badge's filter alone fails no test |
| 5 | Hiding it for closed statuses hides nothing needed | no | confirmed | rejected is final; a restored one is a draft and shows stale again |
| 6 | Up-to-date approved | no | confirmed | mutation → the test fails |
| 7 | French `rejectNotMember` | no | confirmed | mutation → the test fails |
| 8 | Three languages | no | confirmed | read; parity |
| 9 | Nothing contradicts, every case on both routes | no | not met | older: in a personal workspace the proposal bar's stale text says "to be reviewed again" under "personal workspaces aren't reviewed"; on an approved stale one the review page's notice says "approving it now would undo…" where the release is what's blocked |

**Overall:** not met: rows 4 and 9. Fixed since: a test that a released, rejected or archived proposal shows no stale badge, and that an open one does; it fails when the badge filter goes (run by the implementer). Row 9's two findings are in the proposal bar's and the review page's older wording (feature 017/131), shown the same before this task.

On the owner's word (2026-10-29) both older wordings are fixed here too, in three languages:
- In a personal workspace, an out-of-date proposal's bar says resubmitting approves it again (`editor.proposal.stalePersonal`), not "to be reviewed again". `ProposalBar` takes `personal`, from the page and the editor.
- On an approved out-of-date proposal the review page's notice says releasing it would undo what the newer version changed, and that it waits on the author's rebase (`review.staleApproved`).

Each has a test that fails when undone (run by the implementer). Unit suite: 3782 passed. Proposals, personal-workspace and rmk e2e: 10 passed. Re-checked below.

### Re-check

Witnessed: 2026-10-29 14:05 EDT, by a fresh agent (blind, scoped). Commit: 370e4714 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts` (sha256 of `git diff` + untracked files 8158946a…f4f958, the same at start 14:01 and end 14:05; 23 entries in `git status --short` both times). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No stale badge or bar once released, rejected or archived; once when open | yes | confirmed | three mutations → tests fail |
| 2 | `stalePersonal` in a personal workspace, `staleReview` elsewhere | yes | confirmed | `status.ts`; `submissions.ts` self-approval |
| 3 | `personal` passed from `AuthorNotices` and `DraftEditor`, tested | yes | partly | the editor's never takes effect (it shows only draft and changes requested), so no test can cover it |
| 4 | `staleApproved` on the review page | yes | confirmed | `publish.ts` `requireCurrent`; mutation → the test fails |
| 5 | Three languages, glossary | yes | confirmed | read |
| 6 | Typecheck, lint, unit, build, e2e | no | confirmed | 3782 passed; 22 chromium, 16 phone |

**Overall:** not met: row 3.

### Re-check

Witnessed: 2026-10-29 14:07 EDT, by a fresh agent (adversarial, scoped). Commit: 370e4714 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts` (sha1 of diff+untracked 3619189bfee4, the same at start and end). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Unit, lint, typecheck | no | confirmed | 669 passed; clean |
| 2 | `stalePersonal` and `staleReview` | no | confirmed | matrix; three mutations fail |
| 3 | `DraftEditor` passes `personal` | no | confirmed | no visible effect (as row 3 above) |
| 4 | `staleApproved` | no | confirmed | matrix; mutation → the test fails |
| 5 | No stale state once closed | no | confirmed | two mutations fail |
| 6 | `selfApprovedStale` and `approvedStale` | no | confirmed | matrix; mutation → the test fails |
| 7 | Three languages | no | confirmed | read; the untranslated test catches English left in pt |
| 8 | Nothing contradicts | no | not met | personal, sent back after a rebase: "Edit the files, then Resubmit for review." under the bar's "resubmitting it approves it again" (older `feedback.mine`) |
| 9 | Nothing repeats | no | partly | "personal workspaces aren't reviewed" in the bar and in the notice under it |

**Overall:** not met: rows 8, 9 (wording). Fixed since:
- `stalePersonal` ends at "…and resubmitting it approves it again." The notice below says why, and the test checks the clause appears once.
- In a personal workspace the feedback notice says "Edit the files, then Resubmit: it's approved again at once." (`feedback.minePersonal`), on the page and in the editor. Elsewhere it keeps "Resubmit for review".
- The editor no longer passes `personal` to the proposal bar, where it could never take effect.
- All three languages. The tests fail when the page's or the editor's wording is undone (run by the implementer).
- Unit suite: 3783 passed. Wording only: one more scoped round, under the owner's rule.

### Re-check

Witnessed: 2026-10-29 14:14 EDT, by a fresh agent (blind, scoped). Commit: 370e4714 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts` (sha256 of `git diff` + untracked files 74659726…e4af, the same at start 14:09 and end 14:14; 23 entries in `git status --short`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `stalePersonal` shortened; "aren't reviewed" once | yes | confirmed | `status.ts`; `submissions.ts` self-approval; mutation → the test fails |
| 2 | `minePersonal` on the page and in the editor; "Resubmit for review" elsewhere | yes | confirmed | three mutations → the test fails |
| 3 | The personal button's own word | yes | confirmed | `SubmitDialogs.tsx` `label`/`forReview` |
| 4 | The editor no longer passes `personal` to the bar | yes | confirmed | it never took effect there |
| 5 | Three languages, `i18n.md` | yes | confirmed | read; i18n tests pass |
| 6 | The rest holds | no | confirmed | typecheck 0; lint 0 errors; 3783 passed; build; 22 chromium, 16 phone |

**Overall:** met.

### Re-check

Witnessed: 2026-10-29 14:13 EDT, by a fresh agent (adversarial, scoped). Commit: 370e4714 + uncommitted diff and untracked `AuthorNotices.tsx`, `SubmissionScreen.tsx`, `scan-actions.test.ts` (sha1 of diff+untracked a49095e78321, the same at start and end; 23 entries in `git status --short`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Task tests, lint, typecheck | no | confirmed | 486 passed; clean |
| 2 | A personal author sent back: "Resubmit: it's approved again at once", page and editor | no | confirmed | matrix (7 statuses × 4 authors × stale × 3 languages); self-approval on resubmit |
| 3 | A shared workspace keeps "Resubmit for review" | no | confirmed | matrix |
| 4 | Bar, feedback and read-only notice agree; nothing repeats | no | confirmed | matrix |
| 5 | The editor's `personal` removed, nothing visible changes | no | confirmed | matrix |
| 6 | Tests fail when each behaviour goes | no | confirmed | eight mutations |
| 7 | Three languages | no | confirmed | read |

**Overall:** met. Remarks, older and outside this task: a personal-workspace item in `submitted` (hard to reach: it's self-approved in the same call) still reads "Submitted for review…"; fr "l'approuve encore" could read "l'approuve de nouveau".

## Task 7

Witnessed: 2026-10-29 14:21 EDT, by a fresh agent (blind). Commit: d38eaeb5 (marketplace, plus the uncommitted `docs/knowledge/skill-scanner.md` and SPEC.md diff); ronne-web 1ee7a1a plus the uncommitted `www/src/content/docs/{en,pt,fr}/review.tsx` and `docs/product-facts.md`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | ronne-web lint, typecheck, tests, build | no | confirmed | exit 0; 187 passed; the build has the new pt and fr text |
| 2 | Set up the scan names the threshold, three languages | no | confirmed | `1ee7a1a`; labels match `admin.json` |
| 3 | Blocking approval (`gate`), true to the code, three languages | no | confirmed | `scan-gate.ts`, `decisions.ts`, `SubmissionScreen.tsx`; `id="gate"` built in each |
| 4 | The security scan section | no | confirmed | checked against `ScanCard.tsx`, `ScanFindings.tsx`, `dismissals.ts` |
| 5 | The author's page is the review page's screen, in Reviewing, Statuses and Decisions | no | confirmed | `submissions/[id]/page.tsx`, `SubmissionScreen.tsx`; three diffs |
| 6 | Button names match `author.json` | no | confirmed | every name, three languages |
| 7 | pt and fr say the same as en, glossary | no | confirmed | compared section by section |
| 8 | Every helper links to a real section; the two `topics.ts` agree | no | confirmed | six helpers and the card's guide link; built ids |
| 9 | Help and i18n tests | no | confirmed | 383 passed |
| 10 | The knowledge note matches the code | no | confirmed | each claim traced to its file |
| 11 | SPEC's Documentation section | no | confirmed | matches rows 2–5 and 10 |
| 12 | `pnpm witness:check` | no | confirmed | exit 0 |

**Overall:** met.
