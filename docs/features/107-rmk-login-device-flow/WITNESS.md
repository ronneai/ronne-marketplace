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
