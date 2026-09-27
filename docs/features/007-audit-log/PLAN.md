# 007 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [ ] **1. Migration `0002_audit_log`.** The table, indexes and table-level foreign key
  (`ON DELETE SET NULL`), and the Kysely `AuditLogTable` type.
  *Done when:* it migrates on SQLite, and on the 004 servers (`pnpm test:db:*`), with a foreign-key test like 0001's.

- [ ] **2. `audit` domain.** The `AuditEvent` model and catalogue, `recordAudit(db, event)`, metadata
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

(006, 008 and 009 record their own events as part of their tasks.)

## Notes
