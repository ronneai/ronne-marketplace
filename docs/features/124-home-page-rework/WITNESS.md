# 124 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — The notice's model and settings

Witnessed: 2026-10-21 10:15 local, by a fresh agent (blind). Commit: f53da9c3 plus uncommitted changes (`notice-policy.ts` and its test, the settings service, action, errors and database test, `audit-event.ts`, `admin-audit/summary.ts`). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `notice-policy.ts` holds message, link (label and address), tone, shown and revision | no | confirmed | `notice-policy.ts`: the `Notice` type, the two tones, the hidden default at revision 0. |
| 2 | The message is plain text up to 500 characters, counted in characters, with no line breaks | no | partly | Control characters and 501 characters are refused; 500 emoji pass. U+2028 and U+2029 passed, because the check used `\p{Cc}` only. `<b>` is stored as typed (the screen must output text). |
| 3 | The label is up to 60 characters; a link needs both parts | no | confirmed | Unit tests: 60 passes, 61 is `too_long`; a label alone and an address alone give `link_incomplete`. |
| 4 | Only `https://` or a single-`/` address; `javascript:` and `data:` refused | no | confirmed | Probe and unit tests refuse `HTTPS://`, `//host`, `/\host`, tabs, NBSP, spaces and `javascript:`. Not holes: `https://user:pw@host`, a bidi override in an address and `/..//x` were accepted. |
| 5 | Tone is information or warning only | no | confirmed | `danger` and `undefined` refused, unit and database tests. |
| 6 | An empty message can be saved hidden, never shown | no | confirmed | Unit and database tests. |
| 7 | The revision rises on message, link or tone, not on shown | no | confirmed | Database test: 1 after the first save, hide and show keep 1, three content changes end at 4. |
| 8 | Stored in `instance_settings`; `setNotice` and `notice` exist; hiding keeps the text; an unchanged save does nothing | no | confirmed | Database tests; a hand-edited value reads as hidden. |
| 9 | Audited as `settings.notice` with the old and new tone and shown, not the text | no | confirmed | The audit metadata is exactly `{from, to, revision}`; `JSON.stringify` of the events lacks the typed text. |
| 10 | Only root saves; a refusal changes nothing | no | confirmed | `ForbiddenError` for a user and for nobody; revision 0 and no audit event after refusals. |
| 11 | Last save wins | no | partly | One transaction reads and writes; no test saves twice at once. |
| 12 | Unit and database tests and typecheck pass | no | confirmed | 67 tests passed (settings and admin-audit); database project 20 passed; typecheck clean. |
| 13 | The same on PostgreSQL, MySQL and MariaDB | no | can't check here | The servers were not started. |

**Overall:** not met (rows 2 and 11 partly, row 13 unchecked). Fixed: the message and label also refuse U+2028, U+2029 and the bidi overrides (emoji joiners stay allowed); addresses also refuse invisible format characters and a name or password in an `https://` address. HTML in the message stays as typed on purpose, a test pins it, and task 3 must render text only. Last save wins rests on the one transaction; the SQLite test database has one connection, so there is no concurrency test.

### Re-check (rows 2, 4, 11)

Witnessed: 2026-10-21 10:17 local, by a fresh agent (blind re-check). Commit: f53da9c3 plus uncommitted changes. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | No line breaks, bidi overrides or line separators in the message and label | no | confirmed | The probe refused U+2028, U+2029, U+202E and U+2066 in the message and U+202E in the label; a ZWJ family emoji and 500 emoji passed; the HTML test passes. |
| 4 | Only `https://` or a single-`/` address | no | confirmed | Refused: `https://user:pw@a.com`, `https://user@a.com`, `https://:pw@a.com`, a bidi override or U+200B in an address. Allowed: `https://a.com/ok`, `/ok`. |
| 11 | Last save wins | no | confirmed | `setNotice` reads and writes inside one `repo.transaction`; holds on the code, with no concurrency test. |

**Overall:** met for these rows.

### Re-check (row 13)

Witnessed: 2026-10-21 10:18 local, by a fresh agent (blind re-check). Commit: f53da9c3 plus uncommitted changes. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | The settings database tests also pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:postgres`, `:mysql` and `:mariadb` with `-- src/server/domains/settings` → 1 file, 20 tests passed on each. |

**Overall:** met. Every claim of task 1 is confirmed.
