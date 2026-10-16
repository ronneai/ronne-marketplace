# 107 — `rmk login --web`: the device flow

> Milestone: M16 · Depends on: 106, 105, 009, 022, 027 · Design: [MVP §14.3](../../MVP/MVP.md#143-sso--planned-as-m16), [§6](../../MVP/MVP.md#6-cli--rmk) · Contracts: [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

`rmk` and the MCP setup work for people who have no password in Ronne (they sign in with their
company's provider, 106) or whose password sign-in asks for a second step (105). `rmk login --web`
prints a short code and an address, the person approves it in the browser where they are already
signed in, and `rmk` receives a personal access token, the same token as before (009).

## Scope

**In:**
- **The device flow of RFC 8628**, on the API: `POST /api/v1/auth/device/code` and
  `POST /api/v1/auth/device/token`.
- **`rmk login --web`** (and `--no-browser`): asks for a code, opens the verification page (or only
  prints it), waits, stores the token as `rmk login` does today.
- **`/device`**, the page where a signed-in person enters or confirms the code and approves or
  denies it. A signed-out visitor signs in first (with whatever the instance allows: password,
  second step, provider) and comes back to the same code.
- **`rmk login` points the way:** when the exchange answers `two_factor_required` (105) or
  `password_sign_in_disabled` (106), `rmk` says why and continues with the device flow after one
  Enter (or `--yes`); on `invalid_credentials` it adds "Signed up with your company? Use
  `rmk login --web`".
- **`rmk mcp-setup` without a token** offers `rmk login --web` first (027), and `rmk-mcp` tells a
  signed-out person to run it.
- **Account › Access tokens** lists these tokens like any other, named `rmk on <host>`, and shows
  how it was made (*browser approval*).
- **Audit events** (007): `auth.device_started` (anonymous, with the request's address),
  `auth.device_approved`, `auth.device_denied`, `auth.device_expired`, and
  `access_token.created { via: "device" }` on exchange.

**Out** (and where it goes instead):
- **Other clients using the device flow.** `client_id` is always `rmk` (and `rmk-mcp`, the same
  tool); a general OAuth server for third parties is not planned.
- **Refresh tokens.** The token is a personal access token with the usual lifetime (009); there is
  nothing to refresh.
- **Approving from another device by scanning a QR code.** The code and the address are enough.
- **Browser loopback login** (the mock's old idea): the device flow covers it without a local server.

## Behaviour

**Starting.** `rmk login --web [--registry <url>] [--name <token name>]` calls
`POST /api/v1/auth/device/code` with `{ "client_id": "rmk", "name"? }` (name defaults as in 009:
`rmk on <host>`). The response:

```json
{ "device_code": "…", "user_code": "WDJB-MJHT", "verification_uri": "https://ronne.example/device",
  "verification_uri_complete": "https://ronne.example/device?user_code=WDJB-MJHT",
  "expires_in": 600, "interval": 5 }
```

`rmk` prints, on a terminal:

```
To sign in, open  https://ronne.example/device
and enter the code  WDJB-MJHT   (it expires in 10 minutes)
```

and opens `verification_uri_complete` in the default browser unless `--no-browser`, there is no
display, or the session is over SSH (it then prints only). The `user_code` is 8 characters from an
alphabet without look-alikes (no `0 O 1 I L`), shown as `XXXX-XXXX`; the `device_code` is 32 random
bytes, base64url, and only its SHA-256 hash is stored.

**Approving** (`/device`, signed-in people; 006's guard sends others to sign-in with
`next=/device?user_code=…`):
- With a code in the address, the page shows it for confirmation; without, an input.
- It shows **what asked**: "`rmk` on *host*" (the name), the time, and the client address when
  `TRUST_PROXY` is on, and the warning "Only approve if you just ran `rmk login --web` yourself."
- **Approve** and **Deny** are buttons in a server-action form (never a link that changes state,
  `docs/knowledge/links-that-change-state.md`). Approve binds the code to the signed-in user.
- A wrong, used or expired code says "That code isn't valid or has expired. Run `rmk login --web`
  again" and nothing about which of the three it was.
- **Brute force:** at most 5 wrong codes a minute per client address (when `TRUST_PROXY`) and 10 per
  person per hour, then 429; a code that has been tried wrongly 5 times in total is voided.

**Polling.** `rmk` calls `POST /api/v1/auth/device/token` with
`{ "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code", "client_id" }`
every `interval` seconds. Responses, as RFC 8628:

| Status | `error` | When |
|---|---|---|
| 400 | `authorization_pending` | not decided yet |
| 400 | `slow_down` | polled faster than `interval` (the interval grows by 5 s) |
| 400 | `access_denied` | the person pressed Deny |
| 400 | `expired_token` | past `expires_in` |
| 400 | `invalid_grant` | unknown or already used |
| 200 | — | `{ "token": "rmk_…", "id", "name", "expiresAt" }`, a **90-day** token, **once**: the code is spent |

A disabled user's approval is refused when they approve and again at exchange (`user_disabled`). The
response carries `Cache-Control: no-store`. `rmk` stops on a deadline, on `access_denied`, on
`expired_token` or on Ctrl-C, and says which.

**The server.** Better Auth's `deviceAuthorization` plugin issues and tracks the codes; its HTTP
routes stay off the allowlist (006) and the two `/api/v1/auth/device/*` routes are Ronne's own
adapters (the API's error shape, MVP §11). At exchange the adapter turns the approved grant into a
personal access token with the same service as 009, and ends the session the plugin made for the
exchange, so no web session is left behind. If task 1 finds the plugin unfit (below), a small
`device_codes` table does the same.

**Existing credentials.** `rmk login` (password) and `rmk login --token` are unchanged. The token
exchange answers `two_factor_required` and `password_sign_in_disabled` only after a right
password (105, 106), so those codes tell `rmk` which message to print without helping a guesser.

**`rmk` details.**
- No new dependency to open a browser: `open` on macOS, `xdg-open` on Linux, `start` on Windows,
  through the same child-process helper `rmk` already has; a failure is ignored (the address was
  printed anyway).
- Non-interactive use (`CI`, no TTY): `--web` prints the address and code and still waits, so a
  person on another screen can approve; `RMK_TOKEN` stays the way for CI.
- `--registry` and the stored registry work as in 022; the token is written to
  `~/.config/rmk/config.json` (mode `0600`) exactly as today.

## Edge cases

- **Approving the wrong code** (phishing): someone sends a victim a code; the page shows the
  requester's name, time and address, says to approve only your own, and every approval is audited
  with the request's address; the token appears in the victim's Access tokens by name and can be
  revoked (098's incident steps cover it).
- **Two people approve one code:** the first wins; the second sees the "isn't valid" message.
- **The browser is on another computer than the terminal:** works; the code is the link between
  them. That is the point of the flow.
- **The approving person signs out meanwhile:** the grant stands; the code was already bound.
- **A person with two-factor is held on enrolment (105):** `/device` redirects them to
  `/account/security` first, and comes back to the code afterwards.
- **A provider sign-in in the middle** (106): the visitor returns to `/device?user_code=…` through
  the same `next` rule as 006.
- **The server restarts while `rmk` waits:** the codes are in the database, so polling continues.
- **A clock difference** between `rmk` and the server doesn't matter: `rmk` counts `expires_in`
  from its own start and the server decides.
- **The 51st active token** (009): approval succeeds, exchange answers 400 `token_limit` with the
  usual message, and the code is spent; the person revokes one and runs `rmk login --web` again.
- **Revoked meanwhile:** an approved code whose user is disabled before exchange gives `user_disabled`.

## Documentation

- **Command line → Signing in to rmk** (the `rmk` page): `rmk login --web`, the code and the
  address, when to use it (company sign-in, two-factor), `--no-browser`, and what to do over SSH.
- **Access tokens** (account topic): tokens made by browser approval and how to recognise one.
- **Authentication** (106's topic): how company sign-in and the CLI fit together.
- **MCP** (`mcp` topic): `rmk mcp-setup` offers the web login.
- **API** (the token exchange's page): the two device endpoints and their errors.
- **Helpers:** on `/device`, "What is this code?" → the `rmk` page's section; on Account › Access
  tokens' CLI panel, a line for `rmk login --web`.
- The sign-in page's CLI panel (006, 009) gets `rmk login --web` as its fourth line.

## Acceptance criteria

- [ ] `rmk login --web` prints the code and the address, a signed-in person approves, and `rmk`
  stores a working 90-day token; `rmk whoami` then works.
- [ ] Deny, expiry, a wrong code, a reused code, polling too fast and a disabled user give the
  errors above and `rmk` explains each one.
- [ ] An SSO-only account (no password) and a two-factor account can log in with it; `rmk login`
  falls back to it with a clear message for both.
- [ ] The device code is stored only as a hash, the user code is not guessable in the allowed attempts
  (rate limits and voiding are tested), and approving is a POST form, never a GET link.
- [ ] No web session remains after an exchange, and none of the plugin's HTTP routes is reachable.
- [ ] `rmk mcp-setup` with no token offers the web login, and with one does not.
- [ ] The token is audited with `via: "device"`, the approval with the requester's details.
- [ ] Tests run on SQLite, PostgreSQL, MySQL and MariaDB; the `rmk` tests use a fake server; one
  end-to-end test drives the whole flow in the browser.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **The flag is `--web`, and `rmk login` falls back to it on its own** (Claude): a hidden mode
   switch would surprise people who type a password today, and the server can only say "use the
   browser" after a right password.
2. **The token is the same personal access token** (owner, 2026-10-06 design): everything that
   checks tokens (009, the MCP server) stays as it is.
3. **The plugin issues codes, Ronne's routes expose them** (Claude, task 1 decides): so the error
   shape and the audit are Ronne's.

## Open questions

- **Name of the token** from the browser: `rmk on <host>` is what 009 uses. Let the approver rename
  it on the `/device` page? (Left out: the name comes from `rmk`.)
