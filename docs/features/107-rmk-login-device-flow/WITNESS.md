# 107 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Spike: the plugin

Witnessed: 2026-10-17 20:15 EDT, by a fresh agent (blind). Commit: 9725d960 + working-tree diff of 107 SPEC.md/PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

The witness read PLAN.md's Notes from the start, since they are the task's deliverable.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The plugin's table is `deviceCode` with deviceCode, userCode, userId, expiresAt, status, lastPolledAt, pollingInterval, clientId, scope, unique on both codes, with no name or address field | yes | confirmed | `schema.mjs:3-49` matches. Extra fields only come through `grant.deviceCodeSchemaFields`, merged at `index.mjs:42-64` (the Notes cite `:38-47`, a few lines off) |
| 2 | The device code is stored in clear and looked up by equality; `generateDeviceCode` can't help | yes | confirmed | `routes.mjs:229-254`: the same value is stored and returned. `:290-296` looks it up with findOne by equality. Probe → `stored == returned true` |
| 3 | Device code is 40 characters of a-zA-Z0-9; user code is 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0 O 1 I, but L kept); input is normalised | yes | confirmed | `index.mjs:22-23`, `routes.mjs:9,46-48,714-723`. Probe: device code length 40, alphanumeric. 300 user codes → 32 distinct characters, `hasL=true`. Typing `fuvx-td8w` found `FUVXTD8W` |
| 4 | Polling answers invalid_grant, slow_down, expired_token (row deleted, so the next poll is invalid_grant), authorization_pending, access_denied (row deleted); slow_down doesn't grow the interval | yes | confirmed | `routes.mjs:289-380, 437`. Probe: pending → slow_down, interval still 5000 afterwards; unknown → invalid_grant; expired → expired_token then invalid_grant; denied → access_denied then invalid_grant |
| 5 | The exchange creates a web session and returns its token as `access_token` | yes | confirmed | `routes.mjs:455-475`. Probe → sessions 1 → 2, and `access_token` equals a session token |
| 6 | Binding happens when a signed-in person views the code (`GET /device`), not at approval; approving an unviewed code is refused | yes | confirmed | `routes.mjs:528-550, 608-611`. Probe → approving unviewed gives "Device code has not been claimed…"; after viewing, `userId` is bound. The Notes leave out that the request can also pre-bind through `user_id` (`:71, :238`; probe → pre-bound true) |
| 7 | Wrong codes aren't counted; the only limit is the `/device` HTTP rule, 5 per expiresIn window | yes | confirmed | `index.mjs:72-78`. Probe: 8 wrong `auth.api.deviceVerify` calls left the grant row unchanged; 7 wrong HTTP `GET /api/auth/device` → `400,400,400,400,400,429,429` |
| 8 | The plugin's routes are served when it is loaded | yes | confirmed | Probe: `auth.handler` `POST /api/auth/device/code` → 200 |
| 9 | The choice (`device_grants`, plugin not loaded) follows from the evidence | yes | confirmed | The hash, L, interval, session and name/address points are each confirmed by rows 1-7. The plugin isn't imported anywhere (`grep deviceAuthorization apps/web/src packages/*/src` → none) |
| 10 | SPEC "The server", Decision 3 and the plugin-routes 404 criterion agree with the choice | yes | confirmed | SPEC.md:98-107 and 180-183 describe the table and no session. The 404 holds through the existing allowlist: `auth-http.ts:16` answers 404 for any path not in `HTTP_ENDPOINTS = {"/get-session","/ok"}` (`better-auth.ts:32`) |
| 11 | SPEC Behaviour agrees: hash, alphabet, slow_down growth, Brute force | yes | partly | Alphabet: 36 − 5 = 31, so 31⁸ is right. Hash and the +5 s slow_down are in SPEC. But the polling table's `expired_token` row still says only "past `expires_in`", while the Brute force paragraph says voided codes answer it too. The voiding policy is "Owner to confirm" in PLAN Notes but not in SPEC's Open questions. PLAN task 3 still says "the plugin's own routes stay off the allowlist" |
| 12 | `pnpm licenses:check` and `pnpm audit --audit-level high` pass | yes | confirmed | `pnpm licenses:check` → "323 packages checked. All licenses are allowed", exit 0. `pnpm audit --audit-level high` → "No known vulnerabilities found", exit 0 |

**Overall:** not met: every factual claim about the plugin and the choice holds; SPEC/PLAN need three small consistency edits (row 11).

Witnessed: 2026-10-17 20:15 EDT, by a fresh agent (adversarial). Commit: 9725d960 + working-tree diff of 107 SPEC.md/PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Notes name the choice (`device_grants`, Ronne's own table) with evidence; SPEC *The server* and Decision 3 follow it | yes | confirmed | PLAN.md Notes "Chosen: `device_grants`"; SPEC.md *The server* and Decision 3 rewritten to match. The task text said `device_codes`; the new name is consistent across both docs |
| 2 | Plugin table `deviceCode`: 9 fields, unique on both codes, no name or address field (`schema.mjs:3-49`) | yes | confirmed | `schema.mjs:3-49` matches exactly. Grant-field extension is real, but at `index.mjs:42-64`, not `:38-47` as cited |
| 3 | Device code stored in clear and looked up by equality; `generateDeviceCode` can't help | yes | confirmed | `routes.mjs:229-254` stores and returns the same value, `:290-296` looks it up by equality. Probe `probe.mjs` → `stored clear: true` |
| 4 | Lengths and alphabet: 40 chars `a-zA-Z0-9`; user code 8 of a 32-char set keeping `L`; normalisation | yes | confirmed | `index.mjs:22-23`, `routes.mjs:9,714-723,46-48`. Probe → device code length 40, user code `3CHLCV6F` (contains `L`); lower-case dashed input still found the row |
| 5 | Polling errors as listed, and `slow_down` doesn't grow the interval | yes | confirmed | `routes.mjs:297-345`. Probe → poll1 `authorization_pending`, poll2 `slow_down`, `pollingInterval` still 5000. No write to `pollingInterval` anywhere in routes.mjs |
| 6 | Exchange makes a web session and returns its token as `access_token` | yes | confirmed | `routes.mjs:455-475`. Probe → sessions 1 -> 2, `access_token` equals the session token |
| 7 | The evidence weighs the plugin's options fully (hooks, custom generators, exported helpers) | no | partly | Missed: `redeemDeviceCode` is public API (`index.mjs:87`, `routes.d.mts:25-32`) and runs the polling/claim state machine without `createSession`; `grant.authorizeRequest` → `deviceCodeFields` (`index.d.mts:67-92`) would hold the name and address; `generateUserCode` (`index.mjs:25`) would drop `L`. The choice still holds on the clear-text device code, the interval, first-viewer binding, the counting and `user_id` pre-binding. Decision 3's stated reason "makes a session at exchange" is the weak one |
| 8 | Binding happens at viewing (first signed-in viewer wins), and approve refuses an unviewed code | yes | confirmed | `routes.mjs:528-550,608-611`. Probe → approve without view: `invalid_request` + `DEVICE_CODE_NOT_CLAIMED`. After GET `/device`, `userId` bound to the viewer |
| 9 | Wrong codes aren't counted; the only limit is the `/device` rate-limit rule | yes | confirmed | `index.mjs:72-78`: `path === "/device"` only, max 5 per `expiresIn`. Probe → 20 wrong `deviceVerify` calls, row still `pending` with no counter. Not in the notes: `POST /device/code` accepts an anonymous `user_id` that pre-binds the code (`routes.mjs:71,238`) |
| 10 | Plugin routes are served when it's loaded; today it isn't loaded and unlisted `/api/auth/*` is a 404 | yes | confirmed | Probe `auth.handler` POST `/api/auth/device/code` → 200. `grep deviceAuthorization apps/web/src packages/*/src` → none. `auth-http.ts:16` returns 404 for paths not in `HTTP_ENDPOINTS` |
| 11 | Alphabet arithmetic: 31 characters once `0 O 1 I L` are out; 5 tries against 31⁸ | no | confirmed | 36 − 5 = 31. `python3` → 31⁸ = 852,891,037,441. With N pending codes, 5 global wrong tries succeed with probability at most 5N/31⁸ |
| 12 | Voiding rule (SPEC *Brute force*): every wrong entry counts against every pending code, voided at 5 | yes | partly | Sound against guessing, but a denial of service: any signed-in member at 10 an hour can void every pending code twice an hour, including one being approved. "Owner to confirm" is in the Notes but not in SPEC's Open questions. Whether used, expired or malformed entries count is unspecified |
| 13 | SPEC's table design: hashed device code, status set, approver, interval, wrong attempts | no | partly | The columns cover the behaviours. Gap: "Rows past their expiry are deleted when a new code is asked for" makes a later poll answer `invalid_grant`, not `expired_token`, and doesn't say when `auth.device_expired` is audited |
| 14 | `pnpm licenses:check` passes | yes | confirmed | → "323 packages checked. All licenses are allowed", exit 0 |
| 15 | `pnpm audit --audit-level high` passes | yes | confirmed | → "No known vulnerabilities found", exit 0. No change to package.json, apps/web/package.json, pnpm-lock.yaml or pnpm-workspace.yaml |

**Overall:** not met: the choice is made and the plugin facts check out, but the evidence misses the exported helpers that weaken Decision 3's stated reason, the voiding rule's denial of service isn't recorded in SPEC.md, and expiry deletion conflicts with `expired_token`.

### Re-check 1 (blind: row 11, plus what the diff touches)

Witnessed: 2026-10-17 20:19 EDT, by a fresh agent (blind). Commit: 9725d960 + working-tree diff of 107 SPEC.md/PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 11 | SPEC Behaviour agrees: hash, alphabet, slow_down growth, Brute force; voiding answers `expired_token`; PLAN task 3 matches "plugin not loaded" | yes | confirmed | SPEC.md polling table: "`expired_token` \| past `expires_in`, or voided by wrong codes (*Brute force*)". Open questions has "Voiding on wrong codes" ("Built as specified until the owner decides"). PLAN.md task 3: "the plugin isn't loaded, so it has no routes". 31⁸ is right (36 − 5) |
| 13 | New Notes references: grant extension at `index.mjs:42-64` and `index.d.mts:67-92`; `redeemDeviceCode` exported (`index.mjs:87`, `routes.d.mts:25-32`) and runs polling and the claim without a session; `generateUserCode` at `index.mjs:25`; `user_id` pre-binding at `:71`, `:238` | yes | confirmed | `sed` of each range matches. `routes.mjs:289-380` has no `createSession` (that is at :455, in `deviceToken` only). Last pass's probe → `pre-bound via user_id true` |
| 14 | Decision 3, restated, agrees with the Notes and *The server*; one conditional update spends the grant before the token is made | yes | confirmed | Decision 3 matches Notes bullets 2, 4, 6 and 8 and the helpers bullet. "Spent once, even when the token can't be made" agrees with the 51st-token edge case and the table's "once: the code is spent" |
| 15 | Brute force: only a well-formed code matching no grant counts, "a used, expired or malformed one doesn't count"; rows kept a day past expiry | yes | partly | The late-poll part is consistent. Contradiction: once a row is deleted, an expired code entered on `/device` matches no grant, so it counts as wrong; "an expired one doesn't count" is only true for a day |
| 16 | The licence and audit checks are unaffected | yes | confirmed | `git diff --stat` touches only SPEC.md, PLAN.md and WITNESS.md of 107, with no package or lockfile change |

**Overall:** not met: row 11 is fixed, the new references and Decision 3 hold; row 15's "an expired one doesn't count" contradicts deleting rows a day after expiry.

### Re-check 1 (adversarial: rows 7, 12, 13, plus what the diff touches)

Witnessed: 2026-10-17 20:19 EDT, by a fresh agent (adversarial). Commit: 9725d960 + working-tree diff of 107 SPEC.md/PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The evidence covers the plugin's options, and the choice rests on what those can't fix | yes | partly | The Notes and Decision 3 cite all four with correct refs. But SPEC.md *The server* (`:99-101`) still says the plugin is unfit because it "makes a web session at exchange and has no place for the name or the address", which Decision 3 now says the helpers avoid. Notes' exchange bullet still ends "We'd have to delete it again" |
| 12 | Voiding rule recorded as an open owner question with a default; the spike's *Done when* is met while it stays open | yes | confirmed | SPEC Open questions names the denial of service and the alternative, with "Built as specified until the owner decides". The *Done when* is the plugin-or-table choice; voiding works the same under either, so leaving it open doesn't block the spike, as long as a later task builds and tests the default |
| 13 | Expiry: rows kept a day past expiry so a late poll gets `expired_token`; `auth.device_expired` written at the first poll after expiry | yes | partly | The deletion conflict is fixed (`SPEC.md:107-108`). New gap: `rmk` stops at its own deadline, Ctrl-C or a closed laptop never poll again, so a poll after expiry rarely happens and `auth.device_expired` would rarely be written |
| 16 | Only a well-formed code that matches no grant counts as wrong (diff) | yes | partly | (a) The spec doesn't say how a typed code is normalised or whether "well-formed" is judged before or after; judged on raw input, `ABCD-EFGH!` would be a free guess. (b) If used and expired entries don't count toward the 429 limits either, the moment of a 429 tells a prober a code once existed |
| 17 | Spent once: one conditional update spends the grant before the token is made (diff) | yes | confirmed | `SPEC.md:102-104`; consistent with the 51st-token edge case and `invalid_grant` for reuse. `UPDATE … WHERE status = 'approved'` by affected rows is portable (the status always changes, so MySQL's changed-rows count is 1) |
| 18 | `expired_token` also answers a voided grant (diff) | yes | confirmed | Polling table row "past `expires_in`, or voided by wrong codes" matches *Brute force* |
| 19 | Plugin isn't loaded, so it has no routes (diff, PLAN task text) | yes | confirmed | `grep deviceAuthorization apps/web/src packages/*/src` → none. `auth-http.ts:16` returns 404 for unlisted `/api/auth/*` paths |

**Overall:** not met: SPEC *The server* still gives the old reasons, `auth.device_expired` is rarely written as specified, and normalisation before counting isn't specified.

### Re-check 2 (blind: row 15, plus what the diff touches)

Witnessed: 2026-10-17 20:21 EDT, by a fresh agent (blind). Commit: 9725d960 + working-tree diff of 107 SPEC.md/PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | Brute force: what counts as a wrong entry agrees with deleting rows a day past expiry | yes | confirmed | SPEC.md:82-84 "a malformed one doesn't count, nor a used or expired one while its row is kept (a day past expiry)" agrees with SPEC.md:114-115. A voided or denied code still has a row, so it isn't a wrong entry |
| 17 | Typed codes: normalise, then judge; only the normalised code is looked up | yes | confirmed | SPEC.md:75-76 agrees with the alphabet and the example `WDJB-MJHT`. Remark: the message for a malformed code isn't named; row 18 implies the same message |
| 18 | The 429 limits count every refused entry, and voiding counts only wrong ones | yes | confirmed | SPEC.md:77-81: the two counters are separate and agree with the single "isn't valid" message; the guessing bound is unchanged |
| 14 | *The server* and Notes restate the plugin reasons, consistent with Decision 3 | yes | confirmed | SPEC.md:110-112 matches Decision 3; the Notes' session bullet now points to `redeemDeviceCode` |
| 19 | `auth.device_expired` written once per unused grant; voiding is audited | yes | partly | Expiry is consistent and listed. But no audit event covers voiding, though the Open question says "it is audited" |

**Overall:** not met: SPEC names no audit event for voiding, though the Open question and Notes say it is audited.

### Re-check 2 (adversarial: rows 7, 13, 16, plus what the diff touches)

Witnessed: 2026-10-17 20:21 EDT, by a fresh agent (adversarial). Commit: 9725d960 + working-tree diff of 107 SPEC.md/PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The evidence covers the plugin's options, and the spec gives the same reasons everywhere | yes | confirmed | `diff` of the two diffs → *The server* now gives Decision 3's reasons; the Notes' exchange bullet points to `redeemDeviceCode` |
| 13 | `auth.device_expired` is written once per grant that ends unused, at a poll or at the sweep | yes | partly | The trigger is reliable, but the listed statuses have no `expired`, so nothing in the row makes it once: later polls, sweeps and two polls at once would all "first see" it. Also open whether a voided grant gets it |
| 16 | Typed codes are normalised first, then judged and looked up; only well-formed misses count toward voiding | yes | confirmed | `ABCD-EFGH!` → malformed, never looked up; `abcd efgh` → `ABCDEFGH`, counted; `ſ` → `S`, counted; full-width `Ａ` → malformed |
| 20 | Every refused entry counts toward the 429 limits (diff) | yes | confirmed | SPEC *Brute force* says so. Remark: the spec doesn't say a new user code must differ from kept rows; a unique index with a retry closes it |

**Overall:** not met: "`auth.device_expired` once per grant" can't be guaranteed with the listed statuses.

A third, scoped round followed: the findings were wording only, so it went one round past the two the knowledge note allows before the owner decides (said so to the owner).

### Re-check 3 (blind: row 19, plus what the diff touches)

Witnessed: 2026-10-17 20:23 EDT, by a fresh agent (blind). Commit: 9725d960 + working-tree diff of 107 SPEC.md/PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 19 | Voiding is audited, as the Open question and Notes say, and each unused grant gets exactly one ending event | yes | confirmed | SPEC.md:30-33 lists `auth.device_voided` (the person, the address, how many). SPEC.md:119-122: `auth.device_expired` only for pending or approved grants, "a voided one has `auth.device_voided` instead", by the conditional update that sets `expired` |
| 20 | The new `expired` status and the user code being unique among kept rows agree with the rest of the spec | yes | confirmed | SPEC.md:114-116 statuses; `expired` and `voided` answer `expired_token` (SPEC.md:96). A used or expired code typed within the kept day finds only its own row, which agrees with Brute force (SPEC.md:83-85) |
| 21 | Splitting *The server* into two paragraphs changes only the layout | yes | confirmed | `diff 107-t1b.diff 107-t1c.diff` → the old lines come back word for word across SPEC.md:107-123, apart from rows 19 and 20 |

**Overall:** met.

### Re-check 3 (adversarial: row 13 and remark 20)

Witnessed: 2026-10-17 20:23 EDT, by a fresh agent (adversarial). Commit: 9725d960 + working-tree diff of 107 SPEC.md/PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | `auth.device_expired` is written once per grant that ends unused, by the conditional update that sets `expired`; a voided grant gets `auth.device_voided` instead | yes | confirmed | `SPEC.md:116` adds `expired`; `:119-121` writes the event only when the update from `pending`/`approved` changed the row. Two polls at once, or a poll racing the sweep: one update wins, one event. The spend (`approved` → `spent`) and the expiry (`approved` → `expired`) both require `approved`, so only one wins. Remark for task 2: the spend should also require "not past expiry" |
| 20 | The user code is unique among kept rows; a collision is drawn again | yes | confirmed | `SPEC.md:114-115`. Pruning runs before the new code is drawn, so "the rows kept" is the whole table; a unique index plus a retry does it on every dialect |

**Overall:** met.

## Task 2 — Storage and service

Witnessed: 2026-10-17 20:26 EDT, by a fresh agent (blind). Commit: fefb1dcc + working tree. Machine: macOS 27.0.1, Node v24.0.0.

Untracked files of task 3 appeared during the pass; the witness checked only task 2's files, and compared each with its scratch copy (`cmp`) at the end.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's own tests pass on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | `vitest run` on the 0027 db test, device-grants db test, device-grant.test.ts, access-tokens.db.test.ts → 4 files, 31 passed; `pnpm test:db:postgres` / `:mysql` / `:mariadb -- <0027 test> <device-grants test>` → 2 files, 17 passed on each server |
| 2 | Migration 0027 works on every dialect: unique `device_code_hash` and `user_code`, cascade on user delete, `access_tokens.created_via` | no | confirmed | `0027_device_grants.ts:22-55`; its db test passed on all 4 dialects; probe P8 (duplicate user code) → refused |
| 3 | The device code is 32 random bytes in base64url, and only its SHA-256 hash is stored | no | confirmed | `device-grant.ts:57-61`; probe P6 → row doesn't contain the code, hash is 64 hex. Mutation M3 (store in clear) → "stores only the device code's hash" fails |
| 4 | The user code is 8 characters from a 31-character alphabet without `0 O 1 I L`, and a colliding code is drawn again | no | confirmed | `device-grant.ts:29,67-78` (unbiased rejection sampling); device-grant.test.ts passed. Probe P9 (first insert forced to collide) → second draw used, on sqlite/postgres/mysql. No suite test covers the redraw |
| 5 | Typed codes are upper-cased and stripped of spaces and dashes; anything malformed doesn't count | no | confirmed | `device-grant.ts:83-86`; probe P5: NBSP and CRLF stripped, en dash refused, doubled code refused. Mutation M12 (malformed counts) → voiding test fails |
| 6 | Every response in the polling table, `slow_down` adding 5 s, 200 with a 90-day token | no | confirmed | The matching db tests passed. Mutation M10 (no interval growth) → slow_down test fails |
| 7 | A reused code: a spent grant answers `invalid_grant`, and a decided code can't be approved again | no | confirmed | "Reused: the code is spent" → `invalid_grant`; after Deny, approve → `invalid_code` |
| 8 | A disabled user is refused at approval and again at exchange, and no token is made | no | confirmed | `device-grants.ts:208,294-295`; mutations M5 (no check at approval) and M4 (none at exchange) → the test fails |
| 9 | The 51st active token: exchange answers `token_limit`, and the code is spent | no | confirmed | Test passed (next poll → `invalid_grant`). Mutation M7 (spend after making the token) → this test and the two-polls test fail |
| 10 | Two approvals at once: the first wins, the other gets the "isn't valid" answer | no | confirmed | Conditional update `kysely-device-grant-repository.ts:102-116`; probes P2 (4 approvals at once) and P3 (approve vs deny) passed on 4 dialects. Mutation M2 (no pending guard) → the test fails |
| 11 | The exchange is spent once, even with concurrent polls, through 009's token service (`via: "device"`) | no | confirmed | Conditional `spend`; probe P4 (3 polls at once → 1 token) on 4 dialects. Mutation M1 (no status guard) → test fails. `created_via = device` and audit `via: device` asserted |
| 12 | Brute force voiding: every wrong well-formed code counts against every live pending grant, 5 void them, polling then answers `expired_token`; malformed, used or expired codes don't count | no | confirmed | `repository:150-165`, `device-grants.ts:157-181`; the voiding test passed on 4 dialects. Mutation M11 (void at 6) → fails |
| 13 | Expiry: `auth.device_expired` written once per unused grant (at a poll, or by the sweep), rows pruned a day after expiry | no | confirmed | Tests passed. Mutation M9 (drop the transition guard in `expire`) isn't caught by the suite; probe P1 (poll, poll and start racing past expiry) catches it on 4 dialects |
| 14 | Restart: the grants are in the database, so polling continues | no | confirmed | Probe P7 (exchange with a fresh repository instance) → ok on 4 dialects |
| 15 | Audit events: started, approved, denied, expired, voided, with summaries in admin-audit | no | confirmed | `audit-event.ts`, `summary.ts`, `log/events.ts` diffs; the db tests assert each event's actor, address and metadata |

**Overall:** met. Gaps in the tests: the concurrent once-only expiry (row 13) and the user-code redraw (row 4) are covered only by the witness's probes.

Witnessed: 2026-10-17 20:50 EDT, by a fresh agent (adversarial). Commit: fefb1dcc + working tree (task 2's files as of 20:28, byte-identical to the scratch copy at the end; task 3's files appeared during the pass and weren't checked). Machine: macOS 27, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration 0027 works on all four dialects | no | confirmed | SQLite → 21 passed (3 files); `pnpm test:db:{postgres,mysql,mariadb} -- <device-grants test> <0027 test>` → 17 passed on each |
| 2 | Only the device code's SHA-256 is stored, and it never reaches the audit log | no | confirmed | Test checks the row and `device_started`; mutation M3 (store in clear) → 1 test failed |
| 3 | Start: 8-character code from 31 characters, 32-byte base64url device code, 600 s, 5 s, client `rmk` or `rmk-mcp` only | no | confirmed | Tests; `generateUserCode` rejects bytes ≥248, so no bias |
| 4 | `authorization_pending` while undecided | no | confirmed | Test + P6 |
| 5 | `slow_down` when polled too fast, and the interval grows by 5 s | no | confirmed | P6 polls at +0,1,1,9,14,15,5 s → pending then 6× slow_down, interval 35; M5 (no growth) → 1 failed |
| 6 | `access_denied` after Deny; a denied code can't then be approved | no | confirmed | Test |
| 7 | `expired_token` past expiry and for voided grants | no | confirmed | Test; P6 approved then polled at exactly +600 s → expired_token, no token; M11 → 1 failed |
| 8 | `invalid_grant` for unknown, spent or wrong-client codes, and when the approver was deleted | no | confirmed | Test; P8 (delete the approver) → cascade, invalid_grant |
| 9 | 200 gives a 90-day token through 009's service, `via: "device"`, once, with no session | no | confirmed | M14 (via cli) → 1 failed; M9 (no spend) → 3 failed; M1 (no status condition) → 1 failed; P10: 20 rounds of 2 polls plus a sweep, four dialects → exactly 20 tokens |
| 10 | A reused code gets `invalid_grant` | no | confirmed | Test |
| 11 | A disabled user is refused at approval and at exchange | no | confirmed | M2 → 4 failed; M10 → 1 failed |
| 12 | 51st token: `token_limit`, and the code is spent | no | confirmed | M13 → 3 failed |
| 13 | Two approvals at once: the first wins | no | confirmed | M7 (no `status = pending`) → 1 failed |
| 14 | Decisions racing wrong entries don't fail | no | not met | P9 (approve racing the 5th wrong code, 80 rounds): MySQL → 2, MariaDB → 1 `Deadlock found when trying to get lock` from approve; SQLite and PG → 0. The repository doesn't use `retryOnDeadlock` |
| 15 | Typed codes normalised; only well-formed codes looked up; MySQL case-insensitivity can't match the wrong row | no | confirmed | P7: a lower-case stored row isn't matched on any dialect |
| 16 | Voiding counts against every pending code and voids at 5; malformed, used and kept-expired codes don't count | no | partly | P4 (12 concurrent wrong entries, 2 pending) → one `auth.device_voided`, count 2, on all four. Test gap: M8 (void approved grants too) and M4 (count on non-pending rows) → suite green |
| 17 | `auth.device_expired` once per unused grant, at a poll or the sweep | no | not met | P1: 60 pending grants, past expiry + 1 day, one start → 50 events; the other 10 pruned unaudited (sweep limit 50, then the prune). Once-only holds (P11). Test gap: M6 (audit when the transition changed nothing) → suite green |
| 18 | Audit events and summaries, no secret in log fields | no | confirmed | Test assertions; diffs of `audit-event.ts`, `summary.ts`, `log/events.ts` |
| 19 | Rows deleted a day after expiry; until then a late poll gets `expired_token` | no | confirmed | Test "forgets it a day later" |
| 20 | Start refuses a bad name | no | partly | P3: `"a\u0000b"` → PostgreSQL throws (a 500); P2: `"a"+"😀"×99` → the `(2)` name splits a surrogate pair (`createWithFreeName` cuts by UTF-16 units) |

**Overall:** not met: unused grants past the sweep limit are pruned unaudited (17), approvals can deadlock on MySQL and MariaDB (14); test gaps (16, 17) and name input (20).

### Re-check 1, the fixes

The repository's updates now go through `retryOnDeadlock`, each statement on its own. The prune skips grants still pending or approved, so the sweep audits them first. A name with a control character is refused, and names are cut by code points. New tests: an approved grant and every row's attempt count in the voiding test, polls racing a start past expiry, 60 unused grants across two starts, the user-code redraw, a NUL in the name, and a long emoji name with `(2)`.

### Re-check 1 (adversarial: rows 14, 16, 17, 20, plus what the diff touches)

Witnessed: 2026-10-17 20:40 EDT, by a fresh agent (adversarial). Commit: fefb1dcc + working tree (the changed task 2 files copied into the same scratch copy). Machine: macOS 27, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | Decisions racing wrong entries don't fail | no | confirmed | All 6 UPDATEs go through `retryOnDeadlock`. P9 (80 rounds), twice each on MySQL and MariaDB → 0 errors, 0 approved-but-voided (2 and 1 deadlocks before). P10 → 20 tokens; P11 → 1 expiry audit |
| 16 | Voiding counts only against pending, unexpired grants, voids at 5; approved grants stay | no | confirmed | The voiding test checks an approved grant and every row's attempts. M4 (count every status) → fails. M8 alone changes nothing, since approved rows never gain an attempt; M4 guards it |
| 17 | `auth.device_expired` once per grant that ends unused, none pruned unaudited | no | confirmed | P1 (60 pending, two starts a day apart) → 61 audits on all four dialects. M16 (no status filter on the prune) and M6 (audit when nothing changed) → their tests fail |
| 20 | Start refuses a bad name; long names keep whole characters | no | confirmed | P3 `"a\u0000b"` → `invalid_request` on all four; P2 emoji name → 100 code points, no lone surrogate. M18 and M17 → their tests fail. Remark: a lone surrogate is still accepted |
| — | The diff's other changes hold on every dialect | no | confirmed | SQLite → 18 passed; `pnpm test:db:{postgres,mysql,mariadb} -- <device-grants test> <0027 test>` → 21 passed on each |

**Overall:** met.

### Re-check 1 (blind: rows 4, 12, 13, plus what the diff touches)

Witnessed: 2026-10-17 20:36 EDT, by a fresh agent (blind). Commit: fefb1dcc + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on SQLite and the three servers | no | confirmed | SQLite → 3 files, 25 passed; `pnpm test:db:{postgres,mysql,mariadb} -- <0027 test> <device-grants test>` → 21 passed on each; `api-v1.db.test.ts` → 12 passed |
| 4 | A colliding user code is drawn again | no | confirmed | "draws another user code when one is taken" passed; mutation R5 (throw on a collision) → it fails |
| 12 | Wrong codes count only against live pending grants and void them at 5; an approved grant is untouched and still exchanges | no | confirmed | Extended voiding test on 4 dialects (attempts 0/0/0/5/0). Mutation R6 (void approved too) changes nothing, since approved rows are never counted |
| 13 | `auth.device_expired` is written once, even when polls and a start race | no | confirmed | New race test passed; mutation R4 (no `transition` guard) → it fails |
| 16 | The prune never deletes a pending or approved grant before the sweep audited it | no | confirmed | `kysely-device-grant-repository.ts:188-192`; mutation R1 (no status filter) → the test fails |
| 17 | No deadlock on MySQL/MariaDB when wrong codes, decisions and polls run at once | no | confirmed | Probe P10 → 0 rejected, 2/2 runs each. Without the retry, MySQL 8.4 → `Deadlock found…` 3/3 runs |
| 18 | A task test catches losing the deadlock retry | no | partly | Mutation (no retry) → `device-grants.db.test.ts` green on MySQL; only probe P10 catches it |
| 19 | A name with control characters is refused | no | confirmed | Mutation R2 (no check) → the test fails |
| 20 | Token names are cut by code points | no | confirmed | Mutation R3 (cut by code units) → "keeps a long name whole…" fails |

**Overall:** not met: no task test catches removing the deadlock retry (row 18).

### Re-check 2 (blind: row 18)

Witnessed: 2026-10-17 20:41 EDT, by a fresh agent (blind). Commit: fefb1dcc + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 18 | A task test catches losing the deadlock retry | no | confirmed | `device-grants.db.test.ts:385-405` "never fails when decisions, polls and wrong codes run at once". Without the retry (`mutate.sh` against MySQL 8.4) → it fails 3 of 3 runs; with the real code, `pnpm test:db:mysql -- src/server/domains/identity/services/device-grants.db.test.ts` → 19 passed, 3 of 3 runs. It didn't deadlock on MariaDB here, so there it may not catch a missing retry |

**Overall:** met.

## Task 3 — The API routes

Witnessed: 2026-10-17 20:49 EDT, by a fresh agent (blind). Commit: 8670c076 + working tree (device routes, device-api.ts, actions/device-grants.ts, device-api.db.test.ts, sanitize.ts, privacy-scenario.ts, SPEC.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `/code` answers 200 with `device_code`, `user_code` (XXXX-XXXX), `verification_uri`, `verification_uri_complete`, `expires_in: 600`, `interval: 5` | no | confirmed | "answers RFC 8628's fields" checks the exact body; probe → the same shape, a 43-character device code, `BK78-SVP6` |
| 2 | `/token` answers each row of the polling table, and 200 with `{token, id, name, expiresAt}` once | no | confirmed | Two tests cover every row (all 400 but the 200); the token authenticates as Ana; a second poll → `invalid_grant`. A voided grant's `expired_token` is tested only in the service (task 2) |
| 3 | `user_disabled` at exchange, and the token limit | no | confirmed | "answers user_disabled and token_limit" passes |
| 4 | Errors use `{error:{code,message}}` with RFC 8628's names | no | confirmed | `device-api.ts:36` → `errorResponse` (`errors.ts:31-40`); every probe body had the shape |
| 5 | Malformed bodies → `invalid_request`; another `grant_type` → `unsupported_grant_type`; unknown `client_id` → `invalid_client`; `rmk-mcp` accepted | no | confirmed | Tests cover 10 malformed cases and check no row is written. Probe: `null` and empty bodies → 400, 5000-character name → 400, 2 MB → 413 `body_too_large`, `rmk-mcp` → 200 |
| 6 | `Cache-Control: no-store` on every response | no | confirmed | Mutation (drop `no-store` in `json()`) → 2 tests fail; probe saw it on 400 and 429 |
| 7 | Rate limits: starts 10/min per address, 60 shared; polls 60 per address, 600 shared; 429 with `Retry-After` | no | confirmed | Tests cover three of the four buckets; probe: the shared poll bucket's first 429 at poll 600, `retry-after: 60`. No test of the shared poll bucket |
| 8 | Neither route reads or sets a cookie | no | confirmed | `grep cookie` → only a comment; tests send Ana's cookie: no `set-cookie`, the grant's `user_id` stays null |
| 9 | Better Auth's device plugin isn't loaded: `/api/auth/device/*` is a 404 | no | confirmed | `HTTP_ENDPOINTS` = `{"/get-session","/ok"}`; the test checks 5 paths and no `device*` on `app.auth.api` |
| 10 | Both route files are thin adapters (setup gate, `apiRoute`) | no | confirmed | `app/api/v1/auth/device/{code,token}/route.ts` |
| 11 | Telemetry: the new segments are listed, and the device flow is in the privacy check | no | confirmed | Mutations: `"device"` removed → route-segments test fails; a span named with the device code → privacy test fails. Gap: `never.userCode` lacks the dash, so the formatted code isn't checked |
| 12 | The tests pass on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db` → 129 files, 1233 passed; `pnpm test:db:{postgres,mysql,mariadb} -- <device-api test> <privacy test>` → 10 passed each |

**Overall:** met. Smaller findings: no test of the shared poll bucket; the privacy check lacks the dashed user code; the `invalid_client` message names only `rmk`.

Witnessed: 2026-10-17 20:49 EDT, by a fresh agent (adversarial). Commit: 8670c076 + working tree. Machine: macOS 27, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `/code` answers the RFC 8628 fields | no | confirmed | `device-api.db.test.ts` → 9/9 on SQLite, PostgreSQL, MySQL and MariaDB |
| 2 | `verification_uri` comes from the instance's base URL, not the request's Host | no | confirmed | Probe with `Host` and `X-Forwarded-Host: evil.example` → `http://localhost:3000/device`. Gap: building it from `request.url` still passes the tests |
| 3 | `/token` answers each row of the polling table, plus `user_disabled` and `token_limit` | no | confirmed | Tests cover every row; started with `rmk`, polled with `rmk-mcp` → `invalid_grant` |
| 4 | Malformed bodies → `invalid_request`, another grant type → `unsupported_grant_type`, unknown client → `invalid_client`; no row written | no | confirmed | Probe: form-encoded, `null`, `1`, `"rmk"`, `__proto__`, array or empty device code, NUL in name, 900 KB name → `invalid_request`; `RMK`, `"rmk "` → `invalid_client`; over 1 MiB → 413 |
| 5 | Errors use `{error:{code,message}}` and echo no code or token | no | confirmed | Probe of a bad device code → the shape, no echo |
| 6 | `no-store` on 200, 400, 413, 429 and 503 | no | confirmed | Probe headers; the mutation dropping it → 2 tests fail |
| 7 | No cookie is read or set | no | confirmed | Probe: started and polled with Bob's cookie and a junk bearer, approved by Ana → 200, no `set-cookie`, token is Ana's |
| 8 | Start limit: 10/min per address with TRUST_PROXY, 60 shared otherwise, spoofed headers don't help | no | confirmed | Test; mutation `max: 10→11` → the test fails |
| 9 | Poll limit: 60/min per address with TRUST_PROXY, 600 shared otherwise | no | partly | Behaviour holds (probe: 429 at 601 without TRUST_PROXY, at 61 with it). But `clientIp(headers, true)` in `exchangeDeviceLogin` and `pollShared` 600→6000 both pass the tests |
| 10 | Setup not ready → 503 `setup_required` on both routes | no | confirmed | Probe with `getSetupState` mocked → 503 with no-store |
| 11 | Better Auth's device plugin isn't loaded; `/api/auth/device/*` is a 404 | no | confirmed | Mutation loading `deviceAuthorization()` → the test fails |
| 12 | Device code, user code and token don't leak into logs, telemetry or rows | no | confirmed | Probe of stdout through `apiRoute` and the rows → none; privacy test 1/1 |

**Overall:** not met: no test catches a poll limit that trusts a spoofed address or a looser shared bucket (row 9).

### Re-check 1, the fixes

New tests: polls without a trusted proxy share one bucket of 600 whatever `X-Forwarded-For` says; `verification_uri` stays the instance's for a request to another origin with a hostile `Host`. The privacy check also looks for the dashed user code, and `invalid_client`'s message names `rmk-mcp`.

### Re-check 1 (adversarial: rows 9 and 2, plus what the diff touches)

Witnessed: 2026-10-17 20:55 EDT, by a fresh agent (adversarial). Commit: 8670c076 + working tree. Machine: macOS 27, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | Poll limit: 60/min per address with TRUST_PROXY, one shared 600 otherwise, and a test fails when it breaks | no | confirmed | Mutations `clientIp(headers, true)` and `pollShared` 600→6000 → "shares one polling bucket of 600…" fails (1 failed / 10 passed). Unmutated: 11/11 on SQLite, PostgreSQL, MySQL and MariaDB |
| 2 | `verification_uri` comes from the base URL, and a test fails when it doesn't | no | confirmed | `device-api.db.test.ts:108-124`; mutations building it from `request.url` or `x-forwarded-host` → that test fails |
| 13 | The `invalid_client` message names both clients | no | confirmed | `device-api.ts:21` |
| 14 | The formatted user code is checked as never reaching telemetry | no | confirmed | `privacy-scenario.ts:338`; the privacy test checks every `never` entry; 12/12 |

**Overall:** met.

## Task 4 — /device

Witnessed: 2026-10-17 21:20 EDT, by a fresh agent (blind). Commit: b7bcc3da + working tree (task 4's files; the `packages/cli` changes that appeared during the pass weren't checked). Machine: macOS 27, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `/device` shows the code from `?user_code=` in the input, or an empty input; opening it changes and counts nothing | no | confirmed | `app/(app)/device/page.tsx:15-17` only holds and renders; device.test passes |
| 2 | Continue is a POST that looks the code up and shows the name, the time, the address only when known, and the warning | no | confirmed | `DeviceFlow.tsx:41-64`; device.test passes |
| 3 | Approve and Deny are submit buttons of one server-action form, with no link that changes state | no | confirmed | `DeviceFlow.tsx:66-72`; "is only forms" passes |
| 4 | Approve binds the code to the signed-in user and rmk gets the token; Deny leads to `access_denied` | no | confirmed | `device-page.db.test.ts` on SQLite, PostgreSQL, MySQL and MariaDB |
| 5 | Every wrong, used, expired or malformed code gets one message | no | confirmed | `types.ts:24`; changing the text fails the test |
| 6 | Typed codes are normalised; a look-alike makes a code malformed | no | confirmed | Probe 3: `" xx -XXXX- xx "` of a real code → ok; `WDJB-MJH0` → `invalid_code` |
| 7 | Page limits: 5 refused a minute per address, 10 an hour per person, right codes don't count | no | confirmed | `device-grants.ts:101-150`; db tests on four dialects; mutation (never record) → 2 failed |
| 8 | 5 wrong codes void a pending grant: the page says invalid, polling `expired_token` | no | confirmed | Probe 4 (SQLite) |
| 9 | Two people approve one code: the first wins | no | confirmed | Probe 1 (SQLite) |
| 10 | The grant stands when the approver signs out | no | confirmed | Probe 2: approve, sign out, poll → ok |
| 11 | A held user on `/device` goes to `/account/security?next=/device?user_code=…`; other pages to plain `/account/security` | no | confirmed | `hold.ts:18-22`; mutation (`back = false`) → 1 failed |
| 12 | Once two-factor is on, Continue goes back; only a path on this site is kept | no | confirmed | `account/security/page.tsx:17-19`, `TwoFactorPanel.tsx:57-65`; tests pass |
| 13 | A held user can't approve by calling the action directly | no | partly | `serverAction` without `whileHeld` redirects them, but adding `{ whileHeld: true }` leaves every test green |
| 14 | Sign-in round trip keeps the code (provider sign-in too) | no | confirmed | `proxy.ts:40`; dropping `${search}` fails proxy.test |
| 15 | A signed-out caller of the page actions is refused | no | confirmed | "refuses someone signed out" → `ForbiddenError` |
| 16 | Access tokens shows *browser approval* for device-made tokens only | no | confirmed | `kysely-token-repository.ts:34-37,48`, `TokensPage.tsx:63-68`; mutation → 1 failed |
| 17 | Component and db tests pass | no | confirmed | 4 files, 38 passed; db tests on four dialects |
| 18 | The phone sweep covers `/device` and passes | no | can't check here | `e2e/pages.ts:140` lists both URLs; `next build` fails in the scratch copy (Turbopack can't resolve the symlinked `node_modules`), and building in the repository wasn't allowed |

**Overall:** not met: no test pins that a held user can't approve through the action (13), and the sweep wasn't rerun (18). Remark: `user_disabled` also counts against the page limits.

Witnessed: 2026-10-17 21:25 EDT, by a fresh agent (adversarial). Commit: b7bcc3da + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Opening `/device` changes and counts nothing | no | partly | Holds (`page.tsx:15-17`), but mutation M2 (the page looks the code up on GET) leaves 79 files green |
| 2 | Approve and Deny are buttons in one POST form; no link; CSRF | no | confirmed | `DeviceFlow.tsx:38-76`; no `serverActions.allowedOrigins`, so Next's Origin check stays |
| 3 | The page shows what asked and escapes hostile values | no | partly | HTML is escaped, but a name with U+202E is accepted (`\p{Cc}` misses `\p{Cf}`) and `rmk on ‮moc.ynapmoc-ruoy` displays as "rmk on your-company.com" |
| 4 | Approving needs the code to have been seen | no | partly | A POST with `intent=approve` and any code approves without a look-up, and the "done" name comes from client-sent state. Low impact: only the signed-in person |
| 5 | Approve binds the code; Deny ends it; rmk gets the token | no | confirmed | `device-page.db.test.ts` 6/6 on SQLite; identity db files on PostgreSQL and MySQL |
| 6 | Two approvals: the first wins | no | confirmed | Probe and `services/device-grants.db.test.ts:407` |
| 7 | One message for wrong, used, expired and malformed codes | no | confirmed | Single `invalid_code` text and `INVALID` result |
| 8 | Typed codes are normalised | no | confirmed | Probe: lower case with spaces → ok; full-width → `invalid_code` |
| 9 | Limits: 10 an hour per person, 5 a minute per address, on describe and approve | no | not met | 40 concurrent wrong entries → 10 `invalid_code` on SQLite but 40 on PostgreSQL and MySQL (check, await, then record); 20 concurrent wrong codes plus the right one → the right one ok with `failed_attempts` 14 and 20. Mutation M3 (refusals on Approve/Deny not recorded) → tests green |
| 10 | Right codes don't count | no | confirmed | db test passes |
| 11 | Signed-out visitors come back to `/device?user_code=…` | no | confirmed | `proxy.ts:39-40`, `sso.ts:185,271` |
| 12 | A held person goes to `/account/security?next=…`; Continue once on; only site paths kept | no | confirmed | `safeNextPath` refuses `//evil.test`, `/\evil.test`, `/\t/evil.test`, `/device/..//evil.test`, `https://evil.test` |
| 13 | A held person can't approve before enrolling | no | partly | Holds today; mutation M1 (`whileHeld: true`) → 79 files green |
| 14 | The approver signing out leaves the grant standing | no | confirmed | Probe on PG: approve, delete every session, poll → ok |
| 15 | Access tokens shows *browser approval* | no | partly | Works end to end on SQLite, PG and MariaDB; mutation M4 (the repository returns `via: null`) → 452 tests green |
| 16 | Phone sweep passes for `/device` | no | can't check here | Can't build in the scratch copy; the IP cell has no wrap |

**Overall:** not met: concurrent requests pass the limits on PostgreSQL and MySQL (9), bidi characters spoof the name (3), and four mutations survive (M1–M4).

### Re-check 1, the fixes

- The page's limits count an entry when it arrives (check and record with no await between) and take it back once the code was right (`LoginRateLimiter.release`); a disabled account isn't counted.
- A decision needs fewer than 5 wrong codes counted (`failed_attempts < 5` in the conditional update), and a look-up finds no grant at 5.
- Names with format characters (`\p{Cf}`) are refused at start, and the page shows names in `<bdi>`; the address wraps.
- The "done" screen's name comes from the decided grant.
- New tests: a burst of 40 wrong codes, refused approvals counted, a code refused at 5 counted wrong codes, `via: "device"` through `listMyTokens`, a held person's action redirected (`held.test.ts`), opening `/device` looking nothing up, a bidi name refused.
- Phone sweep after a build: `playwright test e2e/mobile-sweep.mobile.e2e.ts --project phone --project phone-webkit --project tablet` → 15 passed.

### Re-check 1 (adversarial: rows 1, 3, 4, 9, 13, 15, plus what the diff touches)

Witnessed: 2026-10-17 21:29 EDT, by a fresh agent (adversarial). Commit: b7bcc3da + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Opening `/device` changes and counts nothing | no | confirmed | M2 (look up on GET) → "opening /device > looks nothing up…" fails |
| 3 | Hostile values are escaped; no bidi spoofing | no | confirmed | U+202E, U+2067/U+2069, U+200B, U+FEFF → `invalid_request` on all four dialects; a hostile name renders as `<bdi>&lt;img…</bdi>`; M7 (`\p{Cc}` only) → a test fails |
| 4 | The result names the grant decided | no | confirmed | `actions.ts` takes `name: result.name`. A decision without a look-up is still possible, only by the signed-in person, and now names what was decided |
| 9 | The limits hold under concurrency and on Approve and Deny | no | confirmed | 40 concurrent malformed entries → 10 `invalid_code`, 30 `rate_limited` on all four dialects; 8 wrong codes plus the right approve at once, 2 runs × 3 servers → refused each time; M3 → "counts refused approvals and denials too" fails |
| 13 | A held person can't use the action | no | confirmed | M1 → `held.test.ts` fails |
| 15 | Access tokens shows *browser approval* | no | confirmed | M4 corrected (`created_via` → `null`) → "lists the token as made by browser approval" fails; the first pass's M4 changed nothing (operator precedence) |
| 17 | After 5 wrong codes a code can't be approved, even when guesses land after its look-up | no | partly | Guard works (a 50-wrong burst from 5 accounts plus an approve, 3 runs × 3 servers → refused), but M5 (drop `failed_attempts < maxWrong` in `decide`) alone leaves the tests green: `isLive` refuses first |
| 18 | Reserve-and-release keeps the counts honest | no | confirmed | `limitedEntry` records first, releases on ok, `user_disabled` or a throw; 40/40 on each dialect |

**Overall:** not met: no test isolates the `failed_attempts` condition in `decide` (17).

### Re-check 1 (blind: rows 13 and 18, plus what the diff touches)

Witnessed: 2026-10-17 21:30 EDT, by a fresh agent (blind). Commit: b7bcc3da + working tree as of 21:21. Machine: macOS 27, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | A held user can't look up or decide a code through the action, and a test pins it | no | confirmed | `held.test.ts`; `{ whileHeld: true }` → 1 failed |
| 18 | The phone sweep passes with `/device` | no | can't check here | `npx next build` was refused by this session's permission classifier; the sweep didn't run |
| 19 | Page limits count an entry before the look-up | no | confirmed | Moving the record after the work → the burst test fails on PostgreSQL (40 instead of 10); SQLite doesn't show the race |
| 20 | `release` takes back one attempt, never below zero or into a new window | no | confirmed | `login-rate-limiter.ts:61-68` |
| 21 | A code with 5 wrong attempts can't be approved | no | confirmed | Removing both guards → 2 tests fail |
| 22 | Names with format characters are refused | no | confirmed | `\p{Cc}` only → 1 failed |
| 23 | The page isolates the name, and the done message uses the decided grant's name | no | partly | Both are in the code, but removing `<bdi>` or going back to `previous.request.name` leaves the tests green |
| 24 | The task's tests pass on SQLite and the servers | no | partly | MySQL and MariaDB 39/39; PostgreSQL 38/39: "never fails when decisions, polls and wrong codes run at once" got `deadlock detected 40P01` in 3 of about 21 runs |

**Overall:** not met: the sweep didn't run (18), two fixes lack tests (23), and a PostgreSQL deadlock flake (24).

### Re-check 2, the fixes

- `countWrongCode` locks the pending rows in id order (`FOR UPDATE` in a transaction) and counts and voids in one statement, with `status` set before `failed_attempts` (MySQL and MariaDB read a column set earlier in the same SET). PostgreSQL then passed 8 runs in a row.
- New tests: the repository's `decide` refuses a row with 5 wrong codes and accepts one with 4; `<bdi>` around the name on the confirm and done screens; the done screen names the decided grant over the browser's.
- The app was rebuilt from this tree, so the sweep can run without a build: from `apps/web`, `npx playwright test e2e/mobile-sweep.mobile.e2e.ts --project phone`.

### Re-check 2 (blind: rows 18, 23, 24, plus what the diff touches)

Witnessed: 2026-10-17 21:40 EDT, by a fresh agent (blind). Commit: b7bcc3da + working tree as of 21:33. Machine: macOS 27, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 18 | The phone sweep passes with `/device` (empty and prefilled) | no | confirmed | From `apps/web`: `npx playwright test e2e/mobile-sweep.mobile.e2e.ts --project phone` on the build from 21:33 (after the last source change) → 5 passed, exit 0; `e2e/pages.ts:140` lists both URLs |
| 23 | `<bdi>` and the decided grant's name, pinned by tests | no | confirmed | `previous.request.name` again → 1 failed; no `<bdi>` in the confirm step → 1 failed; `<span>` in the done step → 1 failed |
| 24 | The db tests pass everywhere, and the concurrency test no longer deadlocks on PostgreSQL | no | confirmed | `countWrongCode` (`kysely-device-grant-repository.ts:156-196`); the concurrency test 10/10 on PostgreSQL, no `40P01`; the three db files 40/40 on SQLite, PostgreSQL, MySQL and MariaDB |
| 25 | Voiding still voids every pending code at 5 and audits the count | no | confirmed | `services/device-grants.db.test.ts:431` on all four dialects |

**Overall:** met.

### Re-check 2 (adversarial: row 17, plus what the diff touches)

Witnessed: 2026-10-17 21:36 EDT, by a fresh agent (adversarial). Commit: b7bcc3da + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 17 | After 5 wrong codes a code can't be approved, even when guesses land after its look-up | no | confirmed | M5 alone → "never decides a grant with 5 wrong codes counted…" fails on SQLite and PG; probe-t4b (50 wrong codes from 5 accounts plus an approve; 8 wrong plus the right approve) → refused, `voided:5` on PG, MySQL and MariaDB |
| 19 | `countWrongCode` voids at exactly 5 on every dialect | no | confirmed | probe-t4c: after 4 → `pending:4`, the 5th → `voided:5`, one `auth.device_voided {count:1}`, on all four. M8 (`>= max`) → the voiding test fails; M9 (`failed_attempts` set first) → fails on MySQL and MariaDB, passes on PG |
| 20 | Only pending, unexpired rows are counted; voided rows stop counting | no | confirmed | probe-t4c: approved 0, denied 0, pending 3 after 3 wrong codes; voided rows stay at 5 |
| 21 | No deadlocks or errors under mixed load | no | confirmed | Storm (wrong codes from 5 people, 10 starts, 4 polls, 4 approves at once), 2 runs on PG, MySQL and MariaDB → 0 rejected; with 50 wrong codes on all four → 0 rejected, all grants voided |
| 22 | The device tests pass on every database | no | confirmed | 3 device db files → 41/41 on SQLite, PG, MySQL and MariaDB; `src/features/device` → 14 passed |

**Overall:** met.

## Task 5 — rmk login --web

Witnessed: 2026-10-17 21:39 EDT, by a fresh agent (blind). Commit: 1646ba38 + working tree (packages/cli, SPEC.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The rmk tests and typecheck pass | no | confirmed | `pnpm --filter @ronneai/rmk exec vitest run` → 23 files, 275 passed; typecheck exit 0 |
| 2 | `--web` sends `{client_id:"rmk", name}`, the name defaulting to `rmk on <host>` | no | confirmed | `web-login.ts:49-52`, `cli.ts`; the tests check both bodies |
| 3 | It prints the address, the code with its expiry, and "Waiting…" at once on stderr; stdout stays one JSON object | no | confirmed | Real process against a fake registry → the 3 lines on stderr at 263 ms; stdout one object |
| 4 | It opens `verification_uri_complete`, but not with `--no-browser`, over SSH, or on Linux without a display | no | confirmed | Mutations M3, M9, M10 → each fails a test |
| 5 | Opening the browser adds no dependency; a failure is ignored | no | confirmed | No change to `package.json` or the lockfile; `openUrl` catches; `openCommand` unit test for 3 platforms |
| 6 | Polling: `interval`, `slow_down` +5 s, a 429's `Retry-After` | no | confirmed | Waits `[5000,10000,15000,60000]`; M1, M2 → fail. Remark: after a 429 the interval stays at 60 s |
| 7 | Ctrl-C stops rmk, says so, exits 1 and saves nothing | no | partly | Real SIGINT with interval 20: "Stopped." at 1505 ms but exit at 20 407 ms: the timer keeps the event loop open. A Ctrl-C during a poll that returns the token still saves it |
| 8 | It stops on `access_denied`, `expired_token`, `invalid_grant`, `user_disabled` and its deadline, says which, exits 1, saves nothing; `token_limit` passes the message on | no | confirmed | `it.each` and the token-limit test; real process `deny` → exit 1, no config; M4 → fails |
| 9 | The deadline counts `expires_in` from rmk's own start | no | confirmed | Fake clock → stops after 119 polls |
| 10 | The token is saved with mode 0600; `--registry` as before; `cli-files.md` unchanged | no | confirmed | Real process → mode 600; M8 → 6 tests fail; `git diff HEAD -- docs/spec/cli-files.md` empty |
| 11 | Opening the browser for real on Windows (`cmd /c start`) | no | can't check here | Only the `openCommand` unit test ran; needs Windows |
| 12 | The fallback on `two_factor_required` / `password_sign_in_disabled`, with `--yes` | no | confirmed | M7, M11 → each fails its test |
| 13 | The `invalid_credentials` hint, and `--web` named without a terminal | no | confirmed | M6 → 2 tests fail |
| 14 | `--web` works without a TTY | no | confirmed | "works without a terminal" → exit 0, no questions |

**Overall:** not met: Ctrl-C waits for the current timer before exiting (7), and Windows wasn't checked (11). Also: a missing `interval` gives NaN waits.

### Re-check 1, the fixes

`Io.sleep` takes an abort signal and `waitFor` clears its timer on abort; Ctrl-C aborts it. A token that arrives after Ctrl-C isn't saved. A 429's wait applies to the next poll only. No `interval` means 5 s (RFC 8628). Tests for each.

### Re-check 1 (blind: rows 6, 7, 11, plus what the diff touches)

Witnessed: 2026-10-17 21:45 EDT, by a fresh agent (blind). Commit: 1646ba38 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The rmk tests and typecheck pass | no | confirmed | 23 files, 279 passed; typecheck exit 0 |
| 6 | `slow_down` adds 5 s and keeps it; a 429 waits once; no `interval` means 5 s | no | confirmed | Waits `[5000,10000,60000,10000]` and `[5000]`; mutations R4, R5 → each fails a test |
| 7 | Ctrl-C stops at once, exits 1, saves nothing, even when the last poll brings the token | no | confirmed | Real process, interval 20: SIGINT at 1503 ms, "Stopped." at 1504 ms, exit 1 at 1509 ms (20 407 ms before); R3 → a test fails |
| 7b | A test fails when the Ctrl-C fix is undone | no | partly | R1 (no `clearTimeout` in `waitFor`) and R6 (`sleep` without the signal) leave all tests green while the real probe hangs 20 s |
| 11 | rmk opens the page on Windows | no | can't check here | Only `openCommand` is unit-tested. Lead: Node quotes the `""` title for `cmd /c start` as `"\"\""`, which cmd may misread |

**Overall:** not met: no test pins the Ctrl-C fix (7b), and Windows wasn't run (11).

### Re-check 2, the fixes

Windows opens the page with `rundll32 url.dll,FileProtocolHandler <url>`: no shell parses the arguments. New tests: under fake timers, `waitFor` leaves no timer after an abort; every wait rmk makes gets the Ctrl-C signal (the fake `Io` records `sleepSignals`). 281 passed.

### Re-check 2 (blind: rows 7b and 11, plus what the diff touches)

Witnessed: 2026-10-17 21:48 EDT, by a fresh agent (blind). Commit: 1646ba38 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The rmk tests and typecheck pass | no | confirmed | 23 files, 281 passed; typecheck exit 0 |
| 7 | Ctrl-C still stops at once; a normal approval still saves with mode 0600 | no | confirmed | Real process: SIGINT at 1502 ms, exit 1 at 1507 ms, nothing saved; `grant` → exit 0, mode 600 |
| 7b | A test fails when the Ctrl-C fix is undone | no | confirmed | R1 → "leaves no timer behind after Ctrl-C" fails; R6 → "gives every wait the Ctrl-C signal" fails. Remark: R7 (a signal Ctrl-C never aborts) passed; the test now also checks the recorded signal is aborted after Ctrl-C |
| 11 | rmk opens the page on Windows with `rundll32 url.dll,FileProtocolHandler <url>`, no shell | no | can't check here | `openCommand("win32")` and its unit test; no cmd parsing is left, but nothing has run on Windows |

**Overall:** not met: row 11 waits for one run of `rmk login --web` on Windows (an address with `&` opens whole).
