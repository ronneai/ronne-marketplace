# 007 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Migration `0002_audit_log`.** The table, indexes and table-level foreign key
  (`ON DELETE SET NULL`), and the Kysely `AuditLogTable` type.
  *Done when:* it migrates on SQLite, and on the 004 servers (`pnpm test:db:*`), with a foreign-key test like 0001's.

- [x] **2. `audit` domain.** The `AuditEvent` model and catalogue, `recordAudit(db, event)`, metadata
  validation (secret-looking keys, 4 KB cap), and a read repository with a cursor.
  *Done when:* tests cover validation, writing in a transaction, rollback leaving nothing, and paging.

- [x] **3. Record 003's events.** `instance.root_created` in setup, and `user.password_reset` in
  reset-root-password, in their existing transactions.
  *Done when:* the 003 database tests assert the events.

- [x] **4. Guard test.** It fails if anything outside `db/migrations` issues `updateTable` or
  `deleteFrom` on `audit_log`.
  *Done when:* it passes, and fails when such a call is added on purpose.

- [x] **5. `/admin/audit` page.** Root-only (404 otherwise), the table with filters and cursor paging, using 032's parts.
  *Done when:* render and permission tests pass, and a Playwright test (006's harness) opens it as root.

- [x] **6. Record 006's events.** `auth.signed_in`, `auth.sign_in_failed`, `auth.signed_out` and
  `user.password_changed`, from the identity services, with the client IP when it can be trusted.
  *Done when:* a database test per event, and the 006 end-to-end tests still pass.

(008 and 009 record their own events as part of their tasks. 006 merged before this feature, so its
events are task 6 here.)

## Notes

- **Task 1 (2026-09-27): migration `0002_audit_log`** and the `AuditLogTable` Kysely type.
  - The foreign key on `actor_id` is table-level and `ON DELETE SET NULL`. The test reads it back
    from each database's catalogue, like 0001's.
  - `metadata` is JSON text, and `ip_address` is `varchar(45)` (the longest IPv6 form fits).
  - Passes on SQLite, PostgreSQL 15, MySQL 8.4 and MariaDB 10.11.
  - Two tests listed exactly `["0001_identity"]` as the applied migrations; they now use the
    migration list.
  - **Added task 6:** 006 merged before the audit log existed, so its four events are recorded here.
- **Task 2 (2026-09-27): the `audit` domain** (`src/server/domains/audit/`).
  - **`recordAudit(db, dialect, event)`** takes the caller's database or transaction, validates the
    event, and inserts it. **`listAuditEvents`** returns 50 events a page, newest first, with a
    `nextCursor` (the last id; it reads one extra row rather than counting).
  - **The catalogue** (`models/audit-event.ts`) holds the spec's 12 actions. A failed sign-in has
    no target, stored as `target_type = "none"`.
  - **Secret-looking keys** are checked at every depth, word by word, so camel, snake and kebab case
    are all caught:
    - `password`, `secret`, `hash`, `salt` or `cookie` anywhere in a key;
    - `token`, `key` or `credential(s)` as its last word.

    So `tokenHash` and `accessToken` are refused, but the catalogue's own `tokensRevoked` is allowed.
  - **Metadata** over 4,096 bytes of JSON is refused (bytes, not characters).
  - **Group filter:** filtering by `access_token` with LIKE would treat `_` as a wildcard, so groups
    filter with an `IN` list of the catalogue's actions.
  - **Ids:** `newId()` now uses ulid's monotonic factory. Ids made in the same millisecond still sort
    in order, which paging by id relies on.
  - Tests pass on SQLite, PostgreSQL, MySQL and MariaDB: a rolled-back transaction leaves no event,
    an invalid event stores nothing, and the cursor paging and filters work.
- **Task 3 (2026-09-27): 003's events.**
  - **`instance.root_created`** (actor `null`, target the new root, `{ via: "cli", email }`) and
    **`user.password_reset`** (`{ via: "cli", sessionsEnded, tokensRevoked }`) are recorded in the
    services' existing transactions.
  - **How:** through a new `recordAudit` method on `IdentityRepository`, so the service still
    depends only on the interface, and the event shares the repository's transaction.
    `deleteSessions` and `revokeAccessTokens` now return the counts the event records.
  - **Tests:** a refused second root leaves only the first event, a reset with no root leaves none,
    and the password never appears in an event.
- **Task 4 (2026-09-27): guard test** (`domains/audit/audit-log.guard.test.ts`).
  - **What it reads:** every non-test source file in `apps/web/src`, `scripts` and `e2e`, except
    `db/migrations`.
  - **What fails it:** Kysely's `updateTable`, `deleteFrom`, `replaceInto` or `mergeInto` on
    `audit_log`, and SQL `update`, `delete from`, `truncate` or `drop table` on it.
  - It has a self-test of the patterns. A throwaway file with `deleteFrom("audit_log")` made it fail,
    naming the file and line, and it passed again once that file was removed.
- **Task 6 (2026-09-27): 006's events** (done before task 5, so the page has real events to show).
  - **`auth.signed_in`:** the user, their new session (`target_type = "session"`), `{ remember }` and
    the client IP.
  - **`auth.sign_in_failed`:** no actor, `{ email, reason }`, where the email is as typed, trimmed,
    lowercased and cut to 255 characters.
    - `reason` is `invalid`, `disabled` or `rate_limited`, for the log only. The person signing in
      always sees the same message.
    - To tell `disabled` apart, `IdentityRepository` has a new `userStatusByEmail`.
  - **`auth.signed_out`:** the session that ended. Signing out without a session records nothing.
  - **`user.password_changed`:** `{ otherSessionsEnded }`, counted before the change. A wrong current
    password records nothing.
  - **No token leaves the store:** Better Auth's sign-in returns the session *token*. The session
    store looks the session up and gives the service only its id, so no token reaches the log.
    `SessionStore.sessionUserId` became `currentSession`, returning `{ userId, sessionId }`.
  - **Not in one transaction:** Better Auth writes sessions and passwords in its own transactions,
    so these events are recorded right after the change succeeds. A crash between the two would
    lose the event, never invent one. 003's events and later ones (008, 009) share the change's
    transaction.
  - **The IP** comes from `clientIp()`, so it's only recorded with `TRUST_PROXY=true`.
  - **Tests:** one per event, plus a check that no password or session token appears anywhere in
    `audit_log`. They pass on all four databases, and the 006 end-to-end tests still pass.
- **Task 5 (2026-09-27): `/admin/audit`** (`app/(app)/admin/audit/page.tsx`, `features/admin-audit/`).
  - **Root only:** anyone else gets a 404, and the log isn't read for them.
  - **The table** shows the time (UTC, with the zone), the actor (email, or `cli` / `system`, or the
    id of a removed user), the action as a badge, the target, the details as key and value pairs,
    and the IP address.
  - **Filters and paging:** action group, actor (including "system and cli") and a UTC date range,
    in a GET form, so it works without JavaScript and every view has a URL. The `to` day is
    included in full. Malformed query values are ignored. It pages with "Older →" (cursor) and
    "← Newest".
  - **Navigation:** the root-only "Admin" link now opens `/admin/audit`, the only admin page so far.
    008 can point it at user admin.
  - **Tests:** render, permission and query parsing tests, and two Playwright tests. Root sees
    `instance.root_created` and its own `auth.signed_in`, and filters by action; a regular user has
    no Admin link and gets a 404.
  - **Checked by hand** in light and dark at 1440px (Playwright screenshots). The throwaway instance
    needed `pnpm db:migrate` for 0002, because `next start` doesn't migrate; the Docker entry point does.
- **Done (2026-09-27):** 008 and 009 record their own catalogue events, with tests, as part of those
  features. The criterion below covers 006's events here.

