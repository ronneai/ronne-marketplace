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
