# #307 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. One more try for a live challenge** `[risky]`. `verifyChallenge` calls the same Better
  Auth endpoint once more when the answer is `INVALID_TWO_FACTOR_COOKIE` and the signed cookie
  names a challenge row that is there and hasn't run out; `challengeUser` and the check share one
  lookup. Six tests in `two-factor-sign-in.db.test.ts` make the counter read fail with a spy.
  *Done when:* the six pass on SQLite, PostgreSQL, MySQL and MariaDB; with the store's change
  reverted, the first four fail on SQLite; the last two, which guard the retry's limits, fail when
  it loses its expiry check or its row check; the identity domain's tests pass.
- [x] **2. Race tests run five times per run.** The four tests that start requests at once take
  `RACE` (`{ repeats: 4 }`: the first run and four repeats). *Done when:* Vitest reports them
  `repeat x4` and each repetition starts from a freshly migrated database (a second `enrolled()` on
  the same one would fail).
- [x] **3. The hold ends.** better-auth 1.7.25, the Dependabot ignore removed, E-14 closed.
  *Done when:* `pnpm install --frozen-lockfile` and `pnpm licenses:check` pass; on MySQL 8.4 the
  race tests fail in some of 10 runs with the store's change reverted and in none of 20 with it.
