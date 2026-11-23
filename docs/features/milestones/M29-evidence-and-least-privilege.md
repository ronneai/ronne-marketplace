# M29 — Evidence and least privilege

> [All milestones](README.md) · [Features index](../README.md)

Planned on 2026-11-01, with M28, M30, M31: why, and in what order, in [the milestones](README.md#planned-on-2026-11-01).

Auditors get evidence they can take away, machines get only the access they need, and developers
see what they're installing before it's written. With it, the two `rmk` lockfile gaps in the threat
model's known gaps (§5: a yanked version a lockfile pins installs without the promised warning; a
dependency on a tag doesn't stay on `rmk.lock`) are filed as issues against 022 and fixed in
`docs/issues`.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 167 | Audit events for what isn't recorded yet: authorization refusals (`authz.denied`, at most one per person, action and minute), root's Scan now, retention purges (with counts), viewing and exporting the audit log; a guard test that every service changing a governed table records an event | 166 | planned |
| 168 | Audit export: the audit log's filtered view as CSV or JSON Lines, and `GET /api/v1/audit` (keyset pages, a token with the audit scope), for root and auditors; each export audited | 166, 167, 169, 170 | planned |
| 169 | Auditor role: instance-wide read-only access to the audit log, users and roles, settings and governance reports, without changing anything or reading private items' content; Admin pages gated by permission instead of by root | 166, 123 | planned |
| 170 | Token scopes: read, feeds, drafts and usage (and audit, for auditors) chosen per token, `rmk login` and the device flow asking only for what they need, existing tokens keeping every scope; built with 116's workspaces | 116, 162 | planned |
| 171 | Review provenance for installers: each version's review in the API, `rmk info`, the MCP server and the feeds (reviewed or not, how it was approved, when, the scan's score); `rmk install --reviewed-only` and a project setting that refuses unreviewed versions | 019, 022, 027, 137 | planned |
| 172 | `rmk install` shows risk before it writes: hooks, MCP servers, widening permission rules and network hosts, dependencies included, listed and confirmed; `--yes` for scripts; a project policy in `rmk.config.json` that refuses or asks by item type | 022, 041, 171 | planned |
| 173 | MCP writes tied to what the person saw: `submit_drafts` takes the id of the `check_drafts` the person was shown, as `apply_plan` takes a plan; item text returned framed as content, never instructions; a prompt-injection section in the threat model | 027, 052 | planned |
| 174 | Secrets found anywhere in an item: the secret check runs over every text file and hook command at submit, not only MCP fields; known formats refused, likely ones warned | 011, 013 | planned |
