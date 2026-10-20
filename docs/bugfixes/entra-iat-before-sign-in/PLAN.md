# Plan: Entra sign-in refused: `iat outside the sign-in`

See [SPEC.md](./SPEC.md). Work on branch `bugfix/106-entra-iat`.

1. [x] **Tests first** (`identity/repositories/oidc-provider-type.test.ts`)
   - Replace "refuses an iat … from before the sign-in started" with two tests: an `iat` in the
     future by 600 s or 1 year is refused; an `iat` of −120 s, −1 h and −30 days is accepted.
   - Remove "measures the oldest iat from when the sign-in started, not from now".
   - *Done when:* the new accept test fails against the current code.
2. [x] **The fix** (`identity/repositories/oidc-provider-type.ts`)
   - Keep only `iat > now + CLOCK_TOLERANCE_SECONDS`, with the message `callback: iat in the future`
     and a comment saying why the lower bound is gone.
   - *Done when:* the tests in task 1 pass.
3. [x] **Remove `startedAt`**
   - Also from every `complete()` call in the tests (the type needs it until it is removed).
   - From `complete()`'s signature (`models/auth-provider-type.ts`), its caller (`actions/sso.ts`),
     `SsoRepository.takeState` (`repositories/sso-repository.ts`) and
     `kysely-sso-repository.ts` (also the `created_at` it selects).
   - *Done when:* `grep -rn startedAt` finds nothing in the sign-in code, and `pnpm typecheck` passes.
4. [x] **Docs:** update `docs/features/106-oidc-sign-in/SPEC.md` (the ID-token checks bullet and
   the *Clock skew* edge case).
   - *Done when:* neither says `iat` has a lower bound.
5. [x] **Checks:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, then commit
   `[bugfix] 106: Accept an Entra ID token whose iat predates the sign-in`.
   - *Done when:* all four pass. On a failure, stop and report. They ran in the pre-commit hook of
     the commits for tasks 1–2 and 3; tasks 1 and 2 are one commit, because the hook runs the whole
     test suite and a failing test can't be committed alone.
6. [ ] **Real check (the owner's):** sign in with Entra while the browser already has an Entra
   session more than 5 minutes old.
