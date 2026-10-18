# 107 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Spike: the plugin.** [risky] Read the installed `deviceAuthorization` plugin: its table,
  code lengths and alphabet, the polling errors, what it returns at exchange (a session), whether
  the user code can be bound to a user at approval, and how it counts wrong codes. Decide in Notes:
  the plugin behind our routes, or a small `device_codes` table of our own (hashed device code,
  user code, user id, status, expiry, name, requester address).
  *Done when:* Notes name the choice with the evidence; either way the licence and audit checks pass.

- [x] **2. Storage and service.** [risky] The migration for all dialects (if needed), and the
  device-grant service: start, look up by user code, approve, deny, exchange (turning the approval
  into a token through 009's service, once), expiry, polling intervals, `slow_down`, the audit events.
  *Done when:* db tests cover every response in the table, a reused code, a disabled user, the
  token limit, two approvals at once, and that the stored device code is a hash.

- [ ] **3. The API routes.** [risky] `POST /api/v1/auth/device/code` and `/token` in the API's error
  shape, `no-store`, the rate limits, no cookie use; the plugin isn't loaded, so it has no routes.
  *Done when:* route tests cover each status above, malformed bodies, an unknown `client_id`, and that
  `/api/auth/device/*` returns 404.

- [ ] **4. `/device`.** [risky] The page (code input or prefilled, what-asked details, Approve and
  Deny as a POST form), sign-in and enrolment redirects keeping the code, the wrong-code messages
  and the attempt limits; Access tokens shows the *browser approval* origin.
  *Done when:* component and db tests cover approve, deny, a wrong code, the limits, a held user
  (105) and the sign-in round trip; the phone sweep passes.

- [ ] **5. `rmk login --web`.** The command: start, print, open the browser (no new dependency),
  poll with the interval and `slow_down`, deadline, Ctrl-C, store the token; `--no-browser`,
  `--name`, `--registry`; the fallback from `rmk login` on `two_factor_required` and
  `password_sign_in_disabled`, and the `invalid_credentials` hint.
  *Done when:* CLI tests with a fake server cover every response, the fallback messages and the
  config file's mode; `docs/spec/cli-files.md` needs no change (the file is the same).

- [ ] **6. MCP setup.** `rmk mcp-setup` without a token offers the web login; `rmk-mcp` says what
  to run when signed out.
  *Done when:* tests cover both, with and without a token.

- [ ] **7. End-to-end.** Playwright drives `/device` while a test process plays `rmk` against the
  built server: approve, deny, expiry, and with a two-factor account.
  *Done when:* `pnpm test:e2e` passes the spec on desktop and phone.

- [ ] **8. Documentation.** The pages and helpers in the spec, and the sign-in page's CLI panel.
  *Done when:* the docs render tests pass in ronne-web, the helper link test passes here, and the
  CLI panel's test shows the fourth line.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

**Task 1, the plugin (2026-10-17): a `device_grants` table of Ronne's own.** Read against the
installed `better-auth@1.7.7`, `dist/plugins/device-authorization/` (`routes.mjs` unless named),
and run in a throwaway probe (memory adapter, `auth.api.*` and `auth.handler`).

- **Its table** (`schema.mjs:3-49`) is `deviceCode`: `deviceCode`, `userCode`, `userId`,
  `expiresAt`, `status`, `lastPolledAt`, `pollingInterval`, `clientId`, `scope`; unique on both
  codes. No name, no requester address; adding fields means its `grant` extension API
  (`index.mjs:42-64`, and `grant.authorizeRequest` → `deviceCodeFields`, `index.d.mts:67-92`).
- **The device code is stored in clear** and looked up by equality (`:232-244`, `:290-296`). The
  probe: the stored value equals the returned one. `generateDeviceCode` (`:101-103`) can't help,
  since what it returns is both stored and sent. The spec wants only a hash stored: unfit.
- **Lengths and alphabet:** device code 40 characters of `a-zA-Z0-9` (`index.mjs:22`, `:714-716`);
  user code 8 characters of `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (`:9`, `:720-723`), which is 32
  characters without `0 O 1 I`, but it keeps `L`, which the spec excludes. Typed codes are
  upper-cased and stripped of anything not a letter or digit (`:46-48`).
- **Polling errors** (`:289-380`): `invalid_grant` (unknown or a client mismatch), `slow_down`,
  `expired_token` (and the row is deleted, so the next poll is `invalid_grant`),
  `authorization_pending`, `access_denied` (row deleted). `slow_down` doesn't grow the interval
  (probe: still 5000 ms after one), which RFC 8628 §3.5 asks for and the spec says.
- **At exchange it makes a web session** (`:455-475`, `createSession` and `setNewSession`) and
  returns the session token as `access_token`. Probe: sessions 1 → 2. (The exported
  `redeemDeviceCode`, below, would avoid it.)
- **Binding:** `GET /device` binds the code to whoever views it while signed in (`:528-550`), and
  approve refuses a code nobody viewed (`DEVICE_CODE_NOT_CLAIMED`, probe confirmed). So binding is
  at viewing, not at approval; the first viewer wins. The anonymous request can also pre-bind the
  code with `user_id` (`:71`, `:238`).
- **What would have helped it:** `redeemDeviceCode` is exported (`index.mjs:87`,
  `routes.d.mts:25-32`) and runs polling and the one-time claim without a session, and a custom
  `generateUserCode` (`index.mjs:25`) would drop `L`. Neither fixes the clear device code, the
  fixed interval, the first-viewer binding or the counting.
- **Wrong codes aren't counted.** The only limit is the rate-limit rule for the path `/device`
  (`index.mjs:72-78`), 5 per `expiresIn` window, which applies only to its HTTP route; nothing is
  voided.
- **Its routes are served** when the plugin is loaded: probe `POST /api/auth/device/code` → 200.
  Keeping them off would rely on the allowlist (006).

So the plugin would still need fixes for the hash, the interval, the binding and the counting,
with the exported helpers covering only the session, `L`, the name and the address. A table of our own is about one migration and one
service, and with the plugin not loaded no route of it exists. **Chosen: `device_grants`**
(SPEC.md *The server* and Decision 3). No dependency is added; `pnpm licenses:check` and
`pnpm audit --audit-level high` pass as before.

**Wrong codes, voided** (SPEC.md, *Brute force*): a wrong code can't be attributed to one grant,
so each wrong entry counts against every pending grant, and 5 void them. The cost: on a busy
instance, five typos within ten minutes (or a person doing it on purpose, which the per-person
limit, 10 an hour, and the audit bound) cancel others' pending codes, and they run
`rmk login --web` again. Only a well-formed code that matches no grant counts. Owner to confirm
(SPEC.md, Open questions). Rows stay a day past expiry, so a late poll still gets `expired_token`.

**Task 2, storage and service (2026-10-17).**

- `0027_device_grants` adds the table and `access_tokens.created_via` (`web`, `cli`, `device`; null
  before), which task 4 shows as *browser approval*. `createToken` now records it.
- `createWithFreeName` (token-exchange.ts) is shared by `rmk login` and the device flow, and cuts
  names by code points, so `(2)` never splits an emoji.
- Every grant update is one conditional statement wrapped in `retryOnDeadlock`: a wrong code's
  update of every pending row can deadlock with a decision on MySQL and MariaDB (the adversarial
  witness saw 3 in 160 races).
- The prune deletes only grants that are no longer pending or approved; the sweep (50 a start)
  marks and audits the others first, so no grant leaves without `auth.device_expired`.
- Test helpers: count audit rows in `audit_log` directly when there can be more than a page;
  `listAuditEvents` is paged.
