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

## Task 2 — The table and the setting

Witnessed: 2026-11-23 17:00 EST, by a fresh agent (blind). Commit: fcc99194 + working tree (13 tracked files under `apps/web`, 6 untracked). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The `password_reset_flows` migration is registered and matches the spec's Data: ULID `id`, unique `token_hash`, nullable `user_id` with a cascading foreign key, `step`, `expires_at`, `created_at`, no email, no IP | no | confirmed | `0048_password_reset_flows.ts:24-44`, `index.ts`, `schema.ts` `PasswordResetFlowTable`; the "keeps no email address and no IP", unique token hash and cascade tests pass; mutation without `onDelete("cascade")` fails the cascade test |
| 2 | The migration's db test passes on SQLite, PostgreSQL, MySQL (and MariaDB), indexes included, and reruns over itself | no | confirmed | SQLite 4 files, 35 passed; `node scripts/test-db.mjs postgres\|mysql\|mariadb` → 3 files, 21 passed each |
| 3 | Off by default, nothing written until root turns it on | no | confirmed | only `"on"` reads as on; "reads as off … with no row written" passes; mutation `value !== "off"` → 5 of 8 fail |
| 4 | Root turns it on and off; only a change is saved; each change audited with `from` and `to`; root only | no | confirmed | `services/password-reset.ts:24-61`; the on/off and root-only tests pass; mutation of the first `recordAudit` → 3 fail |
| 5 | Turning on is refused without email, while its last test or send failed (or none was done), or without a contact; off always works | no | confirmed | `passwordResetBlockers`, throw at `password-reset.ts:43-44`; `mailReadiness` `working` needs a transport and a `working` last status; mutations of the throw and of `working` fail the tests |
| 6 | Clearing the contact turns it off in the email setup's transaction, audited with `reason: contact_cleared`; changing it, or clearing it while off, writes nothing | no | confirmed | `mail-setup.ts:290-292`; both tests pass; mutation `if (false)` fails the first |
| 7 | "Refused while the contact is empty" also holds when turning it on and clearing the contact happen at once | no | not met | `adminSetPasswordResetPolicy` reads readiness before and outside the service's transaction; probe `probe-194-race.db.test.ts` (readiness read → contact cleared → turn on) ended `{"enabled":true}` with no contact |
| 8 | The audit action is listed, with its sentence in English, Portuguese and French | no | confirmed | `audit-event.ts`, `summary.ts:687-691`, `messages/{en,pt,fr}/admin.json`; `sentences.test.ts` passes |

**Overall:** not met: readiness is checked outside the transaction, so two roots acting at once can leave the setting on with no Instance contact.

### Adversarial pass

Witnessed: 2026-11-23 17:00 EST, by a fresh agent (adversarial). Commit: fcc99194 + working-tree diff (13 tracked files modified, 6 untracked). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The table's columns, and no email or IP | no | confirmed | `0048_password_reset_flows.ts:26-41`; probe E inserted `step: "new_password"` with `user_id: null` on all 4 databases |
| 2 | `user_id` is a real FK that cascades | no | confirmed | the cascade test passes on sqlite, pg, mysql, mariadb |
| 3 | The migration's db test passes on SQLite, PostgreSQL and MySQL | no | confirmed | 3 files, 21 passed on each |
| 4 | It reruns, also after a partial MySQL run | no | confirmed | probe E dropped `password_reset_flows_expires_idx`, ran `up()` twice → no error on all 4 |
| 5 | Off by default; any value but "on" reads as off | no | confirmed | probe C stored `ON`, ` on`, `true`, `1`, `yes`, `""` → all off; mutation M3 → 5 fail |
| 6 | Turned on only while email is set up, its last test or send passed, and the contact is set | no | partly | (a) race: probe A, readiness read → `saveMail("")` → turn on → `enabled=true contact=""` on all 4; (b) probe B: a working test, then the Resend key replaced by an untested one → `working: true`, as `saveMailSetup` keeps `mail_last_status` |
| 7 | Turning off is always allowed | no | confirmed | db test with readiness all false |
| 8 | Clearing the contact turns it off, audited, in the same transaction | no | partly | works through the form (mutations M1, M6 fail the test); but the guard is `from.contact !== "" && to.contact === ""`, so a setting on with the contact already empty stays on after a resave |
| 9 | Every change audited, only a real change saved | no | partly | probe D: 3 concurrent turn-ons on MySQL and MariaDB → 3 `changed: true` and 3 audit rows; 1 on PostgreSQL |
| 10 | Root only | no | confirmed | ForbiddenError; mutation M5 fails the test |
| 11 | "Last test failed" read correctly after a failure | no | confirmed | failing → false, working → true, stopSending → false; mutation M2 fails |
| 12 | The audit sentence in three languages | no | confirmed | `sentences.test.ts` → 14 passed |
| 13 | A settings db test covers on, off, the refusals and the contact turn-off | no | confirmed | 8 passed on all 4; M1–M6 each fail a test |

**Overall:** not met: the race above, a resave that doesn't repair it, and "last test passed" surviving a change to the email setup. Minor: concurrent turn-ons over-audit on MySQL and MariaDB; the string `"true"` reads as off (the form posts `on`).

### Re-check 1

Witnessed: 2026-11-23 17:12 EST, by a fresh agent (blind). Commit: fcc99194 + working tree (13 tracked files under `apps/web` modified, 6 untracked). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | "Refused while the contact is empty" holds when turning it on and clearing the contact happen at once | no | confirmed | readiness read in the transaction (`services/password-reset.ts:46-50`); `lockedMailReadiness` compare-and-sets the contact to its own value (`mail-admin.ts:205-223`); mysql2 keeps FOUND_ROWS (`create-db.ts:113`). Probe ordering A → `{"enabled":false}`, 2 audit events, on all 4; ordering B → refused for the contact on pg, mysql, mariadb. Mutation without the hold → ordering A ends on with no contact, and the repository's race test fails |
| 7a | No false refusal: a set contact still lets it turn on; the contact row keeps its value | no | confirmed | probe C → changed; test "leaves the contact row as it was" passes |
| 4' | Compare-and-set write: of two saves at once only one changes and is audited | no | confirmed | `services/password-reset.ts:54-55`; ordering A gave exactly 2 audit rows on all 4 |
| 6' | Any save leaving the contact empty turns off a setting left on | no | confirmed | `mail-setup.ts:302`; test passes; mutation `&& from.contact !== ""` fails it. Remark: a save that changes nothing returns before the turn-off |
| 5' | A change to how email is sent clears the last result; contact, sender's name and reply-to don't | no | confirmed | `UNTESTED_FIELDS`; test passes; mutation `if (false)` fails it |
| 5'' | `mailReadiness` reports `working` | no | confirmed | updated mail-admin test passes on all 4 |
| D | Done when: the migration's and the settings db tests pass on SQLite, PostgreSQL and MySQL | no | confirmed | sqlite 49 passed, 2 skipped (server-only); postgres, mysql, mariadb 51 passed each |

**Overall:** met.

### Adversarial re-check 1

Witnessed: 2026-11-23 17:25 EST, by a fresh agent (adversarial). Commit: fcc99194 + working tree. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6(a) | A contact cleared while it's being turned on leaves it off, or the turn-on is refused | no | confirmed | probe `recheck1.db.test.ts` R1, R2 and R3 (15 rounds 0–2 ms apart) on pg, mysql, mariadb: never on with no contact, no deadlock; mutation without the hold fails the repository test on pg and mariadb |
| 6(b) | "Last test passed" is about the setup as it is | no | partly | the clearing holds (test, mutation, R6); but R5: a test of the old key still sending while root saves a new key writes `working` after the save (`sendTestEmail`, `mail-admin.ts:115`), so the new key reads as working; the outbox has the same hole (`outbox.ts:152`) |
| 8 | Any save leaving the contact empty turns it off, audited once | no | confirmed | test passes on all 4; mutation fails it; compare-and-set from `on` writes nothing when off |
| 9 | Of several turn-ons at once, one changes it and is audited | no | partly | MySQL, MariaDB: 1 change, 1 audit (R4). PostgreSQL: 1 change, but the other 3 throw `AbortedTransactionError`: the insert's unique violation aborts the transaction before `compareAndSet` returns false. The repository test doesn't overlap the turn-ons enough to show it |
| 10 | Nothing broken in 189's or 190's tests | no | confirmed | SQLite mail, identity, settings db tests: 58 files, 768 passed, 4 skipped; the three files on each server 45/45 |

**Overall:** not met: a result from the setup before a change can still mark the new setup as working, and concurrent first-ever turn-ons throw on PostgreSQL. Remark: retyping the same key clears the last result.

### Re-check 2

Witnessed: 2026-11-23 17:28 EST, by a fresh agent (blind). Commit: fcc99194 + working tree (16 tracked files modified, 6 untracked). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5' | A change to how email is sent clears the last result; contact, sender's name and reply-to don't | no | confirmed | `mail-setup.ts:291`; probe `probe-tab-status.db.test.ts`: `fromName` keeps `working`, a new key or the same key typed again reads `untested`; the test passes |
| 5'' | `mailReadiness` reports `working` only for a success through the setup as it is | no | confirmed | `mail-admin.ts:176-192`; mutation dropping the comparison → 2 tests fail |
| 5''' | A test or delivery of the old setup ending after a change doesn't count for the new one | no | confirmed | `sendTestEmail` and the outbox record `sender.setup`, read before the send; probe "stale success" → `working:false`; the switch refuses with `working` |
| 5'''' | The Email tab's status for an older result | no | partly | a stale success reads `untested`; but a success recorded before 194 (no fingerprint) shows "Working" on the tab while readiness says not working; no test covers the tab's fingerprint branch (mutating it to `false` leaves 94 tests green) |
| 4' | Of two saves at once only one changes and is audited, the first-ever turn-on included, none failing | no | confirmed | `kysely-settings-repository.ts:39-49`; the "first ever" test passes on pg, mysql, mariadb; mutation `if (false)` → `AbortedTransactionError` on pg |
| C | The other compareAndSet callers still pass | no | confirmed | callers `account-rules.ts:89`, `password-reset.ts:54,83`, `mail-admin.ts:219`; SQLite 9 files 120 passed, 2 skipped; pg, mysql, mariadb 121 passed each |
| D | Done when: the migration's and settings db tests pass on SQLite, PostgreSQL and MySQL | no | confirmed | same runs; MariaDB too |

**Overall:** not met: a success recorded before 194 reads "Working" on the tab while the switch refuses it, and the tab's branch has no test. Remark: the tab received the fingerprint, which it has no use for.

### Adversarial re-check 2

Witnessed: 2026-11-23 17:35 EST, by a fresh agent (adversarial). Commit: fcc99194 + working tree. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6(b) | A test or send of the old setup that ends after root saves a new one doesn't make the new one read as working | no | confirmed | probe `recheck2.db.test.ts` Q1 (test held in `send`, new key saved, ends `sent`) → `working: false`, tab `untested`, a test of the new key → `true`; Q2 the same through `deliverDue`; Q3 sender's address changed in flight → false; Q4 only the contact changed → stays true; all on sqlite, pg, mysql, mariadb. Mutation of the comparison fails 2 tests |
| 9 | Of several first-ever turn-ons at once, one changes it and is audited, none fails | no | confirmed | Q5: 6 turn-ons on separate connections, 5 rounds, on pg, mysql, mariadb → one `changed:true`, five `false`, no error, 1 audit; mutation without ON CONFLICT → the repository test fails on pg with `AbortedTransactionError` |
| 9a | The shared `compareAndSet` keeps its meaning for its other callers | no | confirmed | Q7 sequential and in a transaction, same on all 4; Q6: 5 first-ever account-rules saves at once → 1 change, 4 `StaleAccountRulesError`, none aborted; all `settings/` and `mail/` files pass on the servers |
| 9b | Nothing else writes a `working` status without `setup` | no | confirmed | `grep -rn '"working"' apps/web/src` → only `mail-admin.ts:118` and `outbox.ts:202`, both with `sender.setup` |

**Overall:** met. Test gap: no repository test shows `sendTestEmail` and `deliverDue` record the setup they sent through (a mutation reading it at write time passes every test). Remark: a late failure through the old setup shows as `failing` on the tab for the new one (it never reads as working).

Fixes after the two passes: the tab shows a success only when it names the setup as it is (one from before 194 reads untested, as the switch counts it); a failure names its setup too, and one through an older setup reads untested; the tab no longer receives the fingerprint; tests for the tab, for a test email of the old key ending sent or failed after a new one is saved, and for an outbox delivery doing the same (each fails under its mutation).

### Re-check 3

Witnessed: 2026-11-23 17:31 EST, by a fresh agent (blind). Commit: fcc99194 + working tree. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5'''' | The tab and readiness agree for a current success, a pre-194 success, a success or failure through an older setup, and a credentials failure with no setup | no | confirmed | probe `PROBE3` (scratch copy resynced) → current success `working`/true; pre-194 success `untested`/false; current failure `failing auth`/false; credentials failure `failing credentials`/false; older-setup success and failure `untested`/false; `setup: ""` or `5` `untested`/false; `agree= true` on all 8 |
| 5a | The tab's status carries no fingerprint | no | confirmed | `noFp= true` on every row; `mail-setup.ts:89,91`; the test uses an exact `toEqual` |
| 5b | The tab tests fail when its branch is mutated | no | confirmed | back to `last ?? "untested"` → 4 new tests in `mail-admin.db.test.ts` fail |
| 5c | The `sendTestEmail` tests fail when `sender.setup` becomes a fingerprint read at write time | no | confirmed | 2 fail (old key ending sent, ending failed) |
| 5d | The outbox test fails under the same mutation | no | partly | all 3 branches → 1 fails; only the two failure branches (`outbox.ts:212,221`) → 26/26 pass: a late failure through the old key isn't guarded |
| 5e | The mail, settings and 0048 db files pass on SQLite, PostgreSQL and MySQL | no | confirmed | SQLite 28 files, 470 passed, 2 skipped; postgres and mysql 13 files, 186 passed each |

**Overall:** not met: no test guards the outbox's failure branches recording `sender.setup` (a test gap; readiness is false either way).

Fix after the pass: the outbox test runs for a delivery ending `sent` and one ending `failed` (tab `untested`, readiness false); mutating the two failure branches now fails the `failed` case.

### Re-check 4

Witnessed: 2026-11-23 17:33 EST, by a fresh agent (blind). Commit: fcc99194 + working tree. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5d | A test fails if either of the outbox's failure branches records a fingerprint read when the result is written instead of `sender.setup`; `outbox.db.test.ts` passes on SQLite and PostgreSQL | no | partly | `mutate4.sh 3` (both) → the `failed` case fails; `2` (terminal branch) → the same; `1` (the retry branch whose last try fails, `outbox.ts:209-216`) → 27 passed: a `failed` result never reaches that branch. Unmutated: SQLite and postgres 27 passed |

**Overall:** not met: the retry branch that ends failed isn't guarded.

Fix after the pass: a third ending, `retry` on the last allowed try (the row at `MAX_ATTEMPTS - 1`), with the same checks; `mutate4.sh 1` now fails it.

### Re-check 5

Witnessed: 2026-11-23 17:35 EST, by a fresh agent (blind). Commit: fcc99194 + working tree. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5d | Each of the outbox's three result branches (`sent`, `retry` whose last try fails, terminal `failed`), changed alone to read the fingerprint at write time, fails a test; unchanged, the file passes on SQLite and PostgreSQL | no | confirmed | `mutate5.sh 1` (outbox.ts:204, sent) → "… ends sent …" fails; `2` (:215, retry) → "… ends retry …" fails; `4` (:224, failed) → "… ends failed …" fails; `0` → 28 passed; the `retry` case sets `attempts` to `MAX_ATTEMPTS - 1` (outbox.db.test.ts:541-549); repository SQLite 28 passed, postgres 28 passed |

**Overall:** met.

## Task 3 — The request

Witnessed: 2026-11-23 17:47 EST, by a fresh agent (blind). Commit: f1f987cc + working tree (11 modified tracked files, 7 untracked password-reset files). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on all four dialects | no | confirmed | `services/password-reset.db.test.ts` 17 passed on sqlite, postgres, mysql, mariadb; `models/password-reset.test.ts` 7 passed |
| 2 | The address is normalised as at sign-in | no | confirmed | `signUpEmail`; probe P6 (`\r\n`, upper case → a code mail; `123`, `null`, 5000 characters → `invalid_email`); mutation M9 fails the test |
| 3 | Active account with a password: a code, tied to the flow; no session | no | confirmed | first db test |
| 4 | Root: no code, the email names `reset-root-password` | no | confirmed | test; probe P4 (pt mail) |
| 5 | No password, or *Root only*: "You sign in with {providers}" | no | confirmed | two tests |
| 6 | Disabled, waiting for approval, no account, erased: nothing sent | no | confirmed | db tests; no audit for erased or unknown |
| 7 | The same screen state on every row | no | confirmed | test over 5 rows; probe P2b |
| 8 | A flow row on every path, no address or IP | no | confirmed | mutation M6 → 5 tests fail |
| 9 | Queued in the outbox, in the page's language | no | confirmed | probe P4 (fr, xx → en, pt); mutation M4 fails the first test |
| 10 | Per-IP 10/hour through 109's database limiter | no | confirmed | probe P3 with the DB store on all 4 → 10 true, then false; mutation M3 fails the test. Remark: the db test uses the memory store |
| 11 | Per-address limits (3 an hour, resend after 60 s) | no | partly | 3 an hour holds (test, P3, P7 for root and providers); the 60 s wait is keyed on a new flow id each request (P1: two requests 1 s apart → 2 mails); mutation M8 (`send.ok` dropped) passes every test |
| 12 | Honeypot, fill time, challenge | no | confirmed | tests; mutation M5 fails the bot test |
| 13 | Audit only for a real account; registered in 3 languages | no | confirmed | `audit-event.ts:115`, `summary.ts:275`; P2b on mysql/mariadb → 0 audits. Remark: mutation M7 (guard reduced to `account &&`) passes every test |
| 14 | MySQL/MariaDB accents: only the exact address gets the code | no | confirmed | P2b → 0 mails, 0 codes on mysql and mariadb; mutation M1 fails the model test |
| 15 | Two requests in a row: the second code ends the first | no | confirmed | test (61 s apart) |
| 16 | Email or the setting off: closed, no flow | no | confirmed | test |
| 17 | A test checks the found and not-found paths make the same repository calls | no | confirmed | Proxy test; mutation M2 fails it |
| 18 | Same time: response times a test can't tell apart | no | not met | P5, median of 6: postgres found 16.7 ms vs missing 11.1; mysql 16.1 vs 11.7; mariadb 15.1 vs 10.6 |

**Overall:** not met: the found path does measurably more work, and the 60-second wait is bypassed by a new request.

### Adversarial pass

Witnessed: 2026-11-23 17:47 EST, by a fresh agent (adversarial). Commit: f1f987cc + working tree. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass on all four dialects | no | confirmed | 17 passed on each |
| 2 | Normalised as at sign-in | no | confirmed | non-ASCII refused before any lookup |
| 3 | A code for an active password account, tied to the flow, no sign-in | no | confirmed | test 1 |
| 4 | A root never gets a code | no | confirmed | probe P3 (root under *Root only*, root with no credential row) → `reset_root` ×2, 0 codes; mutation M1 fails the root test |
| 5 | No password or *Root only* → providers | no | confirmed | tests; P2 (null password, no provider on) → nothing, same answer; P7 odd provider name renders |
| 6 | Disabled or waiting: nothing | no | confirmed | tests |
| 7 | No account or erased: nothing, no audit | no | confirmed | P1 (stored `kåte@`, typed `kate@`) on pg, mysql, mariadb → 0 mails, audits, codes |
| 8 | Flow row on every path, hash of a 32-byte token, user only when a code went | no | confirmed | P8 columns; limited and bot paths → `user_id` null |
| 9 | A new code ends the account's earlier ones | no | partly | sequential holds (mutation M3 fails 2 tests); P5: 3 requests at once → 3 live codes on pg, mysql, mariadb |
| 10 | Queued, never sent on the request's path | no | confirmed | `queueMail` in the transaction, `mailQueued` after commit |
| 11 | The same answer for every address | no | confirmed | P4: code, unknown, limited, bot → same keys, expiry, token length on all 4 |
| 12 | Same time | no | not met | P6, 80 rounds: postgres p50 code account 15.3 ms vs unknown 11.8 (root 14.2, disabled 13.0); mysql 15.7 vs 11.9; mariadb 14.4 vs 11.5. P9: with the address's 3 sends spent a real account is still 1–2 ms slower (its audit row), with no per-address cap |
| 13 | Per-IP 10/hour | no | confirmed | test |
| 14 | Per-address 3/hour, same page after | no | confirmed | test; P4 |
| 15 | Honeypot, fill time, challenge, no replay | no | confirmed | tests; mutation M2 fails the bot test |
| 16 | Audit only for a real account, no code or address in it | no | confirmed | P8 `{"sent":"code"}`; mutation M4 fails 4 tests |
| 17 | The page's language | no | confirmed | test 1; model test |

**Overall:** not met: response time shows whether an address has an account, and concurrent requests leave several live codes. Remark: the `reset_code` subject carries the code, as 190's sign-up subject does.

### Re-check 1

Witnessed: 2026-11-23 18:01 EST, by a fresh agent (blind). Commit: f1f987cc + working tree. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on all four dialects | no | confirmed | 31 passed on postgres, mysql, mariadb (23 own + 8 probe); sqlite 37 passed, 1 skipped (server-only) |
| 11 | Per-address limits (3 an hour, resend after 60 s) | no | confirmed | resend keyed on `address:<emailHmac>` (`password-reset.ts:142-147`); P1 (1 s apart) → 1 mail, 1 code on all 4; mutations M8 → 2 fail, MA (key back to `flowId`) → 1 fails |
| 13 | Audit only for a real account | no | confirmed | M7 (guard `if (account)`) fails the accent test on mysql and mariadb. Remark: nothing reaches the `!account.erased` half |
| 17 | The same-calls test | no | confirmed | expects `lockAccount, endCodesOf, issueCode, recordAudit` as the found path's extras; mutation MC fails it |
| 18 | Same time | no | confirmed | `finally` waits until 400 ms (`password-reset.ts:94-101`); the action leaves the default; P5 medians found vs missing: sqlite 401.8/402.0, postgres 401.8/401.3, mysql 400.7/401.2, mariadb 400.9/401.8; mutation MB fails both timing tests |

**Overall:** met. Remark: the floor hides the difference only while a request finishes within 400 ms.

### Adversarial re-check 1

Witnessed: 2026-11-23 18:10 EST, by a fresh agent (adversarial). Commit: f1f987cc + working tree. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | With the default floor, time doesn't show whether an address has an account | no | confirmed | R1, 6 runs per path: every path 398.8–404.4 ms on sqlite, postgres, mysql (one mariadb outlier 424.3 for a disabled account); raw gap with floor 0 (R4): at most ~43 ms; mutation without the `finally` wait fails both timing tests |
| 2 | Every answer waits, refusals and exceptions included | no | confirmed | R2: `transaction`, `openness`, `mail`, `limits.consume` throwing → rejected at 400.4–403.3 ms on all 4 |
| 3 | A path slower than the floor is hidden | no | partly | R3: `lockAccount` slowed by 600 ms → 615–662 ms vs 401–403: by design a floor, not a fixed time |
| 4 | The floor doesn't leak through the result | no | confirmed | R1 shapes identical; no page or cookie in this task yet |
| 5 | The 60 s resend wait is the address's, across flows | no | confirmed | R5; mutation `subjectId: flowId` fails the test |
| 6 | Requests at once leave one live code | no | confirmed | repository test on pg, mysql, mariadb; mutation without `lockAccount` fails on pg and mysql; R6 5 at once → 1 live |
| 7 | The lock doesn't deadlock with other accounts or sign-ins | no | confirmed | R6 mixed (3 accounts, 4 sign-ins, a second reset) on all 4 → all fulfilled, 3 live codes |
| 8 | The per-address limit covers root and providers emails | no | confirmed | test; mutation fails it |
| 9 | The audit guard covers an accent-equal address | no | confirmed | test on mysql; mutation fails it |

**Overall:** not met on row 3 alone (by design of a floor). Remark: the per-address limit is taken before the transaction, so a failed transaction still spends the minute.

Fixes after the two passes: SPEC.md "Same time" says the floor is a floor (only a database stalled past it on that one request would show) and that the per-address limit is taken before the transaction, as 190's is; a test for an account marked erased whose address is still its own (no mail, no audit), which fails when `!account.erased` is dropped.

### Adversarial re-check 2

Witnessed: 2026-11-23 18:07 EST, by a fresh agent (adversarial). Commit: f1f987cc + working tree (13 tracked files modified, 7 untracked). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Every answer, refusals included, waits at least 400 ms after the request began | no | confirmed | `services/password-reset.ts:94-101`; probe `probe-rc2.db.test.ts` R7 with the floor on: account vs missing 400.0–405.9 ms on all 4 |
| 3' | A real account's extra work takes tens of ms; no unstalled path passes the floor | no | confirmed | R7, floor 0, 3000 flows and codes for the account and 20 000 anonymous flows, 15 runs: account max 7.3 (sqlite), 71.4 (pg), 57.1 (mysql), 45.2 (mariadb) ms; missing 4.5/26.0/33.6/45.7; root 2.0/23.8/22.3/24.4; `password_reset_flows_user_idx` keeps `endCodesOf` indexed; only the request that passes the 60 s limit takes the lock |
| 3'' | The new SPEC text matches the code | no | confirmed | limit before the transaction (`:142` before `:149`); `subjectId: address:<hmac>`; `lockAccount` |
| 3''' | The new erased-account test | no | confirmed | passes on all 4; dropping `!account.erased` from the audit guard, or `\|\| account.erased` from `resetEmailFor`, fails it |

**Overall:** met. Outside this row, in task 2's `settings/services/password-reset.db.test.ts`: the server-only "first ever" test ran (and failed) on SQLite when `TEST_DATABASE_URL` was set but empty, and deadlocked on MariaDB about 1 run in 4.

Fix after the pass: both reset transactions (`setPasswordResetPolicy`, `requestPasswordReset`) run in `retryOnDeadlock`; the server-only tests skip on `!process.env.TEST_DATABASE_URL`. Both files: 36 passed, 3 skipped with the URL empty and on SQLite; 39 passed on postgres, mysql and mariadb; the MariaDB file 15/15 six times running.

## Task 4 — The code and two-factor steps

Witnessed: 2026-11-23 18:29 EST, by a fresh agent (blind). Commit: 8b025db1 + working tree (18 modified files, 3 untracked). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A right code with no two-factor opens the new-password page for 10 minutes, no session | no | confirmed | 4 files, 55 passed, 1 skipped (SQLite); steps test :149 |
| 2 | A wrong code is refused and audited; five end the flow | no | confirmed | steps test :181 |
| 3 | Expired and replaced codes, for a real address and an unknown one | no | confirmed | steps tests :217, :223; `endCodesFor` by `email_hmac` |
| 4 | A cookie from an earlier step is refused; a missing one says so, at both steps | no | confirmed | tests :170, :176, :427; probe: a code-step token at the two-factor step → `spent` |
| 5 | The cookie is replaced on success; a second submit at once is refused | no | confirmed | `nextStep`, `advanceFlow` on the old hash |
| 6 | 20 wrong codes in 24 hours pause reset by email (a right code counts as wrong); sign-in works | no | not met | probe "4 flows × (5 wrong + 1 more)" → the 5th flow's right code opens `new_password`: the sixth try's `endFlow` deletes the flow, and `wrongCodesSince` counts only codes of surviving flows; mutation without the pause fails only the pause test |
| 7 | 30 code tries per IP per hour | no | confirmed | test :310 |
| 8 | The code page answers at the floor | no | confirmed | test :319 |
| 9 | Disabled, made root, erased, *Root only* mid-flow: refused, the flow ends | no | confirmed | 4 tests; mutation M6 fails all 4 |
| 10 | The next step follows the account now (two-factor on after the request; off before its step, `two_factor_at` null) | no | confirmed | tests :401, :408; mutation M3 → 7 fail |
| 11 | A disabled account is refused at the two-factor step | no | confirmed | test :435 |
| 12 | TOTP from the account's secret, as Better Auth decrypts it | no | confirmed | `totp.test.ts`, test :331 |
| 13 | A backup code works once | no | confirmed | test :350; mutation M2 fails it; a case-changed backup code → `wrong` |
| 14 | A TOTP code already accepted is refused, and one accepted at a reset is spent | no | partly | behaviour holds (probe "replay" → `used`); but M1 (no `spendCode`) and M7 (no `codeUsed`) each leave 23/23 passing |
| 15 | Two-factor failures count with sign-in's; the tenth locks for 15 minutes; audited | no | confirmed | test :380; mutation M4 fails it |
| 16 | The same on PostgreSQL, MySQL and MariaDB | no | confirmed | 3 files, 53 passed on each |
| 17 | Data: `two_factor_at`; the two audit events in en/fr/pt and the fixture | no | confirmed | 0048 edited in place (unreleased); `src/features/admin-audit` 52 passed |
| 18 | Task 3's request still meets "What is sent" | no | confirmed | `password-reset.db.test.ts`; `checkResetCode` goes on only with `check.result === "ok" && userId` |

**Overall:** not met: the pause can be bypassed (row 6), and the replay guards are untested one at a time (row 14). Minor: an empty or used two-factor code doesn't count toward the lockout.

### Adversarial pass

Witnessed: 2026-11-23 18:29 EST, by a fresh agent (adversarial). Commit: 8b025db1 + working tree. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A right code with two-factor off: the new-password page, 10 minutes, cookie replaced, no sign-in | no | confirmed | steps test green on all 4 |
| 2 | Earlier cookie refused, missing says so, two right submits at once give one | no | confirmed | P2 → `[true,false]`; P6 upper-case token (MySQL) refused |
| 3 | Five wrong tries end a code, a burst gets no more | no | confirmed | P3 10 at once → at most 5 attempts on every dialect |
| 4 | Expired and replaced answer alike for an account and none | no | confirmed | tests green on all 4; `paused` only in the audit |
| 5 | The code page answers at the floor | no | confirmed | P8 a throwing transaction → ≥149 ms with a 150 floor |
| 6 | 20 wrong in 24 hours pause it for 24 hours | no | not met | P1: 6 flows × (5 wrong + 1) = 30 wrong, then a right code → `new_password` on all 4 |
| 7 | 30 code tries per IP | no | confirmed | test; both steps share the key |
| 8 | TOTP or backup code; a backup code raced on two flows gives one | no | confirmed | P4 → one `ok`, one `wrong` |
| 9 | A TOTP code accepted is refused between reset and sign-in both ways | no | confirmed | P9 both directions → `used` |
| 10 | Failures count with sign-in's; ten in a row lock it | no | partly | one at a time it holds; P10 60 wrong at once → 60 checked, 0 locked, count 60 on all 4: no per-user serialisation (sign-in uses `oneAtATime`) |
| 11 | Two-factor on after the request asked; off before its step passed | no | confirmed | tests on all 4 |
| 12 | Disabled, root, erased, *Root only* can't continue at both steps | no | confirmed | mutation fails 5 tests; P7 |
| 13 | A flow with no user can't reach the next steps | no | confirmed | P6 |
| 14 | TOTP checked as Better Auth does | no | confirmed | `totp.test.ts` |

**Overall:** not met: the pause can be avoided (row 6), and a burst gets past the two-factor lockout (row 10). Minor: a right TOTP code resets the count before `spendCode` catches a replay.

Fixes after the two passes: `wrongCodesSince` counts by the address's HMAC (`email_codes.email_hmac`), which outlives ended flows; `checkCodeOf` runs in one transaction holding the account's `two_factor` row (`FOR UPDATE` on PostgreSQL and MySQL; SQLite runs it alone), records a right TOTP code as accepted in that transaction (a replay is `used` and counts as a failure, never clearing the count), and every refusal, an empty or used code included, counts in the lockout. New tests: the pause test tries each flow to its end; a TOTP accepted at a reset refused at the next; a used and an empty code counted; 30 guesses at once → 10 wrong, 20 locked (servers). Mutations: the old flow-based count fails the pause test; no `FOR UPDATE` fails the burst test on PostgreSQL.

### Re-check 1

Witnessed: 2026-11-23 18:41 EST, by a fresh agent (blind). Commit: 8b025db1 + working tree. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | 20 wrong codes in 24 hours pause reset by email, even when the flows have ended | no | confirmed | probes "4 flows × (5 wrong + 1)" and "5 flows × 5 wrong", then a right code → `wrong` on all 4; `wrongCodesSince` by `email_hmac` |
| 14 | A TOTP accepted already is refused; one accepted at a reset is spent | no | confirmed | spend inside `checkCodeOf`; mutation dropping `spendIn` → 3 tests fail; returning `used` before counting → 1 fails; probe "replay" → `used` on all 4 |
| minor | An empty or used code counts toward the lockout | no | confirmed | mutation returning early on an empty code → the test fails |
| 15 | Failures count with sign-in's; the tenth locks; a burst can't get past | no | confirmed | one transaction over `two_factor` `FOR UPDATE`; steps file (burst test included) and `two-factor-sign-in.db.test.ts` pass on all 4 |
| 16 | The same on PostgreSQL, MySQL and MariaDB | no | confirmed | SQLite 83 passed, 2 skipped; MySQL 85/85; PostgreSQL and MariaDB 84/85 under load (a timing test each), both passing alone |

**Overall:** met. Note: a witness's `pnpm exec` in a scratch copy rewrote the repository's `node_modules/.bin` shims; restored with `pnpm install --frozen-lockfile --force` (no shim points into the scratchpad).

### Adversarial re-check 1

Witnessed: 2026-11-23 18:42 EST, by a fresh agent (adversarial). Commit: 8b025db1 + working tree (19 modified, 3 untracked). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The pause holds even when flows are ended | no | confirmed | P1: 6 flows × (5 wrong + 1), then a right code → `wrong` on all 4; the purge keeps codes a day past expiry |
| 6a | The pause holds "for that account" | no | partly | P15: paused, then `user.email` changed → a right code for the new address opens `new_password` on all 4: the count follows the address |
| 10 | Reset failures count with sign-in's, ten lock it, even in a burst | no | confirmed | P10: 60 at once → 10 checked, 50 locked; P11: 20 reset + 20 sign-in at once → count 10; mutation without `forUpdate()` → the steps burst test fails on pg |
| 10a | No deadlock with sign-in or turning two-factor off | no | confirmed | P11, P14 on all 4 |
| 10b | `spendIn` in the transaction: no abort on pg, no failure on MySQL | no | confirmed | P12: one TOTP at reset and sign-in at once → one wins, 1 session; P9 replay both ways |
| 10c | Backup codes under the row lock: one wins | no | confirmed | P13; P4 |
| M | A right TOTP no longer resets the count before a replay is caught | no | confirmed | P9; the used-code test |
| 16 | The task's files and sign-in's two-factor flows on every dialect | no | partly | SQLite 114+2 skipped, pg 116, mariadb 116, mysql 115 + 1 failure in the unchanged `two-factor-sign-in.db.test.ts` ("the same backup code in two challenges at once, without any queue", 2nd repeat), passing alone twice |

**Overall:** not met: the pause follows the address, not the account (6a); one unchanged sign-in race test failed once on MySQL (16). Remark: `checkCodeOf` used a deferred transaction on SQLite, which `db/locks.ts` says fails with SQLITE_BUSY when another process writes the file.

Fixes after the two passes: `wrongCodesSince` counts the account's own `auth.password_reset_code_failed` audit rows (reason `wrong` or `paused`) in the 24 hours, which outlive the flows and follow the account through a change of address; `checkCodeOf` uses `writeTransaction` (BEGIN IMMEDIATE on SQLite); SPEC "Rate limits" says so; a test changes the address of a paused account (the right code stays wrong). `two-factor-sign-in.db.test.ts` passed 3/3 on MySQL; it calls Better Auth's own backup-code check, none of this task's code.

### Adversarial re-check 2

Witnessed: 2026-11-23 18:46 EST, by a fresh agent (adversarial). Commit: 8b025db1 + working tree (19 modified, 3 untracked). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6a | The pause holds for the account through a change of address | no | confirmed | `kysely-password-reset-repository.ts:116-136` counts `audit_log` rows by `target_id`; P15 → `wrong` on all 4 |
| 6b | Every wrong code for an account leaves an audit row | no | confirmed | `failed()` on every non-ok result with a user, in the attempt's transaction |
| 6c | Retention can't remove the rows within 24 hours | no | confirmed | no `deleteFrom("audit_log")` outside a test (`audit-log.guard.test.ts` forbids it); retention clears only IPs and listed email keys |
| 6d | Someone else filling the count goes no further than the spec | no | confirmed | P18: a third party's 20 wrong → the victim's right code `wrong`, sign-in still `ok`, 25 h later `new_password`, on all 4 |
| 6e | 20 wrong is the limit, even in a burst | no | partly | P17: 19 wrong, then 4 wrong and the right one at once → `ok` on pg, mysql, mariadb (23 wrong before a success); SQLite serialises them. The count is read before anything serialises the account |
| 6f | The pause lasts 24 hours | no | partly | P16: 20 wrong over hours 0–3, the right code at hour 24.5 → `new_password`: a rolling window from the first of the 20 |
| 16 | The task's files and sign-in's two-factor flows on every dialect | no | confirmed | mysql 87/87 twice, postgres 87/87, mariadb 87/87; SQLite 85 passed, 2 skipped |
| R | `checkCodeOf` on SQLite takes the write lock first and doesn't hang | no | confirmed | `writeTransaction`; P10, P11, P14 on SQLite, no `SQLITE_BUSY` |

**Overall:** not met on 6e (a burst at the threshold gets up to 4 extra guesses on the servers) and 6f (the pause is a rolling window). Two adversarial re-checks done: the owner decides (state-witness.md, "Two rounds, then the owner").

The owner chose (2026-11-23): fix both, then one more scoped adversarial round. Fixes: the code step takes the account's row (`lockAccount`) before it counts, so tries at once for one account are counted one after another; `resetPaused` (models/password-reset.ts) is on while some 20 wrong codes fall within 24 hours and the 20th of them is less than 24 hours old, read from two days of the account's audit rows (`wrongCodeTimes`). Tests: the window (unit), the pause still on 21.5 hours after the 20th and off a day after the last try, and a burst at 19 (4 wrong and the right code at once → none `ok`, servers only). `two-factor-sign-in.db.test.ts` "without any queue" (issue #307's race) failed once on MySQL in a run of 3 files at once; alone it passed 10/10 with this task's store and 10/10 with the store before it.

### Adversarial re-check 3

Witnessed: 2026-11-23 19:36 EST, by a fresh agent (adversarial). Commit: 8b025db1 + working tree (19 modified, 3 untracked). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6e | 20 wrong is the limit, even in a burst | no | confirmed | `lockAccount` before `wrongCodeTimes` (`services/password-reset.ts:393`); P17 3 runs × 4 dialects: never more than 20 `wrong` rows (once on mysql the right code won at 19: `ok`, the rest `replaced`, allowed); P19 (a mixed burst with a new request, sign-ins and a ghost flow) → no deadlock, at most 20 `wrong` |
| 6e-t | The burst test checks the claim | no | partly | it expected no `ok`, but `ok` is right when the right code is counted first: failed 3 of 10 on postgres |
| 6f | The pause lasts 24 hours after the 20th | no | partly | P16: `wrong` at T+21.5h and T+24h−1ms, `new_password` at exactly T+24h on all 4; but P22: a try during the pause (`paused`) counts, so the pause runs to about T+44h |
| 6f-u | `resetPaused` edge cases | no | confirmed | P21: equal timestamps, exactly 24 h, 24 h + 1 ms, 45 rows, empty |
| 6g | A flow with no user isn't slowed or changed | no | confirmed | P20: no audit rows, 1–12 ms |
| 16 | The two files on every dialect | no | partly | sqlite 50+3 skipped, mysql 53, mariadb 53, postgres 52/53 (the burst test; "answers at the request's floor" failed once in the same run) |

**Overall:** not met on 6e-t (a flaky test) and 6f (tries during the pause made it longer than the spec says).

Fixes after the pass: `wrongCodeTimes` counts only `wrong` rows, so the pause lasts a day after the 20th as SPEC says (the duration test now checks it ends 24.5 hours after the 20th, a try during the pause included); the burst test asserts what holds in every order (at most 20 `wrong` rows; 19 when the right code won, 20 when not), 5/5 on postgres; the two floor tests allow 5 ms for timers firing early against `performance.now`. All four dialects: 53/53 on the servers, 59 passed and 3 skipped on SQLite.

### Re-check 2

Witnessed: 2026-11-23 19:46 EST, by a fresh agent (blind). Commit: 8b025db1 + working tree (20 modified, 3 untracked). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6f | The pause ends 24 hours after the 20th, even with tries during it | no | confirmed | `kysely-password-reset-repository.ts:134` keeps only `wrong`; probe `PROBE r2` (paused tries 1, 2, 3 h after the 20th, right code 24 h 1 min after) → `ok` on all 4 |
| 6f-t | Counting `paused` rows again fails a test | no | not met | that mutation leaves the steps file green: the duration test's only paused try came too late to extend the pause; the probe fails under it |
| 6e-t | The burst test holds in every order | no | confirmed | 6/6 on postgres |
| 6e-m | The burst test fails without the lock | no | confirmed | `lockAccount` commented out → 6/6 fail on postgres (19 vs 20, or 21–23 > 20) |
| 15-f | The 5 ms tolerance can't hide a missing floor | no | confirmed | both waits removed → the 3 floor tests fail on sqlite, postgres, mysql |
| 16 | Both files on every dialect | no | confirmed | sqlite 50 passed, 3 skipped; 53/53 on each server |

**Overall:** not met on 6f-t (a test gap).

Fix after the pass: the duration test makes a try an hour after the 20th (as the probe does), one at 21.5 hours, and the right code a day and a minute after the 20th → `ok`; with `paused` rows counted again it fails (SQLite run, file restored). The steps file passes on postgres, mysql and mariadb.

### Re-check 3

Witnessed: 2026-11-23 19:48 EST, by a fresh agent (blind). Commit: 8b025db1 + working tree. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6f-t | A test fails if `paused` tries are counted towards the pause | no | confirmed | mutation `reason === "wrong" \|\| reason === "paused"` (`kysely-password-reset-repository.ts:134`) → "keeps the pause a full day after the 20th wrong code, not after the first" fails (`:328`); restored byte for byte |
| 6f-t (restored) | The file passes on SQLite and PostgreSQL | no | confirmed | SQLite 27 passed, 2 skipped (server-only); postgres 29/29 |

**Overall:** met.

### Adversarial re-check 4

Witnessed: 2026-11-23 19:52 EST, by a fresh agent (adversarial). Commit: 8b025db1 + working tree (20 modified, 3 untracked). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6f | The pause ends exactly 24 hours after the 20th, tries during it included | no | confirmed | `kysely-password-reset-repository.ts:134` keeps only `wrong`; P16, P22, P23a, P23b on all 4 → 5/5 each: a paused try at T20+20h then the right code at T20+24h+1min → `ok`; `wrong` at T20+24h−1ms, `ok` at exactly T20+24h; 20 wrong over exactly 24 h paused to its edge, over 24 h + 1 ms not paused |
| 6e-t | The burst test passes in every order and fails without the lock | no | confirmed | `password-reset-steps.db.test.ts:333-356`; alone on postgres 6/6; `lockAccount` commented out → 4/4 fail; restored (`cmp` identical); the steps file 27+2 skipped on sqlite, 29/29 on postgres, mysql, mariadb |

**Overall:** met.

## Task 5 — The reset

Witnessed: 2026-11-23 20:00 EST, by a fresh agent (blind). Commit: 2579c9b5 + working tree (15 modified files, plus the untracked `services/password-reset-complete.db.test.ts`). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's db tests pass on all four databases | no | confirmed | 10 passed on each |
| 2 | The grant is refused after 10 minutes | no | confirmed | test; probe P2 (10 min − 1 ms → done); mutation M3 fails 1 test |
| 3 | The grant works once, a second use included | no | confirmed | test; P3 two submits at once → one `ok`, one audit, one notice on all 4. Test gap: M2 (`consumeGrant` always true) passes all 10 (`endFlowsOf` hides it one after another); under M2 P3 fails on pg |
| 4 | The password rules apply | no | confirmed | test |
| 5 | The same password is allowed | no | confirmed | test |
| 6 | The password is set | no | confirmed | test 1; M10 fails 2 |
| 7 | 128's hold is cleared | no | confirmed | test; M6 fails 1 |
| 8 | Every session ends, none is created | no | confirmed | test 1; P5; M1 fails 1 |
| 9 | Other reset flows and codes end; another account's untouched | no | confirmed | test; M5 fails 1; P7 |
| 10 | Approved device grants withdrawn, shown by a test | no | partly | behaviour holds; M7 (no `denyApprovedDeviceGrants`) passes all 10: the test ticks the box, and `revokeAccessTokens` also denies approved grants |
| 11 | Tokens revoked by default, kept only unticked | no | confirmed | tests; M4 fails 1 |
| 12 | `user.password_reset_by_email` records what Data lists | no | partly | `twoFactor` is a boolean; Data asks for the two-factor method |
| 13 | One transaction, the account read again inside it | no | confirmed | test gap: M11 (no re-check inside) passes all tests |
| 14 | The notice reaches the scheduler only after the commit, shown by a test | no | partly | behaviour holds (P9 with a throwing listener); M13 (`mailQueued` inside the transaction) passes all 10 |
| 15 | The notice says the reset was by email, in three languages | no | confirmed | new `password_reset_by_email` notice; en, fr, pt |
| 16 | Two-factor turned on mid-flow sends it back | no | confirmed | test; M12 fails 1 |
| 17 | An account changed mid-flow can't be reset | no | confirmed | test (disabled); P6 (made root) |
| 18 | An earlier step's cookie, or none, is refused | no | confirmed | test; P1 |
| 19 | The action wires the hasher and the client IP | no | confirmed | `actions/password-reset.ts` |

**Overall:** not met on rows 10, 12 and 14. Minor: an account changed between the two checks gets `spent`, not `cannot_continue`.

### Adversarial pass

Witnessed: 2026-11-23 20:00 EST, by a fresh agent (adversarial). Commit: 2579c9b5 + working tree. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass on all four dialects | no | confirmed | 10 passed on each |
| 2 | No cookie, a code-step cookie, a forged token or a flow with no user can't set a password | no | confirmed | P1, P2; own tests |
| 3 | With two-factor on, a flow that never passed it can't set the password | no | confirmed | P3 |
| 4 | The grant lasts 10 minutes | no | confirmed | own test; P6 |
| 5 | The grant works once, two submits at once included | no | partly | P4 → one `ok` on all 4; but ignoring `consumeGrant` leaves the own tests green (P4 then fails on pg) |
| 6 | One transaction: password, hold, sessions, other flows and codes | no | confirmed | own tests; mutations fail them |
| 7 | Approved `rmk login --web` grants denied, box ticked or not | no | partly | P5 (unticked) → denied; removing `denyApprovedDeviceGrants` leaves the own tests green |
| 8 | Tokens revoked by default, kept only unticked | no | confirmed | own tests |
| 9 | Nobody signed in, a racing sign-in leaves no session | no | confirmed | P10/P12 on SQLite, pg, mysql → 0 sessions |
| 10 | A root, disabled, erased or *Root only* account can't be reset | no | not met | in turn it holds (P7); raced, P9 on pg, mysql, mariadb: another transaction holds `UPDATE user SET role='root'` while the reset runs → `done`, password changed: the re-check reads before `setPassword` locks the row; removing the re-check leaves the own tests green |
| 11 | The notice only when the reset commits; a rollback leaves nothing | no | confirmed | P8 |
| 12 | The notice says the reset was by email | no | confirmed | new template; remark: no reset time in the body (the footer's "When:" line has it) |
| 13 | The audit row records sessions, tokens and the two-factor method | no | partly | `twoFactor` is a boolean |
| 14 | The same password allowed; password rules apply | no | confirmed | own test; P11 (non-ASCII, line break) |

**Overall:** not met: an account made root during a reset gets its password reset by email (row 10); the own tests miss `consumeGrant`, `denyApprovedDeviceGrants` and the in-transaction re-check (rows 5, 7, 10); the audit row keeps a yes/no, not the method (row 13).

Fixes after the two passes: in the reset's transaction the account's row is held (`lockAccount`) before it's read again, so a change being made at that moment is waited for and seen; an account changed between the two reads answers `cannot_continue`. SPEC Data: `user.password_reset_by_email` keeps whether the two-factor step was passed (the flow keeps when, not which method). The notice's footer has the "When: … UTC" line. New tests: approved rmk sign-ins withdrawn with the tokens kept; a throwing scheduler can't undo the reset (the notice is handed over after the commit); two submits at once reset once and an account made root while the reset runs isn't reset (servers). Mutations on postgres: no lock before the re-check fails the promotion test; `consumeGrant`'s result ignored fails the two-submits test. 14/14 on postgres, mysql, mariadb; 12 passed, 2 skipped on SQLite.

### Re-check 1

Witnessed: 2026-11-23 20:11 EST, by a fresh agent (blind). Commit: 2579c9b5 + working tree (17 modified files, plus the untracked `services/password-reset-complete.db.test.ts`). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests and probes pass on all four databases | no | confirmed | SQLite 21 passed, 2 skipped; pg, mysql, mariadb 23 each |
| 3 | The grant works once, two submits at once, shown by a test | no | confirmed | M2 → the two-submits test fails on pg |
| 10 | Approved grants withdrawn with the box unticked, shown by a test | no | confirmed | M7 fails it on SQLite and pg |
| 12 | The audit row records what Data lists | no | confirmed | Data reworded; test 1 `twoFactor: false`, P8 `true` |
| 13 | The account's row locked and read again in the transaction, shown by a test | no | confirmed | M11, M11b, M11c each fail the promotion test on pg |
| 14 | The notice reaches the scheduler only after the commit, shown by a test | no | confirmed | M13 fails it on SQLite and pg |
| 20 | An account changed between the reads gets `cannot_continue` | no | confirmed | the race test |

**Overall:** met.

### Adversarial re-check 1

Witnessed: 2026-11-23 20:19 EST, by a fresh agent (adversarial). Commit: 2579c9b5 + working tree. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass on all four | no | confirmed | SQLite 12+2 skipped; 14 each on the servers |
| 10 | Made root while the reset runs: not reset | no | confirmed | own test; P9; mutation without the lock fails on pg, mysql, mariadb |
| 10a | Disabled or erased while it runs (held uncommitted): not reset | no | confirmed | R1, R2 on pg, mysql, mariadb |
| 10b | The real admin disable and erase racing it | no | confirmed | R3: before the lock → `cannot_continue`; during → the admin waits, reset done, then disabled or erased; no deadlock |
| 10c | The re-read after the lock sees the commit on MySQL and MariaDB | no | confirmed | R1, R2; remark: REPEATABLE READ still passes (no plain read before the lock) |
| L1 | A second reset of the same account: one wins | no | confirmed | R4, 4 rounds, all 4 dialects |
| L2 | No deadlock with root's Reset password or Change password | no | confirmed | R5 both orders |
| L3 | No session survives a sign-in with the old password racing the reset | no | partly | R6 (reset paused after `lockAccount`, sign-in with the old password) → sessions=1 after on pg, mysql, mariadb: the insert waits on the row and lands after `deleteSessions` |
| L4 | No session survives the old session's Change password racing it | no | partly | R5 `change/after` → both ok, sessions=1, the password is the changer's |
| 5 | The grant works once, shown by a test | no | confirmed | mutation fails the two-submits test on pg, mysql |
| 7 | Approved grants withdrawn with tokens kept, shown by a test | no | confirmed | mutation fails it on sqlite, pg, mysql |
| 13 | The audit row as Data says | no | confirmed | SPEC diff "whether the account's two-factor step was passed"; `metadata.twoFactor: flow.twoFactorAt !== null` |
| 13a | The re-check inside the transaction, shown by a test | no | confirmed | mutation fails the promotion test on pg, mysql |
| 14 | The notice after the commit, shown by a test | no | confirmed | mutation fails it on sqlite, pg, mysql |

**Overall:** not met on L3 and L4: a sign-in, or the old session's password change, that checked the old password while the reset held the account keeps a session.

Fixes after the passes: after a reset commits, `completePasswordReset` waits `RESET_SETTLE_MS` (100 ms) and ends the account's sessions created up to the commit (`deleteSessionsUpTo`): a stale sign-in's session is stamped before the commit (Better Auth stamps `createdAt`, then inserts), one with the new password after. A test pauses the reset after taking the row, signs in with the old password meanwhile, and finds no session left (servers; without the cleanup it fails on pg and mysql). SPEC "What a reset does" says so, and states the limit left by Better Auth's one-step Change password (its password set after the reset, its session ended, both changes emailed).

### Adversarial re-check 2

Witnessed: 2026-11-23 20:45 EST, by a fresh agent (adversarial). Commit: 2579c9b5 + working tree. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| L3 | No session survives a sign-in with the old password racing the reset | no | not met | R8: a sign-in reads the old hash, its verify slowed (+300 ms), the reset starts 0–250 ms later → `sessions=1` with the new password set on all 4; natural timing: SQLite 1 in 3 at offset 0, pg 0 in 12. Better Auth stamps `createdAt` after the password check, so a check spanning the commit is stamped after it and the cleanup keeps it |
| L3a | The 100 ms wait is enough for a blocked insert | no | confirmed | R6 and the new test pass; R8 natural on pg 0 in 12 |
| L3b | Clock skew or MySQL precision | no | confirmed | both stamps from Node's clock; `datetime(3)` / `timestamptz` keep milliseconds; not tested: several instances with skewed clocks |
| L3c | The cleanup spares other accounts and a new-password sign-in in the window | no | confirmed | R10 on sqlite and pg |
| L4 | The stated Change-password limit | no | not met | R9 at offset 0 on all 4: both ok, `sessions=1`, the changer's password: Better Auth's `revokeOtherSessions: true` creates a new session after writing the password, so "its session ends" is wrong |
| L4a | Both changes are emailed | no | confirmed | read: `session.ts:251` and the reset's notice |

**Overall:** not met on L3 and L4. Remark: a sign-in whose session the cleanup deletes between Better Auth's insert and its lookup throws instead of refusing (SQLite, 2 in 12).

Two adversarial re-checks done: the owner decided (2026-11-23) to keep the reset as it is (the row lock and the late cleanup), state the remaining race accurately in SPEC "What a reset does" as a known limit shared with Change password and root's Reset password, and fix it for the whole app in a follow-up, feature 200 (planned in M32: a check when every session is created, against the moment the account's password last changed). SPEC's wrong Change-password sentence is replaced.

### Adversarial re-check 3

Witnessed: 2026-11-23 20:29 EST, by a fresh agent (adversarial). Commit: 2579c9b5 + working tree (21 changed or new files). Machine: macOS (Darwin 27.2.0), Node v24.0.0. Scoped to L3 and L4 as SPEC "What a reset does" now states them, and row 200.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The reset ends every session the account has when it runs | no | confirmed | the complete test on all 4; R6–R9 `sessions=0` whenever no check spanned the commit |
| 2 | (a) A sign-in whose session write waited on the row lock is ended by the cleanup | no | confirmed | `password-reset.ts:614-616`, `deleteSessionsUpTo` (`created_at <= upTo`, this user); R6 on pg, mysql → `sessions=0`; sqlite refused the sign-in, 0 |
| 3 | (b) A sign-in that checked the old password well before and wasn't blocked is ended | no | confirmed | R7 offsets 0–40 ms → signed in, session gone; R8 mysql offset 250 → 0 |
| 4 | (b) The open case is exactly a check spanning the commit (sign-in) | no | confirmed | R8 (verify slowed 300 ms) → `sessions=1`, the reset's password, only then |
| 5 | (b) The open case is exactly another session's Change password checking at the instant | no | confirmed | R9: offset 0 (and 20 on pg) → `sessions=1 pw=changer`, as SPEC says; later offsets → `sessions=0 pw=reset` |
| 6 | (b) The cleanup keeps another account's sessions and a new-password sign-in | no | confirmed | R10 on sqlite, pg, mysql |
| 7 | (b) The person is emailed of each change | no | confirmed | read: the reset's notice in its transaction; Change password's `password_changed` in its own |
| 8 | The complete test on all four dialects | no | confirmed | sqlite 12 passed, 3 skipped; 15/15 on pg, mysql, mariadb |
| 9 | Row 200 planned in the index and M32, saying what it closes | no | confirmed | README.md:329; M32:25; `check-docs-index.js` exit 0 |

**Overall:** met. Remark: on SQLite a sign-in racing the reset can throw "Better Auth signed in but its session can't be found" instead of refusing (no session left); for 200.

## Task 6 — The pages

Witnessed: 2026-11-23 20:48 EST, by a fresh agent (blind). Commit: dd1e3795 + working tree (tracked diff and untracked files). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The four pages exist and render in the auth shell | no | confirmed | `src/app/sign-in/forgot/**/page.tsx` render the shell over `AuthShell`; the e2e went through all four |
| 2 | The code page uses `CodeInput`, with *Send a new code* and *Use another address* | no | confirmed | `CodeForm.tsx:28`; both post `startAgainFromForm`; component test |
| 3 | The two-factor step uses the two-factor step's component | no | partly | its own `TwoFactorForm.tsx` of the same parts; `TwoFactorStep.tsx` is bound to sign-in's action |
| 4 | The pages work without JavaScript | no | partly | forms post server actions; the switch has an `href`; but the request page needs JavaScript while 190's challenge is on, the default |
| 5 | A signed-in person goes to Account › Change password | no | confirmed | `page-guard.ts:16` (read only; untested) |
| 6 | *Forgot?* opens the request page when it's on, else today's note | no | confirmed | `password-reset.ts:45` openness; mutation of the `resetByEmail` branch fails a test |
| 7 | The cookie: HttpOnly, SameSite=Strict, Path `/sign-in/forgot`, `__Secure-` and Secure under https | no | confirmed | probe with Next's ResponseCookies; `__Host-` needs `Path=/` (RFC 6265bis), as SPEC says; PLAN.md still said `__Host-` |
| 8 | The cookie is cleared when the flow ends | no | not met | under https: `clearToken` used `cookies().delete` with no `Secure`: browsers ignore that for a `__Secure-` cookie |
| 9 | Missing cookie: start again here | no | confirmed | read only; no test of the pages' own states |
| 10 | Email off mid-flow: a code already sent still works | no | confirmed | read only |
| 11 | Component tests cover each page's states | no | partly | the forms' states are covered; the pages' own (missing cookie, closed, signed in) aren't |
| 12 | Messages in all three languages | no | confirmed | 25 files, 505 tests (parity, placeholders, no English in pt and fr) |
| 13 | E2e: reset with the mailed code, then with two-factor, new password signs in, old session ended | no | confirmed | after `pnpm build`, `e2e/forgot-password.e2e.ts` → 2 passed |
| 14 | The setting's panel on the Authentication tab | no | partly | in PANELS with blockers and the disabled switch; nothing asserts its states |

**Overall:** not met: under https the cookie wasn't cleared, the request page needs JavaScript by default, the two-factor form is its own, and the pages' and the panel's states had no tests.

Fixes after the pass: `clearToken` sets the cookie empty and expired with the options it was set with (Secure under https); PLAN task 6 and SPEC "Bots" state the JavaScript exception (the request page while 190's challenge is on, as sign-up's form) and that the reset's two-factor form is its own, of `TwoFactorStep`'s parts (that component is bound to sign-in's action and words); PLAN's cookie line says `__Secure-` and why. New tests: `src/app/sign-in/forgot/pages.test.tsx` (signed in → Account on all four; the request page closed → sign-in; no cookie → start again; the code page's words and lifetime; a code already sent works with the reset off), `features/admin-settings/authentication/password-reset-form.test.tsx` (ready, blocked and disabled, on and closed, the order of blockers, no English in pt and fr), and `features/forgot-password/actions.test.ts` (the cookie set as SPEC says; cleared with `secure: true` and `maxAge: 0`, never `delete`; the token box posted). The pages now await the shell (`resetShell`) rather than nest an async component.

### Re-check 1

Witnessed: 2026-11-23 20:54 EST, by a fresh agent (blind). Commit: dd1e3795 + working tree (tracked diff and untracked files). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The four pages exist and render in the auth shell | no | confirmed | `await resetShell({...})`; `pages.test.tsx` renders all four |
| 3 | The two-factor step: `TwoFactorStep`'s parts in its own form (reworded PLAN) | no | confirmed | PLAN.md:58-60; `TwoFactorForm.tsx` uses `CodeInput`, a backup `TextField`, the switch link with a no-JS `href`; posts `resetTwoFactorFromForm` |
| 4 | Without JavaScript, except the request page while 190's challenge is on | no | confirmed | PLAN.md:60-61, SPEC.md:126-128; `<noscript>` only with the challenge; its test passes |
| 7 | The cookie as SPEC says | no | confirmed | `actions.test.ts` "set as SPEC says"; PLAN.md:63-64 says `__Secure-` and why |
| 8 | The cookie is cleared when the flow ends, under https too | no | confirmed | `clearToken` (`actions.ts:33-40`); probe `cookie-clear-probe.cjs` → `Max-Age=0; Secure; HttpOnly; SameSite=strict`; mutation back to `cookies().delete` fails the test; restored |
| 11 | Component tests cover each page's states | no | confirmed | `pages.test.tsx` 5 states; mutation `if (!hasFlow)` → `if (false)` fails one; restored |
| 13 | E2e: the mailed code, then two-factor, new password signs in, old session ended | no | confirmed | 2 passed (17.3s) on a build newer than the sources |
| 14 | The panel on the Authentication tab, with its states | no | confirmed | `password-reset-form.test.tsx` 5 tests; mutation `disabled={false}` fails one; restored |

**Overall:** met. Remark: SPEC.md:64 names `TwoFactorStep.tsx` for what the step accepts ("as at sign-in"), which holds.

## Task 7 — Data protection

Witnessed: 2026-11-23 21:05 EST, by a fresh agent (blind). Commit: ca55dce9 + working tree (7 modified files, 121 insertions, 3 deletions). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Retention deletes reset flows a day after `expires_at`, no sooner | no | confirmed | `retention-purge.ts:495`; the new test (DAY+1s deleted, DAY−1s kept, dry run 2); mutation (table out of the loop) fails it |
| 2 | Retention deletes reset codes a day after they expire | no | confirmed | `email_codes` already in the loop, `password_reset` rows included; the test checks none left |
| 3 | Erasure deletes the account's open flows | no | confirmed | `kysely-erase-repository.ts:139-154`; the erase test; erasure keeps the `user` row, so the explicit delete is needed |
| 4 | Erasure deletes the codes of the account's flows | no | partly | codes of current flows go (mutation without `...flows` fails the test); but a code whose flow already ended (`endFlow`, `consumeGrant` delete it) and one of a no-account flow typed with the address stay (probe `w194-t7-erase-leftovers.db.test.ts`) |
| 5 | Your data lists the account's reset flows, step and expiry only | no | confirmed | `kysely-user-data-repository.ts:106-113,156-159`; the test; mutation (no `user_id` filter) fails it. Remark: ended-but-unpurged flows are listed too, not only "open" |
| 6 | Your data never shows the code or the token | no | confirmed | no `email_codes` query; the hash is never selected |
| 7 | The three db tests pass on SQLite and the servers | no | confirmed | 60/60 on each |
| 8 | Done when: the three tests cover the new table | no | partly | each new test fails under its mutation; nothing covers the codes left in row 4 |

**Overall:** not met: erasure leaves the reset codes of ended flows and of no-account flows started with the address.

Fixes after the pass: `kyselyEraseRepository` takes `authSecret` (the erase action and the retention job pass `loadConfig().authSecret`) and `deleteSignUpData` also deletes every `password_reset` code with the address's HMAC; the erase test adds a reset code of Bob's address and of Cy's whose flows are gone (Bob's deleted, Cy's kept; removing the new delete fails it). SPEC Data says erasure takes every reset code sent to the address, and that Your data lists the reset flows still kept (open ones, and ended ones the purge hasn't reached). The three files: 60/60 on SQLite, postgres, mysql, mariadb.

### Re-check 1

Witnessed: 2026-11-23 21:10 EST, by a fresh agent (blind). Commit: ca55dce9 + working tree (11 modified files). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Erasure deletes the account's open flows | no | confirmed | `kysely-erase-repository.ts:144-151,167-170`; the erase test; 14/14 on SQLite and MariaDB |
| 4 | Erasure deletes the codes of the account's flows, and every reset code sent to its address | no | confirmed | `kysely-erase-repository.ts:157-166`; probe `w194-t7-r1-erase.db.test.ts` in `transaction()`: an ended flow's code and a no-account flow's code (from `" Bob@Example.COM "`) deleted; Cy's reset code and Bob's `sign_up` code kept; SQLite, pg, mysql. Another secret → all four kept |
| 5 | Your data lists the reset flows still kept, step and expiry only | no | confirmed | no expiry filter, as the reworded SPEC Data says. Remark: two comments still said "Open" |
| 7 | The three db tests pass on SQLite and the servers | no | confirmed | 60/60 SQLite; 62/62 pg and mysql with the probe; 14/14 erase on mariadb |
| 8 | The three tests cover the new table | no | confirmed | mutating the HMAC delete fails the erase test; restored |
| 9 | Every real erasure passes the secret | no | confirmed | callers `actions/erase-user.ts:12`, `jobs/retention-job.ts:61`, and the transaction rebuild (`...options`) |
| 10 | Another address's codes stay | no | confirmed | erase test; probe |

**Overall:** met. The two "Open" comments now say "still kept".

## Task 8 — Documentation

Witnessed: 2026-11-23 21:20 EST, by a fresh agent (blind). Commit: 3c00d86c + working tree (7 files changed, marketplace); ronne-web d5d66b5 (`docs/marketplace-194-forgot-password`, compared with origin/main). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | ronne-web has `account#forgot` in en, pt, fr, in `topics.ts`, labelled 0.8.0 | no | confirmed | `git diff origin/main...HEAD`; `docsUpcoming.sections.account.forgot = "0.8.0"` |
| 2 | The app's `topics.ts` has it too | no | confirmed | `topics.ts:165` |
| 3 | `authentication#overview`: the setting, its requirements, the contact, why root is left out, in three languages | no | confirmed | the `reset-by-email` subheading in `overview`, in `<Since version="0.8.0">`; names and requirements match `admin.json` |
| 4 | `privacy#retention`: flows and codes and how long, erasure and Your data, in three languages | no | confirmed | the RULES_0_8 row matches `retention-purge.ts:495`; erasure matches `kysely-erase-repository.ts:147-168`; Your data matches `kysely-user-data-repository.ts:107` |
| 5 | `account#forgot`'s facts match the code | no | confirmed | `models/password-reset.ts:29-32, 83-85`; `services/password-reset.ts:581-604`; `mail.json`; the UI labels in `auth.json` in three languages |
| 6 | The helper links to `account#forgot` when the feature is on | no | confirmed | `Help.tsx:226`; on the request page, which redirects to sign-in while closed |
| 7 | The setting has a helper | no | confirmed | `PasswordResetForm.tsx`; `Help.tsx:229`; `help.json` in three languages |
| 8 | The docs render tests pass | no | confirmed | ronne-web `pnpm test` 226 passed; marketplace help and page tests 28 passed |
| 9 | `pnpm docs:links` passes, and catches a missing section | no | confirmed | "Compared 41 topics"; mutation without `forgot` → refused |
| 10 | The ronne-web branch is named in the index's status | no | can't check here | set when the task is ticked: README.md:323 and M32:22 said `in progress` |

**Overall:** not met on row 10 alone (set at the tick). Remarks: the provider bullet didn't say *Root only* accounts get the providers email; the first paragraph didn't say the note shows when email stops working too.

Fixes after the pass: ronne-web 829bf89 adds both remarks to `account#forgot` in en, pt and fr (website lint and 226 tests pass); the index and M32 rows say `done (the Documentation in ronne-web docs/marketplace-194-forgot-password)`.

### Re-check 1

Witnessed: 2026-11-23 21:20 EST, by a fresh agent (blind). Commit: 3c00d86c + working tree (marketplace); ronne-web 829bf89 (`docs/marketplace-194-forgot-password`). Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | The index and M32 name the ronne-web branch, statuses agreeing | no | partly | both named it, but the rule (`features-index.js:42-45, 121`, `statusWithoutNote`) is the index says `done` and only the milestone carries the note, as M19's 130, 132, 141 do |
| 11 | `account#forgot` says *Root only* accounts get the providers email, in three languages | no | confirmed | `git show 829bf89`; the labels match `admin.json:1083`; matches `models/password-reset.ts:85`. Remark: with no provider name at all, nothing is sent |
| 12 | `account#forgot` says the note also shows when email stops working | no | confirmed | matches `actions/password-reset.ts:36-45` |
| 13 | `pnpm docs:check` passes | no | not met | exit 1: the index row carried the milestone's note |
| 14 | `docs:links` passes | no | confirmed | 41 topics compared |
| 15 | The website tests pass | no | confirmed | 226 passed |

**Overall:** not met on rows 10 and 13.

Fix after the pass: the index row says `done`; the M32 row keeps `done (the Documentation in ronne-web docs/marketplace-194-forgot-password)`. `pnpm docs:check` passes.

### Re-check 2

Witnessed: 2026-11-23 21:21 EST, by a fresh agent (blind). Commit: 3c00d86c + working tree (11 modified files). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | The index row says `done`, the M32 row names the ronne-web branch with `done` | no | confirmed | `README.md:323` → `done`; `M32-open-sign-up-and-email.md:22` → `done (the Documentation in ronne-web docs/marketplace-194-forgot-password)` |
| 13 | `pnpm docs:check` passes | no | confirmed | exit 0 |
| 16 | `pnpm witness:check` passes | no | not met | exit 1: two Task 8 "Witnessed:" lines put "marketplace" before the sha; and task 8 ticked before a met pass |

**Overall:** not met on row 16.

Fix after the pass: both lines start `Commit: 3c00d86c`.

### Re-check 3

Witnessed: 2026-11-23 21:22 EST, by a fresh agent (blind). Commit: 3c00d86c + working tree (11 modified files). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both Task 8 "Witnessed:" lines start `Commit: 3c00d86c`, sha first | no | confirmed | `grep -n "Witnessed:" WITNESS.md` → lines 638 and 659, as lines 485–622 |
| 2 | `docs/features/README.md` row 194 says `done` | no | confirmed | `README.md:323` |
| 3 | The M32 row names `docs/marketplace-194-forgot-password` | no | confirmed | `M32-open-sign-up-and-email.md:22` |
| 4 | `pnpm docs:check` passes | no | confirmed | exit 0 |
| 5 | `pnpm witness:check`'s only error is task 8's tick before a met pass, gone once one is added | no | confirmed | one error only; probe `rc3` with this pass added → `check-witness.js` exits 0 |

**Overall:** met.
