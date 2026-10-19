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

## Task 2 — The routes and the pages

Witnessed: 2026-10-19 19:35 EDT, by a fresh agent (blind). Commit: 926afa04 plus the uncommitted diff (task 2). Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | GET /account/data sends the file as an attachment named ronne-data-<id>-<UTC date>.json, JSON utf-8, no-store | no | confirmed | `user-data-api.db.test.ts` 8 of 8; mutations dropping `cache-control` and changing to `inline` fail it |
| 2 | Own-data refusals are tested: no session goes to sign-in, any Authorization header gives 401, a two-factor hold gives 403 and records nothing | no | confirmed | Mutating the authorization check and the hold check each fail one test; the hold test also checks the next try succeeds |
| 3 | 429 carries the time left in Retry-After and details.retryAfter | no | confirmed | Removing the `retry-after` header fails the 429 test (590 to 600 seconds); e2e gets 429 with a positive Retry-After |
| 4 | GET /admin/users/[id]/data is root only: a moderator, a user for someone else, an unknown id and an erased account get 404 and record nothing; root's download of a disabled account works and counts for the person | no | confirmed | Removing ForbiddenError or UserErasedError from the 404 mapping fails the matching tests; zero `user.data_exported` rows after refusals |
| 5 | The Account section has the your-data helper, a plain Download my data link and the last download's date | no | confirmed | `YourDataSection.tsx` plain anchor; `account-security.test.tsx` asserts heading, href, no date before a first download and the dateTime after |
| 6 | Admin Users row action Download their data has the download-user-data helper, is greyed erased for an erased account, absent on your own row; 103's dialog links the download before the email field | no | confirmed | `UserRowActions.tsx`, `DownloadDataDialog.tsx`, `EraseUserDialog.tsx`; `download-data.test.tsx` covers each incl. the order |
| 7 | Both helpers exist and link to privacy#your-data; the topic is registered | no | confirmed | `Help.tsx` both entries use `docsHref(privacy, your-data)`; `topics.ts` has the section (ronne-web not checked, task 3) |
| 8 | An e2e test downloads the file as a user and as root, parses it, and finds the seeded item and comment | no | partly | Both e2e tests read and passing in the implementer's log, not re-run (Playwright can't build in a copy); the log predated a later edit |
| 9 | The phone sweep passes | no | partly | `e2e-sweep.log` 19 passed incl. `/account/password`; not re-run, log predated a later edit |

**Overall:** not met: rows 8 and 9 rest on logs that predate the last edit; every route and component claim holds (7 of 8 mutations caught). Test gaps found: nosniff, a held root on the admin route.

### Re-check 1 (blind: rows 8, 9, the test gaps and the diff)

Witnessed: 2026-10-19 19:50 EDT, by a fresh agent (blind). Commit: 926afa04 plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | An e2e test downloads the file as a user and as root, parses it, and finds the seeded item and comment | no | confirmed | `e2e-final.log` (after a rebuild, after the last source edit): your-data and user-admin pass, root's download parsed with item and comment, repeat gives 429 |
| 9 | The phone sweep passes | no | confirmed | `e2e-final.log`: phone, phone-webkit and tablet sweeps pass, 18 in all; `pages.ts:137` lists `/account/password` |
| 10 | nosniff is tested | no | confirmed | Renaming the header in a scratch copy fails the attachment test |
| 11 | Any method but GET answers 405 and a cross-site Sec-Fetch-Site gets 403 | no | confirmed | Mutating the method check or the cross-site value fails the new test that loops HEAD, POST, PUT and checks nothing is audited |
| 12 | A two-factor-held root is refused on the admin route | no | confirmed | `user-data-api.db.test.ts` held-root test asserts 403 and zero events |
| 13 | The telemetry segment data is pinned | no | confirmed | Removing it from `sanitize.ts` fails `route-segments.test.ts` |
| 14 | The file name uses the account's id and /admin/users/me/data is an ordinary id | no | confirmed | `dataFileName(data.account.id, …)`; target is `string or null`; the new test gets 404 for `me` |

**Overall:** met: rows 8 and 9 confirmed from the post-edit run, the test gaps covered by tests that fail under mutation, the 405 and cross-site refusals too.

Witnessed: 2026-10-19 19:25 EDT, by a fresh agent (adversarial). Commit: 926afa04 plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A bearer token gets no file, with or without a cookie | no | confirmed | 401 on any authorization header before the session is read; mutating it fails 1 of 8 tests |
| 2 | No session, an expired session, or a disabled account's live session gets no file | no | confirmed | Probe on four databases: 303 to sign-in for each |
| 3 | A person held on the two-factor step is refused with the real twoFactorHold | no | confirmed | Policy everyone: a plain user and root got 403 on both routes; reviewers: the plain user got 200, root 403; all four databases |
| 4 | A moderator or user can't fetch another's file and 404, 403 and 429 don't reveal which accounts exist | no | confirmed | Non-root callers get 404 for any id before any lock or write; 429 needs a real earlier export |
| 5 | Odd ids: no injection, no crash | no | confirmed | Spaces, `../`, NUL, a 100000-character id, emoji, CRLF all gave 404 on four databases; the file name is stripped to a safe set |
| 6 | Headers on the file response | no | confirmed | content-type, attachment name, no-store, nosniff; the 303, 401, 403, 404 and 429 carry no-store; no CORS; 429 has Retry-After |
| 7 | Two downloads at once: only one gets through | no | confirmed | Six parallel requests gave 200 and five 429 on all four databases |
| 8 | HEAD, prefetch and cross-site GET can't burn the ten-minute window | no | not met | Next maps HEAD to the GET handler: a HEAD with the cookie recorded an export and the next GET was 429; a cross-site top-level GET did the same since the cookie is Lax |
| 9 | Proxy, logging and telemetry for these paths | no | confirmed | proxy matcher covers both paths; apiRoute logs the pattern not the id; the data segment is listed |
| 10 | The UI: links work without JavaScript, the erased row is greyed, the erase dialog links the download | no | partly | Plain anchors by reading; e2e from the log; a refusal on a plain link shows raw JSON |

**Overall:** not met: a HEAD request, or a cross-site top-level GET, records an export and burns the person's window. Also found: `/admin/users/me/data` downloaded the caller's own file, the route tests depended on the clone's configuration, the file name used the URL's id.

### Re-check 1 (adversarial: row 8, the findings and the diff)

Witnessed: 2026-10-19 19:40 EDT, by a fresh agent (adversarial). Commit: 926afa04 plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | HEAD, prefetch and cross-site GET can't burn the ten-minute window | no | confirmed | HEAD then GET gave 405 and 200 on four databases; POST, PUT, DELETE, PATCH, OPTIONS 405 with Allow; cross-site gave 403 with zero rows, also with Mode navigate or no-cors and Dest document or image; same-site, same-origin, none and absent allowed; residual: same-site pages and browsers without Fetch Metadata are not covered |
| F2 | /admin/users/me/data no longer downloads your own file | no | confirmed | Root asking for id me gets 404 on four databases |
| F3 | The route db tests don't depend on the clone's configuration | no | confirmed | They pass `hold`; 8 files, 79 tests pass |
| F5 | The file name uses the account's real id | no | confirmed | Built from `data.account.id`; a lowercase id gives 404, so there is no file to misname |
| 10 | The UI and the e2e tests | no | confirmed | `e2e-final.log` 18 passed (your-data, user-admin, mobile sweep, composer); the earlier composer failure is gone (it passed alone before) |

**Overall:** met: HEAD, other methods and cross-site navigations no longer export; the same-site and no-Fetch-Metadata residual is accepted.
