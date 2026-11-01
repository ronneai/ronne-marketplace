# 165 — Backups encrypted by default

> Milestone: M28 · Depends on: 099, 083 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Operations"), [the backup runbook](../../runbooks/backup.md) · Contracts: [`docs/spec/backup-format.md`](../../spec/backup-format.md) unchanged (it already describes both kinds)

## Goal

A backup holds everything: the database (accounts, password hashes, private items, the audit log),
the stored files and, unless left out, the settings file with `AUTH_SECRET` and the database's
password. Whoever reads a backup can sign in as anyone and decrypt the sealed secrets. 099 encrypts
one only with `--encrypt`. This feature makes encryption the default, and an unencrypted archive
something the operator asks for by name (owner, 2026-11-01).

## Scope

**In:**
- **`backup` encrypts unless told not to.** The passphrase comes from the first of:
  - `--passphrase-file FILE`;
  - `RONNE_BACKUP_PASSPHRASE`;
  - asked twice on a terminal.

  The archive is `ronne-backup-<UTC>.tar.enc`, sealed as 099's `--encrypt` seals it (scrypt,
  AES-256-GCM in chunks; `backup/crypto.ts`).
- **A new passphrase is at least 12 characters** (the password rule, `identity/models/password.ts`).
  A shorter one is refused before anything is written. Reading an archive (`--verify`, `restore`)
  accepts any passphrase that opens it, so older archives still restore.
- **`--plain`** makes an unencrypted `.tar`.
  - It prints a warning first: "This archive isn't encrypted. It holds AUTH_SECRET and the
    database's password: anyone who reads it can sign in as anyone".
  - With `--no-settings` the warning names only the database and the files.
- **No passphrase and no terminal** (a schedule that hasn't been updated): `backup` refuses with exit
  code 2 and writes nothing. The message names the three ways and `--plain`.
- **`--encrypt`** stays accepted and changes nothing, so scripts that have it keep working.
- **`instance.backup_made`** already records `encrypted`. It also records `plain: true` when
  `--plain` was asked for.
- **The runbook's schedules** (cron, systemd timer, launchd, a Docker host's cron;
  `docs/runbooks/backup.md`) use a passphrase file (0600, owned by the service's user). The upgrade
  notes for the release say that schedules without one stop until they get one.
- **`restore` and `backup --verify`:** unchanged.

**Out** (and where it goes instead):
- **Keys from a KMS or a password manager:** the passphrase file and the variable are the
  interfaces. A key service is an operator's tool in front of them.
- **Scheduled backups made by `service install` itself:** the alert rules and backup timer planned
  in M31 (186).
- **Encrypting the database or storage at rest:** the platform's (MVP §15, Operations).

## Behaviour

**A person backs up by hand.** `rmk-server backup` asks for a passphrase twice and writes
`ronne-backup-20261101-120000.tar.enc`. `backup --verify` on it asks once and lists what's inside.

**A nightly cron job from before this feature.** It has neither a passphrase file nor the variable.
That night it exits 2, cron mails its output, and nothing is written. The operator adds
`--passphrase-file /etc/rmk-server/backup-passphrase` (0600), and the next night's archive is
encrypted. If they really want plain archives, they add `--plain` and see the warning in every
mail.

## Edge cases

- **`--plain` with `--passphrase-file` or `--encrypt`:** refused (exit 2): they contradict.
- **An empty or unreadable passphrase file:** refused, as 099 does.
- **`RONNE_BACKUP_PASSPHRASE` set but shorter than 12 characters:** refused for a new archive.
- **`--keep N`** counts `.tar` and `.tar.enc` together, as 099 does.
- **Docker** (`docker compose exec web pnpm run backup`) has no terminal without `-it`: the message
  says to add `-it`, or to pass the variable.
- **The passphrase is lost:** the archive can't be restored. The message when asking says so, as
  099's help does.

## Documentation

- **Backups** (`backups#backup`): encrypted by default; `--plain`; schedules with a passphrase file.
- **Updating Ronne** (`update#upgrade`): back up first now asks for a passphrase. That line belongs
  to the release that ships this, with the schedule note.
- **The backup runbook** (`docs/runbooks/backup.md`): every command and schedule.
- **Security** (`security#encryption`): backups are encrypted unless asked otherwise.
- **The threat model** (§4.4's backup row, §5).
- **Helpers:** none (a terminal feature).

## Acceptance criteria

- [ ] `backup` with no flags encrypts, asking twice on a terminal, or using the file or the variable,
  in that order; the archive verifies and restores.
- [ ] A new passphrase under 12 characters is refused before writing; an old archive with a shorter
  one still verifies and restores.
- [ ] `--plain` writes an unencrypted archive after the warning; `instance.backup_made` records
  `plain: true`.
- [ ] No passphrase and no terminal exits 2 with the message, and writes nothing.
- [ ] `--encrypt` is accepted; `--plain` with a passphrase source is refused.
- [ ] The restore test in CI runs on an encrypted archive by default, on all three databases.
- [ ] The Documentation, the runbook's schedules and the threat model say what the feature does.

## Decisions

1. **Encrypted by default, plain by name** (owner, 2026-11-01). A backup is the whole instance,
   secrets included.
2. **A schedule without a passphrase fails, never writes plain** (Claude, to confirm). Falling back
   to plain would quietly undo the default on exactly the backups that leave the machine. A failed
   cron job mails its operator, and the release notes say it ahead.
3. **12 characters for new passphrases** (Claude): the password rule. It protects an offline file
   that can be attacked at leisure, whose scrypt cost is fixed when it's made.

## Open questions

- Should the server log a warning at start when a plain archive is the newest in the default backup
  folder? Cheap, but the folder may not be where schedules write.
