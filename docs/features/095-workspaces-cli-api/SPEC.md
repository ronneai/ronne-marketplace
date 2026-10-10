# 095 — Workspaces in `rmk`, the MCP server and the API

> Milestone: M13 · Depends on: 090, 091, 093, 094, 019, 022, 027, 038 · Design: [MVP §6](../../MVP/MVP.md#6-cli--rmk), [§7](../../MVP/MVP.md#7-registry-mcp-server), [§11](../../MVP/MVP.md#11-rest-api-sketch-apiv1) · Contracts: none changed (names stay `@scope/name`)

## Goal

People who work from the terminal or their AI tool see which workspace an item is in, can narrow a
search to one, and know where they may export. Nothing about names, lockfiles or the state file
changes (owner, 2026-10-05: names stay `@scope/name`).

## Scope

**In:**
- **API:** `GET /api/v1/workspaces` (the caller's visible workspaces, with their role); `workspace`
  on items, search results and `GET /api/v1/me` (memberships); `?workspace=` on search.
- **`rmk`:** `rmk workspaces` (list, with role); `rmk search --workspace <name>`; `rmk info` shows
  the workspace (and "private"); `rmk export` groups the scope choice by workspace and lists only
  scopes it may use (091); a `not_a_member` answer prints the web address to ask to join (094).
- **MCP:** `search_items` takes `workspace`; item results carry it; a `list_workspaces` tool.

**Out** (and where it goes instead):
- **Requesting access from `rmk`.** The web app only (094).
- **Workspace in `rmk.config.json` or `rmk.lock`.** Not needed: the name finds the item.

## Behaviour

The API: `GET /api/v1/workspaces` answers `{ "workspaces": [{ "name", "description",
"visibility", "global", "role" }] }`, `global` first, then by name: every public workspace and the
private ones the caller is in (093). `role` is the caller's role there, null where they aren't a
member, and `root` on every one for root. `GET /api/v1/me` adds `workspaces: [{ "name", "role" }]`,
the caller's memberships. Search results, items and versions carry
`"workspace": { "name": "acme", "visibility": "private" }`. `?workspace=` on `GET /api/v1/items` is
trimmed and lowercased; a name no workspace has and a private one the caller isn't in both find
nothing, with the same answer; more than 64 characters is a `400 invalid_request`.

`rmk workspaces`:

```
WORKSPACE  VISIBILITY  YOUR ROLE
global     public      user
acme       private     moderator
tools      public      —   (ask: https://ronne.example.com/workspaces/tools/join)
```

`rmk search deploy --workspace acme` filters as the catalogue does. `rmk info @acme-infra/deploy`
adds `workspace: acme (private)`. `rmk export`'s scope prompt lists `acme › @acme-infra`,
`global › @tools` and so on, only where the user is a member.

The MCP `search_items` input gains an optional `workspace`; `list_workspaces` returns what `rmk
workspaces` prints, as data. Old `rmk` versions keep working: new fields are additive, and the
`?workspace=` parameter is optional.

## Edge cases

- **An older `rmk` against a new instance:** works; it doesn't show workspaces, and export's scope
  list is already filtered by the server.
- **A new `rmk` against an older instance** (no `/workspaces`): `rmk workspaces` says "This registry
  doesn't have workspaces (it's older than 0.N)".

## Documentation

- **`rmk` → Installing** (`rmk#installing`) and **From inside your AI tool** (`rmk#mcp`):
  `--workspace`, `rmk workspaces`, the MCP tool.
- **Exporting your own items → Choosing the scope** (`export#scope`): grouped by workspace.
- **Helpers:** none new (`rmk` isn't in the app).

## Acceptance criteria

- [ ] `GET /api/v1/workspaces`, `workspace` on items and `me`, and `?workspace=` work and respect
  093's visibility.
- [ ] `rmk workspaces`, `rmk search --workspace`, `rmk info` and `rmk export` behave as above,
  with CLI tests.
- [ ] The MCP tools take and return the workspace.
- [ ] An older `rmk` (the last release) passes `release:smoke` against the new server.
- [ ] The Documentation listed above says what the feature does now.

## Open questions

None.
