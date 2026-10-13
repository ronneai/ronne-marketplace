# Backup format spec

> Status: draft · Feature [099](../features/099-backup-restore/SPEC.md) · Decision: MVP §15,
> Operations

What `rmk-server backup` writes and `rmk-server restore` and `backup --verify` read: one archive with
the database, the storage and the settings file, the same for SQLite, PostgreSQL and MySQL/MariaDB.
An archive is either a **plain archive** (a tar, below) or an **encrypted archive** (that tar sealed
in the container at the end of this spec). This spec is the contract between writers and readers:
anything not written here is the writer's choice and a reader must not depend on it.

| File | Name | Content |
|---|---|---|
| Plain archive | `ronne-backup-<yyyymmdd-hhmmss>.tar` (UTC) | the tar |
| Encrypted archive | `ronne-backup-<yyyymmdd-hhmmss>.tar.enc` | the container, holding the tar |

A reader tells them apart by the first 8 bytes (the container's magic, below), never by the name.

## Versions

Two numbers, each a positive integer:

- **The archive format**, `format` in `backup.json` and `manifest.json`: this spec is format **1**.
- **The container version**, a byte in the encrypted header: this spec is version **1**.

A writer changes a number only when a reader of the old one would misread the new archive. A reader
that meets a number it doesn't know stops before writing anything: for `format`, "This backup was
made by Ronne <backup.json's `ronne`> in backup format <n>; install that version or newer to read
it"; for the container, "This backup was encrypted by a newer Ronne; install a newer version to read
it". Adding fields to the JSON files doesn't change a version: readers ignore fields they don't know.

## The tar

POSIX ustar (`magic` `"ustar\0"`, `version` `"00"`), with pax extended headers only where ustar
can't say something (below). The archive ends with two 512-byte zero blocks.

- **Only regular files** (type flag `"0"`), each preceded by at most one pax extended header (type
  flag `"x"`) that applies to it. No directories, links, devices, global headers (`"g"`) or other
  types: a reader stops on any of them.
- **A pax header** is written only when needed, and holds only these records:
  - `path`, when the path doesn't fit ustar's `prefix` (≤ 155 bytes) and `name` (≤ 100 bytes),
    split at a `/`. The ustar `name` then holds a truncated placeholder that readers ignore.
  - `size`, when the entry is 8 GiB or more (ustar's 11 octal digits stop below 8 GiB).
  A reader ignores any other pax record it finds, and uses `path` and `size` from the pax header
  over the ustar fields.
- **Header fields:** `mode` `0600`, `uid` and `gid` `0`, `uname` and `gname` empty, `mtime` `0`.
  Readers don't use them: a restore sets its own modes (0600 for files it writes).
- **Paths** are UTF-8, relative, with `/` between segments, no empty segment, no `.` or `..`
  segment, no leading `/`, no `\`, no NUL. A reader refuses any other path, and any path it has
  already seen.
- **Order:** `backup.json` first, then `database/…`, then `storage/…`, then `settings.env` when
  there is one, then `manifest.json` last. Within `database/`, tables in any order, one table's
  parts together and in increasing number (never `a/000001`, `b/000001`, `a/000002`). A reader
  refuses entries out of this order.

A writer streams: it writes each entry as it goes and never needs the whole archive in memory. That
is why the manifest, which counts and hashes everything, comes last, and why a table is split into
parts (a tar header states its entry's size before the bytes, so each part is buffered whole).

### The entries

| Path | Required | What |
|---|:-:|---|
| `backup.json` | ✓ | What the archive is, readable before the rest (below) |
| `database/<table>/<part>.jsonl` | ✓ | One table's rows, in parts (below) |
| `storage/<key>` | | One storage file: `<key>` is its storage key (`incident/notes/1.0.0.tgz`, `feeds/claude-code/…zip`), its bytes as they are |
| `settings.env` | | The settings file as it was, byte for byte; absent with `--no-settings` |
| `manifest.json` | ✓ | Counts and sha256 of everything above (below) |

A table with no rows has no parts; a backup with no storage files has no `storage/` entries.

## `backup.json`

Written first, so a reader can refuse an archive it can't restore before reading the rest. UTF-8
JSON, one object:

| Field | Type | What |
|---|---|---|
| `format` | integer | The archive format, `1` |
| `ronne` | string | The writer's Ronne version, such as `"0.4.0"` |
| `createdAt` | string | When the snapshot started, ISO 8601 UTC with milliseconds (`2026-10-12T15:31:02.123Z`) |
| `dialect` | string | The source database: `"sqlite"`, `"postgres"` or `"mysql"` (MariaDB is `"mysql"`) |
| `migrations` | string[] | The source's applied migrations, the `name` column of `ronne_migration`, in name order |

```json
{
  "createdAt": "2026-10-12T15:31:02.123Z",
  "dialect": "postgres",
  "format": 1,
  "migrations": ["0001_identity", "0002_audit_log", "…", "0024_scope_moves"],
  "ronne": "0.4.0"
}
```

A reader refuses the archive when `migrations` names one its app doesn't have (a newer Ronne made
it, see SPEC step 2), and when `migrations` isn't a prefix of its own list, in order.

## The rows: `database/<table>/<part>.jsonl`

- **`<table>`** is the table's name as the migrations create it (`item_versions`, `user`). Every
  table the migrations made is backed up except `ronne_migration` and `ronne_migration_lock`
  (their state is `backup.json`'s `migrations`).
- **`<part>`** is a 6-digit decimal number from `000001`, in order with no gaps. How many rows a part
  holds is the writer's choice (Ronne ends a part at a row boundary once it has 10,000 rows or 8 MiB;
  a single row larger than that, such as a 20 MiB draft file, is a part on its own). A line can be
  as long as the largest row, so readers don't limit line length below the part's size.
- **JSON Lines:** UTF-8, one JSON object per row, each line ending with `\n`, no blank lines. A part
  holds at least one row.
- **Order:** across a table's parts, rows in increasing primary-key order (the key's columns in their
  declared order, compared as the source database sorts them). Readers don't rely on it; it makes
  archives of the same data comparable.
- **Every row has every column** the manifest lists for its table, as keys of the object, and no
  others. Key order isn't significant.

### Values

A value is written as the JSON value below, the same for every dialect. The source's type decides
nothing: a reader converts each value to the **target** column's type.

| Stored | Written as | Example |
|---|---|---|
| SQL `NULL` | `null` | `null` |
| A string (`varchar`, `text`, JSON kept as text) | a JSON string, exactly the stored characters | `"@incident/notes"` |
| An integer | a JSON number (integers up to 2^53 − 1 only; a writer stops on a larger one) | `1284` |
| A boolean | as the source stores it: `true`/`false` (PostgreSQL), `1`/`0` (SQLite, MySQL's `tinyint(1)`) | `true`, `1` |
| A timestamp | a JSON string, ISO 8601 UTC with milliseconds and `Z`: the form `toDbDate` writes in SQLite | `"2026-10-12T15:31:02.123Z"` |
| Bytes (`blob`, `bytea`; none today) | `{"$b64": "<standard base64 with padding>"}` | `{"$b64": "AAEC"}` |

A reader, for each target column:
- **Any column:** takes `null` when the target column allows NULL; `null` into a `NOT NULL` column
  stops the restore.
- **Boolean column:** takes `true`, `false`, `1` or `0`; anything else stops the restore.
- **Integer column:** takes a JSON number with no fraction, or `true`/`false` as `1`/`0`.
- **Timestamp column** (PostgreSQL `timestamptz`, MySQL `datetime(3)`): takes the ISO string as UTC.
  In SQLite, timestamps are text columns, and the string is stored as it is, which is the form
  SQLite instances write already.
- **Text column:** takes a string as it is.
- **Bytes column:** takes `{"$b64": …}` only.

Any other combination (a string for an integer column, an object other than `$b64`) stops the
restore with the table, the part, the line and the column.

```jsonl
{"created_at":"2026-10-12T15:31:02.123Z","disabled_at":null,"email":"root@example.com","email_verified":1,"id":"01M4RA…","image":null,"name":"Root","role":"root","updated_at":"2026-10-12T15:31:02.123Z"}
```

## `manifest.json`

Written last. UTF-8 JSON, one object:

| Field | Type | What |
|---|---|---|
| `format` | integer | `1`, the same as `backup.json`'s |
| `tables` | object | One entry per backed-up table, keyed by name (below) |
| `files` | object | One entry per entry of the tar except `backup.json` and `manifest.json`, keyed by its tar path: `{ "size": <bytes>, "sha256": "<64 lowercase hex>" }` |
| `storage` | object | `{ "files": <count>, "bytes": <total> }` for the `storage/` entries |
| `settings` | object | `{ "included": <boolean>, "environmentOnly": [<names>] }`: whether `settings.env` is in the archive, and the settings that came only from the environment (`"AUTH_SECRET"`), never their values |
| `missingArtifacts` | object[] | Released versions whose artifact wasn't in storage when the backup ran: `{ "item": "@scope/name", "version": "1.0.0", "path": "<artifact_path>" }`. Empty when none |

Each `tables` entry:

| Field | Type | What |
|---|---|---|
| `columns` | string[] | The table's columns, in the source's order |
| `primaryKey` | string[] | The primary key's columns, in order |
| `rows` | integer | How many rows the parts hold, together |
| `parts` | integer | How many parts (`0` when `rows` is `0`) |

```json
{
  "files": {
    "database/user/000001.jsonl": { "sha256": "9f2c…", "size": 2210 },
    "settings.env": { "sha256": "41d0…", "size": 318 },
    "storage/incident/notes/1.0.0.tgz": { "sha256": "553b7717ea9f…", "size": 1024 }
  },
  "format": 1,
  "missingArtifacts": [],
  "settings": { "environmentOnly": [], "included": true },
  "storage": { "bytes": 1024, "files": 1 },
  "tables": {
    "user": { "columns": ["id", "name", "email", "…"], "parts": 1, "primaryKey": ["id"], "rows": 2 }
  }
}
```

### What a reader checks

`--verify`, and restore before it writes anything, read the whole archive and stop on the first
problem, naming it:

1. The container (when encrypted) decrypts to the end (below).
2. The tar follows this spec: entry types, paths, order, `backup.json` first and `manifest.json`
   last, and nothing after `manifest.json` but the end blocks.
3. `backup.json`'s `format` and `migrations` are ones this reader can restore (above).
4. Every entry between them is in `manifest.files`, with that size and sha256, and every
   `manifest.files` path is in the archive. sha256 is of the entry's bytes, as stored in the tar.
5. Each table's parts are numbered `1..parts`, hold `rows` lines together, and each line is a JSON
   object with exactly the table's `columns`.
6. The tables tie together: every `database/<table>/` in the archive is in `manifest.tables`,
   every table with `rows` above 0 has parts in the archive, and `manifest.storage` matches the
   `storage/` entries' count and total size. A restore also checks, after migrating the empty
   target to `backup.json`'s `migrations`, that `manifest.tables` names exactly the target's tables
   (without the migration tables) and each table's `columns` and `primaryKey` exactly the target's.
7. Each released version's artifact (an `item_versions` row: its `artifact_path` and `sha256`) is in
   the archive as `storage/<artifact_path>` with that sha256, or is listed in `missingArtifacts`.
   An artifact missing from both, or present with another sha256, is a problem.

A plain archive that is cut short fails at step 2 or 4. `--verify` has no target database, so it
runs every check but the target's tables in step 6. Readers don't trust `manifest.json` for
anything they can count themselves.

## The encrypted container

The plain archive's bytes, sealed with a key derived from a passphrase. Node.js's own `node:crypto`
is enough to read and write it: scrypt and AES-256-GCM.

```
header (40 bytes) | chunk 0 | chunk 1 | … | last chunk
```

### The header

| Offset | Bytes | Field | Value |
|---:|---:|---|---|
| 0 | 8 | magic | ASCII `RONNEBAK` |
| 8 | 1 | container version | `1` |
| 9 | 1 | key derivation | `1`: scrypt |
| 10 | 1 | scrypt `log2(N)` | `17` (N = 131,072) |
| 11 | 1 | scrypt `r` | `8` |
| 12 | 1 | scrypt `p` | `1` |
| 13 | 16 | salt | random, new for every archive |
| 29 | 4 | chunk size | big-endian unsigned, `65536` |
| 33 | 7 | reserved | zero |

A reader refuses a header whose magic, version or key derivation it doesn't know, a reserved byte
that isn't zero, and scrypt parameters or a chunk size outside the limits it accepts (version 1
readers: `log2(N)` from 15 to 18, `r` exactly 8, `p` from 1 to 4, chunk size from 4,096 to
1,048,576), so an altered header can't make it spend more than 512 MiB or unbounded time.

### The key

```
key = scrypt(passphrase, salt, N, r, p, keylen = 32)
```

- **The passphrase** is the UTF-8 bytes of the passphrase in Unicode NFC. One trailing `\n` or
  `\r\n` is removed from `--passphrase-file`'s content and from `RONNE_BACKUP_PASSPHRASE`; nothing
  else is trimmed (a leading BOM in the file is part of the passphrase). An empty passphrase is
  refused, and so is one that isn't valid Unicode text (a `--passphrase-file` that isn't UTF-8, a
  lone surrogate), that holds U+FFFD, the replacement character an undecodable byte becomes
  (Node.js decodes the environment that way), or that holds a control character (Unicode `Cc`:
  tab, a line break other than the one trailing one removed, NUL, ESC…) or a line or paragraph
  separator (U+2028, U+2029): a terminal prompt drops or acts on those, so a typed passphrase and
  the same one in a file could differ, and decoding would turn different bytes into one key. (scrypt's HMAC hashes a passphrase longer than 64 bytes first, so
  such a passphrase and its SHA-256 are the same key: harmless, since one comes from the other.)
- scrypt needs 128 × N × r bytes (128 MiB with the defaults), and Node.js counts more than that
  against `maxmem`, whose default (32 MiB) is too low: readers and writers pass
  `maxmem = 256 × N × r` (256 MiB with the defaults, 512 MiB at the readers' limit), measured to be
  enough for every accepted header on Node.js 22 and 24.
- The salt is new for every archive, so every archive has its own key: nonces never repeat under a
  key, and there is no nonce prefix to store.

### The chunks

The plain archive is cut into chunks of `chunk size` bytes; the last chunk holds the rest, **always
fewer than `chunk size` bytes** (zero bytes when the plain archive's length is a multiple of the
chunk size). Each chunk is sealed with AES-256-GCM:

```
nonce(i)    = 7 zero bytes | i as 4 bytes big-endian | last flag (1 byte: 0x01 for the last chunk, else 0x00)
aad         = the 40-byte header
sealed(i)   = AES-256-GCM(key, nonce(i), plaintext chunk i, aad) ciphertext | 16-byte tag
```

That is the STREAM construction (Hoang, Reyhanitabar, Rogaway and Vizár, 2015), as `age` and Tink
use it: each chunk can only decrypt at its own position, only the last one with the last flag, and
every chunk authenticates the header.

- **Writing:** chunks `0, 1, …` in order; the counter `i` starts at 0 and must not wrap (at most
  2^32 chunks, 256 TiB with 64 KiB chunks); the last chunk is always written, even empty.
- **Reading:** read `chunk size + 16` bytes at a time. A full read that the end of the file follows
  is an error (the last chunk is never full, so the archive was cut). A shorter read (from 16 bytes)
  is the last chunk, opened with the last flag; fewer than 16 bytes, or any byte after it, is an
  error. A chunk that fails to open is an error.
- **On any error** the reader says the archive is damaged or the passphrase is wrong (GCM can't tell
  them apart) and writes nothing. A restore decrypts the whole archive (to check it, step 1 above)
  before it writes anything, then reads it again to restore.

What this protects: the archive's content from anyone without the passphrase, and the archive from
being cut, reordered, spliced with another archive's chunks or altered without the restore noticing.
What it doesn't: the archive's size and the time it was made, which stay visible, or a weak
passphrase, which scrypt only slows down. A lost passphrase can't be recovered.
