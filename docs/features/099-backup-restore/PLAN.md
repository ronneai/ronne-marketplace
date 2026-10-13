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

- [ ] **3. `backup`.** [risky] The archive (`backup.json`, database, storage, settings, manifest),
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

- [ ] **5. `--verify`.** Reads (and decrypts) an archive, checks every sha256 against the manifest
  and each released version's artifact against the database rows inside it, prints the summary.
  *Done when:* tests cover a good archive, an altered file, a missing artifact and a newer format.

- [ ] **6. `restore`.** [risky] Verify first; the migration check (newer backup refused); the
  target database (`--database-url`, settings, `--with-settings`, a new SQLite file) and its
  emptiness check; empty storage; the migration lock and the running-service check; migrate to the
  backup's migrations, load in foreign-key order in batches, copy and check storage, then the newer
  migrations; settings written or differences reported; `instance.restored`; what's left on a
  failure.
  *Done when:* db tests restore on each of the four databases, from each other kind (SQLite ↔
  PostgreSQL, MySQL, MariaDB), from an archive made by an older migration set, and refuse a
  non-empty target, a newer backup and an altered archive with nothing changed.

- [ ] **7. The restore test in CI.** `server-probe.js` gains backup → restore into a new data
  folder → start → the probe's item installs with the same sha256, the token works, the audit log
  has `instance.restored`. It runs in `server-checks.yml` (Ubuntu, macOS, Windows), the bundle
  smoke test and the image's smoke test (`docker compose exec` / `run`).
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
