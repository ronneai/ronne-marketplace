# 046 — Opt-in usage telemetry

> Milestone: M9 · Depends on: 022, 023, 024, 025, 045 · Design: [MVP §14.6](../../MVP/MVP.md#146-usage-telemetry--post-mvp) · Contracts: [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

Moderators and authors can learn which items are actually used: how often they're installed and
removed, in which AI tools, how often they run and how those runs end. `rmk` reports this only from machines where a
person turned it on, only to the instance the items came from, and only as counts. This feature
collects and stores the data; 047 shows it on the item page.

## Scope

**In:**
- `rmk telemetry on | off | status | preview`, off by default on every machine, and the environment
  overrides (`RMK_TELEMETRY`, `DO_NOT_TRACK`, CI).
- **Install events:** `install` and `remove` per item and tool, recorded by `rmk` and by the MCP
  server's `apply_plan`.
- **Run events** from one user-level hook per tool that `rmk telemetry on` installs (Claude Code,
  Codex, Cursor), counting runs of `rmk`-installed items only, as far as each tool reports them (see
  the table below).
- A local queue, sent in batches to `POST /api/v1/usage` on the item's registry, and
  `GET /api/v1/usage` telling clients whether the instance accepts usage.
- Storage as daily totals, kept 90 days; nothing per person or per project.
- An instance switch, `USAGE_TELEMETRY=off`, in the settings file or the environment.
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
process even without one in the file, which is how a CI job opts in. `rmk telemetry status`
prints whether it's on and which of these decided it, the hooks it installed per tool, the queue's size and the last send per registry.

**Install events.** When `rmk install`, `update`, `remove`, the install with no arguments, or the MCP
server's `apply_plan` writes, it queues one event per item and target: `install` (also a version
change) or `remove`. Nothing says which project it happened in.

**Run events.** `rmk telemetry on` adds one hook, in each tool's **user-level** settings (never the
project's, so nothing is committed and teammates aren't affected), for the tools whose user folder
exists (`--target` to choose). The hook runs `rmk telemetry hook <tool>` asynchronously where the tool
allows. It reads the tool's JSON on stdin, finds the project from the payload's working folder (on
the machine only; the project is never sent), and records a run only when the name belongs to an
item in that project's `.rmk/state.json` or in the user-scope state. Anything else is ignored and nothing about it is kept. It always exits 0, prints
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

**`GET /api/v1/usage`** (any token): `{ "accepting": true, "retentionDays": 90 }`.
`rmk telemetry on` calls it for the default registry and says so when the instance doesn't accept
usage (it still records the choice, for other registries).

**`POST /api/v1/usage`** (any token): `{ "events": [ … ] }`, at most 500 events and 256 KiB; `202`
with `{ "accepted": n, "ignored": m }`. An event is ignored, not an error, when the item or version
isn't published here, the day is in the future or more than 3 days old, or a field isn't one of the
known values. `403 usage_disabled` when the switch is off: `rmk` then drops that registry's queue and
asks again after 7 days. Rate limit: 60 requests per user in 10 minutes, with the limiter 037 uses
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

**The switch:** `USAGE_TELEMETRY=off` in the settings file or the environment (`loadConfig`); on by
default, since every machine still has to opt in. `pnpm run setup` and the web setup leave it unset.

## Edge cases

- **Telemetry on, but `rmk` isn't on `PATH` when the tool runs the hook:** the hook fails and the tool
  may show its usual hook error. `rmk telemetry status` checks that the hooks' command resolves, and
  `on` refuses with that message when it doesn't.
- **A hook edited by the person:** the usual conflict rule; `on` and `off` skip it and say so unless
  `--force`.
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
- **`rmk telemetry off` with events queued:** the queue is deleted, not sent.

## Documentation

- **New topic `usage` ("Usage data")**, sections: `what` (what it's for, opt-in, nobody sees it until
  the item page shows it), `sent` (the event example and every field), `never` (the never list),
  `switch` (`rmk telemetry`, the environment variables, CI), `tools` (the table of what each tool
  reports, and the Codex `/hooks` review), `instance` (`USAGE_TELEMETRY=off`, the 90 days, nothing
  per person or project).
- **Topic `rmk`:** a new section `telemetry` pointing to the topic, with the four commands.
- **Topic `install`, section `setup`:** the `USAGE_TELEMETRY` setting.
- **Inline helpers:** none yet; 047 adds one where the numbers appear.

## Acceptance criteria

- [ ] Telemetry is off without a choice, and `RMK_TELEMETRY=0`, `DO_NOT_TRACK=1` and `CI` turn it
      off; `status` says which rule decided.
- [ ] `on` installs the user-level hooks for the tools present, records them in the user state, and
      `off` removes them and deletes the queue.
- [ ] Install, update, remove and `apply_plan` queue `install` and `remove`.
- [ ] The hook counts runs of `rmk`-installed items from each tool's documented payloads (golden
      payload tests per tool), ignores everything else, ignores Cursor's copy of Claude Code's hook,
      exits 0 and prints nothing.
- [ ] `preview` prints exactly what would be sent, and no event field outside the list exists.
- [ ] `POST /api/v1/usage` stores daily sums, ignores unknown items and bad
      days, enforces the size and rate limits, and answers `403 usage_disabled` when switched off;
      on all four database servers.
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

## Open questions

- **Claude Code's `Skill` tool input** doesn't document the field that holds the skill's name;
  building starts by confirming it from a real payload. If it can't be relied on, Claude Code skills
  count only when typed (`UserPromptExpansion`).
