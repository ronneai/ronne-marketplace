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

`rmk search deploy --workspace acme` filters as the catalogue does; two `--workspace`s, or a
blank one, are a usage error. `rmk info @acme-infra/deploy`
adds `workspace: acme (private)`. `rmk export`'s scope prompt lists `acme › @acme-infra`,
`global › @tools` and so on, only where the user is a member: `global` first, then by workspace,
numbered in that order.

Where the registry answers `not_a_member` (an export to a scope in a workspace you aren't in, or a
draft you can no longer submit), `rmk` adds the join page's address, `<registry>/workspaces/<name>/join`:
after the message ("Ask here: …"), in `--json`'s error as `joinUrl`, and under the draft in
`rmk submit`'s preview. For that, `POST /drafts/check` and `/drafts/submit` name each draft's
`workspace`. Asking is done in the web app (094).

The MCP `search_items` input gains an optional `workspace` (a blank one is refused); its results,
like `get_item`'s, carry the workspace, and `get_item` prints it as `rmk info` does.
`list_workspaces` (read-only) returns what `rmk workspaces` prints, as data. `plan_export` lists the
scopes by workspace as `rmk export` does, and a `not_a_member` error carries `joinUrl`. Old `rmk` versions keep working: new fields are additive, and the
`?workspace=` parameter is optional.

## Edge cases

- **An older `rmk` against a new instance:** works; it doesn't show workspaces, and export's scope
  list is already filtered by the server.
- **A new `rmk` against an older instance** (no `/workspaces`): `rmk workspaces` says "This registry
  doesn't have workspaces (it's older than 0.4.0)", exit 1, code `no_workspaces`. 0.4.0 is the
first release with workspaces.

## Documentation

- **`rmk` → Installing** (`rmk#installing`) and **From inside your AI tool** (`rmk#mcp`):
  `--workspace`, `rmk workspaces`, the MCP tool.
- **Exporting your own items → Choosing the scope** (`export#scope`): grouped by workspace.
- **Helpers:** none new (`rmk` isn't in the app).

## Acceptance criteria

- [x] `GET /api/v1/workspaces`, `workspace` on items and `me`, and `?workspace=` work and respect
  093's visibility.
- [x] `rmk workspaces`, `rmk search --workspace`, `rmk info` and `rmk export` behave as above,
  with CLI tests.
- [x] The MCP tools take and return the workspace.
- [x] `pnpm release:smoke` passes, and the last released `rmk`, installed from npm, searches and
  installs against the new server (`release:smoke` packs this branch's packages, so the released
  `rmk` is run by hand).
- [x] The Documentation listed above says what the feature does now.

## Open questions

None.
