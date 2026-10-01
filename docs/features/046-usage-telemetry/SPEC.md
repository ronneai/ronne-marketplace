# 046 — Usage telemetry

> Milestone: M9 · Depends on: 022, 023, 024, 025, 045 · Design: [MVP §14.6](../../MVP/MVP.md#146-usage-telemetry--post-mvp) · Contracts: [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

Moderators and authors can learn which items are actually used: how often they're installed and
removed, in which AI tools, how often they run and how those runs end. Root decides, per instance,
whether usage is collected: not at all (the default on a new instance), with each person free to turn
it off, or required. `rmk` reports only to the instance the items came from, and only as counts.
This feature collects and stores the data; 047 shows it on the item page.

## Scope

**In:**
- **The usage policy**, set by root on a new **Admin › Settings** page: `off` (the default), `choice`
  (on unless the person turns it off) or `required` (on, and nothing turns it off). Stored in the
  database, audited, effective at once.
- `rmk telemetry on | off | status | preview`, `RMK_TELEMETRY=0`, and a one-time notice per
  registry, all following the registry's policy.
- **Install events:** `install` and `remove` per item and tool, recorded by `rmk` and by the MCP
  server's `apply_plan`.
- **Run events** from one user-level hook per tool that `rmk install` adds when reporting is on
  (Claude Code, Codex, Cursor), counting runs of `rmk`-installed items only, as far as each tool reports them (see
  the table below).
- A local queue, sent in batches to `POST /api/v1/usage` on the item's registry, and
  `GET /api/v1/usage` telling clients the instance's policy.
- Storage as daily totals, kept 90 days; nothing per person or per project.
- The Documentation: exactly what is sent, what never is, and how to turn it off.

**Out** (and where it goes instead):
- Showing any of it: the item page's usage cards and charts are 047. Until then nobody sees the data,
  root included.
- **Counting projects** ("installed in N active projects"): left for later (owner, 2026-09-30). The
  design is kept in [MVP §14.6](../../MVP/MVP.md#146-usage-telemetry--post-mvp) under "Later".
- The home page's "Most used" stays on downloads (047).
- Usage from tier-2 tools (028–030, on hold).
- Reading tool transcripts to find skill runs in Codex and Cursor: transcripts aren't a stable format
  in either tool.
- Other instance settings (upload limits, MVP §12): the Settings page starts with the usage policy;
  they can join it later.
- `DO_NOT_TRACK` and `CI`: not honoured (owner, 2026-09-30); `RMK_TELEMETRY=0` is the person's
  switch where the policy lets them choose.
- Telemetry about `rmk` itself (commands run, errors, versions): only item usage.

## Behaviour

### On the person's machine

**The policy decides.** `rmk` learns each registry's policy from `GET /api/v1/usage`, at most once a
day per registry (and at `rmk login`), and keeps it in its usage state. Whether it reports to a
registry:

| Policy | Reports | What turns it off |
|---|---|---|
| `off` (or not known yet: never fetched, or the registry is older than 046) | Never | — |
| `choice` | Yes, by default | `rmk telemetry off` (the person's choice, saved per machine in `~/.config/rmk/config.json` as `"telemetry": { "enabled": false, "decidedAt": "<UTC>" }`), or `RMK_TELEMETRY=0` in the environment |
| `required` | Always | Nothing: `rmk telemetry off` is refused ("<registry> requires usage reporting"), and `RMK_TELEMETRY=0` is ignored for that registry |

`rmk telemetry on` clears an earlier `off`. Nothing ever asks a question.

**The notice.** The first time a command would report to a registry, `rmk` prints once (and records
that it did, per registry):
- `choice`: "rmk reports usage counts (installs and runs of the items it installed) to <registry>.
  To stop: rmk telemetry off. What's sent: <registry>/docs/usage"
- `required`: "<registry> requires usage reporting: rmk sends counts of installs and runs of the
  items it installed. What's sent: <registry>/docs/usage"
- `off`: nothing.
When the policy changes later, the next command prints the new notice.

`rmk telemetry status` prints, per registry, the policy, whether it reports and what decided it
(policy, your choice, `RMK_TELEMETRY=0`), the hooks installed per tool, the queue's size and the
last send.

**Install events.** When `rmk install`, `update`, `remove`, the install with no arguments, or the MCP
server's `apply_plan` writes, it queues one event per item and target: `install` (also a version
change) or `remove`. Nothing says which project it happened in.

**Run events.** When reporting is on for an item's registry, `rmk install` (and `update`, and the MCP
server's `apply_plan`) adds one hook to the **user-level** settings of each tool it installs into, if
it isn't there yet, and says so: "Added rmk's usage hook to ~/.claude/settings.json, to count runs of
the items rmk installed." Never to the project's settings, so nothing is committed and teammates
aren't affected. `rmk telemetry off` removes the hooks (where the policy allows it); while reporting
is off for a registry, the hook records nothing for its items. The hook runs `rmk telemetry hook <tool>` asynchronously where the tool
allows. It reads the tool's JSON on stdin, finds the project from the payload's working folder (on
the machine only; the project is never sent), and records a run only when the name belongs to an
item in that project's `.rmk/state.json` or in the user-scope state, and reporting is on for that
item's registry. Anything else is ignored and nothing about it is kept. It always exits 0, prints
nothing and appends one line to the queue. The entries are recorded in
`~/.config/rmk/user-state.json` under the item name `rmk telemetry`, like `rmk mcp-setup`'s (027), so
they're managed files with the usual conflict rules, and installs leave them alone.

What each tool reports (checked against the vendors' docs on 2026-09-30; re-check before building,
as for renderers, MVP §3.3):

| | Claude Code | Codex | Cursor |
|---|---|---|---|
| Hook file | `~/.claude/settings.json` | `~/.codex/hooks.json` | `~/.cursor/hooks.json` |
| Skills | The model choosing one: `PostToolUse` / `PostToolUseFailure` on `Skill` (`tool_input.skill`). Typed by the person: `UserPromptExpansion` (`slash_command`) | No event: not counted | No event: not counted |
| Commands | `UserPromptExpansion` (`command_name`) | No event | No event |
| Agents | `SubagentStart` (`agent_type`) | `SubagentStart` (`agent_type`) | `subagentStop` (`subagent_type`), if custom agents' names appear there |
| MCP servers | `PostToolUse` / `PostToolUseFailure` on `mcp__<server>__…` | `PostToolUse` on `mcp__<server>__…` | `afterMCPExecution` (`mcp_server_name`), `postToolUseFailure` |
| Outcome | Skills and MCP: success or error. Agents and commands: unknown | Unknown | Agents: `status` (completed, error, aborted). MCP: success or error |
| Before it runs | The workspace trust dialog | The person reviews the hook in `/hooks` (rmk says so) | Nothing for user hooks |

- **Trigger:** `user` (typed by the person: `UserPromptExpansion`), `model` (the model chose it),
  `agent` (the event fired inside a subagent: `agent_id` present, or Cursor's
  `parent_conversation_id`), or `unknown`. A run under `CI` is `ci`; no tool's payload says it's
  headless.
- **Outcome:** `success`, `error`, `cancelled` where the tool says so; otherwise `unknown`, and 047
  shows a success rate only from runs with a known outcome.
- **Hooks, rules, output styles, status lines, permission policies and LSP servers** have no runs to
  count: install events only.
- **Cursor reading Claude Code's hooks** (its third-party setting): the Claude Code hook ignores a
  payload that carries `cursor_version`, so a run is counted once.
- A tool without a usable event reports installs only, and the Documentation's table says which.

**The queue.** Events go to `usage/<registry hash>.jsonl` in `rmk`'s cache folder (next to the
artifact cache, 022), aggregated by day before sending (one line per day, item, version, tool, event,
trigger and outcome, with a count). Sent at the end of any `rmk` command and, from the hook,
by a detached `rmk telemetry flush` when the oldest line is over an hour old: one request per
registry, at most 500 lines, 2 seconds, never retried in the same command. Lines older than 3 days and
anything past 1 MB are dropped, oldest first. Offline, it waits; nothing is ever shown to the person
about a failed send. `rmk telemetry preview` prints the queue exactly as it would be sent.

**What an event carries** (and only this):

```json
{ "day": "2026-10-01", "item": "@platform/code-reviewer", "version": "1.4.0", "tool": "claude-code",
  "event": "run", "trigger": "model", "outcome": "success", "count": 3 }
```

**Never:** prompts, arguments, file contents, paths, project or repository names or ids, remote
URLs, branch names, user names or emails
(Cursor's payload has one; it's never read), environment values, tool inputs or outputs, session or
conversation ids, or the names of items `rmk` didn't install.

### On the instance

**`GET /api/v1/usage`** (any token): `{ "policy": "choice", "retentionDays": 90 }`.

**`POST /api/v1/usage`** (any token): `{ "events": [ … ] }`, at most 500 events and 256 KiB; `202`
with `{ "accepted": n, "ignored": m }`. An event is ignored, not an error, when the item or version
isn't published here, the day is in the future or more than 3 days old, or a field isn't one of the
known values. `403 usage_disabled` when the policy is `off`: `rmk` then drops that registry's queue
and records the policy as `off` until its next daily check. Rate limit: 60 requests per user in 10 minutes, with the limiter 037 uses
(`429`). The body limit follows 037's rule that every `POST` has one. No audit entry: a usage report
changes nothing anyone sees, and one per command would flood the log.

**What is stored** (one migration, all three databases): one table, `usage_daily`: item_id, day,
version, tool, event, trigger, outcome, count; the primary key is every column but count, in that
order (the item page reads one item's days). A report adds its counts to the matching rows.

- **No user id, token, IP, user agent or project** is stored with usage. The token only authorises
  the request.
- **Retention:** rows older than 90 days (`retentionDays`) are deleted, at most once a day, when a
  report arrives.
- The table references `items.id` with cascade, so usage never outlives its item.
- Nothing in the web app shows the data yet: 047 adds the summary queries and the page.

**The policy** (root only): **Admin › Settings**, a new page in the admin area, with one setting so
far, "Usage reporting", three choices with a sentence each:
- **Off:** "rmk reports nothing, and this instance refuses usage reports." (The default.)
- **People choose:** "rmk reports usage counts unless the person turns it off with rmk telemetry off."
- **Required:** "Every rmk that installs from this instance reports usage counts; people can't turn it
  off."
Saving takes effect at once (no restart) and is recorded in the audit log
(`settings.usage_policy`, with the old and new value). Stored in a new `instance_settings` table
(key, value, updated_by, updated_at), which later settings join. A database without the row reads
`off`.

## Edge cases

- **Reporting on, but `rmk` isn't on `PATH` when the tool runs the hook:** the hook fails and the
  tool may show its usual hook error. `rmk install` doesn't add the hook when the command doesn't
  resolve, and `rmk telemetry status` says why.
- **A hook edited by the person:** the usual conflict rule; `install` and `off` skip it and say so
  unless `--force`.
- **Root changes the policy:** `rmk` sees it at its next daily check (or `rmk login`); a report sent
  meanwhile to an instance now `off` gets `403` and the queue is dropped. From `required` to
  `choice`, a person's earlier `rmk telemetry off` counts again.
- **Several registries with different policies:** each item's lines follow its own registry's
  policy; the hook is added when any of them reports.
- **The registry can't be reached for the daily check:** the last known policy stays; never known
  means `off`.
- **An item installed for Claude Code and Cursor at once:** one `install` per tool; runs say which
  tool ran them.
- **Two names collide** (a skill and a command both called `review`, from different scopes): the
  type in the event decides; a name that still matches two items in the state file is ignored.
- **A project with several registries:** each item's events go to the registry in its project's
  lockfile.
- **The token was revoked:** the send gets `401`; the queue is kept (until its 3 days) for after
  `rmk login`.
- **Clock skew:** the day is the machine's UTC day; the server accepts today ± 1 and three days back.
- **A yanked or deprecated version:** counted; usage of old versions is what moderators want to see.
- **`rmk telemetry off` with events queued:** the queue for registries that allow it is deleted, not
  sent.

## Documentation

- **New topic `usage` ("Usage data")**, sections: `what` (what it's for; nobody sees it until the
  item page shows it), `policy` (the three policies and who sets them), `sent` (the event example and
  every field), `never` (the never list), `switch` (`rmk telemetry`, `RMK_TELEMETRY=0`, the notice),
  `tools` (the table of what each tool reports, the hooks rmk adds, and the Codex `/hooks` review),
  `instance` (the 90 days, nothing per person or project).
- **Topic `rmk`:** a new section `telemetry` pointing to the topic, with the four commands.
- **Topic `roles`, section `permissions`:** root sets the usage policy.
- **Inline helpers:** a new `usage-policy` helper next to the setting on Admin › Settings, linking to
  `usage#policy`; 047 adds one where the numbers appear.

## Acceptance criteria

- [ ] A new instance's policy is `off`; root changes it on Admin › Settings, the change is audited
      and takes effect without a restart; nobody else can change it.
- [ ] `rmk` reports nothing to an `off` or unknown registry; reports by default to `choice` unless
      `rmk telemetry off` or `RMK_TELEMETRY=0`; always reports to `required`, refusing `off` there;
      `status` says which rule decided.
- [ ] The notice is printed once per registry and policy.
- [ ] `install` adds the user-level hook for the tools it installs into when reporting is on, says
      so, and records it in the user state; `off` removes it where allowed and deletes the queue.
- [ ] Install, update, remove and `apply_plan` queue `install` and `remove`.
- [ ] The hook counts runs of `rmk`-installed items from each tool's documented payloads (golden
      payload tests per tool), ignores everything else, ignores Cursor's copy of Claude Code's hook,
      exits 0 and prints nothing.
- [ ] `preview` prints exactly what would be sent, and no event field outside the list exists.
- [ ] `POST /api/v1/usage` stores daily sums, ignores unknown items and bad
      days, enforces the size and rate limits, and answers `403 usage_disabled` when the policy is
      `off`; on all four database servers.
- [ ] Nothing about the person or the project is sent or stored, and retention deletes old rows.
- [ ] The Documentation listed above says what the feature does now.

## Decisions

Answered by the owner on 2026-09-30 (MVP §14.6's "decisions to make first"):

1. **Projects:** not counted for now. No project id is computed, sent or stored; the design is kept in
   MVP §14.6 under "Later".
2. **Retention:** 90 days of daily totals.
3. **Who may report:** any token. A token can then do two things, create drafts and report usage;
   MVP §12 and the access tokens decision change when this is built.
4. **Skill and command runs in Codex and Cursor** can't be counted from their hooks today: installs
   only there, and the Documentation says so. Agents and MCP servers count runs in every tool.

Changed by the owner the same day, during task 3 (usage was opt-in until then):

5. **A policy per instance, set by root:** off on a new instance; "people choose" or "required".
   Set on a new Admin › Settings page, not in the settings file.
6. **People choose:** on until the person turns it off (`rmk telemetry off` or `RMK_TELEMETRY=0`).
   `DO_NOT_TRACK` and `CI` aren't honoured.
7. **Required:** nothing turns it off, `RMK_TELEMETRY=0` included.
8. **Run hooks:** added by `rmk install` when reporting is on, with a notice; no separate step.
9. **The notice:** once per registry, worded by the policy.

## Open questions

- None. (The `Skill` tool's input was confirmed on 2026-09-30 from real Claude Code 2.1.286 payloads:
  `tool_input.skill` names the skill, and `PostToolUse` adds `tool_response.success`.)
