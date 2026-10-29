# Backups

> Feature [099](../features/099-backup-restore/SPEC.md) · The archive's format:
> [`docs/spec/backup-format.md`](../spec/backup-format.md) · Installing: [`install.md`](install.md) ·
> When something leaked: [`incident-response.md`](incident-response.md)

For the people who run a Ronne instance. One command makes a complete backup while Ronne runs: the
database, the stored files (released versions, plugins) and the settings file, in one archive. One
command restores it, on the same machine or another, into the same kind of database or another.
Upgrades can't be undone (the database changes on start), so a backup is also the way back.

## The command, for each way of installing

| Installed with | Back up | Where the archive goes | Also keep |
|---|---|---|---|
| Docker (the install script) | `docker compose exec web pnpm run backup` | the `ronne-data` volume, `/app/data/backups/` | `.env` next to `compose.yaml` (ports, domain, the bundled database's password); `./certs` if you brought certificates |
| Linux or macOS service (the packages, `rmk-server service install`) | `sudo rmk-server backup` | the data folder's `backups/`: `/var/lib/rmk-server/backups` on Linux, the folder `rmk-server service status` shows on macOS | nothing: `service install` recreates the rest |
| npm, no service | `rmk-server backup` | the data folder's `backups/` | — |
| A clone of the repository | `pnpm run backup` | `apps/web/data/backups/` | — |

Run the Docker commands in the `ronne-marketplace` folder, where `compose.yaml` is. With a service,
`sudo rmk-server backup` runs as the service's account, on its data and settings.

It prints what it wrote, for example:

```
Wrote /var/lib/rmk-server/backups/ronne-backup-20261014-130541.tar (322 KiB) in 0.0 s.
9 rows in 25 tables, 1 stored file (300 KiB).
! It holds the settings file, with AUTH_SECRET and the database's password: keep it as safe as the server itself, and use --encrypt for copies that leave this machine.
```

**The archive is as sensitive as the server.** With the settings file in it, it holds `AUTH_SECRET`
and the database's password, so it can decrypt the secrets the database keeps: identity providers'
client secrets and the security scan's API key. Keep the backups folder to the server's admins (it's made with mode
0700, each archive 0600), and encrypt copies that leave the machine (below). If an archive leaks,
follow [the settings file, a backup or the server leaked](incident-response.md#the-settings-file-a-backup-or-the-server-leaked).

**Options:**
- `--keep <n>`: after a successful backup, removes the oldest archives in the same folder beyond
  `n` (this one counted). Only files named `ronne-backup-<date>-<time>.tar` or `.tar.enc` count.
- `--out <folder>`: another folder (made if needed; not inside the storage folder). With a service,
  the service's account must be able to write there.
- `--encrypt`: seals the archive with a passphrase (`.tar.enc`): asked twice in a terminal, or
  from `--passphrase-file <file>` or `RONNE_BACKUP_PASSPHRASE` (for schedules). **A lost passphrase
  can't be recovered**: keep it somewhere other than the archives.
- `--no-settings`: leaves the settings file out. Keep a copy of it elsewhere, or a restore starts
  with a new `AUTH_SECRET` (everyone signs in again).
- `--verify <archive>`: reads an archive and checks every checksum, and that every released
  version's file is in it, without restoring anything:

  ```
  ronne-backup-20261014-130541.tar is complete: every checksum matches, and every released version's artifact is in it.
  Made by Ronne 0.3.2 at 2026-10-14T13:05:41.951Z from SQLite, 24 migrations applied (322 KiB).
  ```

A backup reads one consistent moment of the database while Ronne keeps working: what was committed
when it started. It's written as `<name>.partial` and renamed when complete, so a schedule never
copies a half-written archive. Ctrl-C removes the `.partial` file; a power cut or `kill -9` leaves
it, and nothing removes `.partial` files but you (another backup may be writing one).

Settings that come from the environment rather than the settings file aren't in the archive; the
output names them. In Docker that's `TRUST_PROXY` (and `PUBLIC_URL`), which `compose.yaml` and its
`.env` set: keep those two files.

## Making backups on a schedule

Ronne has no schedule of its own: the system's scheduler runs the command. Daily, keeping two weeks,
is a good start. Each example writes to a log; check it, and the `backups/` folder, now and then.

The examples are for Linux and macOS. On Windows, the server runs in a terminal only (no service),
so schedule backups in WSL 2 or a Linux virtual machine, with the Linux steps; `rmk-server backup`
by hand works on Windows too.

**Encrypted on a schedule:** keep the passphrase in a file only root can read, and pass it in `RONNE_BACKUP_PASSPHRASE`. Not `--passphrase-file` with a service: the
backup runs as the service's account, which can't read root's file.

```sh
sudo sh -c 'umask 077; printf "%s\n" "your long passphrase" > /root/ronne-backup-passphrase'
```

### Linux or macOS, cron

In root's crontab (`sudo crontab -e`), with the full path `command -v rmk-server` prints. Cron's
`PATH` is short: installed with npm, `rmk-server` needs `node` on it, so set `PATH` to include
the folder `command -v node` prints (the `.deb` and `.rpm` packages bring their own Node.js and
don't need it):

```
PATH=/usr/local/bin:/usr/bin:/bin
15 3 * * * /usr/bin/rmk-server backup --keep 14 >> /var/log/rmk-server-backup.log 2>&1
```

Encrypted:

```
15 3 * * * RONNE_BACKUP_PASSPHRASE="$(cat /root/ronne-backup-passphrase)" /usr/bin/rmk-server backup --encrypt --keep 14 >> /var/log/rmk-server-backup.log 2>&1
```

Without a service (npm in your own account), use your own crontab (`crontab -e`) and drop the
`sudo`.

### Linux, a systemd timer

`/etc/systemd/system/rmk-server-backup.service`:

```ini
[Unit]
Description=Back up Ronne AI Marketplace
After=rmk-server.service

[Service]
Type=oneshot
ExecStart=/usr/bin/rmk-server backup --keep 14
# For --encrypt: a root-only file with the line RONNE_BACKUP_PASSPHRASE=…
# EnvironmentFile=/etc/rmk-server-backup.env
```

`/etc/systemd/system/rmk-server-backup.timer`:

```ini
[Unit]
Description=Back up Ronne AI Marketplace daily

[Timer]
OnCalendar=*-*-* 03:15
Persistent=true

[Install]
WantedBy=timers.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now rmk-server-backup.timer
systemctl list-timers rmk-server-backup.timer      # when it runs next
journalctl -u rmk-server-backup.service            # what it printed
```

### macOS, launchd

`/Library/LaunchDaemons/ai.ronne.rmk-server-backup.plist` (owned by root, mode 644), with the
path `command -v rmk-server` prints, and a `PATH` with the folder `command -v node` prints
(`/opt/homebrew/bin` with Homebrew's Node.js on Apple silicon): launchd's own is short.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.ronne.rmk-server-backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/rmk-server</string>
    <string>backup</string>
    <string>--keep</string>
    <string>14</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>15</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/var/log/rmk-server-backup.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/rmk-server-backup.log</string>
</dict>
</plist>
```

```sh
sudo launchctl bootstrap system /Library/LaunchDaemons/ai.ronne.rmk-server-backup.plist
sudo launchctl kickstart system/ai.ronne.rmk-server-backup     # run it once now
```

The plist is readable by everyone, so don't put the passphrase in it. Encrypted, the
`ProgramArguments` become `/bin/sh`, `-c` and
`RONNE_BACKUP_PASSPHRASE="$(cat /var/root/ronne-backup-passphrase)" exec /usr/local/bin/rmk-server backup --encrypt --keep 14`.

### A Docker host, cron

In the crontab of an account that may use Docker (`-T`: there's no terminal):

```
15 3 * * * cd /opt/ronne-marketplace && docker compose exec -T web pnpm run backup --keep 14 >> /var/log/ronne-backup.log 2>&1
```

Encrypted, with the passphrase passed from the host's environment (never on the command line):

```
15 3 * * * cd /opt/ronne-marketplace && RONNE_BACKUP_PASSPHRASE="$(cat /root/ronne-backup-passphrase)" docker compose exec -T -e RONNE_BACKUP_PASSPHRASE web pnpm run backup --encrypt --keep 14 >> /var/log/ronne-backup.log 2>&1
```

Use the folder where your `compose.yaml` is (the install script's `ronne-marketplace`).

## Keeping copies off the machine

A backup on the same disk doesn't survive the disk. Copy the archives somewhere else, encrypted
(`--encrypt`) when that place isn't yours alone. The archive is a plain file: any tool does.

- **Docker:** copy out of the volume first. `docker compose cp web:/app/data/backups/. ./ronne-backups/`
  copies the whole folder (the archives keep their mode 0600).
- **Another machine:** `rsync -a --ignore-existing --exclude '*.partial' /var/lib/rmk-server/backups/ backup-host:/srv/ronne/`
  copies the new archives only, never one being written.
- **Object storage,** for example `rclone copy --exclude '*.partial' /var/lib/rmk-server/backups remote:ronne-backups`
  or `aws s3 cp /var/lib/rmk-server/backups/ronne-backup-20261014-130541.tar.enc s3://your-bucket/ronne/`.

Run the copy after the backup (the same cron line, `&&`, or a second timer a little later).

**Very large instances:** every backup is full. If the stored files are large, keep fewer archives
on the machine (`--keep 3`) and copy the storage folder to the other place incrementally as well:
released files never change, so `rsync -a --ignore-existing <data folder>/storage/ backup-host:/srv/ronne-storage/`
sends only new ones. The archives remain what you restore from.

## Checking a backup

`--verify` on an archive (on any machine with `rmk-server` or the image: it needs no database) says
whether it's complete. Every few months, restore one into a scratch folder, as below, and start
it: that's the only check that it restores.

## Restoring

Restore only goes into an **empty** database and an **empty** storage folder, and never while Ronne
runs. It checks the whole archive first, and refuses with nothing changed when the archive was cut
or altered, comes from a newer Ronne ("install that version or newer"), or when the target isn't
empty. Then it restores the rows and files, runs the database changes this version has since, and
writes or keeps the settings file.

**The settings file:**
- `--with-settings`: on a machine with no settings file yet, writes the backup's, so sessions and
  everything else carry on (with the database and storage it restored into).
- Without it, and no settings file: writes a new one with a new `AUTH_SECRET`. Everyone signs in
  again; access tokens keep working.
- A settings file that's already there is kept; restore says what differs from the backup's.
- With another `AUTH_SECRET` than the backup's (no `--with-settings`, or a kept settings file with
  another one), two-factor sign-in is turned off for everyone who had it, and each identity
  provider whose client secret can't be read is marked *Failing* with "Enter the client secret
  again" (Admin › Settings › Authentication); restore says how many of each. Sign-in with such a
  provider fails until its secret is entered again: root can still sign in with a password. The
  security scan's API key can't be read either: Admin › Settings › Security scan asks for it
  again, and semantic scans run static meanwhile.

An encrypted archive asks for its passphrase (or `--passphrase-file`). A backup made while some
stored files were missing asks before restoring without them (`--yes` restores anyway).

### Replacing a broken instance, on the same machine

Stop Ronne, move the current data aside (don't delete it until the restored instance works), then
restore.

**Docker:**

```sh
docker compose stop web
docker compose run --rm --no-deps web sh -c 'mkdir /app/data/before-restore && mv /app/data/ronne.db* /app/data/storage /app/data/.env /app/data/before-restore/'
docker compose run --rm --no-deps web pnpm run restore /app/data/backups/ronne-backup-20261014-130541.tar --with-settings
docker compose up -d
```

With the bundled PostgreSQL or MySQL, the database must be emptied instead of moved: restore into
a new one (below), or drop and recreate the `ronne` database.

**A service (Linux; on macOS, the data folder `rmk-server service status` shows):** move the
database and the stored files aside inside the data folder, which stays (the service's account
may write in it, not in the folder above), with the backups:

```sh
sudo rmk-server service stop
cd /var/lib/rmk-server
sudo mkdir -m 700 before-restore && sudo mv ronne.db* storage before-restore/
sudo rmk-server restore /var/lib/rmk-server/backups/ronne-backup-20261014-130541.tar
sudo rmk-server service start
```

`rmk-server restore` refuses while the service runs. The settings file
(`/etc/rmk-server/env`) is kept: it's this instance's. With PostgreSQL or MySQL, the database must
be emptied instead (below).

**npm, no service:** stop `rmk-server`, move its data folder aside, `rmk-server restore <archive> --with-settings`, start it.

### On another machine

Install Ronne the same way on the new machine, **without running its setup**, copy the archive
over, and restore with `--with-settings` (the backup's `PUBLIC_URL` comes along; change it in the
settings file if the address changes).

**Docker:** copy `compose.yaml` and its `.env` too. The archive goes into the new volume through a
throwaway container (as root, to give it to the image's `node` user):

```sh
docker compose run --rm --no-deps --user root -v "$PWD:/from:ro" web sh -c 'mkdir -p -m 700 /app/data/backups && cp /from/ronne-backup-20261014-130541.tar /app/data/backups/ && chown -R node:node /app/data/backups && chmod 600 /app/data/backups/ronne-backup-20261014-130541.tar'
docker compose run --rm --no-deps web pnpm run restore /app/data/backups/ronne-backup-20261014-130541.tar --with-settings
docker compose up -d
```

**A service or npm:** `sudo rmk-server restore ronne-backup-20261014-130541.tar --with-settings`,
then `sudo rmk-server service start` (or `rmk-server` without a service).

### Into another kind of database

A backup restores into SQLite, PostgreSQL, MySQL or MariaDB, whatever it came from: the way to move
an instance that outgrew SQLite. Make an empty database and a user for it on the server, then name
it with `--database-url`; the settings file written gets that `DATABASE_URL`.

```sh
sudo rmk-server restore ronne-backup-20261014-130541.tar --with-settings --database-url 'postgres://ronne:PASSWORD@db.example.com:5432/ronne'
```

With Docker's bundled PostgreSQL (the `postgres` profile; MySQL is the same with `mysql` and
`mysql://ronne:PASSWORD@mysql:3306/ronne`), on a new volume, with `PASSWORD` the
`RONNE_DB_PASSWORD` in the `.env` next to `compose.yaml`:

```sh
docker compose --profile postgres up -d --wait postgres
docker compose run --rm --no-deps web pnpm run restore /app/data/backups/ronne-backup-20261014-130541.tar --with-settings --database-url 'postgres://ronne:PASSWORD@postgres:5432/ronne'
docker compose --profile postgres up -d
```

### When a restore stops part way

If it fails after it started writing, it says what it left (a partly filled database, files in
storage). Empty both (a new database, an empty storage folder) and run it again. It never deletes
anything it didn't write.

## Using your database's own tools instead

If you prefer `pg_dump`, `mysqldump` or a copy of the SQLite file (stop Ronne first, or use
`sqlite3 ronne.db ".backup copy.db"`), back up these alongside, at the same time: the **storage
folder** (`STORAGE_PATH`, the data folder's `storage/` by default) and the **settings file**. Such a
backup is yours to test: restore it somewhere and start Ronne on it.

## Caddy's certificates

The archive doesn't hold the proxy's HTTPS certificates: they're issued again when Caddy starts on a
new machine. To keep them anyway (Let's Encrypt limits how many certificates a domain gets per week,
which matters if you move often):

- **Docker:** save the `caddy-data` volume, and on the new machine put it back before
  `docker compose up -d`:

  ```sh
  docker compose run --rm --no-deps -v "$PWD:/out" --entrypoint tar proxy -czf /out/caddy-data.tar.gz -C /data .
  docker compose run --rm --no-deps -v "$PWD:/in:ro" --entrypoint tar proxy -xzf /in/caddy-data.tar.gz -C /data
  ```
- **A service:** the proxy's folder, `/var/lib/rmk-server-proxy` on Linux (on macOS,
  `var/rmk-server-proxy` next to the data folder): `sudo tar -czf caddy-data.tar.gz -C /var/lib/rmk-server-proxy .`

Certificates you brought yourself (`RONNE_TLS=files`) are in `./certs` (Docker) or the proxy's
`certs` folder: keep them with your other keys.

## Encryption at rest

Ronne doesn't encrypt its own files: the platform does it better, and a key inside the app would be
one more secret to lose. What to use:
- **The server's disk** for SQLite, the stored files and the backups folder: LUKS on Linux,
  FileVault on macOS, or the cloud provider's encrypted volumes.
- **The database's own** for PostgreSQL and MySQL: the managed service's encryption, or the
  server's disk as above.
- **Archives that leave the machine:** `--encrypt` (AES-256-GCM, with a key derived from your
  passphrase).

## Large instances

The backup streams: it never holds a whole table or the archive in memory. Measured with the backup
benchmark (`pnpm --filter @ronneai/web bench:backup`, 079's data set: skills with a small
artifact each; 2026-10-14, on an Apple M1 Max, against local servers), the database part
takes:

| Items (rows) | Database part of the archive | SQLite | PostgreSQL | Memory held, most |
|---|---|---|---|---|
| 1,000 (3,008) | 1.6 MiB | 0.07 s | 0.14 s | about 1.5 MiB |
| 10,000 (30,008) | 15.6 MiB | 0.19 s | 0.36 s | about 17 MiB |

The stored files are copied as they are, at the disk's speed.

**PostgreSQL:** the backup holds one snapshot for as long as it runs, and PostgreSQL can't clean
up rows changed after it began (vacuum) until it ends. For a backup of minutes, that's nothing;
schedule long ones at a quiet hour.

## Troubleshooting

- **"The storage folder … isn't empty"** or **"The … database isn't empty":** restore only fills an
  empty one. Move the current one aside (above), or give another with `--database-url` / `STORAGE_PATH`.
- **"This backup comes from a newer Ronne":** install that version (or newer), then restore.
- **"the rmk-server service is running. Stop it first":** `sudo rmk-server service stop`, restore,
  start it again.
- **"… are one name in the storage folder …":** the backup was made on a disk that tells case apart
  (Linux, usually) and holds two files whose names differ only by case; this disk (macOS's,
  exFAT) can't hold both. Restore on Linux, or onto a case-sensitive volume.
- **A lost passphrase:** an encrypted archive can't be read without it. Make a new backup.
- **`.partial` files in `backups/`:** a backup that was killed, or one running now. Remove old ones
  by hand.
- **The settings file couldn't be read:** run the backup as the account that runs the server
  (`sudo rmk-server backup` with a service).
