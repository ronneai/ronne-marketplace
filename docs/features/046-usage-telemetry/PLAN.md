# 046 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **0. Check the tools.** Confirm the spec's open question (the `Skill` tool's input) from a real
  Claude Code payload, and re-check every hook event in the spec's table against the vendors' docs.
  (The owner's decisions are already in the spec, MVP §14.6 and the decision log.)
  *Done when:* the open question is answered in the spec, and the table matches the docs.

- [x] **1. Storage and the usage domain.** The migration (`usage_daily`, cascade on `items.id`), a
  repository with the upsert helper from `db/`, and services: record a batch (validate, ignore, sum
  by day) and retention. Reading it is 047's.
  *Done when:* `*.db.test.ts` covers sums, ignored events, retention and cascade; on all four
  database servers.

- [x] **2. The API and the switch.** `USAGE_TELEMETRY` in `loadConfig`; `GET` and `POST
  /api/v1/usage` in `server/http`, with the token guard, the body limit, the rate limiter and
  `403 usage_disabled`.
  *Done when:* `usage-api.db.test.ts` covers acceptance, every ignore rule, the limits, `401` and the
  switch.

- [ ] **3. `rmk`: the switch, the queue and sending.** The config's `telemetry` field, the
  environment rules, the queue (aggregation, size and age limits), the send at the
  end of a command and `rmk telemetry flush`; `status` and `preview`; the line on `rmk login`.
  *Done when:* CLI tests cover each rule that turns it off, the queue's limits, an offline send, `401`, `403 usage_disabled` and `preview`'s exact
  output.

- [ ] **4. Install events.** Queue `install` and `remove` from `commitInstall` and the MCP server's
  `apply_plan`, only when reporting is on.
  *Done when:* `install.test.ts` and the MCP server's tests check the queue after install, update and
  remove, and that nothing is queued when it's off.

- [ ] **5. The run hooks.** `rmk telemetry on | off` writing and removing the user-level hook per tool
  (recorded under `rmk telemetry` in the user state); `rmk telemetry hook <tool>` mapping each tool's
  payload to a run of an installed item, the trigger and the outcome; Cursor's copy of Claude Code's
  hook ignored; the Codex `/hooks` note.
  *Done when:* golden payload tests per tool (from the vendors' documented examples) cover each row
  of the spec's table, an item `rmk` didn't install, a name matching two items, and that the hook
  always exits 0 and prints nothing; `on` and `off` round-trip with the conflict rule.

- [ ] **6. Documentation.** The `usage` topic, the `rmk` and `install` sections in the spec's
  Documentation section; `docs/spec/cli-files.md` gets the config's `telemetry` field and the queue.
  *Done when:* the docs render tests pass, and every link to the new topic lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 0 (2026-09-30).** Claude Code 2.1.286, `claude -p` in a scratch project with logging hooks:
  - `PreToolUse` / `PostToolUse` on `Skill`: `"tool_input": {"skill": "echo-probe"}`; `PostToolUse`
    adds `"tool_response": {"success": true, "commandName": "echo-probe"}`.
  - `/echo-probe` typed: `UserPromptExpansion` with `"expansion_type": "slash_command"`,
    `"command_name": "echo-probe"`, `"command_args": ""`, `"command_source": "projectSettings"`; no
    `PreToolUse` on that path.
  - A custom agent: `SubagentStart` and `SubagentStop` with `"agent_type": "probe-agent"` and an
    `agent_id`; `SubagentStop` has no outcome field.
  - `-p` ran the project's hooks without a trust prompt.
  - Codex's and Cursor's events were checked against their docs the same day; no change to the
    spec's table. Their payloads come from the docs' examples until someone can run those tools.
- **Task 1.** The domain is `apps/web/src/server/domains/usage` (not the items domain): the model
  validates one event, the service sums a report's lines before writing, and `upsertAdding` in
  `db/upsert.ts` adds counts in the database, so concurrent reports never lose one. The trigger
  column is `run_trigger`, because `trigger` is a reserved word in SQL.
- **Task 2.** The API checks, in order: the token, the switch (so a client told to stop isn't also
  told to slow down), the rate, the body's size, then the domain. `USAGE_TELEMETRY` accepts `off`,
  `false` or `0`. MVP §11, §12 and the access tokens decision now say a token may report usage.
