# Race tests on MySQL

A test that starts several requests at once (`Promise.all` over the same user, code or row) checks
a race. On PostgreSQL and SQLite those usually behave the same every run. On MySQL and MariaDB they
often don't: InnoDB locks index ranges, not only rows, so two transactions that touch nearby rows
can deadlock, and which one MySQL kills changes from run to run. A race test there passes or fails
by chance, and **one green run proves little**.

## What happened (2026-11-18, #307)

better-auth 1.7.22 changed `consumeVerificationValue`: it range-deletes a verification value's
older rows on the identifier index before deleting the row by primary key. A concurrent delete by
primary key takes the same two locks in the opposite order, so simultaneous two-factor attempts
deadlocked. Better Auth caught the deadlock as "no row" and answered `INVALID_TWO_FACTOR_COOKIE`,
which Ronne shows as "expired" instead of "wrong code". The backup code was never accepted twice;
the losing attempt got the wrong answer.

`two-factor-sign-in.db.test.ts` caught it, but only sometimes: 20 runs each on MySQL 8.4 gave
0 failures with 1.7.14, 8 with 1.7.22 and 6 with 1.7.25. The npm group with 1.7.22 (#303) passed
its one CI run and would have been merged. The next group (#306, 1.7.25) failed, and the first
explanation, built on that one failure and a release note, named the wrong version (1.7.24). Only
running each delivered lockfile 20 times showed that 1.7.22 fails too.

The fix (#312): `verifyChallenge` tries once more when Better Auth answers
`INVALID_TWO_FACTOR_COOKIE` for a challenge that is still there and hasn't run out. On MySQL 8.4
with 1.7.25 the race tests then failed 0 of 20 runs, against 6 of 10 without it. A spy that makes
the counter read throw reproduces the case on every database, every run, so the guard doesn't
depend on winning a race.

## The rules

- **Run a race test many times before trusting it**, on the server it targets, from the lockfile
  as delivered (`pnpm install --frozen-lockfile`, never a re-resolve):
  `pnpm test:db:mysql -- <file> -t "<test name>"` in a loop, 20 times, and count. Compare with
  `main` the same way. One run, green or red, is not evidence.
- **Give race tests `repeats`** (Vitest's test option), so CI's single run of the file runs the
  race several times. `repeats` counts the extra runs: `{ repeats: 4 }` (`RACE` in
  `two-factor-sign-in.db.test.ts`) runs each test five times, each from a fresh database.
- **Add a test that fails the same way on purpose**, so the case doesn't depend on winning a race:
  a `vi.spyOn` on the library call that throws as the deadlock does (#312's "a challenge whose
  attempt counter fails to read").
- **When a refusal looks wrong on MySQL, look for a deadlock before theorising.** Log the error the
  library threw (wrap the call in the test, in memory: don't edit `node_modules`, whose files are
  hard links into pnpm's store), then read MySQL's own account of the last one:
  `docker compose -f docker/test-databases.compose.yml exec mysql mysql -uroot -p -e "SHOW ENGINE INNODB STATUS\G"`
  (the password is in that compose file). Its "LATEST DETECTED DEADLOCK" section names both
  statements and the locks each held and waited for.
- **Narrow a dependency regression by version, not by release notes.** `npm pack <package>@<version>`
  each version into a scratch folder and grep or diff the function, to see which release first has
  the change; then confirm with the delivered lockfiles above.
- **A library that turns a database error into "not found" hides it.** Map its refusals with care:
  a refusal that can also mean "the database failed" needs a check (does the row really not exist?)
  or a bounded retry, not a fixed message.

## How to spot it

A race test that fails on MySQL or MariaDB only, not every run, often after a dependency update,
with an answer that's plausible but wrong for the case (expired, not found, invalid) rather than
an error.
