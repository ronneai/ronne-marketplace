# 135 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision and policy.** MVP.md §12 gains a "Security scan" bullet, and §15 a decision-log entry
  (the spec's decisions 1–3). `docs/policies/dependencies.md` adds SkillSpector to its tools table as an
  operator-installed tool: Apache-2.0, Python, pinned tag, not in the pnpm tree or the image.
  `docs/features/README.md` adds M20 with 135. A new note, `docs/knowledge/skill-scanner.md`, gives the
  hardening rules, the pinned install, the Docker wrapper (`--network none --read-only --user`, the
  directory mounted read-only) and how to upgrade the pin.
  *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. Recorded fixtures and `parseSkillScan`.** Build SkillSpector at the pinned tag in Docker,
  run `scan --no-llm --format json` on two items from `examples/items` and on a bad sample skill, and
  record the reports under `packages/core/src/skill-scan/fixtures/`. Then `parseSkillScan` in
  `packages/core/src/skill-scan/` (exported from the package): validate the input, map it, sort the
  findings, apply the caps.
  *Done when:* its Vitest suite passes on the fixtures and on bad input (missing fields, wrong types,
  huge strings, 10k findings).

- [ ] **3. Migration.** [risky] `content_scans` as the spec's Data section says, with Kysely types in
  `db/schema.ts` and the settings keys.
  *Done when:* the migration's db test passes on the four databases, and the guard test passes.

- [ ] **4. The runner.** [risky] `apps/web/src/server/domains/scans/`: a `SkillScanner` interface, and a
  `CommandSkillScanner` (temporary directory, path checks, execFile, environment allowlist, timeout and
  kill, output cap, cleanup) that reads `RONNE_SKILL_SCANNER` and `RONNE_SKILL_SCANNER_TIMEOUT`.
  *Done when:* unit tests with a fake scanner (a Node script) cover valid JSON, exit 1, exit 2, hanging,
  flooding, invalid JSON, a missing command, the environment it sees (no `DATABASE_URL` or
  `AUTH_SECRET`), and that the directory is gone afterwards.

- [ ] **5. Queue and job.** `send` queues a scan in its transaction when scanning is on and the type is
  scanned. The `skill-scan` job (run-job and the lease) takes one scan, runs it, and retries a stuck
  one once. It is kicked off on queue and every minute in `scheduler.ts`, and respects `RONNE_JOBS=off`.
  "Scan again" and "Scan now" are root actions.
  *Done when:* db tests cover queued on and off, the type filter, a personal workspace, done, failed, a
  stuck row retried and then failed, and a withdrawn submission, on the four databases.

- [ ] **6. Settings.** [risky] Admin › Settings › Security scan, root only: whether a command is set,
  the last version and error, the switch, the types. It is refused without a command, and audited
  (`settings.skill_scan_changed`). Messages in three languages.
  *Done when:* db tests for the service and the refusal, a page test, and the i18n parity tests pass.

- [ ] **7. Review panel.** The Security scan panel on the review page (data from `review-page.ts`):
  the states, the findings table with links to file lines, and plain-text rendering. Messages in
  three languages. Then the end-to-end test.
  *Done when:* component tests for each state and for a finding containing HTML pass, and a
  Playwright file (fake scanner) shows submit, then queued, then done, then approve. The phone sweep passes.

- [ ] **8. Documentation.** The spec's Documentation section: ronne-web sections and `topics.ts` in
  three languages (a branch `feat/135-skill-scanner` there), `apps/web/src/components/help/topics.ts`,
  both helpers, and `install.md`.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

- SkillSpector's JSON and exit codes are documented as a stable contract (its README, "Integrating
  SkillSpector"). Re-record the fixtures when the pin moves.
