# 099 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The format.** `docs/spec/backup-format.md`: the tar layout, `manifest.json`'s fields,
  the JSON Lines rows (base64 and date encoding), the encrypted container (header, scrypt
  parameters, salt, STREAM chunking with AES-256-GCM), the format version and what a reader does
  with a newer one. MVP §15's Operations row and the index's 099 row say "a portable archive"
  instead of the native dumps.
  *Done when:* the spec is complete enough that the witness can name every field a reader needs.

- [x] **2. The snapshot and the dump.** [risky] In `db/`: `readSnapshot(db, dialect, fn)` (the read-only
  repeatable transaction per dialect), the table list and foreign-key order from the schema,
  batched reads in primary-key order, and the row encoding. Streams `database/<table>/<part>.jsonl`
  into a tar writer (`packages/core`'s ustar writer, extended to stream and to write pax `path` and
  `size` headers, as the format spec says).
  *Done when:* db tests on the four databases dump a seeded instance and show that a write made
  during the dump isn't in it; memory stays flat on 079's benchmark data set.

- [x] **3. `backup`.** [risky] The archive (`backup.json`, database, storage, settings, manifest),
  checksums, the output, the partial file removed on failure, `--out` (0700/0600, refused inside
  storage), `--no-settings`, `--keep`, the environment-only values named, `instance.backup_made`.
  Script, `pnpm run`, tsdown entry, `rmk-server`'s `SCRIPTS` and help, `scriptForService`.
  *Done when:* tests cover each flag, a disk-full failure (a mock writer) and `--keep`'s limits.

- [x] **4. Encryption.** [risky] The STREAM container with node:crypto only: scrypt, AES-256-GCM
  per 64 KiB chunk, counter nonces, the last-chunk flag; `--encrypt`, the passphrase prompt (twice),
  `--passphrase-file`, `RONNE_BACKUP_PASSPHRASE`.
  *Done when:* tests show a round trip; a wrong passphrase, a cut archive, a reordered chunk, a
  flipped bit and a dropped last chunk each fail with nothing restored; a scan finds no passphrase
  in output or logs; the adversarial pass reviews the construction against the format spec.

- [x] **5. `--verify`.** Reads (and decrypts) an archive, checks every sha256 against the manifest
  and each released version's artifact against the database rows inside it, prints the summary.
  *Done when:* tests cover a good archive, an altered file, a missing artifact and a newer format.

- [x] **6. `restore`.** [risky] Verify first; the migration check (newer backup refused); the
  target database (`--database-url`, settings, `--with-settings`, a new SQLite file) and its
  emptiness check; empty storage; the migration lock and the running-service check; migrate to the
  backup's migrations, load in foreign-key order in batches, copy and check storage, then the newer
  migrations; settings written or differences reported; `instance.restored`; what's left on a
  failure.
  *Done when:* db tests restore on each of the four databases, from each other kind (SQLite ↔
  PostgreSQL, MySQL, MariaDB), from an archive made by an older migration set, and refuse a
  non-empty target, a newer backup and an altered archive with nothing changed.

- [x] **7. The restore test in CI.** `server-probe.js` gains backup → restore into a new data
  folder → start → a token made before the backup works, one revoked before it stays revoked,
  `/api/v1/me` names the same account, and a stored file comes back byte for byte (owner's
  decision, 2026-10-13: no API releases an item, creates a scope or reads the audit log, so the
  released item's sha256 and `instance.restored` are the database tests' to check, on all four
  kinds). It runs in `server-checks.yml` (Ubuntu, macOS, Windows), the bundle smoke test and the
  image's smoke test (`docker compose exec` / `run`); the service tests run backup and restore as
  the service's account, restore refused while the service runs.
  *Done when:* those workflows pass on a pull request with the change.

- [ ] **8. The backup runbook.** `docs/runbooks/backup.md`: the table per way of installing,
  schedules (cron, systemd timer, launchd, Task Scheduler, a Docker host), copies off the machine,
  restoring, moving to another machine and another database, Caddy's certificates, encryption at
  rest, PostgreSQL's vacuum note, timings from CI. `install.md`'s "Back up" points to it.
  *Done when:* each command in it was run on a test instance (Docker and npm at least), written in
  the notes.

- [ ] **9. Documentation.** In `../ronne-web`: **Backups**, **Restoring** and **Encryption at
  rest** in Running Ronne (both `topics.ts`), and the Upgrade line, in English, Portuguese and
  French.
  *Done when:* the docs render tests pass in both repositories.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 2, the dump** (`db/snapshot.ts`, `db/introspect.ts`, `db/dump.ts`; the tar writer in
  `packages/core/src/pack/tar.ts`):
  - `readSnapshot` opens the transaction with raw statements on one connection
    (`db.connection()`), not Kysely's `transaction()`: MySQL's consistent snapshot needs
    `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY`, and PostgreSQL and SQLite fix their
    snapshot at the first read, so it runs one before handing the connection over. It always rolls
    back, and a failed rollback after an error doesn't hide that error.
  - The schema comes from each database's catalogue (`pragma_table_info`, `information_schema`,
    `pg_constraint`), so a backup dumps whatever the migrations made. MySQL's `column_type` keeps
    `tinyint(1)`, which is how a boolean looks there.
  - Rows are read with keyset pagination on the whole primary key (`(a, b) > (?, ?)`), which all
    four databases support; a test reads `dist_tags` (a two-column key) one row at a time.
  - There are no generators in the codebase (the arrow-function rule has no arrow form for
    `function*`), so rows go to a callback, a batch at a time.
  - Each part is buffered whole (a tar header states its size first), and a batch of rows is sized
    by its data: a first query reads the rows' byte lengths (`octet_length`, SQLite's
    `length(cast(… as blob))`, every column in SQLite since any column can hold text, the wide ones
    elsewhere), and the batch takes rows up to 4 MiB of them, a wider row alone. With batches of
    1,000 rows whatever their size, 1,000 drafts' files of 1 MiB took 1.35 GiB of heap (the
    adversarial pass). A row that would take a part past 8 MiB starts a new part, so a large row is
    a part on its own.
  - The size query looks ahead about twice as many rows as the last batch took (32 at first, up to
    1,000), not always 1,000: reading a length reads the value on MySQL, so measuring 1,000 wide rows
    to keep 4 made a table of them quadratic there (300 rows of 1 MiB: 107 s; now 3.6 s). MySQL and
    MariaDB also don't use the primary key's index for a row comparison, `(a, b) > (x, y)`
    (`EXPLAIN`: `type=index`), so they get it spelled out, `a > x or (a = x and b > y)`.
  - The heap held after a full collection is the measure that matters: the peak heap includes
    garbage V8 hasn't collected yet, and grows with the run. `pnpm --filter @ronneai/web
    bench:backup` (079's data set through `scripts/bench-seed.ts`, shared with `bench:feeds`;
    `--wide-rows` adds a draft with that many files of `--wide-kib` each, `longtext` in MySQL) on
    the owner's Mac, Node 24.0.0, 2026-10-12:

    | Database | Items | Draft files | Rows | Parts | Archive (MiB) | Dump (s) | Heap peak (MiB) | Held after a collection (MiB) |
    |---|---|---|---|---|---|---|---|---|
    | SQLite (memory) | 1,000 | — | 3,008 | 10 | 1.6 | 0.06 | 10.4 | 1.4 |
    | SQLite (memory) | 10,000 | — | 30,008 | 11 | 15.6 | 0.15 | 69.4 | 16.6 |
    | SQLite (memory) | 30,000 | — | 90,008 | 17 | 46.7 | 0.38 | 76.7 | 16.5 |
    | SQLite (memory) | 1,000 | 300 × 1 MiB | 3,309 | 54 | 301.7 | 0.91 | 47.6 | 17.5 |
    | SQLite (memory) | 1,000 | 1,000 × 1 MiB | 4,009 | 154 | 1,001.8 | 2.88 | 47.7 | 17.6 |
    | PostgreSQL 15 | 1,000 | — | 3,008 | 10 | 1.6 | 0.10 | 8.7 | 1.2 |
    | PostgreSQL 15 | 10,000 | — | 30,008 | 11 | 15.6 | 0.26 | 58.6 | 16.4 |
    | PostgreSQL 15 | 1,000 | 300 × 1 MiB | 3,309 | 54 | 301.7 | 2.98 | 47.8 | 17.4 |
    | PostgreSQL 15 | 1,000 | 1,000 × 1 MiB | 4,009 | 154 | 1,001.9 | 9.18 | 47.8 | 17.4 |
    | MySQL 8.4 | 1,000 | — | 3,008 | 10 | 1.6 | 0.11 | 8.6 | 1.3 |
    | MySQL 8.4 | 10,000 | — | 30,008 | 11 | 15.6 | 0.38 | 32.3 | 16.3 |
    | MySQL 8.4 | 1,000 | 300 × 1 MiB | 3,309 | 54 | 301.7 | 3.59 | 48.1 | 17.7 |
    | MySQL 8.4 | 1,000 | 1,000 × 1 MiB | 4,009 | 154 | 1,001.8 | 12.41 | 48.1 | 17.7 |

    Earlier, with settings rows as the wide rows (SQLite only, MySQL's `text` stops at 64 KiB):
    300 × 20 MiB, a 6 GB archive, held 39.6 MiB. What's held stops growing at one part's lines and
    bytes (8 MiB), or one row's when a row is larger (a 20 MiB draft file: about 40 MiB), and the
    time grows with the data.
  - SQLite has no read-only transaction: the snapshot turns `query_only` on for its length, and puts
    it back as it was whatever happens, so a write inside it fails as on PostgreSQL and MySQL.
  - SQLite allows NULL in a primary key not declared `NOT NULL` (`instance_settings.key`), and
    `(key) > (NULL)` matches nothing, so the keyset read would end early and lose the rows after
    it: the dump stops with an error instead. `readSchema` reports such a column as nullable.
  - The tar writer runs its calls one at a time, in the order they were made, so a caller that
    doesn't wait (`Promise.all`, `end()` during a stream) can't interleave two entries' bytes. It
    refuses everything after a failed entry (the archive is incomplete by then), and paths with a
    lone UTF-16 surrogate, which would be written as U+FFFD and could become a duplicate. A call
    made from inside its own work (from `write`, or a stream it's reading) would wait in the queue
    for the call it's part of, so it fails (`tar_reentrant`) instead: the writer tells it apart
    with Node's `AsyncLocalStorage`, reached through `process.getBuiltinModule` so core has no
    `node:` import and still loads elsewhere (where the check is skipped). The store is a token
    cleared when its call settles: async work started inside a call (a timer, a listener) keeps
    the store, and adding once that call is over is an ordinary call. While it still runs, such a
    call is refused even where it would only have queued: the writer can't tell the two apart. A
    stream whose work started before it was handed over (pre-fetched) runs outside any call's
    context, so if it added to its own writer it would wait for ever: the writer's contract says
    a source must not add to the writer it feeds (the adversarial pass found it; a time limit was
    the other way out, but it would fail a slow, valid write).
  - The snapshot tests fail, as they should, when the dump runs outside `readSnapshot` (tried on
    SQLite and MySQL, then put back). A write after `readSnapshot` began and before its work's
    first read is left out too: a plain `begin` would let it in on SQLite and MySQL.
  - `readSnapshot` holds the connection for the whole dump: SQLite's Kysely driver has only one, so
    a backup made inside the web server's process would hold its writes until the end. The backup
    command (task 3) runs as its own process, with its own connection.
  - Any refusal from the tar writer (an unsafe path, a wrong size) marks the archive failed, even
    when no byte of that entry was written: task 3 treats it as the end of the backup, removing
    the partial file.
- **Task 3, the command** (`src/server/backup/`: `archive.ts` writes the archive, `run-backup.ts`
  is the command, `cli.ts` its flags; `scripts/backup.ts`):
  - Marked `[risky]` while building it: `--keep` and the clean-up after a failure delete files.
  - The archive is written as `<name>.partial` (opened `wx`, mode 0600), flushed (`fsync`), then
    renamed; a failure closes and removes the partial file, and `--keep` runs only after the
    rename. The tar writer's small writes (512-byte headers, padding) are gathered into 1 MiB
    writes. A disk-full test wraps the real file output and fails with `ENOSPC` after 3 KiB.
  - `readSnapshot` gained `waitForMigrations`: it takes Kysely's own migration lock (through the
    dialect adapter, so it's the same advisory lock or `GET_LOCK` the migrator takes) before the
    snapshot and releases it once the snapshot is fixed. A test holds the lock on another
    connection and checks the backup waits, and sees the table created before the release; with
    the option off, it fails on MySQL (tried, then put back).
  - Storage is read after the snapshot, walked in byte order without following links. A storage
    put writes `<key>.<12 hex>.tmp` and links it into place (`local-storage.ts`): those files are
    left out, as are links and names a storage key can't have; the output names them. Each file is
    read through one handle, its size from that handle, so a file replaced meanwhile is read whole.
  - The released versions' artifacts come from the snapshot (`item_versions` with the item's
    scope and name), then are compared with what storage held: missing ones go in the manifest's
    `missingArtifacts`; one with another sha256 is a warning only (the format has no field for it,
    and `--verify` reports it).
  - A relative `--out`: `rmk-server` makes it absolute (`scriptArgs`) before running the script,
    which as the service's account runs in `/`; the Docker image's `pnpm` stand-in sets
    `RONNE_CALLER_CWD` before moving to the app. In a clone nothing keeps the folder it was typed
    in: pnpm's script shell and tsx both reset `PWD` to the app's folder (tried). `INIT_CWD` is where
    the innermost pnpm was typed: the folder for `pnpm --filter @ronneai/web run backup`, but the
    repository's root for the root's `pnpm run backup`, whose script starts pnpm again there;
    that's what it uses (the adversarial pass found it). `scriptArgs` leaves a value starting with
    `-` alone (`--out --no-settings` would have made a folder named `--no-settings`), and the
    inside-storage check ignores case on macOS and Windows, where a storage folder not made yet
    can't be asked its spelling (the adversarial re-check found both). Folding names in code lost
    to APFS twice more (Unicode forms and full folding, then `ẞ`, U+1E9E, which folds to `ss`
    there and to `ß` in JavaScript), so the check now asks the disk: the folder is made (after the
    database answers, so a refused connection leaves none), then, if storage exists (made by that
    `mkdir` or anyone), both are compared by `realpath`, which gives the disk's own spelling.
    The folders made for a refused backup are removed with `rmdir` (empty ones only), from
    `mkdir`'s first new folder down. A test with the `existsSync` check turned off fails.
    A lone `-` is a folder's name to Node's `parseArgs`, so `scriptArgs` makes it absolute, and
    leaves a blank value blank for the script to refuse.
  - The settings file is read once, by the backup itself (not `loadConfig`, which reads it again):
    the settings it runs with and the copy in the archive are the same text, which no change
    between two reads can split (the adversarial re-checks found two reads could disagree). It's
    read as bytes and archived as they are; only the parsing decodes UTF-8 (a Latin-1 byte had
    become U+FFFD). Inside storage is refused after resolving
    links, for the part of the path that exists.
  - The database is opened, and asked `select 1` (PostgreSQL's and MySQL's pools connect only at
    the first query, the blind re-check found), before the archive's file is made, and a SQLite
    file that isn't there is refused first (`createDb` would make an empty one and its folder). The adversarial pass
    found both, and that a stack trace escaped for an `--out` through a regular file: every error
    before the write is now a `BackupFailedError`.
  - The script asks `runBackup` to remove the partial file on SIGINT, SIGTERM and SIGHUP
    (`removeOnSignal`); a test emits SIGTERM from inside a write with `process.exit` mocked. Names
    printed from storage have control characters escaped (`\x1b`).
  - The app's version comes from `apps/web/package.json`, which tsdown bundles into
    `dist-scripts/backup.mjs`.
  - `src/server/backup/` is database code for CI (`db-scope.js`, `test:db:core`).
  - `server-probe.js` runs `backup --keep 1` twice against a running `rmk-server` (run here on the
    packed and installed package: one archive left), and the image's `scripts-probe.sh` does the
    same through `docker exec … pnpm run backup` and checks the mode (not run here: it needs an
    image build; CI runs it on the pull request).
  - Every failure after the `--out` folder is made removes the empty folders it made (the
    adversarial re-checks found them left behind, while the message said "nothing else changed").
  - Waiting on Windows (owner's decision, 2026-10-12): the inside-storage check relies there on
    Node's `realpath` and `existsSync` seeing NTFS's case-insensitive names. No test runs on Windows
    here, so `server-probe.js` runs `backup --out <data>/STORAGE/b` on macOS and Windows and expects
    the refusal; task 3 is ticked once the Windows server-checks job passes on the pull request.
- **Task 4, encryption** (`src/server/backup/crypto.ts` the container, `passphrase.ts` where the
  passphrase comes from; `--encrypt` and `--passphrase-file` in `cli.ts`, `run-backup.ts`,
  `scripts/backup.ts`):
  - Push-based on both sides, like the tar writer (no generators): the sealer holds bytes until a
    full chunk has a byte after it, since the last chunk must be shorter than the chunk size; at
    the end it seals what's left as the last chunk, or a full chunk then an empty last one. The
    opener opens a full sealed chunk only when more bytes follow it, and the rest at `end` as the
    last; a full chunk at the end, fewer than 16 bytes, or anything after fails. After a failure it
    hands out nothing more and refuses every later call.
  - With fixed chunk sizes, the structure alone already refuses a dropped last chunk, and the salt
    feeds the key, so mutating the last-chunk flag or the header AAD away left the tampering tests
    green (tried). A test opens chunks by hand from the format spec's own description (scrypt,
    nonce, AAD), so a writer that drops either fails it, and so would one that a spec reader
    couldn't open.
  - The key is derived before the archive's file is made (scrypt with N = 2^17 takes about half a
    second and 128 MiB). The plain bytes count toward nothing; the output's size is the file's.
  - The passphrase is read before the backup starts: `--passphrase-file` (relative to where the
    command was typed; `rmk-server` makes it absolute), else `RONNE_BACKUP_PASSPHRASE`, else asked
    twice with a hidden prompt on stderr. Messages never hold it (CodeQL's clear-text logging
    rule); tests check the output, the errors and the audit event for it.
  - The adversarial pass found a `--passphrase-file` that isn't UTF-8 decoded lossily (`pw\xff`
    and `pw\xfe` gave the same key): it's now decoded with a fatal decoder and refused (exit 2),
    and a lone surrogate from the environment or the prompt too (`\p{Cs}` in a `u` regex; the
    project's TypeScript library predates `isWellFormed`). The sealer refuses anything after its
    end, version or KDF 0 reads as a damaged header rather than a newer one, and the opener joins
    its held bytes only once there's a chunk to open (small pushes had copied everything each
    time).
  - The re-checks found Node decodes the environment lossily (a Latin-1 byte becomes U+FFFD before
    the code sees it, so `\p{Cs}` never fires there): a passphrase holding U+FFFD is refused from
    every source. The fatal decoder also strips a leading BOM by default; `ignoreBOM: true` keeps it,
    as the spec trims nothing but one trailing line break.
  - The second adversarial re-check found the hidden prompt (clack over readline) silently drops a
    tab, NUL and other control characters, and keeps only what follows a pasted line break, so a
    typed passphrase and the "same" one in a file could differ. A passphrase holding a control
    character (`\p{Cc}`) is refused from every source (after the one trailing line break is
    removed from a file or the environment); the prompt itself can't be made to keep them.
  - The third adversarial re-check found U+2028 and U+2029 (not `Cc`) taken as line ends by
    readline too. What readline acts on without a word is exactly line endings (`\r`, `\n`,
    U+2028, U+2029) and control characters (key sequences start with ESC), so the rule refuses
    `\p{Cc}`, `\p{Zl}` and `\p{Zp}`: the class, not one more case. Edits a person sees and makes
    the same way each time (backspace, Ctrl-U) are left to the prompt.
- **Task 5, `--verify`** (`src/server/backup/verify.ts` the checks, `run-verify.ts` the command;
  `createTarReader` in `packages/core/src/pack/tar.ts`):
  - core's `readTar` reads a whole archive in memory and only the package format, so a streaming,
    push-based reader joined the writer: ustar headers checked (magic, version, checksum), regular
    files after at most one pax header (`path`, `size` used, other records ignored), safe paths
    once each, then exactly two zero blocks and nothing after; it hands each entry's bytes over in
    order and refuses everything after a failure.
  - The manifest comes last, so verify keeps what it counts (each entry's size and sha256, each
    table's parts, rows and the set of key sets its rows had, the storage keys' sha256 and the
    `item_versions` rows' artifact paths and sha256) and compares at the end. Lines are parsed as
    they arrive; a line is held whole (up to 256 MiB), since a row can be as large as a draft file.
  - Each test breaks one rule on a real archive: its entries are read back and written again with
    one change (and, where only one rule should break, the manifest's files and storage made right
    again). Mutations of the checksum, artifact and order checks each make a test fail (tried).
  - The blind pass found rows' key sets compared as NUL-joined strings, so one key holding two
    column names joined by NUL passed as both: they're compared as JSON arrays now. An encrypted
    archive's header is read (and a newer one named) before the passphrase is asked for, and the
    damaged-archive message no longer speaks of restoring.
  - For task 6, from the re-check: a row with a duplicate JSON key passes verify (JSON.parse keeps
    the last value, and the key set still matches), and a tar re-packed with standard 10 KiB
    record padding is refused (the format allows nothing after the end blocks). Restore decides
    whether to refuse duplicate keys when it reads rows.
- **Task 6, `restore`** (`src/server/backup/restore.ts` the writing half, `run-restore.ts` the
  command; `migrateToExactly` in `db/migrate.ts`; `scripts/restore.ts`):
  - One connection does it all and holds Kysely's migration lock from the emptiness check to the
    audit event: Kysely's migrator takes the same lock again on that session (PostgreSQL's advisory
    locks and MySQL's `GET_LOCK` count per session), so migrating on it doesn't wait for itself.
    The rows' transaction is raw `begin`/`commit` on it, like the snapshot's, because the archive is
    read push by push: it commits when the first entry after the database arrives.
  - Migrating an empty database runs the migrations' own inserts (the global workspace…); those
    rows are deleted, in reverse foreign-key order, inside the transaction, and the backup's come
    in, so the restored database is the backup's exactly.
  - Values follow the target column's kind as the database reports it: PostgreSQL `boolean`,
    MySQL `tinyint(1)`, SQLite `integer` (booleans are 0 and 1 there); timestamps go as text:
    ISO to PostgreSQL, UTC text to MySQL, the ISO text as it is to SQLite (see the re-checks below).
  - verify now hands restore the archive's table order, `backup.json`'s and `manifest.json`'s
    sha256 (which the manifest can't list) and, when asked, settings.env's bytes, which the target
    choice needs before anything is written.
  - The tests compare every table, row by row, between the source and the restored database, with
    values made comparable (booleans as 0/1, dates as ISO): from a SQLite file into this run's kind,
    and from this run's kind into a SQLite file, so the four runs cover SQLite with each of
    PostgreSQL, MySQL and MariaDB both ways. The backup's own `instance.backup_made` comes after its
    snapshot, so it's the source's only extra row; `instance.restored` is the target's.
  - `--with-settings` with no settings file restores into the backup's own `DATABASE_URL`, as the
    spec orders: on the same machine that's the source's database, refused as not empty (the
    script test shows it). On a new machine it's the database the backup came from, if reachable.
  - The first passes found the second read caught changed bytes but not lost entries: it now
    checks, before the rows commit, that every database part came again and the rows add up, and
    at the end every entry and the stored files' count. A test swaps the archive on disk while the
    missing-artifact question is asked, between the reads. SQLite had no lock, so a server starting
    mid-restore could lose its rows: the connection takes SQLite's exclusive locking mode, held
    until it closes (tried: other connections can neither read nor write meanwhile). A non-empty
    SQLite file was changed by createDb turning WAL on before the emptiness check: it's looked at
    read-only first (`openSqliteReadOnly` in `create-db.ts`, the only place with drivers; tests use
    `db/testing/sqlite-files.ts`). Timestamps must read back exactly. A kept settings file that
    names another database or storage is warned about; one that appears mid-restore is kept.
  - The re-checks found: a SQLite target took any text as a timestamp (its columns are text), so
    `_at` columns are checked there too (the schema's naming, guarded by a test on the servers,
    where the types show); node-pg wrote Dates in the process's time zone and cut old offsets'
    seconds (1850 in New York), so timestamps go to PostgreSQL as ISO text and to MySQL as UTC text;
    `backup.json` and `manifest.json` must come again in the second read, and nothing else may take
    their branch; the settings are read again at the end (removed or rewritten meanwhile), and a new
    settings file is linked into place so one that appeared isn't replaced. `onLocked` lets a test
    write from another connection once restore holds SQLite's lock: it gets SQLITE_BUSY, and the
    test fails with the exclusive mode removed (tried).
  - The second adversarial re-check found: the settings file's temporary-and-link creation followed
    a leftover or symlinked temporary file and failed where there are no hard links (FAT32), so it's
    an exclusive create (`wx`, mode 0600) of the file itself, refused if anything is there; the
    second read now checks the format's order too (backup.json first, manifest.json last), and a
    part for a table the schema lacks is "changed", not a crash; year 0000 is refused (valid ISO, no
    year PostgreSQL takes). It also found MySQL and MariaDB archives moving years 0-99 a century:
    mysql2 builds DATETIME with Date's rules, which take them as 1900-1999. `createDb` now reads
    DATETIME itself (`readDatetime`, as UTC, year, month and day set together); every database test
    passes with it on MySQL and MariaDB, and its test fails without it (tried).
  - The third adversarial re-check found `readDatetime` turned zero and out-of-range dates (MariaDB
    stores `2026-00-15` by default) into other real dates where mysql2 had left them invalid and
    the dump refused them: it returns an invalid date unless every part reads back unchanged. It
    also found the second read accepted parts interleaved or renumbered, which the first refuses:
    verify now hands restore the exact sequence of parts (`partOrder`), and the second read must
    see the same. The test of a dropped part takes either refusal, by order or by count.
  - The fourth adversarial re-check found Kysely's MySQL migration lock is one `GET_LOCK` name for
    the whole server: restore held it for its run, so every other database's migrations on that
    server waited (the full MySQL suite timed out under load; in production, other instances on a
    shared server couldn't start). `createDb` gives MySQL an adapter whose lock is named after the
    database (`ronne-migration:` + sha1 of `database()`, under MySQL's 64 characters); server
    starts, backups and restores of one database share it. A test holds one database's lock and
    takes another's at once (it times out with Kysely's lock, tried). PostgreSQL's advisory locks
    are per database already. The dump also refuses year 0000, which no restore takes.
  - The fifth adversarial re-check found a SQLite source still backed up `_at` text no restore
    takes (year 0000, before year 1, impossible dates): the exact-timestamp check is now one helper,
    `parseExactTimestamp` in `db/dates.ts`, used by the dump (`encodeRow`, for `…_at` strings) and
    by restore. The MySQL lock now fails loudly when `GET_LOCK` doesn't answer 1 (after an hour's
    wait, it had gone on unlocked, as Kysely's own does), and hashes the name in lower case.
  - For the release notes (owner): the MySQL/MariaDB migration lock's name changed, so during an
    upgrade an older and a newer instance starting together on one database don't exclude each
    other; upgrade one instance at a time, as the install guide says.
  - The sixth adversarial re-check found a PostgreSQL date past 9999 (`+010000-…`) and a SQLite
    `_at` blob backed up and verified though no restore takes them: the dump checks every Date with
    `parseExactTimestamp` too, and an `_at` value must be text, a Date or NULL. A failure before
    restore starts writing now says "Nothing was changed"; the lock's failure path has a test that
    kills a waiting `GET_LOCK` (MariaDB answers NULL, MySQL errors), which fails without the result
    check (tried).
  - Waiting on Windows and real services (owner's decision, 2026-10-13): writing storage files with
    Windows paths, and `rmk-server restore` refusing while a real service runs, can't be checked on
    this Mac; task 6 is ticked once task 7's backup → restore runs in the Windows, macOS and Ubuntu
    server checks on the pull request.
- **Task 7, CI** (`packages/repo-tools/src/server-probe.js`, `.github/actions/build-image/scripts-probe.sh`,
  `scripts/service/test-{linux,macos,windows}-service.*`):
  - The server probe signs in twice, revokes one token, writes a 300 KiB file into storage, backs
    up with `--out`, stops, restores into a new data folder (`--with-settings --database-url
    file:<new>/ronne.db`: without `--database-url`, the backup's own URL is the old, full database),
    and starts a second server there. Run here against the packed and installed package (macOS):
    every step passes. The bundle smoke test runs the same probe.
  - The image probe copies the archive out, removes the container, and restores in a new container
    on a new volume (`docker create` with `pnpm run restore`, the archive `docker cp`'d in at mode
    644 so the image's `node` user can read it), then starts the image on that volume. Run here
    against a local build: every step passes, nothing left behind. It caught two bugs: `tee |
    grep -q` under `pipefail` fails when grep stops reading early (the output is captured now), and
    backup named its folder through the image's `./data` link; it now uses `RONNE_DATA_DIR` when
    set, so Docker shows `/app/data/backups`.
  - The service tests (systemd, launchd, WinSW) back up as the service's account and check the
    archive's owner and mode, then check restore is refused while the service runs and, once it's
    stopped, runs as the service as far as its own emptiness check. They need the real services:
    CI only.
- **After the merge (#180): the adversarial re-check's low remarks** (branch `feat/099-backup-followup`):
  - A closed output (`| head -1`) crashed `backup` and `restore` after they finished, with a failing
    exit code; any other output error (a full disk under a redirection) did too, and a restore then
    ended after its data was in, before its settings file. Both scripts now ignore errors writing
    their messages (`ignoreOutputErrors` in `backup/cli.ts`). Tested on the real scripts with
    `… | true` (`scripts/backup.db.test.ts`, which fails without either call); run here with the
    output on a full disk image: restore exits 0 with its settings file written.
  - `rmk-server restore` with `RONNE_DATA_DIR` or `RONNE_ENV_FILE` naming the service's own folder
    or settings file is refused while the service runs. The paths are compared as the disk sees
    them (`sameFile`: device and file number), so links, macOS's `/System/Volumes/Data` firmlink
    (which `realpath` doesn't resolve), case and Windows' short names count. A relative one is
    resolved from the web app's folder in the package (`webDir`, passed by `run.ts`), where the
    scripts resolve it. Another instance's folder runs as before (`control.test.ts`,
    `system.test.ts`).
  - Restore tries every stored file at its own path in the storage folder before writing anything
    (`backup/storage-names.ts`): it makes each, empty, where the restore will write it, then removes
    what it made (by the names it made first: macOS's exFAT lists Å decomposed and then can't
    remove it by that spelling; then the folders it made, and exFAT's `._` files beside them),
    leaving the folder as it was. Two names the folder takes for one, a file where a folder must
    go, or a file that can't be written (ENAMETOOLONG, EILSEQ, EACCES…) refuse the restore with
    nothing changed; SIGINT, SIGTERM and SIGHUP meanwhile undo it before exiting. Owner's decision
    (2026-10-14): ask the target disk. Four rounds got there: a per-OS rule, a wide fold picking
    pairs to ask about, then a dry run in a folder next to the storage; each witness found what
    they missed (APFS's ᾼ͂/ᾷ, HFS+'s ignorables, names no pair covered; then the whole path's length,
    the storage folder's own permissions, per-folder casefolding, and a read-only parent refused
    wrongly), all of which only the real paths answer. Run here: the witness's pairs refused on
    APFS, HFS+ and exFAT with nothing left (exFAT keeps a/a‌b apart and restores them); a read-only
    parent restores, a read-only storage folder is refused; a long full path restores where it
    fits; SIGINT and SIGTERM during a 20,000-file run exit 130 and 143 with the data folder empty;
    20,000 files take about 5 s. Tests follow the disk they run on (`storage-names.test.ts`,
    `restore.db.test.ts`), also run with TMPDIR on a case-sensitive APFS image.
  - The fifth round's witness found the cleanup removed more than it made: a user's `._x` beside a
    folder it made, and a file another process wrote into the storage folder meanwhile (a sweep
    of new entries). Now it removes exactly what it recorded making, non-recursively, and a `._`
    file only when it wasn't there before; each step is synchronous, with a yield every 256
    files, so a signal never finds a folder made and not yet recorded (the async version left
    one, caught by the new signal test). SIGQUIT joined SIGINT, SIGTERM and SIGHUP, and a signal
    prints what couldn't be removed. A dangling link or a file on the storage path now reads as
    the error it is (`unmade`), not as a clash. On exFAT, macOS itself rewrites a `._x` when any
    program makes a folder `x` and deletes it with `x` (checked with plain mkdir/rmdir): the
    restore's own mkdir would do the same, so it stays. Run again on HFS+ and exFAT images: the
    pairs refused with nothing left; SIGINT, SIGHUP, SIGQUIT exit 130, 129, 131 with the data
    folder empty.
  - The focused pass (owner's choice, 2026-10-14) found a signal during the check's last
    synchronous stretch or its cleanup could be lost (the handlers came off before the event loop
    delivered it) and the restore went on; and `._name` files another program wrote into a folder
    the check made were removed. Now the check lets the event loop in once more before the
    handlers go, and removes a `._name` only when it appeared as the check made `name`. Run here:
    40 SIGINTs aimed at the end of a 20,000-file check, all exit 130 with nothing left (before:
    about one in three lost, the witness's count). No test injects a writer between the check's
    steps; the rule is in `storage-names.ts` with its reason.
  - Windows CI (#181's new "Disk tests on Windows" job, `server-checks.yml`): `sameFile` passed on
    NTFS, and so did the case pairs. A file and a folder of one name were refused but called
    "can't be written (ENOENT)": Windows says ENOENT where a file stands for a folder on the way,
    so ENOENT now counts as something in the way, which the earlier-name lookup confirms. The
    job runs only `system.test.ts`'s sameFile test: the file's others check POSIX modes.
  - Writing the storage files inside the rows' transaction wouldn't make a failure leave nothing:
    the migrations run before it (and MySQL commits schema changes on its own), so the up-front
    check stays the way.
  - Left as it is: SIGHUP sent to tsx's parent alone, in a clone, orphans the backup (tsx's
    relay; a terminal hang-up signals the group, which works). No test checks that `run.ts` passes
    `webDir` (it would need the packed server).
