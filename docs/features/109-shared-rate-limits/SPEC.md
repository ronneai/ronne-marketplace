# 109 — Shared rate limits

> Milestone: M17 · Depends on: 006, 037, 046 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Login rate limit", and a new "Rate limits" row) · Contracts: none changed

## Goal

Every rate limit Ronne has today is counted in one process's memory, nearly all of them by
`LoginRateLimiter` (`apps/web/src/server/domains/identity/models/login-rate-limiter.ts`). A restart empties the counts,
so someone guessing passwords gets a fresh five attempts each time the server restarts. With two
replicas behind a load balancer (M17), each replica counts on its own, so every limit is as many
times looser as there are replicas. Self-registration (190), forgot password (194) and verified
email changes (197) all need limits that hold across replicas, and their specs say so.

This feature counts the limits in the database: one table, shared by every replica and kept across
restarts. The limits, their windows, their keys and every answer and message stay as they are.
Only where the count lives changes.

## Scope

**In:** every limiter the running app keeps in memory once the instance is set up.

| Limiter | Limit | Keys | Where |
|---|---|---|---|
| Sign-in (006) and `POST /api/v1/auth/token` (`rmk login`) | 5 a minute | `email:…`, and `ip:…` with `TRUST_PROXY` | `identity/services/session.ts`, `token-exchange.ts` |
| Changing a password (006), and wrong passwords and codes on two-factor changes (105): the same limiter and counts as sign-in | 5 a minute | `email:…` only | `identity/services/session.ts`, `two-factor.ts` |
| New backup codes (105): one set per person every 30 seconds, then `just_made`. Taken before the work, so two clicks on two replicas make one set; given back when no set was made, and when two-factor is turned off | 1 in 30 seconds | `user:…` | `identity/services/two-factor.ts` (a module `Map` before 109, set after a success) |
| Provider sign-in (106): starts and callbacks | 30 a minute per client IP, or 300 a minute for the instance when the address isn't known | `sso-start:ip:…`, `sso-callback:ip:…`, `…:unknown` | `identity/actions/sso.ts` |
| `rmk login --web` codes (107): asking for one, and polling | 10 and 60 a minute per IP; 60 and 600 for the instance without one | `device-start:…`, `device-poll:…` | `identity/actions/device-grants.ts` |
| Codes typed on `/device` (107) | 5 a minute per IP and 10 an hour per person, both counted together | `device-page:ip:…`, `device-page:user:…` | the same |
| SCIM (108) | 600 a minute per working token; refused ones 20 a minute per IP, or 100 for the instance | `scim-token:…`, `scim-refused:…` | `identity/actions/scim.ts` |
| Draft uploads (037) and submits (052) | 30 and 10 in 10 minutes per user | `user:…`, `submit:…` | `http/upload-rate-limit.ts` |
| Usage reports (046) | 60 in 10 minutes per user | `usage:…` | `http/usage-rate-limit.ts` |
| Feedback (127) | 10 an hour per person | `feedback:…` | `feedback/services/feedback-limiter.ts` |

- **A `rate_limits` table**, one row per limiter and key: the key's keyed hash, when its window
  started, how many attempts it has counted, and when the window ends.
- **A shared module, `apps/web/src/server/rate-limit/`,** since the limits are used by several
  domains and by `http/`, not by identity alone. It holds the `RateLimiter` port and two stores: the
  database, which every limiter above uses in the running app, and memory, for the setup code and
  for tests.
- **Expired rows deleted by the retention purge (102),** with a count in its result, on the Privacy
  tab and in `rmk-server purge`'s output.
- **The threat model and MVP.md** no longer say the limits are in memory, except where they still
  are.

**Out:**

- **The setup code's limit (161) stays in memory.** Before setup there's no database to count in,
  and the instance being set up is one server. Once root exists, the setup code is gone.
- **Better Auth's own limiter stays in memory.** It covers only the two HTTP routes Better Auth
  still serves, `/get-session` and `/ok` (`HTTP_ENDPOINTS`), which read and change nothing.
  Sign-in doesn't go through it. 111 checks every remaining in-memory state for replicas.
- **The other in-memory state 111 lists:** the marketplace cache, the scheduler's ticks and the
  per-person two-factor queue of 105.
- **No new limits and no changed numbers.** 190, 194 and 197 add their own limits through this
  module.
- **Sliding windows, token buckets and a Redis store.** The fixed windows stay, so the answers
  don't change, and Ronne needs nothing but its database (MVP §9.4).

## Behaviour

- **The same rules as today.** An attempt counts against each key it names. It's refused when any
  of its keys is used up, and then it counts against none of them, so waiting out the window always
  works. `retryAfterSeconds` is the time until the latest of the full windows ends, rounded up. The
  `check` / `record` pair (only failures count, 105) and `release` (a count taken back, 107) work as
  they do now.
- **Several limits at once.** One `consume` can name keys under different limits: the `/device`
  page's per-IP and per-person limits. All of them are counted, or none.
- **Atomic across replicas.** A `consume` locks its rows and decides in one transaction
  (`writeTransaction` in `db/locks.ts`):
  1. it locks the rows in key order (`forUpdate`, a locking read, which sees the latest committed
     row), so two attempts can't deadlock each other;
  2. it decides, then writes the new counts, and commits.

  A row that doesn't exist yet can't be locked. Then the transaction ends without writing, the
  missing rows are made in a statement of their own, ignoring a row another attempt made first
  (PostgreSQL and SQLite `ON CONFLICT DO NOTHING`, MySQL and MariaDB `INSERT IGNORE`), and the
  transaction runs again. The same happens when the purge deleted a row in between.

  On PostgreSQL, MySQL and MariaDB the transaction is `READ COMMITTED` (`readCommittedTransaction`),
  as Ronne's other locking code is; the locking read is what makes the decision see the attempt it
  waited for. On SQLite it starts with `BEGIN IMMEDIATE`, taking the file's write lock first, so
  another process writing to the file (an `rmk-server` command) makes it wait out the busy timeout
  instead of failing with `SQLITE_BUSY`. If the database still ends a deadlock, the whole
  transaction runs again (`retryOnDeadlock`). However many requests arrive at once, on however many
  replicas, at most `max` of them are allowed in a window.
- **Limit names** are lower-case letters, digits and hyphens, checked when a limiter is made, so a
  name can't run into the key after it in the hash.
- **A window that has ended starts over** on the next attempt: the row's window restarts at that
  attempt, with a count of 1.
- **The keys are keyed hashes,** never the email, the IP address or the account ID. A row's key is
  HMAC-SHA256 of the limiter's name and the key, under a key HKDF-SHA256 derives from `AUTH_SECRET`
  with its own `info` (`ronne rate-limit keys v1`), as `crypto/sealed.ts` derives its keys. A plain
  SHA-256 wouldn't do: every IPv4 address can be hashed in minutes. Without `AUTH_SECRET`, no one
  can tell from the table whose attempts it counts. The limiter's name is part of the hash, so two
  limiters can't share a row even when they use the same key.
- **The application's clock,** injectable as today (`now`), not the database's. The replicas'
  clocks are assumed to be kept by NTP, and a skew of a few seconds moves a window's end by as much.
- **When the database fails, the attempt fails.** The error goes up and the request fails as it
  would anyway: every limited path reads the database next. A limiter never lets an attempt
  through uncounted.
- **The answers don't change:** the same `rate_limited` errors, `429` with `Retry-After`, messages,
  log events and audit events.
  One wait does change: when both of the `/device` page's limits are full, `retryAfterSeconds` is
  the later of the two windows' ends, the earliest an entry can pass; before 109 the page answered
  the person's window, the first it checked.

## Edge cases

- **Many attempts at once:** 20 at the same moment with a limit of 5 allow exactly 5: across two
  connection pools on PostgreSQL, MySQL and MariaDB, and through the one pool a process has on
  SQLite. On SQLite, another process writing the same file (an `rmk-server` command) waits out the
  busy timeout, up to 5 seconds, blocking the server meanwhile, as better-sqlite3 does. Two pools
  in one process can't take turns on a SQLite file, and Ronne never opens two; replicas need
  PostgreSQL, MySQL or MariaDB.
- **A window ends while an attempt waits for the lock:** the attempt decides with the time it read
  when it started. At worst it's refused, or counted in the old window, a moment before that window
  would have ended; it's never allowed past a full window.
- **`rotate-secret` (098):** the hashes change with `AUTH_SECRET`, so every count starts over. The
  old rows are never matched again, and the purge deletes them once their windows end. An attacker
  who can rotate the secret already controls the server.
- **A restore (099)** brings back the table with the rest. Its windows have long ended, or end
  within the hour.
- **A key used by no one again** stays until its window ends and the purge runs: at most an hour
  plus the purge's 6 hours.
- **An erased account (103):** the rows hold no readable data (a keyed hash, a count and two
  times), can't be tied to a person without `AUTH_SECRET`, and are deleted within hours, so erase
  doesn't look for them, and the data download (104) doesn't list them.
- **Before setup:** nothing reaches the database limiters. Sign-in and the API answer "not set up"
  first, and the setup code keeps its memory limit.
- **A hot reload in development** no longer needs the limiters on `globalThis`: the counts are in
  the database. `dropStale`'s limiter half goes.

## Data

`rate_limits`, one migration for all three dialects:

| Column | Type | |
|---|---|---|
| `key_hash` | `varchar(64)`, primary key | the HMAC, hex |
| `window_started_at` | timestamp | when this window's first counted attempt came |
| `hits` | integer | attempts counted in the window |
| `expires_at` | timestamp, indexed | when the window ends (`window_started_at` + the limiter's window) |

It has no foreign keys: a row belongs to no table. The purge deletes rows whose `expires_at` has
passed, in batches of `PURGE_BATCH`, under the job's lease.

## Documentation

- **ronne-web, `privacy` topic:** a row in the purge's table (`RULES`): rate limit counters, a
  keyed hash of what was counted and how many times, deleted once their window ends, in English,
  Portuguese and French. The `retention` section names them with what an instance keeps. No new
  topic or section, so neither `topics.ts` changes.
- **Helpers:** none change. The Privacy tab's last run gains a count, inside its existing message.
- **In this repository:** `docs/security/threat-model.md` (the sign-in, upload, `/device`, feedback
  and setup code rows, and the "in one process's memory" row of §5), and MVP.md §15.

## Acceptance criteria

1. Every limiter in the Scope table counts in `rate_limits` in the running app, with the same
   limits, windows, keys and answers as before.
2. Twenty concurrent `consume` calls with a limit of 5 allow exactly 5: spread over two connection
   pools on PostgreSQL, MySQL and MariaDB, and on one pool on SQLite, where another process holding
   the file's write lock makes an attempt wait rather than fail.
3. A refused attempt counts against none of its keys, and waiting out the window lets the next one
   through.
4. The `/device` page's two limits are counted together or not at all.
5. A count survives a restart: a new process with the same database sees it.
6. The table holds no email, IP address or account ID in clear, and the same key under two limiter
   names gives two rows.
7. The purge deletes expired rows and no others, its result counts them, and the Privacy tab and
   `rmk-server purge` show the count.
8. The setup code's limit and Better Auth's limiter stay in memory, and the threat model says why.
9. The threat model and MVP.md §15 describe where each limit is counted.
10. The Documentation's `privacy` topic lists the counters, in three languages.

## Decisions

1. **The database, not Redis.** Ronne runs on SQLite, PostgreSQL, MySQL or MariaDB and nothing
   else (MVP §9.4). A limit is checked once per sign-in or upload, which a primary-key row lock
   handles easily. A cache server would be one more thing to run, secure and back up.
2. **Fixed windows, unchanged.** A sliding window would change what people see. Fixed windows let
   a burst of twice the limit through across a window's edge, which is already true today.
3. **Keyed hashes, not plain values.** The counters need to match a key, not read it. Keyed with
   `AUTH_SECRET`, they hold no personal data anyone can read from a backup or a dump of the table.
4. **A failed database fails the attempt.** Letting attempts through when the count can't be
   written would turn a database outage into an open door.
5. **The setup code and Better Auth stay in memory.** There's no database before setup, and Better
   Auth's remaining routes only read.

## Open questions

None.
