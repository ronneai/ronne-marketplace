# 102 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. The settings.** [risky] The retention model (`settings/models/retention-policy.ts`:
  keys, defaults, range, parsing), the settings service and action (root only, audited
  `settings.retention` with old and new values), the Privacy tab on Admin › Settings (122's
  `tabs.ts`, `?tab=privacy`) with the Retention panel, its helper `retention`, and the
  `settings.retention` audit event's sentence (060).
  *Done when:* db tests cover the defaults, each boundary of the range, a non-integer, the audit
  event and a non-root (404); the component test covers the panel and its errors; the phone sweep
  passes.

- [ ] **2. The purge.** [risky] `server/jobs/retention-purge.ts`: each table's rule from the spec,
  in batches of 1,000 in their own transactions, through the dialect date helpers, returning the
  counts; a `dryRun` flag that counts and changes nothing.
  *Done when:* a db test seeds each table with a row one second inside and one outside each
  boundary and checks exactly the outside rows change, on SQLite and (`pnpm test:db:up`) on
  PostgreSQL, MySQL and MariaDB; a second run changes nothing; a run stopped after the first batch
  (a fake that throws) leaves the rest for the next; `dryRun` changes nothing and counts the same.

- [ ] **3. The lease and the frame.** [risky] The `jobs` migration (all dialects) and
  `server/jobs/lease.ts`: claim with one conditional `UPDATE`, renew per batch, release at the end,
  15-minute lease; `server/jobs/run-job.ts` wraps a job with the lease, the `job.*` log lines and
  the `ronne.job.duration` metric, and writes `last_run_at` and `last_result`.
  *Done when:* db tests show two claimants against one database (two connections, one job) do the
  work once and the loser gets `skipped`; a lease older than 15 minutes is taken over; a run that
  throws releases nothing but its lease expires; the log lines hold the counts and no IP or email;
  `pnpm test:db` passes on the servers for the migration.

- [ ] **4. The scheduler and the command.** The in-process scheduler started from
  `instrumentation.ts` (Node.js runtime, setup done, `RONNE_JOBS` not `off`): 5 minutes after start,
  then every 6 hours, never two overlapping in one process; `apps/web/scripts/purge.ts` and
  `server/setup/purge.ts` (`--dry-run`, the counts, exit codes, the progress line), `purge` in
  `SCRIPTS`, `rmk-server --help`, `package.json`'s `purge` script and `dist-scripts`.
  *Done when:* a unit test drives the scheduler with a fake clock; the script's tests cover
  `--dry-run`, the held lease (exit 1), setup not done, and the counts' text; `packages:check` and
  `release:smoke` pass with the new script.

- [ ] **5. The last run on the Privacy tab.** The tab reads `jobs` for `retention_purge` and shows
  the last run's time and counts, "No run yet" (naming `RONNE_JOBS` when it's `off`), or the last
  error's name.
  *Done when:* component tests cover the three states; an e2e test sets a retention, runs
  `rmk-server purge` against the test instance and sees the counts on the tab.

- [ ] **6. Documentation.** In `../ronne-web`: the **Privacy** topic with **Retention** (both
  `topics.ts`), the Settings tabs line, the Backups sentence, in English, Portuguese and French;
  here, the install guide (`RONNE_JOBS`, `purge`), `.env.example`, the `retention` helper, MVP §15's
  decision, and this feature's index row set to done.
  *Done when:* the docs render tests pass in both repositories; `pnpm witness:check` passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
