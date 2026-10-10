# 118 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Names in `@ronneai/core`.** `parseItemName` and `formatItemName` (two or three
  segments, `global` short), the manifest schema's `name`, `dependencies` and 097's `agent:`
  patterns, the examples and golden files unchanged for `global`. Find every place that splits a
  name on `/` (core, cli, mcp, web) and route it through these.
  *Done when:* core tests cover both forms, `@global/…` shown short, and malformed names; a grep
  test finds no other name splitting; the examples still pass the schema.

- [ ] **2. Migration.** [risky] `scopes` unique on `(workspace_id, name)`; `item_aliases` (name
  unique, item_id FK cascade, created_at, reason `migration/move/rename`); every item outside
  `global` gets its `@scope/name`. Check the usage and download tables for name keys and move them
  to item ids.
  *Done when:* the migration's db test passes on the four databases, including two same-named
  scopes in two workspaces after it; the guard test passes.

- [ ] **3. Lookup by name and alias.** [risky] One repository method finds an item by full name or
  alias for a `Viewer` (093's filter first); the registry API, resolve (keyed on item ids), tarball
  name checks, search by exact name, submit and release dependency checks and the item page's
  redirect use it. Aliases refused as new draft names, and as names a move or rename would give.
  *Done when:* db tests cover alias lookup, visibility (a non-member gets not found), one item
  reached by two names in one resolve, and every refusal; the 093 guard test still passes.

- [ ] **4. Release and storage.** The packed `ronne.yaml` carries the full name and current
  dependency names; new versions stored under the workspace for non-`global` items.
  *Done when:* release tests cover a `global` and a team item, and an old tarball with an old name
  still installs.

- [ ] **5. `rmk` and MCP.** Both forms in every command and tool; the lockfile, state file and
  markers rewritten when an alias is followed, with the message; `export --to @workspace/scope`;
  full names in `search` and `info`; `client_too_old` from the API for an `rmk` before 118 (its
  `user-agent`) on three-part names. Update `docs/spec/cli-files.md`.
  *Done when:* CLI and MCP tests cover an alias rewrite end to end in a temporary project, and an
  old user-agent gets `client_too_old`.

- [ ] **6. Plugin feeds.** Plugin names `workspace.scope.name` outside `global`; the "Moved from"
  note for 30 days; `docs/spec/plugin-feeds.md` updated.
  *Done when:* feed tests cover the names, the length warning and the note.

- [ ] **7. Web app.** Item URLs with the workspace, alias redirects, full names on cards, item
  pages, the editor's name field (scope picker grouped by workspace), Admin › Scopes; Use the new
  name on a dependency through an alias.
  *Done when:* component tests pass, and an end-to-end test creates `test/lint` in two workspaces,
  releases both and installs each, on desktop and phone.

- [ ] **8. Decision log and contracts.** MVP §15: Workspaces (names include the workspace, 090
  decision 2 reversed), Scopes (unique per workspace), a new Aliases row; MVP §3 and §11; 090's
  decision 2 marked as reversed by 118; `docs/spec/manifest.md`.
  *Done when:* the rows and contracts are in.

- [ ] **9. Documentation.** The topics and helper in the spec, in a ronne-web branch.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 1:** `shortName` in the renderers cut at the first slash; with three parts it would have
  written `scope/name` folders. It's `shortItemName` now. Searches (`typedNameParts`) take a
  three-part name; task 3 adds a database test for it. The grep test
  (`packages/repo-tools/src/item-names.test.js`) doesn't see `split("/", 2)` or `search("/")`.
