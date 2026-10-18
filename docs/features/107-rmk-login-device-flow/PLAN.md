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

- [x] **3. The API routes.** [risky] `POST /api/v1/auth/device/code` and `/token` in the API's error
  shape, `no-store`, the rate limits, no cookie use; the plugin isn't loaded, so it has no routes.
  *Done when:* route tests cover each status above, malformed bodies, an unknown `client_id`, and that
  `/api/auth/device/*` returns 404.

- [x] **4. `/device`.** [risky] The page (code input or prefilled, what-asked details, Approve and
  Deny as a POST form), sign-in and enrolment redirects keeping the code, the wrong-code messages
  and the attempt limits; Access tokens shows the *browser approval* origin.
  *Done when:* component and db tests cover approve, deny, a wrong code, the limits, a held user
  (105) and the sign-in round trip; the phone sweep passes.

- [x] **5. `rmk login --web`.** The command: start, print, open the browser (no new dependency),
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

- [ ] **9. No voiding on wrong codes.** [risky] The owner's answer to the open question
  (2026-10-17): wrong codes no longer void pending codes, since anyone signed in could cancel
  others' logins that way; the rate limits (5 a minute per address, 10 an hour per person) and 31⁸
  codes are enough. Take `failed_attempts` out of migration 0027 (not released yet) and the
  service, drop `auth.device_voided`, and update SPEC.md (Brute force, the polling table, Decisions,
  Open questions). Built after task 6, before the end-to-end test.
  *Done when:* no wrong code changes another grant; the limits still hold on the four databases;
  the audit catalogue and its summaries have no `auth.device_voided`; SPEC.md says the rate limits
  are the defence.

- [ ] **10. Windows check.** Moved out of task 5 by the owner (2026-10-17): nobody had Windows to
  run it on. On a Windows machine, run `rmk login --web` against an instance, with an address that
  has a `&` in it if possible, and check the browser opens the whole address
  (`rundll32 url.dll,FileProtocolHandler`, task 5).
  *Done when:* a witness pass on Windows records it, or the owner records the run.

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

**Task 3, the API routes (2026-10-17).**

- `server/http/device-api.ts` adapts both routes; `actions/device-grants.ts` wires the service and
  keeps the four limiters on `globalThis` (starts and polls, per address or one instance bucket).
- `verification_uri` is the auth instance's `baseURL` + `/device` (PUBLIC_URL, or localhost),
  never the request's host, so a hostile `Host` can't send people elsewhere.
- A new route segment must be added to `ROUTE_SEGMENTS` in `telemetry/sanitize.ts` (`code` and
  `device` here), or `route-segments.test.ts` fails. When committing a task while a later task's
  routes sit untracked, stash those first: the hook tests the working tree.
- The device flow is in the telemetry privacy scenario: the device code, the user code (with and
  without its dash) and the token never reach the collector.

**Task 4, `/device` (2026-10-17).**

- Opening `/device` only shows the code in an input: **Continue** is the POST that looks it up, then
  Approve or Deny. So a GET (a link, a prefetch, `rmk` opening the page) never counts a wrong code.
- The page's limits are in `actions/device-grants.ts` (`limitedEntry`): the check and the count
  happen with no `await` between, and a right code gives its count back (`LoginRateLimiter.release`).
  Checking, awaiting the database, then recording let 40 concurrent entries through on PostgreSQL
  and MySQL (the adversarial witness); SQLite hid it.
- `decide` also needs `failed_attempts < 5`, so guesses still in flight when a code was looked up
  still stop it.
- `holdPage` keeps the way back only for `/device` (`RETURN_AFTER_HOLD`): `hold.test.ts` needs
  `await holdPage();` first, so it reads the path from `x-ronne-path` itself.
- A held person can't use the page's action: `deviceCodeFromForm` is a plain `serverAction`
  (`held.test.ts`).
- Names are refused with `\p{Cf}` (bidi overrides) as well as `\p{Cc}`, and shown in `<bdi>`.

**Task 5, `rmk login --web` (2026-10-17).**

- `rmk` buffers a command's output until it ends; the code must show while it waits, so `Io`
  gained `notice` (stderr, at once), `openUrl`, `sleep` and `onInterrupt`, all faked in
  `testing.ts` (`notices`, `opened`, `slept`, `interrupt()`, and `onSleep` to move a clock).
- A wait must clear its timer on Ctrl-C (`waitFor` in io.ts): resolving the promise alone left the
  process alive until the timer ran out (the witness saw 20 s with a 20 s interval).
- Windows opens the page with `rundll32 url.dll,FileProtocolHandler <url>`, not `cmd /c start ""
  <url>`: Node quotes the `""` title argument in a way cmd may misread (the witness's lead, not
  run on Windows). `open` on macOS, `xdg-open` on Linux.
- `cli-files.md` needs no change: `--web` writes the same `{ token, email }` (the email from `/me`).
