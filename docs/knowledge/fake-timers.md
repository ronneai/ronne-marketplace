# Fake timers in database tests

**Don't fake `setTimeout` in a `*.db.test.ts` while the test talks to the database.** On
PostgreSQL, MySQL and MariaDB the drivers (`pg`, `mysql2`) use timers themselves: with Vitest's
fake timers on, a query waits on a clock that only moves when the test advances it, and a check
with a deadline (the health check's 3 seconds) fails or hangs. SQLite (`better-sqlite3`) uses no
timers, so the test passes locally and fails only on CI's database servers.

Seen in 101: `health.db.test.ts`'s "storage doesn't answer within 3 seconds" faked `setTimeout` to
skip the wait; on PostgreSQL and MariaDB the database's own check timed out first, and the endpoint
answered `database_unavailable`.

What to do instead:
- Let the real time pass when it's short (that test now takes 3 seconds).
- Or make the deadline injectable, so the test passes a small one.
- If timers must be faked, fake them only around code that doesn't touch the database.

Before committing a database test, run it on the servers (`pnpm test:db:up`, then
`pnpm test:db:postgres` / `:mysql` / `:mariadb -- <file>`), as CLAUDE.md says.
