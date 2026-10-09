# 094 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Migration and services

Witnessed: 2026-10-09 14:52 EDT, by a fresh agent (blind). Commit: bfe0eb9 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration 0021 creates `workspace_access_requests` with the listed columns; its keys cascade from workspaces and users, `decided_by` sets null; it can run twice | no | confirmed | `pnpm test:db:{postgres,mysql,mariadb} -- src/server/domains/workspaces src/server/db/migrations` → 17 files, 120 passed on each; `0021_*.db.test.ts` checks 3 keys, cascade, 500 characters in any script, running again |
| 2 | One open request per user and workspace, checked in the service under a lock | no | partly | Probe: 5 identical `requestAccess` at once ×3 → 1 open row on all four. No db test covers it: removing `lockUsers` at `access-requests.ts:103` leaves the 19 tests green on postgres |
| 3 | `requestAccess` returns `sent`, trims the message, answers `already_requested` and `already_member`; audits `workspace.access_requested` on the requester | no | confirmed | Tests "asks once…" (exact metadata `{workspace,email}`) and "asks nothing of members and root"; 4 DBs |
| 4 | An unknown name and a private name answer the same (`sent`); only the private one is stored | no | confirmed | Test "answers a private name and an unknown one alike" → `sent` ×3, 1 row; 4 DBs |
| 5 | Message and reason at most 500 characters, not bytes | no | confirmed | `textFrom` uses `[...text].length`; 501 × `x` refused, 500 × `日` accepted, 501-character reason refused |
| 6 | `cancelAccessRequest` cancels only your own open request, once, audited | no | confirmed | Test "cancels only your own…": NotFound ×2, Answered, 1 event; no session → Forbidden (probe P10) |
| 7 | Approving adds as `user`; only root and admins pick `moderator`; `admin` refused; audits `access_approved` and `member_added` | no | confirmed | Three approve tests; check at `access-requests.ts:233`; 4 DBs |
| 8 | Declining stores the reason, the requester sees it, audited | no | confirmed | Test "declines with a reason…": `ownRequests` → `reason: "Ask Ana first."`, 1 `access_declined` |
| 9 | Only root and the workspace's moderators and admins answer | no | confirmed | Test: moderator elsewhere, member, requester → Forbidden, `pendingRequests` too; probes: no session → Forbidden (P10), demoted moderator → Forbidden (P9); 4 DBs |
| 10 | Two answers at once: the first wins, the second gets "Already answered" | no | confirmed | Test passes on 4 DBs; removing the status check at `:212` fails it (sqlite), removing the locks at `:205-206` fails it (pg, mysql); approve vs direct add and approve vs cancel probes → one winner |
| 11 | At most 10 open per user; the limit can't tell names apart | no | confirmed | Test "refuses the 11th"; probe: 14 asks at once → 10 open on 4 DBs. Remark: the count is checked after the name lookup (`:105` before `:109`), not before as the spec says |
| 12 | A declined request can be sent again 7 days after the decline | no | confirmed | Test "waits 7 days…"; boundary probe (mysql): −1 minute TooSoon, +1 minute `sent`. Remark: the test would pass with any wait from 1 to 8 days |
| 13 | Disabling a user cancels their open requests; `user.disabled` has `requestsCancelled` | no | confirmed | Test "cancels a disabled user's open requests" → both cancelled, `{requestsCancelled: 2}` |
| 14 | Adding directly approves the open request, by whoever added, `direct: true` | no | confirmed | Test covers `addMembers` and `setUserWorkspaces` (`members.ts:268,399`) |
| 15 | Someone removed later can ask again at once | no | partly | Approve → remove → ask works (test). Decline → direct add → remove → ask → `AccessRequestTooSoonError` on all four (probe P2) |
| 16 | Deleting the workspace removes its requests; making it private keeps them | no | confirmed | Test "keeps requests when the workspace turns private, and removes them with it"; 4 DBs |
| 17 | The message and the reason never reach the audit log | no | confirmed | Probe P4: `SECRETMESSAGE`, `SECRETREASON` absent from `listAuditEvents` (4 DBs). The decline test doesn't check it |
| 18 | The four audit actions are registered and summarised; `access_requests.answer` for moderator and admin | no | confirmed | `vitest run summary.test.ts permissions.test.ts services` → 17 passed |
| 19 | The db tests run on the four databases | no | confirmed | 13 files / 112 tests on each of sqlite, postgres, mysql, mariadb; typecheck clean; biome no errors |

**Overall:** not met: no db test covers two asks to one workspace at once (row 2), and a declined user who was added and then removed waits 7 days (row 15).

### Adversarial pass

Witnessed: 2026-10-09 14:56 EDT, by a fresh agent (adversarial). Commit: bfe0eb9 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration 0021: planned columns, keys, two indexes, runs again, four databases | no | confirmed | `access-requests`, `0021`, `0019` db tests → 32/32 on each of the four; `0021_workspace_access_requests.ts:22-70` |
| 2 | Each of request, cancel, approve, decline has db tests passing on four databases | no | confirmed | `access-requests.db.test.ts` "asking", "cancelling", "answering" → passed on all four |
| 3 | At most one open request per user and workspace, even with concurrent asks | no | confirmed | Probe: 6 concurrent asks ×5 → 1 `sent`, 5 `already_requested`, 1 open on all four; with `forUpdate` stubbed on PG → 2 open |
| 4 | The db tests cover the race | no | partly | The answering race is covered (fails with `forUpdate` stubbed). Concurrent asks and the limit race have no test: with the stub, the other 18 tests pass |
| 5 | Two answers at once: first wins; no deadlock with approve, cancel, decline and `addMembers` at once | no | confirmed | Probe P3, 4 rounds per DB → one outcome, consistent membership, others Answered or `already_member`; no deadlock |
| 6 | At most 10 open per user, also concurrently | no | confirmed | Test on 4 DBs; probe P2: 14 concurrent → 10 open, 4 TooMany (stubbed: 14) |
| 7 | The limit is checked before the name is looked up, so it doesn't tell names apart | no | not met | Probe P6: unknown names add no row and private ones do, so with 9 open, asking `secret` then a public one → TooMany, while `nowhere` then the public one → `sent`; `access-requests.ts:99-105` |
| 8 | An unknown and a private name answer the same; a private name isn't confirmed to a non-member | no | partly | First ask matches. Asking again: `secret` → `already_requested`, `nowhere` → `sent`; `ownRequests` returns `secret`'s visibility and description (`access-requests.ts:336-349`) |
| 9 | 7 days after a decline, not before; other workspaces not held up | no | confirmed | Test passes on 4 DBs; `access-requests.ts:107-110` |
| 10 | Someone removed later can ask again at once | no | partly | Probe P7: decline → direct add → remove → ask → `AccessRequestTooSoonError` |
| 11 | Members and root are told they're in; nothing recorded | no | confirmed | Test "asks nothing of members and root"; `rows()` → `[]` |
| 12 | Message and reason: optional, trimmed, ≤500 characters, stored the same on every database | no | partly | 501 refused, 500 × `日`/`😀` round-trip on all four; a U+0000 is stored on SQLite and MySQL but PG throws a raw `invalid byte sequence for encoding "UTF8": 0x00` |
| 13 | Only root and the workspace's moderators and admins answer | no | confirmed | Test plus probe P5 → Forbidden for the requester who moderates beta, a `global` moderator, no session; request stays open |
| 14 | A moderator demoted after the session was read is refused | no | confirmed | Probe P4: stale actor → approve and decline Forbidden; `access-requests.ts:175-182` |
| 15 | Approving adds as `user`; only root and admins pick `moderator`; `admin` refused | no | confirmed | Approve tests pass on 4 DBs |
| 16 | Audit: four events on the requester, naming the workspace, no message or reason | no | confirmed | P8 metadata on all four = `{"workspace":"acme","email":"u@example.com"}` only |
| 17 | Adding directly approves the open request, `direct: true` | no | confirmed | Test on 4 DBs; `members.ts:139-156` |
| 18 | Disabling cancels open requests; `requestsCancelled` | no | confirmed | Test on 4 DBs; `user-admin.ts:197-208`; identity and members db tests 38/38 on PG, MySQL, MariaDB |
| 19 | Deleting removes requests; private keeps them | no | confirmed | Test on 4 DBs |
| 20 | Only the requester cancels, only an open request | no | confirmed | Test "cancels only your own open request, once" |
| 21 | Permission, audit catalogue and summaries updated | no | confirmed | `summary.test.ts permissions.test.ts workspaces.test.ts` → 17 passed; typecheck clean |

**Overall:** not met: the open-request count and asking twice tell a private name from an unknown one (7, 8), `ownRequests` shows a private workspace to a non-member (8), a decline outlives a later membership (10), a NUL byte breaks only PostgreSQL (12), and no test covers concurrent asks (4). Also noted: `decideAccessRequest`'s result is ignored by its callers.

### Re-check — rows 2 and 15

Witnessed: 2026-10-09 15:04 EDT, by a fresh agent (blind). Commit: bfe0eb9 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | One open request per user and workspace, under a lock, and a db test covers concurrent asks | no | confirmed | Test "keeps one open request when the same user asks several times at once" (5 at once, 3 rounds) passes on all four; with `lockUsers` removed at `access-requests.ts:99` in a scratch copy it fails on postgres and mysql (1 failed, 23 passed) |
| 2b | The limit holds under concurrent asks, and a db test covers it | no | confirmed | Test "holds the limit when 14 requests are sent at once" passes on all four; with the lock removed it fails 3/3 on postgres (`expected [] to have a length of 4`), still passes on mariadb, so only PostgreSQL catches it |
| 15 | Someone removed later can ask again at once, even after a decline | no | confirmed | `access-requests.ts:115-118` skips the wait when `membershipChangedSince` (`kysely-access-requests.ts:114-130`, the `member_added`/`member_removed` audit rows for that name) finds a change; test "doesn't make someone added and removed since a decline wait" passes on all four; forcing the check to false fails it (sqlite) |
| 16 | Nothing else broke | no | confirmed | `vitest run --project db src/server/domains/workspaces src/server/db/migrations src/server/domains/identity` → 27 files, 206 passed on sqlite, postgres, mysql and mariadb; unit tests 17 passed; typecheck clean; biome: 3 warnings in untouched files |

**Overall:** met: concurrent asks are covered by a db test that fails without the lock, and someone added or removed after a decline asks again at once, on all four databases. Remarks: the "since" check reads the audit log by workspace name (audit rows aren't pruned and workspaces aren't renamed today), with a strict `>` on `created_at`.

### Re-check — adversarial, rows 4, 7, 8, 10 and 12

Witnessed: 2026-10-09 15:11 EDT, by a fresh agent (adversarial). Commit: bfe0eb9 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | The db tests cover the race: concurrent asks and the limit under concurrency, besides two answers at once | no | confirmed | `access-requests.db.test.ts 0021_*.db.test.ts` → 29/29 on sqlite, postgres, mysql, mariadb; "at once" tests ×3 more each → passed. With `lockUsers` removed (`access-requests.ts:99`), "keeps one open request…" fails on PG, MySQL, MariaDB (2–5 `sent`); "holds the limit… 14 at once" fails on PG only |
| 7 | The open-request limit can't tell a private name from an unknown one | no | confirmed | Probe P2 on all four, with 9 open: `acme` (private) then `t9` → `sent, TooMany, already_requested`; `nowhere` then `t9` → the same. Not storing unknown names (mutation) fails 3 tests |
| 8 | Asking twice and `ownRequests` don't tell a private name from an unknown one | no | confirmed | Probe P1 on all four: both `sent`, then `already_requested`; `ownRequests` identical apart from id, name, date, `description`/`visibility` null for both (`access-requests.ts:368-370`); cancel and ask again alike. A decline shows to the requester, as the spec says |
| 10 | Someone added or removed after a decline can ask again at once | no | confirmed | Test passes on 4 DBs, fails without the exemption (`:117`); probe P6: member → `already_member`, removed → `sent`, declined again → TooSoon, a change in `beta` doesn't lift `acme`'s wait |
| 12 | Message and reason: trimmed, ≤500 characters, no NUL, stored the same on every database | no | confirmed | `textFrom` refuses NUL (`:49`); test passes on 4 DBs and fails without the check; probe P4 identical on all four (lone surrogate, NBSP, 500 × 😀, CRLF, U+2028, DEL) |
| 12b | The 7-day wait is exactly 7 days | no | confirmed | Changing it to 6 or 8 days fails "waits 7 days…" (boundaries ±1 minute) |
| 21 | `decideAccessRequest`'s result is checked by every caller | no | confirmed | `access-requests.ts:154`, `:245`, `:290` throw Answered on false; `members.ts:147` audits only when approved; race probes P5 and R1 on 4 DBs → one winner, no deadlock |
| 22 | A name that can't be a workspace's isn't kept | no | partly | Probe P3 on 4 DBs: `-x`, `ａｃｍｅ`, 65 characters, `x\0y` → not stored; but `admin`, `root`, `ronne`, `api` → stored with `workspace_id` null and count against the limit. Cause: `isValidName(name, "item")` at `access-requests.ts:105` |

**Overall:** not met: rows 4, 7, 8, 10, 12 and the `decideAccessRequest` note hold on all four databases; reserved workspace names are stored as requests and count against the limit (row 22).

### Re-check — adversarial, row 22

Witnessed: 2026-10-09 15:15 EDT, by a fresh agent (adversarial). Commit: bfe0eb9 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 22 | A name that can't be a workspace's isn't kept | no | confirmed | `access-requests.ts:111` checks `!workspace && !isValidName(name, "workspace")` after the member check. Probes on all four: the 9 reserved names, ` ADMIN `, `Root`, `\tapi\n`, `WWW\r\n` asked twice → `sent`, 0 rows, 0 events, `ownRequests` empty; lookalikes (`ADMİN`, `ａｄｍｉｎ`, `admin\0`, `-admin`) → 0 rows; near-misses (`admins`, `root1`, `my-api`) → kept, then `already_requested`; 6 asks at once → 2 rows, no deadlock |
| 22a | Reserved names don't count against the limit | no | confirmed | Probe P5 on all four: with 9 open, the reserved names leave 9 rows; at 10, `beta` and `nowhere` → TooMany, `admin` → `sent`, which tells nothing since creation refuses reserved names (`models/workspace.ts:40`) |
| 22b | The existing test covers the fix | no | confirmed | Without line 111, "treats a private name and an unknown one alike" fails (`admin`, `root`, `api` stored); with the reserved check before the lookup, "asks nothing of members and root" fails (`global` → `sent`) |
| 22c | Members and root are still told they're in, `global` included | no | confirmed | Probe P4 on all four: `global`, `GLOBAL`, ` Global ` → `already_member` for user, moderator, root; root → `already_member` for any name; 0 rows |
| 22d | Private and unknown names still can't be told apart | no | confirmed | Probe P6 on all four: private `beta` and `nowhere` → `sent`, then `already_requested`; `ownRequests` alike; cancel and ask again alike; at the limit both TooMany |
| 22e | A workspace that has a reserved name (inserted directly) is still handled as a workspace | no | confirmed | Probe P7 on all four: non-member → stored with its `workspace_id`, then `already_requested`; member → `already_member` |
| 22f | Nothing else broke | no | confirmed | `access-requests.db.test.ts` + `0021_*.db.test.ts` + probe → 37/37 on sqlite, postgres, mysql, mariadb |

**Overall:** met: reserved names answer "Request sent" and are neither stored nor counted on any of the four databases; members and root, `global` included, are told they're in; private and unknown names can't be told apart.
