# 009 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Token model.** Generate `rmk_` tokens, hash them, a format check, lifetimes, limits, and the
  domain errors (`TokenLimitError`, `TokenNameTakenError`), in `domains/identity`.
  *Done when:* unit tests cover the format, hashing and lifetime math.

- [ ] **2. Token repository and services.** Create, list your own, revoke, look up by hash with the
  user, and a throttled `last_used_at` update. Each change records its 007 event in its transaction.
  *Done when:* database tests cover create, list, revoke, lookup, the limits, and the once-a-minute update.

- [ ] **3. Bearer guard and API errors.** `server/http/require-token.ts`, and error mapping to MVP
  §11 with `WWW-Authenticate` and `no-store`.
  *Done when:* tests cover each failure code, a valid token, a disabled user, and cookies being ignored.

- [ ] **4. API routes.** `POST` and `DELETE /api/v1/auth/token` and `GET /api/v1/me`. The password
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

