# 104 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The export service

Witnessed: 2026-10-19 18:55 EDT, by a fresh agent (blind). Commit: fbd21b2a plus the uncommitted diff (10 files). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every spec'd section and field exists (version, exportedAt, instance, account, sessions, accessTokens, deviceGrants, workspaces, accessRequests, scopes, items, submissions, comments, auditEvents) | no | confirmed | `models/user-data.ts` types, `user-data-export.ts`, the repository; test 1 checks each section against seeded rows; extra `workspace` fields on items, submissions and comments |
| 2 | Every list is ordered oldest first | no | confirmed | Every repository query has `orderBy` on the date plus an id tie-break; the test checked only 3 of the lists (the rest by reading the SQL) |
| 3 | The row limit cuts a list, keeps the oldest and `truncated` names it; a long comment is cut with an ellipsis | no | partly | Test 7 with `maxRows: 3` checks accessTokens and comments; mutation removing `truncated.push` fails it; no test cut `items` or `auditEvents` |
| 4 | Other people's emails in audit metadata become `[other]`, the person's own stays | no | confirmed | `scrubOtherEmails` applied in the service; test 2 checks root's file has no ana@ or bob@ address and Ana's keeps hers; mutation removing the scrub fails it |
| 5 | `user.data_exported` records actor, target and `{by, rows}` counts, never content | no | confirmed | `recordAudit` in the service; tests 1 and 3 check actor, target, `by`, `rows` and that comment text is absent |
| 6 | One download per account per 10 minutes, counted in the database, root's counted for the person, with the seconds left | no | confirmed | `exportedSince` queries `audit_log`; test 5 checks 599 s, 540 s for root, success at +10 min, another account's own limit; mutation removing the check fails tests 5 and 6 |
| 7 | Two concurrent exports let one through | no | confirmed | Test 6 passes on SQLite, PostgreSQL, MySQL, MariaDB; mutation removing the `forUpdate` lock fails it on PostgreSQL |
| 8 | The output holds no hash, secret, backup code or provider token | no | confirmed | The repository selects none of `token_hash`, `two_factor.*`, provider tokens, `device_code_hash`, `secret_enc`, session `token`; test 1 searches the JSON for 8 or more seeded values; mutation adding `token_hash` fails it |
| 9 | Only the person or root can export; a moderator, stranger, nobody are refused; unknown id not found; erased refused with nothing recorded | no | confirmed | `user-data-export.ts:52-70`; tests 3, 4, 9 (real `eraseUser`) |
| 10 | A deleted identity provider shows as `(deleted provider)` | no | confirmed | Test 8 and `DELETED_PROVIDER` in the repository |
| 11 | The db test passes on SQLite and the three servers | no | confirmed | SQLite 12 passed with the model test; `node scripts/test-db.mjs` postgres, mysql, mariadb → 9 passed each |

**Overall:** not met: everything holds except claim 3, which is partly covered (no test cuts items or audit events).

### Re-check 1 (blind: claim 3, and what the diff touches)

Witnessed: 2026-10-19 19:20 EDT, by a fresh agent (blind). Commit: fbd21b2a plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Lists are cut oldest first, `truncated` names them, items are cut by versions and empty items dropped, audit events cut | no | confirmed | New test cuts items and audit events under `maxRows: 1`; mutations dropping `slice(0, room)` and `truncated.push` of items fail it; the empty-item guard was not caught by any test (a test was added after) |
| 2 | Lists are ordered oldest first | no | confirmed | The order check now covers 7 lists; the SQL is unchanged |
| 4 | Other people's emails become `[other]` in values and keys, own kept | no | partly | Probe: `see /bob@example.com` and `x/bob@example.com` came out unchanged because a slash before the at sign exempted the run |
| 6 | Limit of one per 10 minutes, seconds capped at 600 | no | confirmed | `Math.min` in the service; limit test passes on all dialects |
| 9 | A disabled person's own request is refused | no | confirmed | The self branch with `disabledAt` throws ForbiddenError |
| 5 | Target-only events have a null `ipAddress`, no secrets | no | confirmed | Repository maps `ipAddress` to null unless the person acted; suite incl. the secret search green |

**Overall:** not met: claim 4 is partly met, an address after a slash was not replaced.

### Re-check 2 (blind: claim 4 and the empty-items gap)

Witnessed: 2026-10-19 19:35 EDT, by a fresh agent (blind). Commit: fbd21b2a plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Other people's emails become `[other]` in values and keys, own kept, an item reference `@scope/name@x.y.z` kept, an address after a slash replaced | no | confirmed | Probe: `see /bob@example.com` → `see [other]`, `x/bob@example.com` → `[other]`, `@team/x@1.0.0` and `-rc.1` kept, own address kept in any case, key scrubbed; `@a/b@evil.example.com` is not treated as a version |
| 3b | Empty items are dropped when items are cut, and a test catches it | no | confirmed | Mutation making the items push unconditional fails the new test (1 failed, 9 passed); restored and compared with `cmp` |

**Overall:** met: claim 4 and the empty-items gap are confirmed; nothing is left open.

Witnessed: 2026-10-19 18:55 EDT, by a fresh agent (adversarial). Commit: fbd21b2a plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No secret or credential reaches the JSON | no | confirmed | Probe P1 seeded 18 needles (TOTP secret, backup codes, provider tokens, device hash, client secret, session token, password hash, token hash); none is in the JSON; account and session keys are only the allowed fields |
| 2 | Other people's emails and data don't survive in the person's file | no | partly | Probe P2: scrubbed nested values, arrays, uppercase, unicode, mailto, plus tags; leaked an email used as a key, `bob@localhost` (left on purpose) and the other actor's IP on target-only events |
| 3 | Authorization: who can export whom | no | confirmed | Probe P5: demoted root, disabled root, no user and a user asking for root's file give ForbiddenError; erased gives UserErasedError and records nothing; a stale disabled self was exported (fixed after) |
| 4 | Limit of one per 10 minutes, counted in the database | no | confirmed | Probe P6 on four databases: 1 ms before the edge refused, exactly at the edge allowed; P7: 8 concurrent calls give exactly 1 success; mutation removing `forUpdate` fails the own test 3 of 3 on PostgreSQL and MySQL |
| 5 | Row and comment limits, `truncated`, valid JSON, items cut | no | partly | P8: 10001 sessions give 10000 kept oldest first; P4: comment cut by code point; but P3 with `maxRows=1` gave 2 versions in `items` (never sliced) |
| 6 | Every list oldest first, ties deterministic | no | confirmed | The repository orders by date then id; P8's 10000 sessions are ascending |
| 7 | Same behaviour on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | P1 to P8 give identical output on the four; booleans, dates and JSON metadata round-trip |

**Overall:** not met: items can exceed the row limit by one, and the file carries some third-party data in audit events.

### Re-check 1 (adversarial: rows 2, 3, 4, 5 and the diff)

Witnessed: 2026-10-19 19:10 EDT, by a fresh agent (adversarial). Commit: fbd21b2a plus the working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | Other people's emails and data don't survive in the person's file | no | partly | Keys and the other actor's IP are fixed; new leak: `https://x.test/u?to=zed@example.com` and `team/zed@example.com` unchanged because of the slash exemption |
| 5 | Row and comment limits, `truncated`, valid JSON, items cut | no | confirmed | P3 with `maxRows=1` gives 1 version and one item on four databases |
| 3 | Authorization | no | confirmed | A disabled person with a stale actor object now gives ForbiddenError |
| 4 | 10-minute limit | no | confirmed | Edge cases on four databases; clock back one hour gives 600 seconds |

**Overall:** not met: row 2 is partly met, the slash exemption leaves addresses in URLs and paths.

### Re-check 2 (adversarial: row 2)

Witnessed: 2026-10-19 19:20 EDT, by a fresh agent (adversarial). Commit: fbd21b2a plus the working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | Other people's emails and data don't survive in the person's file | no | partly | 19 forms and P2 on SQLite and PostgreSQL pass; one false skip: `@x/bob@1.2.3-foo.example.com` kept because the prerelease tail allowed a hostname; percent-encoded and fullwidth at-sign forms accepted as exotic |

**Overall:** not met: one contrived false skip in the item-version rule. The owner chose one more scoped re-check after the fix.

### Re-check 3 (adversarial: row 2)

Witnessed: 2026-10-19 19:30 EDT, by a fresh agent (adversarial). Commit: fbd21b2a plus the working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | Other people's emails and data don't survive in the person's file | no | confirmed | 32 forms: `@x/bob@1.2.3-foo.example.com`, `-a.co`, `-a.123.com`, `+build.com` all give `@[other]`; real references `@x/y@1.0.0-rc.1`, `-beta.2`, `-rc-1`, `+b2` kept; forms still kept end in a numeric label or contain a plus and can't be domains; P2 8 of 8 on SQLite and MySQL |

**Overall:** met: no still-leaking form and no real item reference wrongly scrubbed; rows 3 to 5 were confirmed in re-check 1 and nothing touched them since.
