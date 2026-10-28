# 135 — Security scan of submissions (SkillSpector)

> Milestone: M20 · Depends on: 013, 014, 015, 060, 129 · Design: [MVP §12](../../MVP/MVP.md#12-security-considerations), [MVP §15](../../MVP/MVP.md#15-decision-log) ("Security scan") · Contracts: none changed

## Goal

Moderators get a second opinion on what an item *says and does*, not only on what it contains.
014's risk flags tell a reviewer that a submission has a hook, a script or a URL. They can't tell
that a `SKILL.md` hides an instruction to send `~/.ssh` somewhere, or that a script decodes base64
and runs it. NVIDIA's **SkillSpector** ([github.com/NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector),
Apache-2.0) checks for exactly this: 71 patterns in 17 categories, including prompt injection, exfiltration,
MCP tool poisoning, obfuscation, Python AST and taint analysis, and YARA rules. This feature runs it, when
the instance's operator installs it, on each submission and shows its findings on the review page
(owner, 2026-10-28: on the server, advisory, static by default; semantic analysis by an LLM only when
the operator sets up a provider and root turns it on).

## Scope

**In:**
- **Opt-in and external.** Ronne never bundles Python or SkillSpector. The person who runs the server
  installs it at a pinned version and names its command in `RONNE_SKILL_SCANNER`. Root then turns
  scanning on in **Admin › Settings**. With either one missing, nothing changes.
- **Static by default, semantic as an opt-in** (owner, 2026-10-28). A static scan (`--no-llm`) keeps
  item content on the server: at most it sends the dependency names and versions the item declares
  to OSV.dev, and not even that with the container wrapper (`--network none`). SkillSpector's semantic analysis also asks an LLM whether what a skill
  says matches what its code does. Ronne runs it only when the operator has set up a provider in the
  environment or the settings file (the provider and its key are never stored in the database or typed in the web), and
  root has chosen **Static and semantic** in settings, with a warning naming where the files go.
- **What is scanned:** each submission revision (013) of the item types root picks, `skill` by default.
  The scan runs on the revision's files, written by Ronne into a fresh private temporary directory.
- **When:** sending a submission queues a scan of its new revision. The `skill_scan` job runs the queued
  scans one at a time.
- **Advisory.** The result is shown and never blocks anything. Submit, approve, override, bulk approve
  and release all behave as before, whatever the scan says or whether it ran at all.
- **Where it shows:** a **Security scan** panel on the review page, beside the risk flags.
- **The sandbox** (Behaviour, below), and what an operator must do for it ([`docs/knowledge/skill-scanner.md`](../../knowledge/skill-scanner.md)).
- Audit events `settings.skill_scan_changed` (root turns scanning on or off, or changes the types or
  the analysis).

**Out** (and where it goes instead):
- **SkillSpector's other LLM providers:** `bedrock` (a cloud credential chain that reads files on the
  host), `anthropic_proxy` (it can turn off TLS checks), and the CLI providers (`claude_cli`,
  `gemini_cli`, `opencode_cli`, and the disabled `codex_cli` and `antigravity_cli`, which run an agent
  on the host). Not planned.
- **Blocking a submit or approval on the score.** Not planned. SkillSpector is alpha (its own
  classifier) and heuristic, so a person decides.
- **Showing the scan to people installing an item** (item page, `GET /api/v1/items/…`, `rmk info`, MCP).
  A later feature, once the moderators have used the results for a while.
- **A scanner inside Ronne's Docker image, or a sidecar.** Python and the 63 packages it installs don't belong in
  `node:24-slim`, and a Docker socket in the container is root on the host. A later feature can add
  an optional scanner image. Until then the scanner works only for installs without Docker (`install.md`
  "Without Docker" and "Install as a service").
- **Scanning published versions from before this feature.** Only new revisions are scanned.
- **Baselines, or suppressing findings by hand.** Not planned. A moderator who disagrees says so in review.

## Behaviour

**Turning it on.** The operator installs SkillSpector at the reviewed commit, with exactly the packages
in its `uv.lock` (the knowledge note gives both ways: `uv sync --frozen` directly, or the image from
`scripts/skill-scanner/Dockerfile` with the `skillspector-sandbox` wrapper),
and sets `RONNE_SKILL_SCANNER` to a JSON array of the command, an absolute path (a relative one
would be looked up from the scan's folder, beside the submitted files, so it's refused), and its
leading arguments: the
installed program, `["/opt/skillspector/venv/bin/skillspector"]`, or the wrapper, which mounts
the folder Ronne passes into the container, `["/usr/local/bin/skillspector-sandbox"]`.
The command comes from the environment or the settings file, never from the web: whoever can change it can run anything on
the server, and that is the operator, not root (decision 3). **Admin › Settings › Security scan** shows
whether a command is configured (its first word only), the version it reported the last time it ran,
a switch (off by default), the item types to scan, and the **analysis**: **Static** (the default) or
**Static and semantic**. Semantic can be chosen only when the operator has set up a provider (below);
the choice then says "Each submission's files are sent to <provider> (<host>)", with the host of its
endpoint (the provider's own when none is set). Turning scanning on with no command configured,
or choosing semantic with no provider, is refused with a message that names the environment variable.

**A provider, for semantic analysis.** The operator sets SkillSpector's own variables, each with the
prefix `RONNE_SKILL_SCANNER_ENV_`, for example `RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER=ollama`
and `RONNE_SKILL_SCANNER_ENV_OLLAMA_BASE_URL=http://10.0.0.5:11434/v1`. Ronne passes on, without the
prefix and only to a semantic scan, `SKILLSPECTOR_PROVIDER`, `SKILLSPECTOR_MODEL`,
`SKILLSPECTOR_REASONING_EFFORT`, and **only the chosen provider's own variables**:

| `SKILLSPECTOR_PROVIDER` | Its variables | Needs |
|---|---|---|
| `openai` | `OPENAI_API_KEY`, `OPENAI_BASE_URL` | the key |
| `anthropic` | `ANTHROPIC_API_KEY` | the key |
| `nv_build` | `NVIDIA_INFERENCE_KEY` | the key |
| `azure_openai` | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` | the key and the endpoint |
| `openai_compatible` | `SKILLSPECTOR_COMPAT_API_KEY`, `SKILLSPECTOR_COMPAT_BASE_URL` | the key and the endpoint |
| `ollama` | `OLLAMA_BASE_URL` | nothing (`http://localhost:11434/v1` by default) |

Any other provider, or one missing what it needs, counts as no provider. Passing only the chosen
provider's variables matters: SkillSpector falls back to `OPENAI_API_KEY` and `OPENAI_BASE_URL` when
a provider's own key is unset, which would send the files somewhere the warning doesn't name. The
prefix means nothing reaches the scanner because it happens to be in Ronne's environment. Settings
show the provider, the model and the host the files go to, never a key. SkillSpector's other
variables are never passed, `ANTHROPIC_BASE_URL` and `OPENAI_PROJECT_ID` among them, so `anthropic`
always sends to `api.anthropic.com`; an operator who sets one with the prefix sees it ignored, and
the knowledge note says so.

**Queuing.** When `send` (013) creates a revision of an item type that is scanned, and scanning is on,
it adds a `content_scans` row, `queued`, in the same transaction. When it's off, it adds nothing, and
the panel says "Not scanned". In a personal workspace a submission is approved at once (114). The scan
is still queued and still shows on the review page.

**Running.** The `skill_scan` job ([`run-job.ts`](../../../apps/web/src/server/jobs/run-job.ts), with
the job lease) takes the oldest `queued` row, marks it `running`, and:
1. writes the revision's files into a new `0700` directory under the OS temporary folder. It uses the
   same path checks as `checkPackage` (no `..`, no absolute paths, no symbolic links);
2. runs `command[0]` with `[...command.slice(1), "scan", dir, "--no-llm", "--format", "json"]`, with
   no shell; a semantic scan leaves out `--no-llm`;
3. passes an **environment with only these variables**: `PATH`, `HOME` and `TMPDIR` (both a `home/`
   folder beside the files, in the same temporary directory), `LANG`, `SKILLSPECTOR_MAX_WORKFLOW_SECONDS`
   (a little under the timeout), `SKILLSPECTOR_LOG_LEVEL=ERROR` and `LANGCHAIN_TRACING_V2=false`, and for
   a semantic scan the provider's variables above. `DATABASE_URL`, `AUTH_SECRET` and every other
   variable Ronne has never reach it;
4. stops it after the timeout (`RONNE_SKILL_SCANNER_TIMEOUT`, 300 seconds by default) or past 4 MiB
   of output: SIGTERM to its process group, then SIGKILL 5 seconds later (the wrapper stops its
   container on SIGTERM). When it exits, whatever it left running in its group is killed. Ronne
   stops waiting 2 seconds after that even if something outside the group still holds the output;
5. removes the directory, whatever happened. A scan never throws: a folder that can't be made is
   `no temporary folder`, a write the disk refuses is `write failed`, a command that can't be
   executed is `not runnable`, and a path given twice, inside another file, outside the item, with a
   name over 255 bytes, or differing from another only in case or Unicode form (a case-insensitive
   disk would merge them) is `bad file path`.

Exit 0 or 1 with JSON that passes `parseSkillScan` (`@ronneai/core`) gives `done`. A timeout, exit 2,
too much output or JSON that doesn't parse gives `failed`, with a short reason (`timeout`, `exit 2`,
`output too large`, `invalid report`, `not found`, `not runnable`, `signal`, and the three above). The process's own output is never stored or shown, since it
can echo item content. The job is started as soon as a scan is queued (fire and forget, under the
lease) and also runs every minute in `scheduler.ts`. `RONNE_JOBS=off` stops both. A `running` row
older than twice the timeout goes back to `queued` once, and is marked `failed` the second time.

**The result.** `parseSkillScan` keeps, from SkillSpector's documented JSON:
`risk_assessment.score` (0–100), `severity` (`LOW|MEDIUM|HIGH|CRITICAL`), `recommendation`
(`SAFE|CAUTION|DO_NOT_INSTALL`), `metadata.skillspector_version`, whether the LLM analysis ran
(`metadata.llm_requested`, `llm_available`, `llm_error`), and for each issue its rule id, category,
severity, confidence, file and line, title and explanation. A report must say it used the LLM
exactly when Ronne asked for it: a static scan that reports `llm_requested: true` is refused. A
semantic scan whose LLM wasn't available is kept as a static result, and says so. Strings are cut to 500 characters and the list to
200 findings, most severe first, with the number left out kept. Anything else in the report is dropped.

**The panel** (review page, beside `RiskSummary`, on every revision that has a scan):
- **Done:** the severity badge (CRITICAL and HIGH in the error colour, MEDIUM in the warning colour,
  LOW neutral), the score, SkillSpector's recommendation in our words ("Looks safe", "Look closely",
  "Likely unsafe"), and the findings table: severity, rule and category, file:line (a link to that line
  in the review's file view), and the message as plain text. Under it: "Static scan by SkillSpector
  vX.Y.Z" (or "Static and semantic scan by SkillSpector vX.Y.Z, with <provider> <model>", or "Semantic
  analysis didn't run: the provider wasn't available"), then "Advisory: it can miss problems and flag
  safe code."
- **Queued / running:** "Scanning…". The page refreshes the panel while it waits.
- **Failed:** "The scan didn't finish (timeout)". Root also sees "Scan again", which queues a new row.
- **Not scanned:** scanning was off, or the type isn't scanned. Root sees "Scan now".
- "Scan again" and "Scan now" show only while a scanner command is set; without one they're refused,
  since nothing would take the scan. They're also refused unless the revision's newest scan failed
  or it has none, so root can't add a second while one waits, runs or has finished.
- Each revision shows its own scan, so a resubmit gets a new one and the old revision keeps its own.

## Edge cases

- **The scanner is removed or broken after scans were queued:** every scan fails with `exit`,
  `not found` or `not runnable`, or, when `RONNE_SKILL_SCANNER` itself was removed, `not configured`;
  the panel and Admin › Settings show the last error. Nothing else is affected. The job takes no
  lease unless a scan is waiting or stuck (`running` for more than twice the timeout), so an
  instance that doesn't scan reads one row a minute. The folder sweep runs every minute either way,
  with no lease: it only touches folders older than any scan can last.
- **Ronne's process dies during a scan:** the scan folder stays until the next job run removes
  `ronne-scan-*` folders older than twice the longest a scan can take; the scan row is retried as a
  stuck one. The scanner keeps running in its own process group until SkillSpector's own deadline
  (`SKILLSPECTOR_MAX_WORKFLOW_SECONDS`, which Ronne sets a little under the timeout).
- **Many submissions at once** (bulk upload, 037): they wait in the queue, one at a time. A scan never
  slows down submitting.
- **More than one replica** (M17): the lease means one replica scans at a time. Each replica needs the
  scanner installed, or the scans its lease picks up fail. The knowledge note says so.
- **A revision with files larger than SkillSpector reads** (1 MB per file): SkillSpector reports partial
  coverage. We show "Some files were too large to scan" when its report says so.
- **An item type that isn't a skill** but is picked in settings (`agent`, `command`, `mcp-server`):
  scanned the same way. SkillSpector reads Markdown, scripts and MCP configs.
- **A submission withdrawn or deleted while queued:** a deleted one's scan row goes with the
  revision (cascade); a withdrawn (archived) one's is dropped by the job without scanning. Restoring
  it and sending it again makes a new revision, with its own scan.
- **Data download and erasure** (103, 104): scans hold no personal data, only findings about files,
  and go with their revision.
- **Retention** (060): scans go when their revision is purged.
- **The provider is removed from the environment and the settings file while semantic is chosen:** the next scans run
  static, and settings say "Semantic chosen, but no provider is set up: scans are static".
- **The provider fails or times out during a scan:** SkillSpector finishes the static part and says
  the LLM wasn't available. The scan is `done`, static, with that note.
- **Semantic and the container wrapper:** the provider must be reachable, so the wrapper can't use
  `--network none`. It uses the network the operator names (`SEMANTIC_NETWORK`), which should reach
  only the provider. The knowledge note says how.

## Data

- `content_scans`: id, revision_id (→ `submission_revisions`, cascade), scanner (`skillspector`),
  scanner_version (nullable), status `queued/running/done/failed`, attempts, score (nullable),
  severity (nullable), recommendation (nullable), complete (nullable), analysis (`static` or
  `semantic`: what ran, nullable until done), llm_note (nullable: `unavailable` when semantic was
  asked for and didn't run), llm_provider and llm_model (nullable), findings (JSON text, nullable), findings_omitted,
  error (nullable, short reason), queued_at, started_at, finished_at. Indexes on (status, queued_at), for the job, and
  (revision_id, queued_at), for the newest scan of a revision. Several rows per revision are allowed ("Scan again"). The panel shows the newest.
- Settings, rows of `instance_settings` (no migration): `skill_scan_enabled` (`false`),
  `skill_scan_types` (`skill`, a comma-separated list), `skill_scan_analysis` (`static`),
  `skill_scan_last_version` and `skill_scan_last_error` (what the scanner said last).

## Documentation

- **Reviewing submissions** (the review topic), a new section **Security scan**
  (`reviews#security-scan`): what SkillSpector checks, what the badge and findings mean, that it's
  advisory, static unless root chose semantic (and what that sends where), and can miss things and
  flag safe code, and that each revision gets its own scan.
- **Admin › Settings** topic, a new section **Security scan** (`settings#security-scan`): what the
  operator installs, `RONNE_SKILL_SCANNER`, the switch and types, static and semantic analysis (the
  provider variables, what leaves the server, cost and speed), and why the command and the provider
  can't be set from the web.
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
- [ ] The scanner is run with an argument array, no shell, with `--no-llm` unless the scan is
  semantic, on a private temporary directory that is removed afterwards, success or not.
- [ ] The scanner's environment holds only the allowlisted variables: the provider's only for a
  semantic scan, only from `RONNE_SKILL_SCANNER_ENV_*`, and only the chosen provider's. A test shows
  `DATABASE_URL`, `AUTH_SECRET`, an unprefixed `OPENAI_API_KEY`, a prefixed name off the list
  (`RONNE_SKILL_SCANNER_ENV_ANTHROPIC_BASE_URL`) and another provider's variables (`OPENAI_API_KEY`
  with `SKILLSPECTOR_PROVIDER=anthropic`) never reach it, and a static scan gets none of the
  provider's variables even with a provider set up.
- [ ] Semantic can be chosen only with a supported provider set up; the warning names the provider and
  host; keys are never shown, stored or logged; a report that used the LLM when it wasn't asked to is refused.
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

1. **SkillSpector, on the server, advisory** (owner, 2026-10-28).
2. **External and opt-in** (Claude): it is Python with a large dependency tree, alpha, and released
   every week, so it stays outside our image and pnpm tree. The operator pins it, and the
   dependencies policy lists it as an operator-installed tool.
3. **The command comes from the environment or the settings file, never from the web** (Claude): a
   command set in the web would let root run anything on the server.
4. **Each revision is scanned, not each version** (Claude): the moderator decides on a revision,
   and a version is a revision that was released.
5. **Static by default; semantic only when the operator sets up a provider and root chooses it**
   (owner, 2026-10-28). The provider and its key come from the environment or the settings file,
   like the command (decision 3) and like `DATABASE_URL` and `AUTH_SECRET`: the operator decides
   where item content may go and holds the provider's key. Set from the web, an endpoint would let
   root send item content anywhere, and the key would sit in the database, readable by anyone with
   access to it.

## Open questions

- Should a scan also be shown on the item page and to `rmk info` once moderators trust it? (Out,
  above. A later feature.)
- An optional scanner image for Docker installs: wanted, and when?
