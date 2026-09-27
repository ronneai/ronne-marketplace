# 007 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Migration `0002_audit_log`.** The table, indexes and table-level foreign key
  (`ON DELETE SET NULL`), and the Kysely `AuditLogTable` type.
  *Done when:* it migrates on SQLite, and on the 004 servers (`pnpm test:db:*`), with a foreign-key test like 0001's.

- [x] **2. `audit` domain.** The `AuditEvent` model and catalogue, `recordAudit(db, event)`, metadata
  validation (secret-looking keys, 4 KB cap), and a read repository with a cursor.
  *Done when:* tests cover validation, writing in a transaction, rollback leaving nothing, and paging.

- [ ] **3. Record 003's events.** `instance.root_created` in setup, and `user.password_reset` in
  reset-root-password, in their existing transactions.
  *Done when:* the 003 database tests assert the events.

- [ ] **4. Guard test.** It fails if anything outside `db/migrations` issues `updateTable` or
  `deleteFrom` on `audit_log`.
  *Done when:* it passes, and fails when such a call is added on purpose.

- [ ] **5. `/admin/audit` page.** Root-only (404 otherwise), the table with filters and cursor paging, using 032's parts.
  *Done when:* render and permission tests pass, and a Playwright test (006's harness) opens it as root.

- [ ] **6. Record 006's events.** `auth.signed_in`, `auth.sign_in_failed`, `auth.signed_out` and
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

