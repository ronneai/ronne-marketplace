# 006 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Better Auth routes and settings.** `/api/auth/[...all]` with an allowlist of HTTP
  endpoints, the `nextCookies` plugin, `baseURL`, `secret` and `trustedOrigins` from `loadConfig`,
  session lifetimes, `ronne.*` cookies, Ronne's own login limiter (per email, plus per IP with
  `TRUST_PROXY`), the client IP rules, and a shared instance (`getAppAuth()`). A lint rule stops
  Better Auth imports outside `domains/identity`.
  *Done when:* tests cover the HTTP allowlist (sign-in over HTTP is a 404), the session and cookie
  settings, the limiter refusing the 6th attempt, and the proxy header being ignored unless
  `TRUST_PROXY=true`. The sign-in action that uses the limiter comes in task 3.

- [x] **2. Disabled users.** The `session.create.before` hook, and `getCurrentUser()` checking `disabled_at`.
  *Done when:* database tests show a disabled user can't sign in, and an existing session stops working.

- [x] **3. Identity actions.** `signIn` (with the login limiter), `getCurrentUser`, `requireUser`,
  `changePassword` (rules from 003, other sessions ended) and `signOut`.
  *Done when:* database tests cover each, including a wrong current password.

- [x] **4. Route protection.** `src/proxy.ts` (cookie present or redirect with `next`), the protected
  `(app)` layout with `requireUser`, the public routes, and a safe `next`.
  *Done when:* tests cover redirects for protected, public and setup-required paths, and reject
  `//evil.test` and `https://evil.test` as `next`.

- [x] **5. Sign-in page.** The form (server action), remember me, the "Forgot?" note, generic errors,
  the rate-limit message, and the CLI authentication panel, using 032's parts.
  *Done when:* render tests pass, and it works with JavaScript off (checked by hand, noted).

- [x] **6. Account pages.** `/account/password`, and sign-out in the user menu.
  *Done when:* render and action tests pass.

- [x] **7. Playwright.** Add `@playwright/test` after the dependency checklist. The e2e harness does
  build, `setup --yes` into a temp settings file, then `next start`. Tests: sign in, wrong password,
  remember me, sign out, change password. Add a CI job, `End-to-end (Chromium)`, following the
  documentation-only skip.
  *Done when:* the tests pass locally and in CI, and the job is proposed as a required check.

## Notes
- **Task 1 (2026-09-27): Better Auth settings and the HTTP routes.**
  - **Rate limit, changed from the draft spec (owner decision):** Better Auth's limiter runs only in
    its HTTP router, and the sign-in form calls `auth.api` from a server action, so it would have no
    limit. Next.js also keeps a client-sent `X-Forwarded-For` (it only fills the header when it's
    missing), so the IP can't be trusted without a proxy. Ronne has its own `LoginRateLimiter`
    (`models/login-rate-limiter.ts`): 5 attempts a minute per email, plus per IP with `TRUST_PROXY`.
  - **`/api/auth/*`** serves only `/get-session` and `/ok` (`HTTP_ENDPOINTS`). Better Auth's
    `disabledPaths` matches exact paths only (it can't cover `/callback/:id`), so it's an allowlist
    in `actions/auth-http.ts`. A test walks every endpoint Better Auth has and expects a 404 for
    the rest, so a new endpoint in an upgrade stays closed.
  - **Sessions:** 30 days with "Remember me", refreshed at most daily. Without it, a browser-session
    cookie, and Better Auth ends the session after a day. The draft's "7 days by default" had no
    case where it applied, so it's gone. Cookies are `ronne.*`, and `__Secure-ronne.*` over https.
  - **Found on the way:** spreading `authSchema` after the settings replaced the `session` key, so
    the lifetimes were ignored (the test caught a 7-day cookie). They're merged now.
  - **`getAppAuth()`** (`repositories/auth-instance.ts`) caches one instance per settings on
    `globalThis`, with one shared limiter.
  - **Lint:** `noRestrictedImports` bans `better-auth` and `@better-auth/*` in `apps/web` outside
    `src/server/domains/identity`. The migration test is the one exception, with a comment: it
    compares the migration with Better Auth's own schema.
- **Task 2 (2026-09-27): disabled users.**
  - **`databaseHooks.session.create.before`** asks the repository's new `findActiveUser()` and
    refuses the session when the user is disabled (or missing), so sign-in fails like a wrong
    password.
  - **`getCurrentUser(headers)`** (`actions/session.ts`, `services/session.ts`) reads the user again
    on every call through `findActiveUser()`. Disabling someone, or changing their role, applies on
    their next request. A role outside root, moderator and user gets no access.
  - **Layers:** the service depends on a `SessionStore` interface (`repositories/session-store.ts`),
    which Better Auth implements. Tests build an `AppAuth` with `testing/test-auth.ts`.
- **Task 3 (2026-09-27): identity actions** in `actions/session.ts`, over `services/session.ts`.
  - **`signIn`** normalises the email and refuses junk (a bad email, an empty password or one over
    128 characters) before hashing. Then it applies the limiter and calls Better Auth. Wrong
    password, unknown email and disabled user all return `invalid_credentials`.
  - **Disabled users, fixed from task 2:** the session hook returned `false`, which Better Auth turns
    into a 500 ("Failed to create session"). It now throws the same 401 as a wrong password.
  - **`requireUser`** redirects to `/sign-in?next=…`, taking the path from the `x-ronne-path`
    header that `src/proxy.ts` will set (task 4).
  - **`changePassword`** needs a session and applies the 003 length rules. Wrong current passwords
    count against the same per-email limit as sign-in, so a stolen session can't be used to guess the
    password. Better Auth's `changePassword` isn't bound to a "fresh" session, so it works on a
    30-day session. With `revokeOtherSessions`, it ends every session and starts a new one for this
    browser.
  - **`signOut`** ends the session, and does nothing without one.
- **Task 4 (2026-09-27): route protection.**
  - **`src/proxy.ts`** redirects a page request without a `ronne.*` session cookie to
    `/sign-in?next=…`, and otherwise sets `x-ronne-path` (replacing any value the client sent). Its
    matcher skips `/api/*` (API routes answer with their own status codes), `_next` assets and the
    icons. It imports only `models/route-guard.ts` and `models/session-cookie.ts`, which are plain code.
  - **The `(app)` layout** calls `requireUser`, which checks the session in the database, and passes
    the user to the shell. `/styleguide` now gets the real user (root-only in production).
  - **`safeNextPath`** accepts only a path starting with a single `/`, with no backslash. It parses
    the path and checks the origin again, because the URL parser drops tabs and newlines
    (`/\t/evil.test` becomes `//evil.test`). It never returns sign-in itself.
  - **Checked live** (`next start`): `/`, `/account/password?x=1` and `/styleguide` redirect with
    `next`; `/api/health`, `/api/auth/get-session` and `/icon.svg` pass; `/api/auth/sign-in/email`
    is a 404; a forged session cookie gets past the proxy and is sent to sign-in by the layout.
  - **Found for task 7:** Next.js loads `apps/web/.env` into the environment on its own, so a server
    started with `RONNE_ENV_FILE` pointing elsewhere still sees a developer's local `DATABASE_URL`.
    The end-to-end harness must run where that file doesn't apply. Before setup, the root layout
    still shows the setup screen on every page, as its test covers.
- **Task 5 (2026-09-27): sign-in page** (`app/sign-in/page.tsx`, `features/sign-in/`).
  - **The form** is a client component using `useActionState` over the `signInFromForm` server
    action. It keeps the email after an error, never the password. "Forgot?" is a native
    `<details>` with the reset note, so it needs no JavaScript. The CLI panel uses `CopyableCommand`
    and links to Access tokens.
  - **Checked live without JavaScript** (`next start`, posting the form's own hidden
    `$ACTION_*` fields with curl, as a browser without scripts would). The Chrome extension wasn't
    connected, so there are no screenshots.
    - A wrong password returns the page with `ERR: Email or password is wrong`, and keeps the email.
    - The right one gives a 303 to `next` and a `ronne.session_token` cookie with
      `Max-Age=2592000`, `HttpOnly` and `SameSite=lax`.
    - The 6th attempt for one email shows "Too many attempts, wait a minute".
    - Signed in, `/sign-in?next=/styleguide` redirects to `/styleguide`, and `next=//evil.test`
      redirects to `/`. The header shows root's email and the Admin link.
  - **Before setup:** `/` goes to `/sign-in`, which shows the setup screen. The page ran
    `getCurrentUser` anyway and logged "isn't set up yet" errors, so `getCurrentUser` now returns
    null on an unconfigured instance (`getAppAuthIfConfigured`). Rechecked: no errors.
  - **Local testing note:** `next start` loads `apps/web/.env`, and environment variables take
    precedence in `loadConfig`. The throwaway instance was started with its values exported.
- **Task 6 (2026-09-27): account pages.**
  - **`/account/password`** (`features/account/`): current, new and confirm, each with show/hide.
    Errors sit next to their field, and the rate limit shows as a notice. A confirmation that doesn't
    match never reaches the server. On success: "Password changed. You're still signed in here;
    other sessions were signed out."
  - **Sign-out:** the (app) layout passes `signOutFromMenu` to the shell's user menu. It ends the
    session, clears the cookie and goes to `/sign-in`.
  - **Bug found live, and fixed:** after changing the password, the page redirected to sign-in.
    Better Auth replaces the session and its cookie. Next.js re-renders the page with the new
    cookie in `cookies()`, but `headers()` keeps the original Cookie header (its source has a TODO
    on this). The layout read the old, deleted session. `server/http/request-headers.ts` rebuilds
    the Cookie header from `cookies()`, and every page, layout and action uses it.
  - **Checked live without JavaScript** (`next start`, curl posting the forms):
    - A wrong current password shows its error.
    - A change keeps this browser signed in with a new cookie, signs the other browser out, and
      only the new password signs in.
    - Sign-out answers 303 to `/sign-in` and clears the cookie; the old cookie then gets a 307.
    - Protected pages are sent with `Cache-Control: private, no-cache, no-store`, so the back button
      reloads them (and redirects) rather than showing a cached copy.
  - The home page no longer says sign-in is coming.
- **Task 7 (2026-09-27): Playwright.**
  - **`@playwright/test` 1.63.0**, a dev dependency of `apps/web`. The dependency checklist:
    - Need: end-to-end tests in a real browser (MVP §9.1). Nothing in the repo does this.
    - License: Apache-2.0 for all three packages (`@playwright/test`, `playwright`,
      `playwright-core`), plus `fsevents` (MIT, optional, macOS). `pnpm licenses:check` passes.
    - Health: Microsoft, released monthly; 1.63.0 came out on 2026-09-04.
    - Advisories: `pnpm audit --audit-level high` finds none.
    - Install scripts: none. Browsers are downloaded only by an explicit `playwright install`,
      never on `pnpm install`.
    - Weight: 5 packages.
  - **The harness** (`e2e/harness.ts`, run from `playwright.config.ts`) makes one instance per run:
    - SQLite in a temporary folder, configured by `pnpm run setup --yes` with a test root, and one
      seeded user per test (`e2e/seed.ts`), so the per-email limit never trips across tests;
    - `next start` on a free port, with every setting passed as an environment variable, so a
      developer's `apps/web/.env` (which Next.js loads by itself) is never used;
    - `pnpm test:e2e` runs `next build` first.
  - **Tests** (`e2e/auth.e2e.ts`): sign in and come back to `next`; wrong password and unknown email
    give the same error; remember me (a 30-day cookie, or a session cookie); sign out and the back
    button; change password (wrong current, then success: this browser stays, the other is signed
    out, and the new password works). 5 pass locally in about 3 seconds after the build.
  - **Two fixes on the way:**
    - Through `pnpm exec`, Playwright's stop signal never reached `next-server`, so the run didn't
      end. The server is now started with `node_modules/.bin/next`.
    - Next.js's route announcer is also `role="alert"`, so the tests match the error notice by its
      `ERR:` prefix.
  - **CI:** a new `End-to-end (Chromium)` job in `ci.yml`. It installs Chromium with
    `--with-deps`, and its steps skip on documentation-only pull requests like the other checks.
    **Proposed:** add it to `main`'s required checks once it has passed on the pull request.
  - Playwright's output (`playwright-report/`, `test-results/`) is git-ignored.
- **Done (2026-09-27):** merged in #22. The `End-to-end (Chromium)` job passed on that pull request
  (about a minute), so every acceptance criterion is met. Proposed to the owner: make it a required
  check on `main`.

