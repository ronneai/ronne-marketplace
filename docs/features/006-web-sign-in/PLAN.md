# 006 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [ ] **1. Better Auth routes and settings.** `/api/auth/[...all]` via `toNextJsHandler`, the
  `nextCookies` plugin, `baseURL`, `secret` and `trustedOrigins` from `loadConfig`, session
  lifetimes, the rate limit with a sign-in rule, `ipAddressHeaders` behind `TRUST_PROXY`, and a
  shared instance (`getAuth()`). A lint rule stops Better Auth imports outside `domains/identity`.
  *Done when:* tests cover sign-in through the handler, session expiry settings, the 6th-attempt
  limit, and the proxy header being ignored unless `TRUST_PROXY=true`.

- [ ] **2. Disabled users.** The `session.create.before` hook, and `getCurrentUser()` checking `disabled_at`.
  *Done when:* database tests show a disabled user can't sign in, and an existing session stops working.

- [ ] **3. Identity actions.** `getCurrentUser`, `requireUser`, `changePassword` (rules from 003, other
  sessions ended) and `signOut`.
  *Done when:* database tests cover each, including a wrong current password.

- [ ] **4. Route protection.** `src/proxy.ts` (cookie present or redirect with `next`), the protected
  `(app)` layout with `requireUser`, the public routes, and a safe `next`.
  *Done when:* tests cover redirects for protected, public and setup-required paths, and reject
  `//evil.test` and `https://evil.test` as `next`.

- [ ] **5. Sign-in page.** The form (server action), remember me, the "Forgot?" note, generic errors,
  the rate-limit message, and the CLI authentication panel, using 032's parts.
  *Done when:* render tests pass, and it works with JavaScript off (checked by hand, noted).

- [ ] **6. Account pages.** `/account/password`, and sign-out in the user menu.
  *Done when:* render and action tests pass.

- [ ] **7. Playwright.** Add `@playwright/test` after the dependency checklist. The e2e harness does
  build, `setup --yes` into a temp settings file, then `next start`. Tests: sign in, wrong password,
  remember me, sign out, change password. Add a CI job, `End-to-end (Chromium)`, following the
  documentation-only skip.
  *Done when:* the tests pass locally and in CI, and the job is proposed as a required check.

## Notes
