# Timestamp columns end in `_at`

Every timestamp column's name ends in `_at`, and no other column's does. `rmk-server restore`
(099) relies on it: SQLite keeps timestamps as ISO-8601 text, so when an archive made on SQLite is
restored into PostgreSQL or MySQL, `restore.ts` tells which text columns are timestamps by that
suffix alone.

`restore.db.test.ts` ("keeps the naming restore relies on") checks every column of the migrated
schema, but only on PostgreSQL, MySQL and MariaDB, where the types say which columns are
timestamps. On SQLite it passes whatever the names are, so `pnpm test` won't catch a wrong name.

## What to do

- **A new timestamp column** is named `…_at`, even when its library calls it something else. Map
  the name instead: Better Auth's two-factor `lockedUntil` is `lock_expires_at` (105,
  `twoFactorSchema` in `domains/identity/models/auth-schema.ts`).
- **A column that isn't a timestamp** never ends in `_at`.
- **Before committing a migration**, run the database tests on the servers
  (`pnpm test:db:up`, then `pnpm test:db:postgres -- src/server/backup/` and the others), as
  CLAUDE.md asks for database code.
