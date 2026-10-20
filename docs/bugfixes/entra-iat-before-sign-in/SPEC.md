# Entra sign-in refused: `iat outside the sign-in`

**Belongs to:** 106 (Identity providers and OIDC sign-in). **Status:** fixed on the branch; the real Entra check is the owner's.
**Branch:** `bugfix/106-entra-iat`.

## Report

A real sign-in through Microsoft Entra ID fails at the callback `/api/auth/sso/callback/entra`:

```
auth.sso_failed provider=entra reason=invalid_response detail="callback: iat outside the sign-in"
```

*Test sign-in* sometimes succeeds. It runs the same `complete()` as a real sign-in
(`actions/sso.ts`, `actions/test-sign-in.ts`), so the difference is the token, not the code path.

## Cause

`oidc-provider-type.ts`, in `complete()`, refuses an ID token whose `iat` is earlier than
`startedAt − 300 s` (when the sign-in began, kept in the `verification` row's `created_at`) or later
than `now + 300 s`.

- Units are all seconds, the database keeps the start time as UTC, and the server clock matches
  Microsoft's to the second (checked against the `Date` header of `login.microsoftonline.com`,
  2026-10-20). The "future" side did not fire.
- Entra documents `iat` as when the authentication occurred. A browser that still has an Entra
  session gets an ID token with an `iat` from that earlier login, which can be hours or days before
  this sign-in started. The lower bound refuses it.
- *Test sign-in* passes when the root user has just logged in to Entra, so the `iat` is recent.

Confidence: about 90%. The log line carries no timestamps, so it was not observed directly.

## Goal

An Entra sign-in works whether or not the browser already has an Entra session, without weakening
what ties an ID token to one sign-in.

## Behaviour

- `complete()` refuses an `iat` later than `now + 300 s` (a forged token or a broken clock), as now.
- `complete()` no longer refuses an `iat` for being old.
- Freshness is bound by what is already checked:
  - the **nonce**, generated per sign-in, kept on the server and checked by `oauth4webapi`;
  - the **state**: a single-use row, deleted when taken, expiring after 10 minutes, matched to a
    cookie in the same browser;
  - **PKCE (S256)**: only the browser that started the sign-in can exchange the code;
  - `exp`, `iss`, `aud` and the **signature** (always, via `validateApplicationLevelSignature`).
- `startedAt` has no other use, so it leaves `complete()` and `takeState()`.
- The error says which side failed (`callback: iat in the future`) and logs no claim or token.

## Not changed

- The 5-minute leeway on `exp` and `nbf`, and the upper bound on `iat`.
- A "the person must have authenticated recently" rule. OIDC's tool for it is `max_age` and
  `auth_time`, which would be its own feature.

## Edge cases

- `iat` missing or not a number: `oauth4webapi` refuses it before this check.
- A token from before the sign-in, replayed: refused by the nonce (it can't carry this sign-in's),
  the state (used once) and the code (used once, bound to the verifier).

## Documentation

None. Nothing people see or do changes, except that Entra sign-in works. `106/SPEC.md` is updated
here (lines on `iat` and on clock skew), because the behaviour it describes changes.

## Acceptance criteria

- [ ] An ID token with an `iat` 30 days old signs in.
- [ ] An ID token with an `iat` 10 minutes or 1 year in the future is refused as `invalid_response`.
- [ ] No `startedAt` remains in `complete()`, `takeState()` or their callers.
- [ ] `106/SPEC.md` says `iat` is only checked against the future, and why.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.

## Decisions

- **Drop the lower bound, don't widen it.** Entra sessions last up to 90 days, so any window would
  break again.
- **Folder:** `docs/bugfixes/`, as asked. Other bugs live in `docs/issues/` and are named by their
  GitHub issue number; this one has none yet.

## Open questions

- Should the bug get a GitHub issue, and move to `docs/issues/NNN-…` (so `pnpm witness:check`
  covers it)?
