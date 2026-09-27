# 009 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [ ] **1. Token model.** Generate `rmk_` tokens, hash them, a format check, lifetimes, limits, and the
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
