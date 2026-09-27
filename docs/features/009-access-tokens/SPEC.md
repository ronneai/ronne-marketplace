# 009 — Personal access tokens

> Milestone: M1 · Depends on: 006, 007, 032 · Design: [MVP §6](../../MVP/MVP.md#6-cli--rmk), [§9.5](../../MVP/MVP.md#95-auth), [§11](../../MVP/MVP.md#11-rest-api-sketch-apiv1)
> · Mock: the "CLI authentication" panel in `ronne_ai_marketplace_sign_in_cli_auth*`

## Goal

`rmk` and the MCP server authenticate with personal access tokens, not passwords or browser cookies.
Users create and revoke their tokens in the web app, and `rmk login` can also get one by exchanging
an email and password. Every API request with a token is checked the same way, in one place.

## Scope

**In:**
- `/account/tokens`: list, create (shown once) and revoke your own tokens.
- API (MVP §11):
  - `POST /api/v1/auth/token`: email and password in exchange for a token, for `rmk login`;
  - `DELETE /api/v1/auth/token`: revoke the token making the request, for `rmk logout`;
  - `GET /api/v1/me`: the current user, for `rmk whoami` and `rmk login --token`.
- **The bearer guard** in `server/http/`, used by every later `/api/v1` route (019 onward).
- The API error shape (MVP §11) for authentication failures.
- Audit events (007).

**Out:**
- The `rmk` commands themselves → 022. This feature is the server side they call.
- Browser-based CLI login (the mock's "browser loopback") → with SSO, post-MVP (§14.3), as the device flow. Owner decision, 2026-09-27.
- Signing in to the **web** with a token: not supported (owner decision; see 006).
- Token scopes (read-only versus write): every token acts as its user, for now. Scopes can come once there are write APIs (M3 and later).
- Root viewing or revoking other users' tokens individually: 008 revokes them all on disable or reset.

## Behaviour

**Token format:** `rmk_` + 32 random bytes in base64url (43 characters), so 47 characters in all.
- **The prefix** makes tokens easy to recognize, and lets GitHub's secret scanning and push protection
  flag them once a custom pattern for `rmk_[A-Za-z0-9_-]{43}` is added.
- **Only the SHA-256 hex hash is stored** (`access_tokens.token_hash`, unique, 64 characters, from 0001).
  The plain token exists only in the response that creates it.
- **Lookup** is by the hash (unique index), so the plain token is never compared as a string.

**Lifetime:** chosen at creation: **30, 90 (default) or 365 days, or no expiry**. "No expiry" asks for
confirmation. A token is valid only when it isn't revoked or expired, and its user isn't disabled.

**Limits:** at most **50 active tokens per user**. Names are 1–100 characters and unique among the user's active tokens.

**`/account/tokens`** (every signed-in user, 032's parts):
- **Table columns:** name, prefix (`rmk_AbC1…`, the first 8 characters after the prefix, so tokens
  can be told apart; stored in `token_prefix`, migration `0003_access_token_prefix`), created, last used (or "never"), expires (or "no expiry"), status (`active`,
  `expired` or `revoked`), and a revoke button.
- **Create** (a dialog): name and lifetime. Then a one-time panel shows the token in a
  CopyableCommand, with "Copy it now: it won't be shown again", and a ready-to-use
  `rmk login --token rmk_…` line.
- **Revoke:** a confirm dialog, then `revoked_at` is set. It takes effect on the token's next request.
- The "CLI authentication" panel from the mock appears here too: `rmk login`, `rmk login --token`, `rmk whoami`.

**Bearer guard** (`server/http/require-token.ts`):
- **Reads** `Authorization: Bearer <token>`. It accepts only the `rmk_…` format; anything else
  fails before touching the database.
- **Hashes, then looks up** the token with its user in one query.
- **Checks** that it isn't revoked or expired, and that the user isn't disabled.
- **Returns** `{ user, token: { id, name } }` to the route.
- **Updates `last_used_at`** at most once a minute per token (a conditional update), so busy clients
  don't write on every request.
- **Failures** use the MVP §11 shape with a `WWW-Authenticate: Bearer` header:

  | Status | Code | When |
  |---|---|---|
  | 401 | `token_missing` | No `Authorization` header, or not `Bearer` |
  | 401 | `token_invalid` | Wrong format, or unknown |
  | 401 | `token_expired` | Past `expires_at` |
  | 401 | `token_revoked` | `revoked_at` is set |
  | 401 | `user_disabled` | The token's user is disabled (401 rather than 403, so the client signs in again) |

- **Unknown and wrong-format tokens get the same code and message,** so the error doesn't reveal
  whether a token existed.
- **Cookies are ignored on `/api/v1`:** it's bearer only. That also rules out cross-site request
  forgery on the API.

**`POST /api/v1/auth/token`** (for `rmk login`):
- **Request:** `{ "email", "password", "name"? }`. `name` defaults to `rmk on <host>` from `User-Agent` or `rmk`, capped at 100 characters.
- **The password is checked through Better Auth's verification,** without creating a web session.
  It shares the sign-in **rate limit** from 006: 5 attempts a minute per email, and per client IP
  when `TRUST_PROXY=true` (006's decision).
- **Responses:**
  - **201** `{ "token": "rmk_…", "id", "name", "expiresAt" }`, with a **90-day** lifetime;
  - **401** `invalid_credentials`, the same for unknown email, wrong password and disabled user;
  - **429** `rate_limited`.
- **Audit:** `access_token.created { via: "cli" }`. Failures are recorded as `auth.sign_in_failed`.

**`DELETE /api/v1/auth/token`:** bearer-guarded. It revokes the token that made the request, returns
**204**, and records `access_token.revoked { by: "owner" }`.

**`GET /api/v1/me`:** bearer-guarded. It returns `{ "id", "email", "name", "role" }` and
`{ "token": { "id", "name", "expiresAt" } }`.

**Transport:** the API sets `Cache-Control: no-store` on every token response. Tokens and passwords
are never logged. Request logging, when added, redacts `Authorization`.

## Edge cases

- **Token created, then the user is disabled:** the guard refuses it with `user_disabled`, and 008
  has already revoked it anyway.
- **Clock and expiry:** `expires_at` is stored in UTC, and compared with the server's time in the query.
- **Timing:** looking up by hash plus a unique index keeps response times similar for unknown and
  known-but-revoked tokens. The error codes differ on purpose, so a user knows to make a new one;
  that's acceptable, because telling them apart needs the token itself.
- **The 51st active token:** `TokenLimitError` ("Revoke an old token first").
- **Duplicate active name:** `TokenNameTakenError`.
- **The one-time panel** is in the server action's response only. Refreshing the page loses it, and that's intended.

## Acceptance criteria

- [x] Tokens are `rmk_` + 43 base64url characters; only SHA-256 hashes are stored; the plain token appears once.
- [x] `/account/tokens` lists, creates (with the lifetimes above) and revokes your own tokens, and records 007 events.
- [x] The guard accepts a valid token and refuses missing, invalid, expired, revoked and disabled-user tokens with the codes above, and `WWW-Authenticate`.
- [x] `last_used_at` is updated at most once a minute per token.
- [x] `POST /api/v1/auth/token` returns a 90-day token for correct credentials, the same 401 for wrong password, unknown email and disabled user, and 429 when rate-limited.
- [x] `DELETE /api/v1/auth/token` revokes the calling token (204), and the next call with it gets `token_revoked`.
- [x] `GET /api/v1/me` returns the user and the token's metadata.
- [x] The API ignores cookies; `/api/v1` with a session cookie and no bearer gets `token_missing`.
- [x] Limits: the 51st active token and a duplicate active name are refused.
- [x] Nothing logs or stores a plain token or password (a test inspects the audit metadata and the error responses).

## Open questions

- Add a GitHub secret scanning custom pattern for `rmk_[A-Za-z0-9_-]{43}`, so pushed tokens are caught? It's a repository setting for the owner, once this is merged.
