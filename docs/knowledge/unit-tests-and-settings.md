# Unit tests and this clone's settings

A clone you've set up (`pnpm run setup`) has a settings file with `DATABASE_URL` and `AUTH_SECRET`.
Server code reads it through `loadConfig()`. CI has none: there, anything that reaches
`getAppAuth()` throws `NotConfiguredError`.

## What happened

092's Admin › Users page started calling `listWorkspaces()`. Its unit test didn't mock that call.
On the developer's machine, the call quietly read the clone's real SQLite database and the test
passed. In CI it failed with "Ronne AI Marketplace isn't set up yet" (PR #140).

## What to do

- **The `unit` Vitest project hides the settings** (`apps/web/vitest.config.ts`). It points
  `RONNE_ENV_FILE` at a file that doesn't exist and blanks `DATABASE_URL` and `AUTH_SECRET`, so a
  unit test sees what CI sees. Keep it that way.
- **When a page or action gains a server call, mock it** in every unit test that renders it. Look
  for the domain's `actions/*` module (`vi.mock("@/server/domains/…/actions/…")`).
- **A test that needs a database is a `*.db.test.ts`** and gets one from `createTestDb()`. The
  `db` project still reads `TEST_DATABASE_URL`.

## How to spot it

The test passes locally and fails in CI with `NotConfiguredError` from `getAppAuth`. The stack
shows a domain action called from a page or component under test.
