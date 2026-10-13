# 099 — Backup and restore

> Milestone: M14 · Depends on: 082, 005 · Design: [MVP §14.4](../../MVP/MVP.md#144-other-future-topics), [§15](../../MVP/MVP.md#15-decision-log) (Operations, Docker, Drafts) · Guide: [`docs/runbooks/install.md`](../../runbooks/install.md)

## Goal

Anyone running Ronne makes a complete backup with one command, while it runs, and restores it on
the same machine or a new one, with Docker or without (owner, 2026-10-06). Today the install guide
says "back up the data folder, and the database too": no command, no check, and no way to know a
backup restores until the day it's needed. Upgrades can't go back (migrations run on start), so a
backup is also the only undo.

## Scope

**In:**
- `rmk-server backup`: one archive with the database, the storage and the settings file, made
  while the server runs, checksummed, optionally encrypted with a passphrase.
- `rmk-server restore <archive>`: into an empty database and storage, on any of the three database
  kinds, then the migrations the app has since.
- `rmk-server backup --verify <archive>`: reads the archive, checks every checksum (and the
  passphrase), and says what's in it, without restoring.
- `--keep <n>`, to remove the oldest backups in the folder after a new one.
- The same through `pnpm run backup` / `restore` from a clone, and in Docker.
- **A backup runbook**, `docs/runbooks/backup.md`: making backups on a schedule (cron, a systemd
  timer, launchd, Task Scheduler, a Docker host's cron), keeping copies off the machine,
  restoring, moving to another machine or another database, the Docker volumes, and encryption at
  rest.
- **A restore test in CI**: backup → restore into a fresh folder → start → the content is all
  there, on each operating system's server check, and across database kinds in the database tests.

**Out** (and where it goes instead):
- **A built-in schedule.** The operating system's scheduler runs the command; the runbook says how.
- **Backups to S3 or another remote.** The archive is a file; copying it off the machine is the
  operator's (the runbook shows `rclone`, `aws s3 cp` as examples). S3 storage for the app is 110.
- **Incremental backups.** Every backup is full. Artifacts are immutable, so the runbook says how
  to sync the storage folder incrementally for very large instances.
- **Encryption at rest inside the app.** The disk's, the database's or (with 110) the bucket's,
  documented (decision log, Operations): key management in the app would be one more secret to lose.
- **Restoring into a database that has data.** Always an empty one (below); merging two instances
  isn't a restore.
- **Backing up Caddy's certificates.** They're issued again on start; the runbook says how to keep
  them anyway (the `caddy-data` volume, the service's proxy folder) to stay within the CA's rate
  limits.

## Behaviour

### Why one portable format, not `pg_dump`, `mysqldump` or `VACUUM INTO`

The row in the index named the databases' own tools. This spec chooses one format Ronne writes and
reads itself, through Kysely, for every database kind:
- **No client tools needed.** The Docker image, the bundles and the packages have no `pg_dump` or
  `mysqldump`, and a `pg_dump` older than the server refuses to run. Adding them would weigh down
  the image and follow every server version.
- **One restore path, tested once.** Three native formats would be three restore paths.
- **Moving between databases.** A SQLite instance that outgrows it restores into PostgreSQL or
  MySQL with the same command: ids are 26-character strings (no sequences to reset) and the schema
  is one migration set for all three.
- **Consistent while running:** the dump reads every table in one read-only transaction at a
  repeatable snapshot (PostgreSQL `REPEATABLE READ`, MySQL/MariaDB a consistent snapshot, SQLite a
  read transaction under WAL), a helper in `db/`. Artifacts are written to storage before the
  database row that names them is committed, and never change, so copying storage *after* the
  snapshot finds every file the snapshot names (files released after it come along too, unnamed and
  harmless).

Operators who prefer their database's own tools can still use them: the runbook says what to copy
alongside (the storage and the settings file), and that such a backup is theirs to test.

The decision log's Operations row changes with this feature (MVP §15).

### `rmk-server backup`

```
rmk-server backup [--out <dir>] [--encrypt] [--no-settings] [--keep <n>] [--yes]
rmk-server backup --verify <archive> [--passphrase-file <file>]
```

- **Where:** `--out`, or `<data folder>/backups/` by default (the volume in Docker, so it survives
  the container; the runbook says to copy it off the volume too). A relative `--out` is from where
  the command was typed with `rmk-server` (made absolute before the script runs, also as the
  service's account) and in Docker (the image's `pnpm` sets `RONNE_CALLER_CWD`); in a clone, from
  pnpm's `INIT_CWD`: where `pnpm --filter @ronneai/web run backup` was typed, but the repository's
  root for the root's `pnpm run backup`, which starts pnpm again there (pnpm's script shell and tsx
  reset `PWD`, so nothing else keeps the folder). The output names the full path. Inside storage
  is judged by the disk itself: before anything is made, by the real paths of what exists; then,
  once the database has answered, the folder is made and checked again by the real paths the disk
  gives for both (a storage folder that this made now exists too), so no spelling the disk treats
  as the same (case, Unicode forms) gets past it; the folders made for a refused backup are
  removed. The folder is created with mode 0700, the archive with 0600.
  Name: `ronne-backup-<UTC yyyymmdd-hhmmss>.tar` (`.tar.enc` when encrypted), from when the backup
  started; one already there with that name is refused ("wait a second").
- **Written as `<name>.partial`**, flushed to disk, then renamed: a schedule copying the folder
  never takes a half-written archive, and `--keep` never counts one. Ctrl-C, SIGTERM or SIGHUP
  while it's written removes the partial file (exit 130, 143, 129; through `pnpm run`, pnpm reports
  1); a process killed outright or a
  power cut leaves it, and since another backup may be writing one, nothing removes `.partial`
  files but the operator (the runbook says so).
- **Nothing is written before the settings are read and the database answers:** a settings file
  that can't be read (a schedule run as another account), a database that can't be opened or
  reached (a first query runs before the archive's file is made), or a SQLite file the settings
  name that isn't there (backup never creates one) stops it with exit 1. The settings file is read
  once, as bytes: the settings the backup runs with (environment variables over the file, an
  empty one counting as unset, as the server reads them) and the copy in the archive come from the
  same read, and the copy is byte for byte.
- **What's in it** (a tar, written as it goes, so a large instance doesn't need the memory; every
  field is in [`docs/spec/backup-format.md`](../../spec/backup-format.md)):
  - `backup.json`, first: the format version (1), Ronne's version, the time, the database kind it
    came from, and the applied migrations (`ronne_migration`'s names, in order), so a reader can
    refuse a backup it can't restore before reading the rest.
  - `database/<table>/<part>.jsonl`: one JSON object per row, in primary-key order, every table the
    migrations made except the migration tables, in parts of up to 10,000 rows or 8 MiB (a larger
    row is a part on its own; a tar header states its entry's size first, so each part is buffered,
    never a whole table). Values are the same JSON for every dialect (dates as ISO 8601 UTC,
    binary as `{"$b64": "…"}`), converted to the target column's type on restore.
  - `manifest.json`, last: each table's columns, primary key and row count, and each entry's size
    and sha256, which are only known once everything is written.
  - `storage/…`: every file under the storage path, as they are (artifacts, plugin zips and their
    sidecars), read after the snapshot. Left out, and named in the output: links (never
    followed), a storage write's temporary file (`<key>.<12 hex>.tmp`, in progress), and names
    storage doesn't write.
  - `settings.env`: the settings file as it is (`DATABASE_URL`, `AUTH_SECRET`, `PUBLIC_URL`,
    `STORAGE_PATH`, …), unless `--no-settings`. Values set only in the environment aren't in a
    file and aren't backed up; the output says which ones were ("AUTH_SECRET comes from the
    environment and isn't in this backup"): `DATABASE_URL`, `AUTH_SECRET`, `PUBLIC_URL`,
    `STORAGE_PATH` or `TRUST_PROXY` set in the environment to a value the file doesn't have. In
    Docker, compose sets `PUBLIC_URL` and `TRUST_PROXY`, and the output says to keep
    `compose.yaml` and the `.env` next to it.
- **Sensitive:** with the settings, the archive holds `AUTH_SECRET` and the database password. The
  output says so, and suggests `--encrypt` when the archive will leave the machine.
- **Encryption (`--encrypt`):** asks for a passphrase twice, or reads it from `--passphrase-file`
  or `RONNE_BACKUP_PASSPHRASE` (for schedules). Only Node.js's own crypto: scrypt (N=2^17, r=8,
  p=1) derives a key from the passphrase and a random salt; the tar is sealed in 64 KiB chunks with
  AES-256-GCM, each chunk's nonce a counter with a last-chunk flag (the STREAM construction), so a
  cut, reordered or altered archive fails to decrypt instead of restoring part of it. The format
  (header, parameters, chunking) is written in `docs/spec/backup-format.md`. A lost passphrase
  can't be recovered; the output and the runbook say so.
- **`--keep <n>`:** after a successful backup, removes the oldest `ronne-backup-*` archives in the
  same folder beyond `n` (1 to 10,000), this one counted and never removed. Only regular files
  named exactly `ronne-backup-<yyyymmdd-hhmmss>.tar` or `.tar.enc` count, ordered by the time in
  their name; links, folders, `.partial` files and other names are never touched. It never runs if
  this backup failed. A file it can't remove is named, and the backup still succeeds.
- **`--yes`** is accepted, so schedules can pass it; backup asks nothing (but the passphrase).
- **Output:** what it wrote, its size, the counts ("1,284 rows in 31 tables, 412 stored files
  (96.0 MiB)"), and the time it took; then warnings: the settings are sensitive, settings only the
  environment has, released versions whose artifact is missing or has another sha256 than the
  database's, storage files left out. Exit 0 only when the archive is complete, 1 when it failed
  (the partial file and the empty folders it made removed, "The backup failed: the disk is full (ENOSPC) …"), 2 for bad flags.
- **While it runs:** writes keep working; the snapshot is what was committed when it started.
- **`--verify`:** reads the archive (decrypting it), checks every entry against the manifest's
  sha256, checks that each released version's artifact is there with the sha256 the database
  records (the integrity check the incident runbook uses, 098), and prints the manifest's summary.
  Exit 1 with the first problem otherwise. It runs every check of the format spec's "What a reader
  checks" but the target's tables (it has no database), needs neither the settings nor a running
  instance, writes and audits nothing, and asks for the passphrase only when the archive turns out
  to be encrypted (its first bytes, never its name). A relative archive path is from where the
  command was typed, as `--out` is. It streams: memory follows the number of entries and tables,
  not the archive's size.
- **Audited** as `instance.backup_made` (`{ via: "cli", tables, rows, files, bytes, encrypted,
  settings }`, never the path or the passphrase), after the archive is complete; if recording it
  fails, the backup still succeeds and says so.

### `rmk-server restore`

```
rmk-server restore <archive> [--passphrase-file <file>] [--database-url <url>] [--with-settings] [--yes]
```

1. **Reads and verifies the whole archive first** (as `--verify`), before writing anything.
2. **Checks the app can take it:** every migration the backup applied must be one this app knows
   (else "This backup comes from a newer Ronne (<version>); install that version or newer to
   restore it"). A backup from an older Ronne restores, and the newer migrations run after.
3. **The target database:** from `--database-url`, else the settings file, else (no settings
   yet) the backup's own `DATABASE_URL` when `--with-settings`, else a new SQLite file in the data
   folder. It must be **empty**: no tables, or only the migration tables with nothing applied.
   Otherwise: "The database isn't empty. Restore into a new database, or remove this one first",
   and for SQLite, how to move the file aside. Nothing is changed.
4. **The target storage** must be empty or absent. Same refusal otherwise.
5. **The server must be stopped:** restore takes the migration lock, as start does, so a server
   starting meanwhile waits; when a service is installed and running, restore says to stop it
   (`rmk-server service stop`), and in Docker the runbook uses `docker compose stop web` then
   `docker compose run --rm web pnpm run restore …`.
6. **Restores:** migrates the empty database to exactly the backup's migrations, loads the rows
   table by table in an order that respects foreign keys (from the schema, a helper in `db/`), in
   batches, in one transaction where the database allows it; copies the storage files and checks
   each sha256; then runs the newer migrations.
7. **Settings:** with `--with-settings` and no settings file yet, writes the backup's settings file
   (mode 0600), replacing its `DATABASE_URL` and `STORAGE_PATH` with the targets when they differ.
   Without it, or when a settings file exists, keeps the current one and says what differs
   (`AUTH_SECRET` differs: everyone will need to sign in again; `PUBLIC_URL` differs).
8. **Prints** what it restored and the next step (start the server). Audited after the restore as
   `instance.restored` (`{ from: { version, dialect, time }, rows, files }`), on top of the
   restored log, so the audit log shows both the history and the restore.

If any step fails after writing started, it says what it left (a partly filled database, files in
storage) and that the target must be emptied before trying again. It never deletes anything it
didn't write.

### The Docker volumes and the services

The runbook lists, for each way of installing, the one command and what else to keep:

| Installed with | Back up | Also keep |
|---|---|---|
| Docker | `docker compose exec web pnpm run backup` (archive on the `ronne-data` volume, under `backups/`); copy it out with `docker compose cp` | `.env` next to `compose.yaml` (ports, domain, the database password for the bundled PostgreSQL/MySQL); `./certs` if you brought certificates |
| Packages, service (Linux, macOS) | `sudo rmk-server backup` (runs as the service account) | `/etc/rmk-server/service.json` is recreated by `service install` |
| Windows service | `rmk-server backup` as administrator | as above |
| npm, no service | `rmk-server backup` | — |

The bundled PostgreSQL and MySQL of `compose.yaml` are covered by the archive like any other
database; their own volumes don't need a separate backup.

### Encryption at rest

The runbook's **Encryption at rest** section says what Ronne leaves to the platform and how: an
encrypted disk or volume (LUKS, FileVault, BitLocker, the cloud provider's encrypted volumes) for
SQLite, storage and backups on the server; the managed database's encryption for PostgreSQL and
MySQL; `--encrypt` for archives that leave it; and (with 110) the bucket's server-side encryption.

## Edge cases

- **A very large instance:** the archive is streamed; the database is read in batches inside the
  snapshot transaction; memory stays flat. The runbook gives timings measured in CI for a
  benchmark-sized instance (079's data set).
- **The snapshot transaction on MySQL** must use `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ
  ONLY`; on PostgreSQL `REPEATABLE READ READ ONLY`. Long backups hold the snapshot; on PostgreSQL
  that delays vacuum, noted in the runbook.
- **SQLite's WAL files** aren't copied: the rows are read through the database, so a backup never
  depends on `-wal` and `-shm`.
- **Disk full while writing:** the partial archive is removed and the command says so; `--keep`
  hasn't run.
- **A storage file the database names is missing** (a disk problem before the backup): the backup
  still completes, and says which artifacts are missing; `--verify` and restore report them too.
  Restore continues (the versions answer `artifact_unavailable` as today) when `--yes`, asks
  otherwise.
- **Restoring into another database kind:** SQLite → PostgreSQL, MySQL → SQLite and so on, covered
  by the database tests; values that one dialect stores differently (booleans, dates) go through
  the same helpers the repositories use.
- **A backup taken during a migration:** not possible; backup takes the migration lock (Kysely's:
  an advisory lock on PostgreSQL, `GET_LOCK` on MySQL and MariaDB), so it waits for a running
  migration, starts its snapshot, and releases the lock once the snapshot is fixed. SQLite's
  migrations run in one transaction, which the snapshot never sees half of.
- **`--out` inside the storage path:** refused, so a backup never contains earlier backups.
- **Restoring the same archive twice:** the second finds the database not empty and refuses.
- **An archive from a newer format version:** refused, naming the Ronne version that wrote it
  (`backup.json`); an encrypted archive from a newer container version is refused as "encrypted by
  a newer Ronne", since its header names no version.
- **The passphrase from `RONNE_BACKUP_PASSPHRASE`:** never printed or logged; CodeQL's
  clear-text logging rule ([`codeql-logging.md`](../../knowledge/codeql-logging.md)) applies.
- **Windows paths and file names:** storage keys use `/`; tar entries too; restore writes them
  with the platform's separators and refuses any entry with `..`, an absolute path or a link, as
  unpacking an upload does.

## Documentation

- **Running Ronne** (`operations`, added by 098), new sections:
  - **Backups** (`operations#backup`): the one command per way of installing, the schedule
    examples, `--encrypt`, `--keep`, `--verify`, keeping copies off the machine.
  - **Restoring** (`operations#restore`): the steps, the empty target, moving to another machine
    or another database, what happens to sign-ins when the secret differs.
  - **Encryption at rest** (`operations#encryption`): what Ronne leaves to the disk, the database
    and the bucket.
- **Install → Upgrade** (`install#upgrade`): "back up first" names the command and links to
  Backups.
- **The install guide** (`docs/runbooks/install.md`): the "Back up" paragraph becomes the command
  and a link to the backup runbook.
- **Helpers:** none; backup is a command on the server, with nothing to click.

## Acceptance criteria

- [ ] `rmk-server backup` makes one archive with every table, every storage file and the settings
      file, while the server takes writes, and `--verify` confirms every checksum and every
      released artifact.
- [ ] `rmk-server restore` restores an archive into an empty database of each kind and an empty
      storage, runs the newer migrations, and refuses a non-empty target, a newer backup and an
      altered archive without changing anything.
- [ ] The restore test passes in CI: on Ubuntu, macOS and Windows (server checks), and across
      database kinds (SQLite → PostgreSQL, MySQL, MariaDB and back) in the database tests, with
      the same items, versions, sha256, users, tokens and audit events afterwards.
- [ ] `--encrypt` archives can't be read without the passphrase, and a cut or altered one fails;
      the format is written in `docs/spec/backup-format.md`.
- [ ] `--keep` removes only older `ronne-backup-*` archives, and only after a backup succeeded.
- [ ] Both commands work through `rmk-server`, `pnpm run` and Docker, and as the service account.
- [ ] `docs/runbooks/backup.md` covers schedules, every way of installing, restoring, moving and
      encryption at rest; MVP §15's Operations row records the portable format.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

- None. (Native dumps were the index's first idea; the portable format replaces them for the
  reasons above, and the index row changes with this spec.)
