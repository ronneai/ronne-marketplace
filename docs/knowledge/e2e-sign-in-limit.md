# End-to-end tests and the sign-in limit

Sign-in allows **5 attempts a minute per email** (006's limiter). The end-to-end tests run against
one instance, in one worker, in well under a minute, so every sign-in of the same email counts
toward the same window.

## What to do

- **Give each test its own user** (`apps/web/e2e/users.ts`, seeded by `e2e/seed.ts`). That's why
  the list is long.
- **Root is the exception:** there is only one root. Five test files already sign root in (`audit`,
  `auth`, `drafts`, `scopes`, `user-admin`). A sixth makes the last of them fail with the page stuck
  on `/sign-in`, while each passes when run alone.
- **A new root-only page goes into an existing root test.** 046 added Admin › Settings and first gave
  it its own `settings.e2e.ts`; the full run then failed `user-admin.e2e.ts`. Its checks now live in
  the root test of `audit.e2e.ts`, which also shows the change in the audit log. Check the 404 for
  other roles with a user a test already signs in.

## How to spot it

The failing test is the last root test in the run, its error is `expect(page).not.toHaveURL(/\/sign-in/)`,
and the server log shows no error for the sign-in. Run the file alone: if it passes, count root's
sign-ins.
