# 102 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The settings.** [risky] The retention model (`settings/models/retention-policy.ts`:
  keys, defaults, range, parsing), the settings service and action (root only, audited
  `settings.retention` with old and new values), the Privacy tab on Admin › Settings (122's
  `tabs.ts`, `?tab=privacy`) with the Retention panel, its helper `retention`, and the
  `settings.retention` audit event's sentence (060).
  *Done when:* db tests cover the defaults, each boundary of the range, a non-integer, the audit
  event and a non-root (404); the component test covers the panel and its errors; the phone sweep
  passes.

- [x] **2. The purge.** [risky] `server/jobs/retention-purge.ts`: each table's rule from the spec,
  in batches of 1,000 in their own transactions, through the dialect date helpers, returning the
  counts; a `dryRun` flag that counts and changes nothing.
  *Done when:* a db test seeds each table with a row one second inside and one outside each
  boundary and checks exactly the outside rows change, on SQLite and (`pnpm test:db:up`) on
  PostgreSQL, MySQL and MariaDB; a second run changes nothing; a run stopped after the first batch
  (a fake that throws) leaves the rest for the next; `dryRun` changes nothing and counts the same.

- [x] **3. The lease and the frame.** [risky] The `jobs` migration (all dialects) and
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

- Task 1: both numbers are one setting to the person (one form, one Save, one `settings.retention`
  event with `{ from: { ipDays, sessionsDays }, to: { … } }`), stored as two `instance_settings`
  rows so each reads like the other settings do. A number is parsed as `^\d{1,20}$` then the
  range: leading zeros are accepted because a `type="number"` field can submit `03650` (the
  adversarial pass found `\d{1,4}` refused it), and twenty digits is a bound
  (`docs/knowledge/codeql-regex.md`), not a widening: past four significant digits nothing is in
  range. A sign, a decimal point, an exponent or a non-ASCII digit is refused; `1e3` as a
  JavaScript number is `"1000"` and accepted, which only code can send.
- Task 1: the Privacy tab reads `instanceSettings` (the whole set) as the Usage tab does; task 5
  adds the `jobs` row's last run beside it.
- Task 1: the `privacy` topic went into `apps/web/src/components/help/topics.ts` with this task,
  so the helper's link is typed; the website's page comes with task 6, in ronne-web.
- Task 2: the purge takes `(db, dialect, policy, now)` and knows nothing about schedules or
  leases (task 3's). Each rule selects the ids of its oldest 1,000 matching rows and writes by id,
  both inside the batch's transaction: on SQLite's one connection a select outside it would wait
  on it. The email rule is the odd one: the metadata is JSON text, so the `LIKE '%"email":%'`
  only narrows what's read, and the rows are decoded and rewritten in code. Its pages walk a
  keyset (`created_at`, `id`) past every row read, changed or not, because the first version
  stopped on a page that changed nothing and the witnesses showed 1,000 look-alike rows (a nested
  `email`) would hide a real one for ever; its dry run decodes the same pages, so it counts what a
  run would change. The app only ever writes a flat `{ email, reason }`, so look-alikes come from a
  restored backup or a hand edit, but the rule must not depend on that. The walk refuses a page
  that ends on the row the last one did (an error, never a second read): with better-sqlite3 the
  loop is synchronous between awaits, so a cursor bug would otherwise spin without ever letting a
  test's timeout fire, which the adversarial re-check saw (4 minutes, killed by hand).
- Task 2: 007's guard test (`audit-log.guard.test.ts`) fails on any update or delete of
  `audit_log` outside the migrations, and the purge is the first code that must update those rows
  (MVP §15, Personal data: the events stay, the IP and the typed email don't). The guard now has a
  named allowlist of files that may update, with what each changes, and a test that none of them
  deletes; 103's erase joins it. The whole-suite run caught it, not the task's own tests: a guard
  over every file is the kind of shared check a task's test can't see.
- Task 2: 107's own sweep already deletes finished device grants 24 hours after they expire; the
  purge's rule (a day or more) only ever finds what that sweep would delete too, so the two agree.
  A pending grant past `expires_at` counts as finished (SPEC's row changed with this task): nothing
  is left to audit about a 10-minute code that is days old.
- Task 2: the test's cutoffs are literal dates (`2026-07-20T12:00Z` for 90 days before
  `2026-10-18T12:00Z`), never derived from `purgeCutoffs`, and every rule has a row exactly at its
  cutoff: the first version derived them, so a cutoff an hour off would have passed, and a `<`
  turned `<=` too. The "oldest first" assertion only bites on PostgreSQL (SQLite and MySQL happen
  to read the index in that order); the `orderBy` is there regardless.
- Task 3: the lease is three statements on one row per job (`jobs`): a conditional `UPDATE`
  claims it when `lease_ends_at` is null or past, a renew moves the end only while the holder
  still has it, and a release clears it and records the run only for the holder. Nothing else: no
  advisory lock, no transaction held open, so the three dialects behave the same and a lost
  connection costs at most the 15-minute lease. The row is made on first use with a plain insert
  whose unique violation is ignored (two makers at once). The columns are `lease_ends_at` and
  `lease_holder`, not the spec's first `locked_until`/`locked_by`: a timestamp column must end in
  `_at` for restore (`docs/knowledge/timestamp-names.md`), and the backup test on the servers
  checks it.
- Task 3: `runJob` never throws to its caller: a failure is a `job.failed` line (with the error,
  through 100's redaction), a `last_result` holding only the error's name (a driver's message can
  name a host), and a `failed` result; the scheduler (task 4) goes on. A renew that finds the
  lease gone throws `LeaseLostError` inside the work, so a run that overran its lease stops and
  the run that took over owns the row. The metric comes from the log line, as 101's others do
  (`onEvent` in `real-hooks.ts`), so the jobs code imports nothing from OpenTelemetry.
- Task 3: after both passes were met, two things from their findings went in without a further
  pass (neither changes behaviour): `JobTable` moved above `ItemAliasTable`'s comment in
  `schema.ts`, and a test for a release that fails after the work (a Proxy whose `updateTable`
  throws): `runJob` still resolves `failed`, the lease stays and expires. The adversarial pass's
  remarks stand as written in `WITNESS.md`: a bare IP in an error's message isn't redacted by 100
  (only the database host could appear here), and `runJob` spreads whatever counts a job returns
  (the retention job fixes them to four; 111's jobs should too).
- Task 3: the lease test needs two connections to one database; the default in-memory SQLite is
  one connection's own, so on SQLite the test makes a file database of its own and migrates it.
- Task 1 also fixed three lint errors that weren't this task's (owner, 2026-10-18): two
  `noUselessFragments` (`DependencyMarks.tsx`, `ToolsPanel.tsx`) and `biome.json`'s schema
  version, which the installed Biome 2.5.15 reported while CI on `main` stayed green; why the two
  runs differed wasn't found.
