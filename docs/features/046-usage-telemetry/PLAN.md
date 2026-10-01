# 046 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **0. Decisions.** The owner answers the spec's open questions 1–5; the answers go into the
  spec, MVP §14.6 and the decision log (§15), with MVP §12 and the access tokens row updated for
  question 4. Confirm question 6 from a real Claude Code payload, and re-check every hook event in
  the spec's table against the vendors' docs.
  *Done when:* no open question is left without an answer in the spec.

- [ ] **1. Storage and the usage domain.** The migration (`usage_daily`, `usage_projects`, cascade
  on `items.id`), a repository with the upsert helper from `db/`, and services: record a batch
  (validate, ignore, HMAC the project, sum by day) and retention. Reading it is 047's.
  *Done when:* `*.db.test.ts` covers sums, ignored events, install/remove/present/run on projects
  (with the version they report), retention and cascade; on all four database servers.

- [ ] **2. The API and the switch.** `USAGE_TELEMETRY` in `loadConfig`; `GET` and `POST
  /api/v1/usage` in `server/http`, with the token guard, the body limit, the rate limiter and
  `403 usage_disabled`.
  *Done when:* `usage-api.db.test.ts` covers acceptance, every ignore rule, the limits, `401` and the
  switch.

- [ ] **3. `rmk`: the switch, the queue and sending.** The config's `telemetry` field, the
  environment rules, the project id, the queue (aggregation, size and age limits), the send at the
  end of a command and `rmk telemetry flush`; `status` and `preview`; the line on `rmk login`.
  *Done when:* CLI tests cover each rule that turns it off, the project id for HTTPS, SSH and no
  remote, the queue's limits, an offline send, `401`, `403 usage_disabled` and `preview`'s exact
  output.

- [ ] **4. Install events.** Queue `install`, `remove` and the daily `present` from `commitInstall`
  and the MCP server's `apply_plan`, only when reporting is on.
  *Done when:* `install.test.ts` and the MCP server's tests check the queue after install, update,
  remove and a second command on the same day, and that nothing is queued when it's off.

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
