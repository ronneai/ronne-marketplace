# 109 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - SPEC.md and PLAN.md.
  - MVP.md §15: the "Login rate limit" row says where the count lives, and a new "Rate limits" row
    says what this spec decides (the database, fixed windows, keyed hashes, failing closed, and the
    two limiters left in memory).
  - `docs/features/README.md` links 109 in M17.
  - *Done when:* MVP.md and the index say what this spec says, and `pnpm witness:check` and
    `pnpm docs:check` pass.

- [x] **2. The table and the store.** [risky]
  - Migration `0044_rate_limits` (all three dialects) and its type in `db/schema.ts`.
  - `apps/web/src/server/rate-limit/`:
    - the `RateLimiter` port (`consume`, `check`, `record`, `release`, all async) and
      `consumeAll` for several limits at once;
    - the database store (missing rows made while ignoring conflicts, rows locked in key order,
      `READ COMMITTED`, `retryOnDeadlock`);
    - the memory store, with today's rules;
    - the keyed hash.
  - *Done when:* db tests, on SQLite and on the servers (`pnpm test:db:up`), show:
    - 20 concurrent attempts allow exactly 5 (over two pools on the servers, one on SQLite, where
      another process waits for the file's lock);
    - a refused attempt counts nothing;
    - a window ending starts the count over;
    - `release`, and `check` with `record`;
    - `consumeAll` counting all or none;
    - a count seen by a new connection pool;
    - no email, IP or ID in the table, and two limiter names giving two rows.

    The memory store passes the same rules in a unit test.

- [ ] **3. Sign-in.** [risky]
  - The login limiter on the database store: sign-in, changing a password, wrong two-factor codes
    and `POST /api/v1/auth/token`, each awaiting it.
  - The 30-second gap between new backup codes becomes a limiter on the database store (checked
    before, recorded after a success, released when two-factor is turned off); its `Map` goes.
  - `getAppAuth` builds it from the instance's database and `AUTH_SECRET`. The limiter's
    `globalThis` copy and its half of `dropStale` go.
  - Tests that only need a limiter out of the way keep the memory store. One test per path runs the
    database store and sees the same `rate_limited` answer.
  - *Done when:* the identity db tests pass on SQLite and the servers. A sign-in refused on one app
    instance is refused on a second instance on the same database, and the threat model's
    "Guessing passwords" row names where the count lives. MVP.md §15's two rows lose "Planned"
    once the last limiter moves (task 5).

- [ ] **4. Provider sign-in, `rmk login --web` and SCIM.** [risky]
  - The SSO, device (API and `/device` page, through `consumeAll`) and SCIM limiters on the
    database store, with the same limits and keys. Their `globalThis` copies go.
  - *Done when:* their db tests pass on SQLite and the servers, each limit is shown holding across
    two app instances, and the threat model's `/device` row is updated.

- [ ] **5. Uploads, submits, usage and feedback.**
  - The four limiters on the database store, keyed by user as today. Their `globalThis` copies go.
  - The setup code's limiter moves to the memory store, and `LoginRateLimiter` goes, leaving
    `loginRateLimitKeys` in identity's models. `setup-code-limit.ts` and MVP.md's Feedback row say
    where each count lives; MVP.md §15's "Login rate limit" and "Rate limits" rows lose "Planned".
  - *Done when:* the drafts, usage and feedback tests pass, each limit holds across two app
    instances, and the threat model's upload and feedback rows are updated.

- [ ] **6. The purge.** [risky]
  - The retention purge deletes expired `rate_limits` rows in batches, and its result counts them
    (`rateLimitsDeleted`).
  - The count appears in the Privacy tab's last run (three languages), in `rmk-server purge`'s
    output and in the job's log event.
  - The threat model: the setup code row, and §5's "in one process's memory" row, now only for the
    setup code and Better Auth.
  - *Done when:* a db test shows expired rows deleted and live ones kept, a dry run counting
    without deleting, and the counts in the tab, the command and the log.

- [ ] **7. Documentation.**
  - ronne-web, in a branch that goes live with the release: the `privacy` topic's purge table and
    its retention section, in three languages.
  - *Done when:* the docs render tests pass in ronne-web, and the row matches what the purge does.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 2, SQLite and two pools.** A deferred SQLite transaction that reads and then writes fails
  at once with `SQLITE_BUSY` when another connection wrote in between: the busy timeout covers
  waiting for the lock, not a stale snapshot. `writeTransaction` starts with `BEGIN IMMEDIATE`.
  Two pools in one process still can't overlap transactions (better-sqlite3 blocks the process
  while it waits), so the SQLite tests run concurrency on one pool, and a raw second connection
  shows the lock is held from the start.
- **Task 2, the isolation level.** No test tells `READ COMMITTED` from MySQL's `REPEATABLE READ`
  here: `FOR UPDATE` reads the latest committed row at either level. It's kept to match the other
  locking code (`db/locks.ts`).
