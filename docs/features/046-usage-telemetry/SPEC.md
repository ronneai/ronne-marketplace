# 046 — Opt-in usage telemetry

> Milestone: M9 · Depends on: 022, 023, 024, 025, 045 · Design: [MVP §14.6](../../MVP/MVP.md#146-usage-telemetry--post-mvp) · Contracts: [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

Moderators and authors can learn which items are actually used: in how many projects, in which AI
tools, how often they run and how those runs end. `rmk` reports this only from machines where a
person turned it on, only to the instance the items came from, and only as counts. This feature
collects and stores the data; 047 shows it on the item page.

## Scope

**In:**
- `rmk telemetry on | off | status | preview`, off by default on every machine, and the environment
  overrides (`RMK_TELEMETRY`, `DO_NOT_TRACK`, CI).
- **Install events:** `install`, `remove` and a daily `present` per item and project, recorded by
  `rmk` and by the MCP server's `apply_plan`.
- **Run events** from one user-level hook per tool that `rmk telemetry on` installs (Claude Code,
  Codex, Cursor), counting runs of `rmk`-installed items only, as far as each tool reports them (see
  the table below).
- A local queue, sent in batches to `POST /api/v1/usage` on the item's registry, and
  `GET /api/v1/usage` telling clients whether the instance accepts usage.
- Storage as daily aggregates and hashed project ids, with a retention window; nothing per person.
- An instance switch, `USAGE_TELEMETRY=off`, in the settings file or the environment.
- The Documentation: exactly what is sent, what never is, and how to turn it off.

**Out** (and where it goes instead):
- Showing any of it: the item page's usage cards and charts are 047. Until then nobody sees the data,
  root included.
- Moving the home page's "Most used" from downloads to active projects: decided in 047.
- Usage from tier-2 tools (028–030, on hold).
- Reading tool transcripts to find skill runs in Codex and Cursor: transcripts aren't a stable format
  in either tool.
- An instance settings page: the switch is in the settings file, like the other instance settings
  today.
- Telemetry about `rmk` itself (commands run, errors, versions): only item usage.

## Behaviour

### On the person's machine

**The switch.** `rmk telemetry on` asks nothing more; it records the choice in
`~/.config/rmk/config.json` as `"telemetry": { "enabled": true, "decidedAt": "<UTC>" }` (one choice
per machine, for every registry), installs the run hooks (below) and prints what will be sent and the
Documentation link. `off` records `false`, removes the hooks and deletes the queue. Without a choice,
it's off. Nothing ever asks: `rmk login` prints one line saying usage reporting exists and is off.

It's off, whatever the file says, when `RMK_TELEMETRY=0`, when `DO_NOT_TRACK=1`, or when `CI` is set
(unless `RMK_TELEMETRY=1`). `RMK_TELEMETRY=1` is a choice too: it turns reporting on for that
process even without one in the file, which is how a CI job opts in. `rmk telemetry status` prints whether it's on and which of
these decided it, the hooks it installed per tool, the queue's size and the last send per registry.

**The project id.** Projects are counted without being named. `rmk` hashes, with SHA-256 and a fixed
prefix (`rmk-project:v1:`), the project's `origin` remote normalised (scheme, credentials, port and a
trailing `.git` dropped; host lowercased: `https://user@GitHub.com/a/b.git` and `git@github.com:a/b`
give the same id), or the project's absolute folder path when there's no remote. User-scope installs
send no project id. The URL and path never leave the machine.

**Install events.** When `rmk install`, `update`, `remove`, the install with no arguments, or the MCP
server's `apply_plan` writes, it queues one event per item and target: `install` (also a version
change) or `remove`. Any `rmk` command run in a project, and any run event there, also queues
`present` for each item in the lockfile, at most once a day per project, so an untouched but used
project stays counted.

**Run events.** `rmk telemetry on` adds one hook, in each tool's **user-level** settings (never the
project's, so nothing is committed and teammates aren't affected), for the tools whose user folder
exists (`--target` to choose). The hook runs `rmk telemetry hook <tool>` asynchronously where the tool
allows. It reads the tool's JSON on stdin, finds the project from the payload's working folder, and
records a run only when the name belongs to an item in that project's `.rmk/state.json` or in the
user-scope state. Anything else is ignored and nothing about it is kept. It always exits 0, prints
nothing and appends one line to the queue. The entries are recorded in
`~/.config/rmk/user-state.json` under the item name `rmk telemetry`, like `rmk mcp-setup`'s (027), so
they're managed files with the usual conflict rules, and installs leave them alone.

What each tool reports (checked against the vendors' docs on 2026-09-30; re-check before building,
as for renderers, MVP §3.3):

| | Claude Code | Codex | Cursor |
|---|---|---|---|
| Hook file | `~/.claude/settings.json` | `~/.codex/hooks.json` | `~/.cursor/hooks.json` |
| Skills | The model choosing one: `PostToolUse` / `PostToolUseFailure` on `Skill`. Typed by the person: `UserPromptExpansion` (`slash_command`) | No event: not counted | No event: not counted |
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
trigger, outcome and project, with a count). Sent at the end of any `rmk` command and, from the hook,
by a detached `rmk telemetry flush` when the oldest line is over an hour old: one request per
registry, at most 500 lines, 2 seconds, never retried in the same command. Lines older than 3 days and
anything past 1 MB are dropped, oldest first. Offline, it waits; nothing is ever shown to the person
about a failed send. `rmk telemetry preview` prints the queue exactly as it would be sent.

**What an event carries** (and only this):

```json
{ "day": "2026-10-01", "item": "@platform/code-reviewer", "version": "1.4.0", "tool": "claude-code",
  "event": "run", "trigger": "model", "outcome": "success", "project": "9f2c…", "count": 3 }
```

**Never:** prompts, arguments, file contents, paths, remote URLs, branch names, user names or emails
(Cursor's payload has one; it's never read), environment values, tool inputs or outputs, session or
conversation ids, or the names of items `rmk` didn't install.

### On the instance

**`GET /api/v1/usage`** (any token): `{ "accepting": true, "retentionDays": 90, "activeDays": 30 }`.
`rmk telemetry on` calls it for the default registry and says so when the instance doesn't accept
usage (it still records the choice, for other registries).

**`POST /api/v1/usage`** (any token): `{ "events": [ … ] }`, at most 500 events and 256 KiB; `202`
with `{ "accepted": n, "ignored": m }`. An event is ignored, not an error, when the item or version
isn't published here, the day is in the future or more than 3 days old, or a field isn't one of the
known values. `403 usage_disabled` when the switch is off: `rmk` then drops that registry's queue and
asks again after 7 days. Rate limit: 60 requests per user in 10 minutes, with the limiter 037 uses
(`429`). The body limit follows 037's rule that every `POST` has one. No audit entry: a usage report
changes nothing anyone sees, and one per command would flood the log.

**What is stored** (one migration, all three databases):

| Table | Columns | Holds |
|---|---|---|
| `usage_daily` | item_id, day, version, tool, event, trigger, outcome, count; PK on all but count, in that order (the item page reads one item's days) | Sums per day |
| `usage_projects` | item_id, project, tool, version, first_day, last_day, removed_day; PK (item_id, project, tool) | Which projects have the item, and the version they last reported, for "active projects" |

- `project` is HMAC-SHA256 of the client's hash under a key derived from `AUTH_SECRET`, so a copy of
  the database can't be matched against a list of guessed repository URLs. User-scope events count
  under one project per person, derived the same way from the user's id and never stored with it.
- **No user id, token, IP or user agent** is stored with usage. The token only authorises the request.
- An `install` sets `last_day` and `version` (and clears `removed_day`), `remove` sets `removed_day`,
  `present` and `run` set `last_day` and `version`. A project is **active** for an item when it isn't removed and `last_day`
  is within `activeDays`.
- **Retention:** daily rows older than `retentionDays`, and project rows whose `last_day` (or
  `removed_day`) is older, are deleted, at most once a day, when a report arrives.
- Both tables reference `items.id` with cascade, so usage never outlives its item.
- Nothing in the web app shows the data yet: 047 adds the summary queries and the page.

**The switch:** `USAGE_TELEMETRY=off` in the settings file or the environment (`loadConfig`); on by
default, since every machine still has to opt in. `pnpm run setup` and the web setup leave it unset.

## Edge cases

- **Telemetry on, but `rmk` isn't on `PATH` when the tool runs the hook:** the hook fails and the tool
  may show its usual hook error. `rmk telemetry status` checks that the hooks' command resolves, and
  `on` refuses with that message when it doesn't.
- **A hook edited by the person:** the usual conflict rule; `on` and `off` skip it and say so unless
  `--force`.
- **An item installed for Claude Code and Cursor in one project:** one `present` per tool; runs say
  which tool ran them.
- **Two names collide** (a skill and a command both called `review`, from different scopes): the
  type in the event decides; a name that still matches two items in the state file is ignored.
- **A project with several registries:** each item's events go to the registry in its project's
  lockfile.
- **The token was revoked:** the send gets `401`; the queue is kept (until its 3 days) for after
  `rmk login`.
- **Clock skew:** the day is the machine's UTC day; the server accepts today ± 1 and three days back.
- **A yanked or deprecated version:** counted; usage of old versions is what moderators want to see.
- **`rmk telemetry off` with events queued:** the queue is deleted, not sent.

## Documentation

- **New topic `usage` ("Usage data")**, sections: `what` (what it's for, opt-in, nobody sees it until
  the item page shows it), `sent` (the event example and every field), `never` (the never list),
  `switch` (`rmk telemetry`, the environment variables, CI), `tools` (the table of what each tool
  reports, and the Codex `/hooks` review), `instance` (`USAGE_TELEMETRY=off`, retention, active
  window, hashed projects, nothing per person).
- **Topic `rmk`:** a new section `telemetry` pointing to the topic, with the four commands.
- **Topic `install`, section `setup`:** the `USAGE_TELEMETRY` setting.
- **Inline helpers:** none yet; 047 adds one where the numbers appear.

## Acceptance criteria

- [ ] Telemetry is off without a choice, and `RMK_TELEMETRY=0`, `DO_NOT_TRACK=1` and `CI` turn it
      off; `status` says which rule decided.
- [ ] `on` installs the user-level hooks for the tools present, records them in the user state, and
      `off` removes them and deletes the queue.
- [ ] Install, update, remove and `apply_plan` queue `install` and `remove`; a command in a project
      queues `present` at most once a day.
- [ ] The hook counts runs of `rmk`-installed items from each tool's documented payloads (golden
      payload tests per tool), ignores everything else, ignores Cursor's copy of Claude Code's hook,
      exits 0 and prints nothing.
- [ ] `preview` prints exactly what would be sent, and no event field outside the list exists.
- [ ] The project id is the same for a remote's HTTPS and SSH forms, and no URL or path is sent.
- [ ] `POST /api/v1/usage` stores daily sums and hashed projects, ignores unknown items and bad
      days, enforces the size and rate limits, and answers `403 usage_disabled` when switched off;
      on all four database servers.
- [ ] Nothing about the person is stored with usage, and retention deletes old rows.
- [ ] The Documentation listed above says what the feature does now.

## Open questions

These were the "decisions to make first" in MVP §14.6. The spec is written with the recommended
answer; the owner confirms or changes them before building, and the decision log records them.

1. **The project id:** the normalised `origin` remote, falling back to the folder path (specified),
   or the folder path only (simpler, but one repository cloned twice counts twice).
2. **Retention:** 90 days of daily sums, and 30 days without a sign of life before a project stops
   counting as active (specified).
3. **Per-project data for moderators:** never; only counts, and 047 hides numbers under a threshold
   (specified).
4. **Who may report:** any token (specified). A token can then do two things, create drafts and
   report usage, which changes MVP §12's "a token can create drafts and nothing else" and the access
   tokens decision; both are updated when this is built.
5. **Skill runs in Codex and Cursor** can't be counted from their hooks today. Accept installs-only
   there (specified), or wait for the tools to add an event.
6. **Claude Code's `Skill` tool input** doesn't document the field that holds the skill's name;
   building starts by confirming it from a real payload. If it can't be relied on, Claude Code skills
   count only when typed (`UserPromptExpansion`).
