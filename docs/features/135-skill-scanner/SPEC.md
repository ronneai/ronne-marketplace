# 135 — Security scan of submissions (SkillSpector)

> Milestone: M20 · Depends on: 013, 014, 015, 060, 129 · Design: [MVP §12](../../MVP/MVP.md#12-security-considerations), [MVP §15](../../MVP/MVP.md#15-decision-log) ("Security scan") · Contracts: none changed

## Goal

Moderators get a second opinion on what an item *says and does*, not only on what it contains.
014's risk flags tell a reviewer that a submission has a hook, a script or a URL. They can't tell
that a `SKILL.md` hides an instruction to send `~/.ssh` somewhere, or that a script decodes base64
and runs it. NVIDIA's **SkillSpector** ([github.com/NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector),
Apache-2.0) checks for exactly this: 68 patterns in 17 categories, including prompt injection, exfiltration,
MCP tool poisoning, obfuscation, Python AST and taint analysis, and YARA rules. This feature runs it, when
the instance's operator installs it, on each submission and shows its findings on the review page
(owner, 2026-10-28: on the server, advisory, static only).

## Scope

**In:**
- **Opt-in and external.** Ronne never bundles Python or SkillSpector. The person who runs the server
  installs it at a pinned version and names its command in `RONNE_SKILL_SCANNER`. Root then turns
  scanning on in **Admin › Settings**. With either one missing, nothing changes.
- **Static only.** Ronne always passes `--no-llm`, so item content never leaves the server. No setting
  turns on the LLM analysis (owner, 2026-10-28).
- **What is scanned:** each submission revision (013) of the item types root picks, `skill` by default.
  The scan runs on the revision's files, written by Ronne into a fresh private temporary directory.
- **When:** sending a submission queues a scan of its new revision. The `skill-scan` job runs the queued
  scans one at a time.
- **Advisory.** The result is shown and never blocks anything. Submit, approve, override, bulk approve
  and release all behave as before, whatever the scan says or whether it ran at all.
- **Where it shows:** a **Security scan** panel on the review page, beside the risk flags.
- **The sandbox** (Behaviour, below), and what an operator must do for it ([`docs/knowledge/skill-scanner.md`](../../knowledge/skill-scanner.md)).
- Audit events `settings.skill_scan_changed` (root turns scanning on or off, or changes the types).

**Out** (and where it goes instead):
- **LLM analysis.** Not planned (owner, 2026-10-28).
- **Blocking a submit or approval on the score.** Not planned. SkillSpector is alpha (its own
  classifier) and heuristic, so a person decides.
- **Showing the scan to people installing an item** (item page, `GET /api/v1/items/…`, `rmk info`, MCP).
  A later feature, once the moderators have used the results for a while.
- **A scanner inside Ronne's Docker image, or a sidecar.** Python and about 160 packages don't belong in
  `node:24-slim`, and a Docker socket in the container is root on the host. A later feature can add
  an optional scanner image. Until then the scanner works only for installs without Docker (`install.md`
  "Without Docker" and "Install as a service").
- **Scanning published versions from before this feature.** Only new revisions are scanned.
- **Baselines, or suppressing findings by hand.** Not planned. A moderator who disagrees says so in review.

## Behaviour

**Turning it on.** The operator installs SkillSpector at a pinned tag (the knowledge note gives the
`uv tool install git+https://github.com/NVIDIA/SkillSpector.git@vX.Y.Z` line and the Docker wrapper)
and sets `RONNE_SKILL_SCANNER` to a JSON array of the command and its leading arguments, for example
`["/opt/skillspector/bin/skillspector"]` or `["docker","run","--rm","--network","none",…,"skillspector:2.13.2"]`.
The command comes from the environment, never from the web: whoever can change it can run anything on
the server, and that is the operator, not root (decision 3). **Admin › Settings › Security scan** shows
whether a command is configured (its first word only), the version it reported the last time it ran,
a switch (off by default), and the item types to scan. Turning scanning on with no command configured
is refused, with a message that names the environment variable.

**Queuing.** When `send` (013) creates a revision of an item type that is scanned, and scanning is on,
it adds a `content_scans` row, `queued`, in the same transaction. When it's off, it adds nothing, and
the panel says "Not scanned". In a personal workspace a submission is approved at once (114). The scan
is still queued and still shows on the review page.

**Running.** The `skill-scan` job ([`run-job.ts`](../../../apps/web/src/server/jobs/run-job.ts), with
the job lease) takes the oldest `queued` row, marks it `running`, and:
1. writes the revision's files into a new `0700` directory under the OS temporary folder. It uses the
   same path checks as `checkPackage` (no `..`, no absolute paths, no symbolic links);
2. runs `execFile(command[0], [...command.slice(1), "scan", dir, "--no-llm", "--format", "json"])`, with
   no shell;
3. passes an **environment with only these variables**: `PATH`, `HOME` and `TMPDIR` (both the temporary
   directory), `LANG`, `SKILLSPECTOR_MAX_WORKFLOW_SECONDS` (the timeout), `SKILLSPECTOR_LOG_LEVEL=ERROR`
   and `LANGCHAIN_TRACING_V2=false`. `DATABASE_URL`, `AUTH_SECRET` and every other variable Ronne has
   never reach it;
4. kills it after the timeout (`RONNE_SKILL_SCANNER_TIMEOUT`, 300 seconds by default) and reads at most
   4 MiB of output;
5. removes the directory, whatever happened.

Exit 0 or 1 with JSON that passes `parseSkillScan` (`@ronneai/core`) gives `done`. A timeout, exit 2,
too much output or JSON that doesn't parse gives `failed`, with a short reason (`timeout`, `exit 2`,
`output too large`, `invalid report`). The process's own output is never stored or shown, since it
can echo item content. The job is started as soon as a scan is queued (fire and forget, under the
lease) and also runs every minute in `scheduler.ts`. `RONNE_JOBS=off` stops both. A `running` row
older than twice the timeout goes back to `queued` once, and is marked `failed` the second time.

**The result.** `parseSkillScan` keeps, from SkillSpector's documented JSON:
`risk_assessment.score` (0–100), `severity` (`LOW|MEDIUM|HIGH|CRITICAL`), `recommendation`
(`SAFE|CAUTION|DO_NOT_INSTALL`), `metadata.skillspector_version`, and for each issue its rule id, category,
severity, confidence, file and line, and message. Strings are cut to 500 characters and the list to
200 findings, most severe first, with the number left out kept. Anything else in the report is dropped.

**The panel** (review page, beside `RiskSummary`, on every revision that has a scan):
- **Done:** the severity badge (CRITICAL and HIGH in the error colour, MEDIUM in the warning colour,
  LOW neutral), the score, SkillSpector's recommendation in our words ("Looks safe", "Look closely",
  "Likely unsafe"), and the findings table: severity, rule and category, file:line (a link to that line
  in the review's file view), and the message as plain text. Under it: "Static scan by SkillSpector
  vX.Y.Z. Advisory: it can miss problems and flag safe code."
- **Queued / running:** "Scanning…". The page refreshes the panel while it waits.
- **Failed:** "The scan didn't finish (timeout)". Root also sees "Scan again", which queues a new row.
- **Not scanned:** scanning was off, or the type isn't scanned. Root sees "Scan now".
- Each revision shows its own scan, so a resubmit gets a new one and the old revision keeps its own.

## Edge cases

- **The scanner is removed or broken after scans were queued:** every scan fails with `exit` or
  `not found` (ENOENT), and the panel and Admin › Settings show the last error. Nothing else is affected.
- **Many submissions at once** (bulk upload, 037): they wait in the queue, one at a time. A scan never
  slows down submitting.
- **More than one replica** (M17): the lease means one replica scans at a time. Each replica needs the
  scanner installed, or the scans its lease picks up fail. The knowledge note says so.
- **A revision with files larger than SkillSpector reads** (1 MB per file): SkillSpector reports partial
  coverage. We show "Some files were too large to scan" when its report says so.
- **An item type that isn't a skill** but is picked in settings (`agent`, `command`, `mcp-server`):
  scanned the same way. SkillSpector reads Markdown, scripts and MCP configs.
- **A submission withdrawn or deleted while queued:** its scan row goes with the revision (cascade).
  The job skips a row whose revision has gone.
- **Data download and erasure** (103, 104): scans hold no personal data, only findings about files,
  and go with their revision.
- **Retention** (060): scans go when their revision is purged.

## Data

- `content_scans`: id, revision_id (→ `submission_revisions`, cascade), scanner (`skillspector`),
  scanner_version (nullable), status `queued/running/done/failed`, attempts, score (nullable),
  severity (nullable), recommendation (nullable), findings (JSON text, nullable), findings_omitted,
  error (nullable, short reason), queued_at, started_at, finished_at. Index on (status, queued_at) and on
  revision_id. Several rows per revision are allowed ("Scan again"). The panel shows the newest.
- Settings (060's settings table): `skill_scan.enabled` (false), `skill_scan.types` (`["skill"]`),
  `skill_scan.last_version`, `skill_scan.last_error`.

## Documentation

- **Reviewing submissions** (the review topic), a new section **Security scan**
  (`reviews#security-scan`): what SkillSpector checks, what the badge and findings mean, that it's
  advisory, static, and can miss things and flag safe code, and that each revision gets its own scan.
- **Admin › Settings** topic, a new section **Security scan** (`settings#security-scan`): what the
  operator installs, `RONNE_SKILL_SCANNER`, the switch and types, and why the command can't be set from the web.
- **Install guide** (`docs/runbooks/install.md`, "After installing"): an optional step, "Scan
  submissions with SkillSpector", linking to the knowledge note.
- **Helpers:** on the panel, "What is this scan?" → `reviews#security-scan`. In settings, "How do I
  install the scanner?" → `settings#security-scan`.
- New sections change `apps/web/src/components/help/topics.ts` and ronne-web's `topics.ts` together,
  in English, Portuguese and French.

## Acceptance criteria

- [ ] With `RONNE_SKILL_SCANNER` unset or the switch off, sending a submission queues nothing and
  every existing test passes unchanged.
- [ ] With both set, sending a revision of a scanned type queues exactly one scan, in the same transaction.
- [ ] The scanner is run with an argument array, no shell, `--no-llm` always, on a private temporary
  directory that is removed afterwards, success or not.
- [ ] The scanner's environment holds only the allowlisted variables. A test shows `DATABASE_URL`
  and `AUTH_SECRET` aren't in it.
- [ ] A timeout kills the process and records `failed (timeout)`. Too much output, exit 2 or invalid
  JSON record `failed` with their reason. A stuck `running` row is retried once.
- [ ] `parseSkillScan` accepts SkillSpector's real reports (fixtures recorded from v2.13.x on
  `examples/items` and on a bad sample skill), rejects anything else, and enforces its caps.
- [ ] The review panel shows each state, findings render as plain text, and approve, override and
  bulk approve work whatever the scan says.
- [ ] Root turns scanning on and off and picks types. It is refused without a command, and audited.
  Nobody can set the command from the web.
- [ ] The panel and settings are in English, Portuguese and French (129) and pass the phone sweep (065).
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **SkillSpector, on the server, advisory, static only** (owner, 2026-10-28).
2. **External and opt-in** (Claude): it is Python with a large dependency tree, alpha, and released
   every week, so it stays outside our image and pnpm tree. The operator pins it, and the
   dependencies policy lists it as an operator-installed tool.
3. **The command comes from the environment, not from settings** (Claude): a command set in the
   web would let root run anything on the server.
4. **Each revision is scanned, not each version** (Claude): the moderator decides on a revision,
   and a version is a revision that was released.

## Open questions

- Should a scan also be shown on the item page and to `rmk info` once moderators trust it? (Out,
  above. A later feature.)
- An optional scanner image for Docker installs: wanted, and when?
