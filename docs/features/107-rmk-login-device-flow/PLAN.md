# 107 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Spike: the plugin.** [risky] Read the installed `deviceAuthorization` plugin: its table,
  code lengths and alphabet, the polling errors, what it returns at exchange (a session), whether
  the user code can be bound to a user at approval, and how it counts wrong codes. Decide in Notes:
  the plugin behind our routes, or a small `device_codes` table of our own (hashed device code,
  user code, user id, status, expiry, name, requester address).
  *Done when:* Notes name the choice with the evidence; either way the licence and audit checks pass.

- [ ] **2. Storage and service.** [risky] The migration for all dialects (if needed), and the
  device-grant service: start, look up by user code, approve, deny, exchange (turning the approval
  into a token through 009's service, once), expiry, polling intervals, `slow_down`, the audit events.
  *Done when:* db tests cover every response in the table, a reused code, a disabled user, the
  token limit, two approvals at once, and that the stored device code is a hash.

- [ ] **3. The API routes.** [risky] `POST /api/v1/auth/device/code` and `/token` in the API's error
  shape, `no-store`, the rate limits, no cookie use; the plugin's own routes stay off the allowlist.
  *Done when:* route tests cover each status above, malformed bodies, an unknown `client_id`, and that
  `/api/auth/device/*` returns 404.

- [ ] **4. `/device`.** [risky] The page (code input or prefilled, what-asked details, Approve and
  Deny as a POST form), sign-in and enrolment redirects keeping the code, the wrong-code messages
  and the attempt limits; Access tokens shows the *browser approval* origin.
  *Done when:* component and db tests cover approve, deny, a wrong code, the limits, a held user
  (105) and the sign-in round trip; axe and the phone sweep pass.

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
