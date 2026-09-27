# 009 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Token model.** Generate `rmk_` tokens, hash them, a format check, lifetimes, limits, and the
  domain errors (`TokenLimitError`, `TokenNameTakenError`), in `domains/identity`.
  *Done when:* unit tests cover the format, hashing and lifetime math.

- [x] **2. Token repository and services.** Create, list your own, revoke, look up by hash with the
  user, and a throttled `last_used_at` update. Each change records its 007 event in its transaction.
  *Done when:* database tests cover create, list, revoke, lookup, the limits, and the once-a-minute update.

- [x] **3. Bearer guard and API errors.** `server/http/require-token.ts`, and error mapping to MVP
  §11 with `WWW-Authenticate` and `no-store`.
  *Done when:* tests cover each failure code, a valid token, a disabled user, and cookies being ignored.

- [x] **4. API routes.** `POST` and `DELETE /api/v1/auth/token` and `GET /api/v1/me`. The password
  exchange goes through Better Auth's verification with the 006 rate limit, and no web session.
  *Done when:* route tests cover the success and failure cases, including 429, and a secret-leak test.

- [ ] **5. `/account/tokens` page.** The table, the create dialog with a one-time panel, revoke, and
  the CLI panel, using 032's parts.
  *Done when:* render and action tests pass. Playwright: create a token, call `/api/v1/me` with it,
  revoke it, then get `token_revoked`.

## Notes
- **Task 1 (2026-09-27): token model** (`domains/identity/models/access-token.ts`).
  - **`generateToken()`** makes `rmk_` + 32 bytes from `randomBytes` in base64url: 47 characters.
    **`hashToken()`** is SHA-256 hex. **`isTokenFormat()`** checks `^rmk_[A-Za-z0-9_-]{43}$`.
  - **Names** are trimmed and 1–100 characters. **Lifetimes** are 30, 90 (the default) or 365 days,
    or `none`.
  - **Also:** `tokenExpiry`, `tokenStatus` (active, expired or revoked) and the limit of 50 active
    tokens.
  - **The errors:** `InvalidTokenNameError`, `InvalidTokenLifetimeError`, `TokenLimitError`,
    `TokenNameTakenError` (its field is `tokenName`, since `name` is `Error`'s) and
    `TokenNotFoundError`.
  - **Migration `0003_access_token_prefix`** adds `access_tokens.token_prefix` (`varchar(12)`,
    nullable).
    - **Why:** the spec's list shows each token's prefix, and 0001 stores only the hash.
    - **Is it safe?** The 12 plain characters (`rmk_` + 8) leave 35 secret ones, about 210 bits.
    - It passes on all four databases.
  - **Spec corrections:** the password exchange shares 006's limit (per email, and per IP only with
    `TRUST_PROXY`), not "per IP address"; and the prefix column is mentioned.
  - **Tests:** the format over 1,000 tokens, a known SHA-256 value, the preview, 9 malformed values,
    names, lifetimes, expiry and status.
- **Task 2 (2026-09-27): repository and services.**
  - **`TokenRepository`** (`repositories/token-repository.ts`, Kysely in
    `kysely-token-repository.ts`):
    - counting active tokens (not revoked, and no expiry or one still ahead), and checking active
      names;
    - insert, list your own (newest first), find one you own, and revoke;
    - `findByHash` with the owner, in one join;
    - `touchLastUsed`, a conditional update that writes only when `last_used_at` is null or over a
      minute old.
  - **Services** (`services/access-tokens.ts`):
    - **`createToken`** checks `account.manage_own`, the 50-active limit and duplicate active names,
      in one transaction with `access_token.created { name, expiresAt, via }`. Only the hash and the
      12-character prefix are stored.
    - **`listTokens`** and **`revokeToken`**: someone else's token is "not found", never
      "forbidden"; revoking twice records one event.
    - **`authenticateToken`** checks the format first (no database work for junk), then the hash,
      revoked, expired and a disabled user, and returns `token_missing`, `token_invalid`,
      `token_expired`, `token_revoked` or `user_disabled`.
  - **Actions** (`actions/access-tokens.ts`): `listMyTokens`, `createMyToken`, `revokeMyToken` and
    `authenticateToken`.
  - **Tests** (all four databases): the plain token only in the result; the hash and prefix stored;
    the lifetimes; a duplicate active name, which is allowed again after revoking; the 51st token;
    ownership; each failure code; and the once-a-minute update, on a clock that starts now (a fixed
    date could fall after the 90-day expiry).
- **Task 3 (2026-09-27): bearer guard** (`server/http/require-token.ts`).
  - **`bearerToken(headers)`** reads only `Authorization: Bearer <token>`. It ignores cookies, so the
    API is bearer only and cross-site request forgery doesn't apply.
  - **`requireToken(request)`** returns `{ ok, auth }` or `{ ok: false, response }`. Before setup it
    returns 503 `setup_required`.
  - **Failures** are 401 in the MVP §11 shape, with `Cache-Control: no-store` and
    `WWW-Authenticate: Bearer realm="ronne"`, plus `error="invalid_token"` when a token was sent.
    `errorResponse` gained an optional headers argument.
  - **The messages** point to Access tokens or `rmk login`. `token_invalid` has one message for
    malformed and unknown tokens.
  - **The guard's dependencies** (whether the instance is set up, and how to authenticate) are
    injectable: the real "is it set up?" check reads the developer's `apps/web/.env`, which CI
    doesn't have.
  - **Tests** (all four databases): the header parsing, a valid token, each failure code with its
    headers, cookies being ignored, 503 before setup, and the token never echoed in an error.
- **Task 4 (2026-09-27): API routes.** The handlers live in `server/http/api-v1.ts` and the routes in
  `app/api/v1/...`.
  - **`POST /api/v1/auth/token`** (`services/token-exchange.ts`):
    - **No web session.** The password is checked with the same argon2 hasher Better Auth uses,
      against the credential account (`IdentityRepository.findCredentialByEmail`).
    - **Timing:** an unknown email is still checked against a dummy hash, so it takes as long as a
      real account.
    - **Limit and failures:** it shares 006's limit. Every failure is the same 401
      `invalid_credentials`, and is recorded as `auth.sign_in_failed` with `via: "cli"`.
    - **Name:** the default comes from a `User-Agent` like `rmk/0.1.0 (laptop; …)`, giving
      `rmk on laptop`, or plain `rmk`. **022 should send that format.** Logging in again from the
      same machine gets `rmk on laptop (2)` and so on, never a name clash.
    - **Other answers:** 429 `rate_limited` with `Retry-After`; 409 `token_limit` for the 51st
      token; 400 `invalid_request` for a body that isn't a JSON object.
  - **`DELETE /api/v1/auth/token`:** guarded; revokes the calling token (204), and records
    `access_token.revoked { by: "owner" }`. The guard runs before the app instance is looked up,
    so before setup it answers 503, not an exception.
  - **`GET /api/v1/me`:** guarded; returns the user and the token's id, name and expiry.
  - **Every token response** is `Cache-Control: no-store`.
  - **Tests** (all four databases):
    - the exchange: a 90-day token, no session created, the audit event, and the same 401 for five
      kinds of failure;
    - the 429, the 400s and the name suffixes;
    - `/me` then `DELETE`, then `token_revoked`, and a missing token;
    - a secret-leak test: no password or plain token in any response, audit row or token row.

