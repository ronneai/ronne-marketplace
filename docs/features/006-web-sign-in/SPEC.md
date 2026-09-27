# 006 — Web sign-in, sign-out and change password

> Milestone: M1 · Depends on: 003, 032 · Design: [MVP §9.5](../../MVP/MVP.md#95-auth), [§8](../../MVP/MVP.md#8-web-application)
> · Mock: `ronne_ai_marketplace_sign_in_cli_auth*` in the local, git-ignored `docs/UI-Mocks-Materials/`. The layout is described below.

## Goal

People with an account can sign in to the web app with their email and password, stay signed in,
change their password and sign out. Every page except sign-in requires a session. Better Auth does
the work behind the `identity` domain, as configured in 003.

## Scope

**In:**
- Better Auth's HTTP routes at `/api/auth/[...all]`, limited to an allowlist (`/get-session`, `/ok`),
  plus the `nextCookies` plugin so server actions can set cookies. Signing in, signing out and
  changing the password are server actions only.
- The sign-in page `/sign-in`: email, password (with show/hide), "Remember me (30 days)",
  "Forgot?", and the "CLI authentication" panel from the mock.
- Sign-out from the user menu (032).
- `/account/password`: change your own password.
- Route protection: signed-out visitors go to `/sign-in?next=…`, and back afterwards.
- **Disabled users can't sign in,** and they lose their sessions (the check is also enforced per request).
- Login rate limiting (MVP §9.5).
- Playwright end-to-end tests, set up here for M1 and later (MVP §9.1).

**Out:**
- Signing in to the web with a personal token (owner decision, 2026-09-27). Tokens are machine credentials for `rmk` and the MCP server (009).
- Self-service password reset by email: the MVP has no email. "Forgot?" explains who can reset (owner decision). Root resets users in 008, and root itself uses `pnpm run reset-root-password`.
- Creating and managing users → 008. Access tokens → 009. Audit events → 007 (006 calls it once it exists).
- SSO → post-MVP (§14.3).

## Behaviour

**Better Auth setup** (extends `createAuth` from 003, in the `identity` domain):
- **`baseURL`** comes from `PUBLIC_URL` and **`secret`** from `AUTH_SECRET` (`loadConfig`).
  `trustedOrigins` is `PUBLIC_URL`. One instance per config, shared like `getAppDb`.
- **Sessions:** refreshed at most once a day while in use (`updateAge`).
  - **"Remember me" checked:** 30 days (`expiresIn`), as in the mock.
  - **Unchecked:** a browser-session cookie (Better Auth's `rememberMe: false`), and the session
    ends after one day at most on the server.
- **Cookies:** named `ronne.*` (`cookiePrefix`), `httpOnly` and `SameSite=Lax`. `Secure`, with the
  `__Secure-` prefix, when `PUBLIC_URL` is `https://`.
- **HTTP endpoints:** `/api/auth/*` serves only `/get-session` and `/ok`; every other Better Auth
  endpoint (sign-in, sign-up, password changes and resets, account changes) returns 404.
- **Rate limit (owner decision, 2026-09-27):** Ronne's own limiter in the identity domain, used by
  the sign-in action: 5 attempts a minute **per email**, always, and **per client IP** too when
  `TRUST_PROXY=true`. An attempt is refused when any of its keys is used up.
  - **Why not Better Auth's limiter:** it only runs on its HTTP routes, and the sign-in form is a
    server action that calls `auth.api` directly.
  - **Why not per IP by default:** `next start` fills `X-Forwarded-For` only when the request has
    none, so without a proxy a client can send any address and dodge an IP limit.
  - **The trade-off:** someone hammering one email locks that account out for up to a minute.
  - It keeps counts in memory, which suits one instance (the MVP's model). A shared store is future
    work if Ronne runs as several instances.
- **Client IP behind a proxy:** with `TRUST_PROXY=true`, the rightmost `X-Forwarded-For` entry
  (the one the proxy added) is the client IP, for the limiter and the session's `ip_address`.
  Without it, the header is ignored and no IP is recorded (`disableIpTracking`). This is where the
  setting documented in 005 takes effect.
- **Disabled users:**
  - a `databaseHooks.session.create.before` hook refuses to create a session when `user.disabled_at` is set;
  - `getCurrentUser()` also returns nothing for a disabled user, so an existing session stops working at once;
  - sign-in shows the same generic error as a wrong password, so it doesn't reveal which accounts exist.

**`identity` actions** (the rest of the app never imports Better Auth):
- `getCurrentUser(headers)`: `{ id, email, name, role }` or `null`.
- `requireUser(headers)`: the same, or a redirect to sign-in.
- `changePassword(headers, { current, next })`: validates the new password with the 003 rules
  (12–128 characters), and ends the user's other sessions (`revokeOtherSessions: true`). The current session stays signed in.
- `signOut(headers)`.

**Route protection:**
- **`src/proxy.ts`** (Next 16's name for middleware) only checks that a session cookie *exists*, and
  redirects to `/sign-in?next=<path>` when it doesn't. The Next docs warn against shared modules and
  database work there.
- **The real check** is `requireUser()` in the protected layout (`app/(app)/layout.tsx`), on the server.
- **Public:** `/sign-in`, `/api/auth/*`, `/api/health`, static assets, and the setup-required screen.
- **`next` is only followed when it's a relative path on this site** (it starts with `/` but not
  `//`). Anything else goes to `/`, so it can't be used as an open redirect.

**Sign-in page** (from the mock, in the 032 design system):
- A card with the full brand (monogram and wordmark, owner decision), "Sign in to Ronne", and the subtitle "Use your email and password".
- Fields: **Email** (no usernames exist, so the mock's "Email or Username" becomes "Email"),
  **Password** (with show/hide), and **Remember me (30 days)**.
- **"Forgot?"** opens a note: "Ask a root administrator to reset your password. If you're root, run
  `pnpm run reset-root-password` where Ronne is installed." No email is sent.
- **Errors:** a mono `ERR:` notice with "Email or password is wrong" (the same text for unknown,
  disabled and wrong password), or "Too many attempts, wait a minute" when rate-limited.
- **The "CLI authentication" panel** below the card, as in the mock:
  - `rmk login`, which asks for your email and password (009);
  - `rmk login --token <token>`, with a link to Access tokens;
  - `rmk whoami`.

  These are CopyableCommand parts. They describe what 009 and 022 deliver.
- It works without JavaScript: a server action form. The show/hide button needs JavaScript and degrades.
- An already signed-in visitor goes straight to `next` or `/`.

**Change password** (`/account/password`): current password, new password, and confirm. On success,
"Password changed. You're still signed in here; other sessions were signed out." A wrong current
password shows `ERR:` and changes nothing.

**Sign-out:** a server action that ends the current session and goes to `/sign-in`.

**End-to-end tests** (Playwright, Apache-2.0; `@playwright/test` goes through the dependency checklist):
- `apps/web/e2e/`. Each run builds the app, runs `pnpm run setup --yes` into a temporary
  `RONNE_ENV_FILE` with SQLite, starts `next start` on a free port, and signs in as that root.
- **Chromium only in CI,** to keep it fast. A new CI job, `End-to-end (Chromium)`, is skipped for
  documentation-only pull requests like the others.
- **Browsers:** they come from Playwright's own download. The install step adds them to CI with
  `playwright install --with-deps chromium`, and the dependency policy's install-script rules are
  checked for it.

## Edge cases

- **The setup-required mode (005) comes first:** before setup, every page, `/sign-in` included,
  shows the setup screen.
- **Session for a deleted or disabled user:** `getCurrentUser()` checks `disabled_at` on every call,
  so disabling (008) takes effect on the user's next request, even with a valid cookie.
- **`AUTH_SECRET` changes:** every session becomes invalid, and people sign in again (documented in `.env.example`).
- **Clock skew:** session expiry uses the database's stored times, written in UTC (002).
- **Big or odd input:** email over 255 characters or a password over 128 is rejected before hashing (no expensive work for junk).

## Acceptance criteria

- [ ] With the right email and password, a user lands on `next` (or `/`) and sees their email and role in the header.
- [ ] Wrong password, unknown email and disabled user all show the same error, and none creates a session.
- [ ] The 6th sign-in attempt within a minute for one email (or, with `TRUST_PROXY=true`, from one IP) gets the rate-limit message.
- [ ] Every page except the public ones redirects signed-out visitors to `/sign-in?next=…`, and `next` never leads off-site.
- [ ] "Remember me" gives a 30-day session; unchecked gives a browser-session cookie.
- [ ] Changing the password needs the current one, applies the length rules, keeps this session and ends the others.
- [ ] Sign-out ends the session; the back button doesn't show protected pages.
- [ ] Disabling a user (008, or directly in the database for this feature's tests) ends access on their next request.
- [ ] `TRUST_PROXY=true` makes the rate limit use `X-Forwarded-For`; without it, the header is ignored.
- [ ] `/api/auth/*` serves only the allowlisted endpoints; sign-in and sign-up over HTTP return 404.
- [ ] Playwright covers sign in, wrong password, sign out and change password, and runs in CI (Chromium).
- [ ] No Better Auth import outside `domains/identity` (lint rule).

## Open questions

- None.
