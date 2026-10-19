# 102 — Retention

> Milestone: M15 · Depends on: 007, 006, 099 · Design: [MVP §14.4](../../MVP/MVP.md#144-other-future-topics), [§15](../../MVP/MVP.md#15-decision-log) (Personal data) · Contracts: none changed

## Goal

Personal data is kept only as long as it's needed, as Quebec's Law 25, PIPEDA and the GDPR expect
(owner, 2026-10-06). Today an instance keeps every client IP address for ever: in the audit log
(007), in sessions (006) and in device grants (107), and a session that expired stays in its table.
Root sets how long each is kept, 90 days by default, and a job the instance runs itself purges
what's older, so nobody has to remember. It's also the first scheduled job and the first database
lock for one, which 111 (several replicas) will rely on.

## Scope

**In:**
- **Two retention settings** on a new **Privacy** tab of Admin › Settings (122): how many days an
  IP address is kept, and how many days an expired session is kept. 90 days each by default; 1 to
  3,650; audited.
- **What the purge clears** (Behaviour): IP addresses past their age in the audit log, sessions
  and device grants; the email typed in a failed sign-in past the same age; expired sessions and
  finished device grants past theirs.
- **A scheduled job** inside the server, with a **lock in the database** so that one run happens
  at a time, however many processes start it; and **`rmk-server purge`** (`pnpm run purge`) for
  people who prefer cron, and to see what a run would do (`--dry-run`).
- **The job frame** (`server/jobs/`): a job's name, interval, lock and log lines, written so the
  next scheduled job (111's, a future one) reuses it.
- **The Privacy topic** in the Documentation, with its first section, Retention.

**Out** (and where it goes instead):
- **Erasing a person:** 103. **A person's download of their data:** 104.
- **Retention of the audit log's events themselves:** the events stay for ever; they are the
  record of who did what (007), with no personal data once the IP is cleared and the person
  erased (103). An instance that wants fewer rows has its database.
- **Logs** (100): they go to collectors Ronne doesn't control; they hold no IP or email.
- **Usage reports** (046) store nothing about who sent them.
- **Backups** (099) hold what the database held when they were made; the backup runbook says to
  keep them no longer than the retention, and that's for the operator.
- **A retention for drafts, submissions or items:** not personal data; out.

## Behaviour

### The settings

On Admin › Settings, a new tab **Privacy** (`?tab=privacy`) after Authentication, root only, with
one panel, **Retention**:

| Setting | Key (`instance_settings`) | Default | Range |
|---|---|---|---|
| Keep IP addresses for | `retention_ip_days` | 90 | 1–3,650 |
| Keep expired sessions for | `retention_sessions_days` | 90 | 1–3,650 |

Each has a short line under it saying what it covers (below). Saving audits
`settings.retention` with `{ ipDays, sessionsDays }` and the previous values. A value outside the
range, or not a whole number, is refused with the field's error; nothing is saved. The panel's
heading carries the helper `retention`.

### What is purged, and when

A run, at time *T*, with `ip = retention_ip_days` and `s = retention_sessions_days`:

| Where | Rule |
|---|---|
| `audit_log.ip_address` | set to `NULL` on events with `created_at < T − ip` days |
| `audit_log.metadata.email` of `auth.sign_in_failed` | removed from the metadata on events with `created_at < T − ip` days: the typed address may belong to nobody, or to someone who never had an account, so no erasure (103) would ever reach it |
| `session.ip_address`, `session.user_agent` | set to `NULL` on sessions with `created_at < T − ip` days, live or not |
| `session` | deleted when `expires_at < T − s` days |
| `device_grants.requester_ip`, `approver_ip` | set to `NULL` when `created_at < T − ip` days |
| `device_grants` | deleted when `created_at < T − s` days and the grant is finished: any status but `pending`, or a `pending` one past its `expires_at` (107's sweep would mark it expired on the next `rmk login --web`; a grant lives 10 minutes and the retention is a day or more, so nothing is left to audit) |

Nothing else. In particular, no event is deleted, no user row is touched, and no access token is
deleted (a revoked token's row is the record of the revocation; 103 deletes an erased person's).
The audit log's insert-only guard (007) names the purge as the one file allowed to update
`audit_log` rows, with what it may change; nothing deletes one, and no other file may update one.

Each table is purged in batches of 1,000 rows (the oldest first) in their own short transactions,
so a first run on an old instance never holds a long lock, and a run that is stopped halfway has
done part of the work and the next one does the rest. A purge is **idempotent**: running it twice
changes nothing the second time.

### The scheduled job

- **In the server:** `register()` in `instrumentation.ts` starts the scheduler (only in the Node.js
  runtime). Each tick checks that setup is done and does nothing before it (no database to open),
  so a setup finished while the server runs is picked up at the next tick. The purge runs 5
  minutes after start, then every 6 hours. `RONNE_JOBS=off` turns the in-process scheduler off, for an operator who runs
  `rmk-server purge` from cron instead (the Documentation says when to).
- **The lock:** a `jobs` table, one row per job name (`retention_purge`), with `lease_ends_at`,
  `lease_holder` (a random id per run), `last_run_at`, `last_result` (timestamp columns end in
  `_at`: `docs/knowledge/timestamp-names.md`). A run claims the row with one conditional
  `UPDATE … WHERE name = ? AND (lease_ends_at IS NULL OR lease_ends_at < now)` and goes on only
  when it changed one row; the lease is 15 minutes and is renewed every batch; the run releases
  it at the end. The same statement works on SQLite, PostgreSQL and MySQL/MariaDB
  (no advisory locks, which SQLite doesn't have and a lost connection wouldn't release). A process
  that dies mid-run leaves a lease that expires, and the next run takes over. Two processes or two
  replicas (111) can't run it at once.
- **Logs** (100): `job.started` and `job.finished` (`job`, `ms`, and the counts: `ipsCleared`,
  `emailsCleared`, `sessionsDeleted`, `grantsDeleted`) at `info`; `job.skipped` (`reason: locked`)
  at `debug`; `job.failed` with `err` at `error`. The next run happens on schedule whatever the
  last did. The run's result is kept in `jobs.last_result` too, so the Privacy tab can show it.
- **The Privacy tab shows** the last run: when, and what it cleared, or that none has run yet, or
  the last error's name (never its message, which could name a host).
- **Metrics** (101): `ronne.job.duration` (histogram, `job`, `result`) when telemetry is on.

### `rmk-server purge`

`pnpm run purge` in a clone; `rmk-server purge` in the packages, the Docker image
(`docker compose exec`) and the services. Reads the settings file as every script does. Runs the
same purge once, taking the same lock (so cron and the in-process job never overlap), and prints
each table's count:

```
✓ IP addresses cleared: 1,204 (audit log 1,180, sessions 20, device grants 4)
✓ Failed sign-ins' emails cleared: 37
✓ Expired sessions deleted: 312
✓ Finished device grants deleted: 9
```

`--dry-run` prints the counts and changes nothing. Exit codes: 0 done (or nothing to do), 1 the
lock was held or the run failed (the message says which), 2 invalid input. It's added to
`SCRIPTS` in `packages/server/src/cli.ts`, to `rmk-server --help` and to the install guide.

### Phones (065)

The Privacy tab is the same panel layout as Usage: a form with two number fields and Save, the last
run's line under it. The tab strip (122) scrolls sideways.

## Edge cases

- **Setup not done:** the scheduler doesn't start (there's no database); `rmk-server purge`
  refuses with the usual "run setup first".
- **A retention shortened:** the next run clears what the new value says, down to 1 day; the
  Privacy tab's description says so.
- **The clock jumps back** (a restored VM): a lease taken "in the future" holds until it passes
  (at most 15 minutes after the jump); the purge compares `created_at` with `now`, so a jump
  back purges less, never more.
- **Many rows on a first run** (an old instance with a million events): the batches keep each
  transaction short; the run may take minutes; its lease renews each batch. `rmk-server purge`
  shows a progress line per 10,000 rows when stdout is a terminal.
- **SQLite with `expires_at` or `created_at` stored as text** (the dates helper, `db/dates.ts`): the
  comparison goes through `fromDbDate`'s counterpart for the dialect, as the keyset queries do; a
  test on each dialect checks the boundary (a row one second inside is kept, one second outside
  goes).
- **The database is unavailable at run time:** `job.failed` with the driver's error (redacted by
  100), no retry before the next schedule; the health check already reports the database.
- **The job runs while a backup runs** (099): both are short transactions; the backup's snapshot
  is consistent either way.
- **`RONNE_JOBS=off` and no cron:** nothing is purged; the Privacy tab says "No run yet" with the
  variable's name, so root can see it.
- **A purge during `rmk-server restore`** (099): restore takes the database down and the job fails
  once; nothing else.
- **The audit log page** (060) shows a cleared IP as "—", as it does for events that had none.
- **A pending device grant's `requester_ip`** is cleared only once it's older than the IP
  retention, which is far beyond the grant's 15-minute life; in practice the grant is deleted by
  then.

## Documentation

- **New topic: Privacy** (`privacy`), in Running Ronne, with the section **Retention**
  (`privacy#retention`): what an instance holds about people and where, what is purged, when and
  by which rule, the two settings, `rmk-server purge` and `RONNE_JOBS`, what cron line to add when
  the scheduler is off, and the laws it's for in one sentence, without legal advice. Both
  `topics.ts` change (`privacy` with `retention`; 103 and 104 add their sections).
- **Administration → Settings** (`admin#settings`): the Privacy tab in the tabs list.
- **Backups** (`backups#backup`): one sentence that a backup holds what the database held, and
  to keep it no longer than the retention.
- **The install guide** (`docs/runbooks/install.md`): `RONNE_JOBS` in the settings table and
  `purge` in the commands table.
- **`apps/web/.env.example`:** `RONNE_JOBS`, commented.
- **Helpers:** `retention` on the Retention panel's heading → `privacy#retention`.
- **MVP §15:** the decision "Scheduled jobs run in the server, under a lease in a `jobs` table,
  with a terminal command for cron" (this feature).

## Acceptance criteria

- [ ] Root sets both retentions on the Privacy tab, within 1–3,650 days; an invalid value is
      refused; a save is audited with the old and new values; nobody else sees the tab (404).
- [ ] A purge clears IP addresses in the audit log, sessions and device grants, the typed emails
      of failed sign-ins, and deletes expired sessions and finished device grants, exactly by the
      table's rules, and nothing else: a test seeds each table with rows one second inside and
      outside each boundary, on SQLite and on the three servers.
- [ ] A purge run twice changes nothing the second time, and a run interrupted after one batch
      leaves the rest for the next.
- [ ] Two runs started at once (two processes against one database) do the work once: one claims
      the lease and the other logs `job.skipped`; a lease older than 15 minutes is taken over.
- [ ] The server runs the purge 5 minutes after start and every 6 hours; `RONNE_JOBS=off` stops it;
      before setup nothing runs.
- [ ] `rmk-server purge` runs the same purge, prints the counts, honours `--dry-run`, and refuses
      with exit 1 when the lease is held.
- [ ] The Privacy tab shows the last run's time and counts, or that none has run.
- [ ] The log lines and the metric are written as the spec says; no line carries an IP or an email.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Both an in-process scheduler and a terminal command** (owner, 2026-10-18): the scheduler so
   a small instance needs nothing else; the command so an operator with cron and several replicas
   can choose where it runs.
2. **A lease in a `jobs` table rather than advisory locks** (Claude): the one mechanism the three
   database kinds share; it survives a lost connection by expiring; 111 reuses it for every
   scheduled job.
3. **Failed sign-ins' typed emails fall under the IP retention** (Claude, to confirm): they are
   personal data no erasure can reach, and 90 days is enough to investigate a credential-stuffing
   attempt. The event itself stays, with its reason and count.
4. **Audit events are never deleted by retention** (owner, 2026-10-06, MVP §15): the log is the
   record; 103 makes it anonymous.
5. **Clearing a live session's IP after 90 days** (Claude): a session that old is rare (the
   default life is shorter), and the IP has no use after sign-in; keeping it on live sessions
   would need a second rule for nothing.

## Open questions

- Decision 3: keep the typed email for 90 days, or clear it at once (keeping only the reason)?
