# 165 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "Operations" row says backups are encrypted by default, and
    `docs/features/README.md` lists 165 in M28.
  - *Done when:* both say what this spec says, and `pnpm witness:check` passes.

- [ ] **2. The command's default.** [risky]
  - `parseBackupCommand`: `--plain`; `--encrypt` accepted with no effect; the contradictions.
  - `run-backup`: the passphrase sources in order; the 12-character rule for new archives; exit 2
    with no terminal and no passphrase; the warning for `--plain`; `plain` in the audit metadata.
  - *Done when:* `cli.test.ts` and the backup db tests cover each source, a short passphrase, no
    terminal, `--plain` (with and without `--no-settings`), the contradictions, and an old archive
    with a short passphrase still verifying.

- [ ] **3. Restore test on encrypted archives.**
  - The backup and restore checks in `server-checks.yml` (backup, then restore into a new
    instance) and the backup db tests across dialects make encrypted archives by default, and keep
    one plain run.
  - *Done when:* `server-checks.yml` passes with an encrypted archive, and the backup db tests pass
    on SQLite, PostgreSQL and MySQL (`pnpm test:db:postgres -- <files>`, `:mysql`).

- [ ] **4. Runbook, Documentation and the threat model.**
  - `docs/runbooks/backup.md`: every command, the four schedules with a passphrase file.
  - `backups#backup`, `security#encryption`, the release's upgrade note (`update#upgrade`).
  - The threat model's §4.4 and §5.
  - *Done when:* the docs render tests and `pnpm docs:links` pass; each schedule example runs in a
    shell with a test passphrase file (`pnpm test:install` or a runbook check).

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
