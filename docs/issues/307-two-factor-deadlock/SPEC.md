# #307 — Two attempts at once at the second step get the true answer on MySQL

> GitHub: [#307](https://github.com/ronneai/ronne-marketplace/issues/307) · Feature:
> [105](../../features/identity/105-two-factor-sign-in/SPEC.md) · Reported on: the Dependabot updates of
> better-auth 1.7.22 (#303) and 1.7.25 (#306), never released

## Report

- On MySQL, `two-factor-sign-in.db.test.ts` › "the same backup code in two challenges at once,
  without any queue" fails with `expected 'expired' to be 'wrong_code'` from better-auth 1.7.22 on.
  20 runs each on MySQL 8.4, from each version's own lockfile: 1.7.14, 0 failures; 1.7.22, 8;
  1.7.25, 6. In every run exactly one attempt signs in: the backup code is never accepted twice.
  The losing attempt gets the wrong answer.
- **Why (five whys, confirmed):** Better Auth's `verifyTwoFactor` reads the challenge's attempt
  counter in `beginAttempt` with `consumeVerificationValue(…).catch(() => null)`, before it checks
  or spends the code. From 1.7.22, `consumeVerificationValue` range-deletes on the identifier index
  before deleting the row by primary key, and two transactions doing that at once can take their
  locks in opposite orders: MySQL kills one as a deadlock. The catch turns the deadlock into "no
  counter", Better Auth answers `INVALID_TWO_FACTOR_COOKIE`, and Ronne shows "expired". 1.7.26 has
  the same code.
- Meanwhile Dependabot held better-auth at 1.7.21 (#308, exception E-14).

## Goal

On every database, with better-auth 1.7.22 and later, an attempt at the second step that loses a
race gets the answer it would get alone: a wrong or used code is "wrong code", a right one signs in.
Better Auth stays unheld.

## Scope

**In:**
- **One more try, in `verifyChallenge`** (`better-auth-two-factor-store.ts`). When Better Auth
  answers `INVALID_TWO_FACTOR_COOKIE` but the request's signed challenge cookie names a challenge
  row that is still there and hasn't run out, the store calls the same endpoint (`verifyTOTP` or
  `verifyBackupCode`) once more and returns that answer. Never more than once. Any other refusal,
  a challenge that is gone or ran out, or no readable cookie: the first answer, as before.
- **Tests that always fail the way MySQL does** (`two-factor-sign-in.db.test.ts`): a spy makes
  Better Auth's read of an attempt counter throw, so every database, every run, sees what a
  deadlock does. A right code signs in; a wrong code is a wrong code; a counter that keeps failing
  is "expired" after exactly two tries, with no session; five wrong codes with a failing read each
  still void the challenge; a challenge that ran out is asked once; a challenge whose row is gone,
  though it wouldn't have run out yet, is asked once.
- **The race tests run five times per run** (Vitest's `repeats: 4`: the first run and four
  repeats): the four tests that start requests at once.
- **The hold ends:** better-auth 1.7.25 (1.7.26 is younger than `minimumReleaseAge`), the
  Dependabot ignore removed, E-14 closed.

**Out:**
- Retrying any other Better Auth error, or any database error Ronne sees itself.
- Better Auth's own lock order. That is upstream's to fix; the report is the owner's (Open
  questions).

## Behaviour

- Nothing changes for one attempt at a time: Better Auth answers `INVALID_TWO_FACTOR_COOKIE` with a
  live challenge only when its counter read failed.
- **Why one more try is safe.** `beginAttempt` runs before the code is checked or spent, and the
  deadlocked transaction rolled back, so nothing was used up: no code, no attempt. The second try
  reads the counter and records its result like any other attempt, so a retry never gives an extra
  guess (the "five wrong codes" test). If the code was spent by the race's winner meanwhile, the
  second try says so ("wrong code"); if the winner was the same challenge, its row is gone and the
  first answer stands.
- The audit and the log see one attempt, with the second try's answer.

## Edge cases

- **The counter fails twice** (a second deadlock, or the counter row lost because Better Auth's
  re-arm also failed): "expired", as before, after two tries.
- **The challenge runs out between the tries:** the second try says "expired" itself.
- **The database fails while the store reads the challenge row for the check:** that error is
  thrown, as any database error is, where before the person saw "expired".
- **Better Auth's later consume of the challenge row deadlocks** (in `valid`, after the code is
  spent): that error isn't caught by Better Auth, so it reaches Ronne as a database error, not a
  refusal, and isn't retried. Not seen in any run; the race tests would show it as a 500.

## Documentation

None: the Documentation doesn't describe what a losing simultaneous attempt sees, and nothing a
person does changes. The fix makes the app answer as it did with better-auth 1.7.21.

## Acceptance criteria

1. The six tests in "a challenge whose attempt counter fails to read" pass on SQLite, PostgreSQL,
   MySQL and MariaDB. With the store's change removed, the first four fail on SQLite; the last two
   guard the retry's limits and fail when it loses its expiry check or its row check.
2. The four race tests run `repeat x4`, each repetition from a freshly migrated database.
3. better-auth is 1.7.25 in `apps/web/package.json` and the lockfile; `.github/dependabot.yml` has
   no `better-auth` ignore; E-14 is closed.
4. With better-auth 1.7.25 on MySQL 8.4, the race tests fail in some of 10 runs without the store's
   change and in none of 20 runs with it.

## Decisions

- **A retry in Ronne, not a patch of Better Auth.** Patching `node_modules` or forking would need
  carrying across every update; the retry depends only on the refusal code and the challenge row,
  both public.
- **Checked against the challenge row, not the error.** Better Auth swallows the database error, so
  Ronne can't see it was a deadlock. A live, unexpired challenge is the case where
  `INVALID_TWO_FACTOR_COOKIE` can't be true.

## Open questions

- **The upstream report** (lock order in `consumeVerificationValue`; `beginAttempt` hiding a
  database error as `INVALID_TWO_FACTOR_COOKIE`) goes to Better Auth from the owner's account.
