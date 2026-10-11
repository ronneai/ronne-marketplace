# Better Auth in tests

When a Better Auth instance is created, it starts a check of the database schema: a query nothing
waits for (`createBetterAuth` in `better-auth/dist/auth/base.mjs`). The app makes one instance per
process, so it runs once and logs a mismatch if there is one. Tests make many: `testAppAuth(t)`
builds a new one on every call, and some tests call it once per request.

On a busy CI runner, one of those checks could still hold a connection from the test's pool when
the test ended. `cleanup()` closes the pool, which waits for every connection to come back, so the
`afterEach` hook timed out after 30 seconds. The next test's reset then terminated the connection
(`57P01`, "terminating connection due to administrator command"). All the test's assertions had
passed; the log showed `ERROR [Better Auth]: Could not validate the database schema` just before.
It failed once on PostgreSQL in CI (`api-v1.db.test.ts`, 2026-10-10) and passed on a re-run.

## What to do

- **Make test instances with `validateSchema: false`**: `testAppAuth` does, and so does every test
  that calls `createAuth` itself. The app's own migrations own the schema, and the migration tests
  check it.
- **Leave it on in the app** (`auth-instance.ts`): there's one instance, and the log line is useful
  at start.
