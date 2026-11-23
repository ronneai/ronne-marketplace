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
