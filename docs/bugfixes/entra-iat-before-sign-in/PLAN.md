# Plan: Entra sign-in refused: `iat outside the sign-in`

See [SPEC.md](./SPEC.md). Work on branch `bugfix/106-entra-iat`.

1. [ ] **Tests first** (`identity/repositories/oidc-provider-type.test.ts`)
   - Replace "refuses an iat … from before the sign-in started" with two tests: an `iat` in the
     future by 600 s or 1 year is refused; an `iat` of −120 s, −1 h and −30 days is accepted.
   - Remove "measures the oldest iat from when the sign-in started, not from now".
   - Drop `startedAt` from every `complete()` call.
   - *Done when:* the new accept test fails against the current code.
2. [ ] **The fix** (`identity/repositories/oidc-provider-type.ts`)
   - Keep only `iat > now + CLOCK_TOLERANCE_SECONDS`, with the message `callback: iat in the future`
     and a comment saying why the lower bound is gone.
   - *Done when:* the tests in task 1 pass.
3. [ ] **Remove `startedAt`**
   - From `complete()`'s signature (`models/auth-provider-type.ts`), its caller (`actions/sso.ts`),
     `SsoRepository.takeState` (`repositories/sso-repository.ts`) and
     `kysely-sso-repository.ts` (also the `created_at` it selects).
   - *Done when:* `grep -rn startedAt` finds nothing in the sign-in code, and `pnpm typecheck` passes.
4. [ ] **Docs:** update `docs/features/106-oidc-sign-in/SPEC.md` (the ID-token checks bullet and
   the *Clock skew* edge case).
   - *Done when:* neither says `iat` has a lower bound.
5. [ ] **Checks:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, then commit
   `[bugfix] 106: Accept an Entra ID token whose iat predates the sign-in`.
   - *Done when:* all four pass. On a failure, stop and report.
6. [ ] **Real check (the owner's):** sign in with Entra while the browser already has an Entra
   session more than 5 minutes old.
