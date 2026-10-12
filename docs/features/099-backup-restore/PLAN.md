# 099 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. The format.** `docs/spec/backup-format.md`: the tar layout, `manifest.json`'s fields,
  the JSON Lines rows (base64 and date encoding), the encrypted container (header, scrypt
  parameters, salt, STREAM chunking with AES-256-GCM), the format version and what a reader does
  with a newer one. MVP §15's Operations row and the index's 099 row say "a portable archive"
  instead of the native dumps.
  *Done when:* the spec is complete enough that the witness can name every field a reader needs.

- [ ] **2. The snapshot and the dump.** [risky] In `db/`: `readSnapshot(db, fn)` (the read-only
  repeatable transaction per dialect), the table list and foreign-key order from the schema,
  batched reads in primary-key order, and the row encoding. Streams `database/*.jsonl` into a tar
  writer (`packages/core`'s ustar writer, extended to stream if needed).
  *Done when:* db tests on the four databases dump a seeded instance and show that a write made
  during the dump isn't in it; memory stays flat on 079's benchmark data set.

- [ ] **3. `backup`.** The archive (manifest, database, storage, settings), checksums, the output,
  the partial file removed on failure, `--out` (0700/0600, refused inside storage), `--no-settings`,
  `--keep`, the environment-only values named, `instance.backup_made`. Script, `pnpm run`, tsdown
  entry, `rmk-server`'s `SCRIPTS` and help, `scriptForService`.
  *Done when:* tests cover each flag, a disk-full failure (a mock writer) and `--keep`'s limits.

- [ ] **4. Encryption.** [risky] The STREAM container with node:crypto only: scrypt, AES-256-GCM
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
