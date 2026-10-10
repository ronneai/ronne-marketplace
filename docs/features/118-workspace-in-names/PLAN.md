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

- [x] **2. Migration.** [risky] `scopes` unique on `(workspace_id, name)`; `item_aliases` (name
  unique, item_id FK cascade, created_at, reason `migration/move/rename`); every item outside
  `global` gets its `@scope/name`. Check the usage and download tables for name keys and move them
  to item ids.
  *Done when:* the migration's db test passes on the four databases, including two same-named
  scopes in two workspaces after it; the guard test passes.

- [x] **3. Lookup by name and alias.** [risky] One repository method finds an item by full name or
  alias for a `Viewer` (093's filter first); the registry API, resolve (keyed on item ids), search
  by exact name, submit and release dependency checks and the item page's redirect use it. Aliases
  refused as new draft names, and a shared check (`isOldName`) for the names a move or rename
  would give (113, 115 call it). The workspace's item pages (`/workspaces/<workspace>/items/…`)
  exist, so the redirect lands. (The check of a tarball's packed name is `rmk`'s: task 5.)
  *Done when:* db tests cover alias lookup, visibility (a non-member gets not found), one item
  reached by two names in one resolve, and every refusal; the 093 guard test still passes.

- [x] **4. Release and storage.** The packed `ronne.yaml` carries the full name and current
  dependency names; new versions stored under the workspace for non-`global` items.
  *Done when:* release tests cover a `global` and a team item, and an old tarball with an old name
  still installs.

- [x] **5. `rmk` and MCP.** Both forms in every command and tool; the lockfile, state file and
  markers rewritten when an alias is followed, with the message; a version whose packed name is
  its item's name or an old one is accepted; `export --to @workspace/scope`;
  full names in `search` and `info`; `client_too_old` from the API for an `rmk` before 118 (its
  `user-agent`) on three-part names. Update `docs/spec/cli-files.md`.
  *Done when:* CLI and MCP tests cover an alias rewrite end to end in a temporary project, and an
  old user-agent gets `client_too_old`.

- [x] **6. Plugin feeds.** Plugin names `workspace.scope.name` outside `global`; the "Moved from"
  note for 30 days; `docs/spec/plugin-feeds.md` updated.
  *Done when:* feed tests cover the names, the length warning and the note.

- [x] **7. Web app.** Item URLs with the workspace, alias redirects, full names on cards, item
  pages, the editor's name field (scope picker grouped by workspace), Admin › Scopes; Use the new
  name on a dependency through an alias.
  *Done when:* component tests pass, and an end-to-end test lists, opens and installs (`rmk`) two
  items of one scope and name in two workspaces, released by the seed, on desktop; and on a phone
  lists and opens them and shows each one's install command by its full name. (Changed while
  building: releasing in a workspace through the app is `old-names.db.test.ts`'s; a phone doesn't
  run `rmk`.)

- [x] **8. Decision log and contracts.** MVP §15: Workspaces (names include the workspace, 090
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
- **Task 2:** usage and downloads were already by item id. The database doesn't stop an item from
  taking an alias's name, and SQLite doesn't enforce `varchar(195)`: the services check both
  (task 3).
- **Task 3:** scope names alone no longer find a scope: forms, the drafts API and admin edits send
  `acme/infra` (or `infra` in global), read by core's `scopeRefFrom`. Old names are reserved for
  everyone through `isOldName`, unfiltered on purpose; at release the refusal says only "taken",
  since the release store reads every workspace. The catalogue's name sort and the scope list page
  with an id tie-break. Workspace item pages and API routes exist; web URLs live under
  `/workspaces/<workspace>/items/…` (the `[name]` segment is the workspace, as the join page's),
  and `/workspaces/global/items/…` redirects to `/items/…`. Plugin zips of a workspace's items are
  at `/feeds/<tool>/workspaces/<workspace>/plugins/…` (done here, ahead of task 6, because the
  feeds broke without it). e2e: `submit-problems.mobile` on phone-webkit failed once and passed
  alone.
- **Task 4:** a change proposed to a moved item starts with its name now (`manifestNamed`, in
  `models/manifest-names.ts`, used at release too). For task 5: `rmk install` keys what it knows
  by the resolved (new) name, while `withDependencies` (097, `skill-frontmatter.ts`) looks a
  dependency up by the name an old tarball wrote, so it would drop it; map old names through the
  resolution's `renamed` and the item's aliases.
- **Task 5:** the registry's `renamed` lists every old name of what it resolved, so `rmk` finds an
  old version's dependencies by them. A current `rmk` says `x-rmk-names: workspace`; an `rmk/…`
  without it gets 426 `client_too_old` for names outside `global`. `outdated` only reports a new
  name; `install` and `update` move the project.
- **Task 6:** a name a tool refuses is now logged once, when its plugin is built. Untested yet:
  `rmk feed build` fetching from `/feeds/<tool>/workspaces/…` (a probe showed it works),
  `pluginKey` with a workspace; `renamedSince` keeps the newest alias by `created_at` only.
- **Task 7:** a `RegExp` in a nav item broke every page (props to client components must be
  plain; `docs/knowledge/server-client-props.md`). New e2e users or recent items shift lists other
  tests read (the users table's first page, the composer picker's 12 most recent): the twins are
  dated long ago, and `user-admin` searches for root. `submit-problems.mobile` on phone-webkit
  times out in full runs, on `main` too, and passes alone. The editor step that applies "Use the
  new name" has no test of its own.
