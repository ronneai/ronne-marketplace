# 118 — The workspace in item names

> Milestone: M13 · Depends on: 090–095, 011, 015, 019, 020, 022, 027, 037, 077, 097 · Design: [MVP §3](../../MVP/MVP.md), [§11](../../MVP/MVP.md#11-rest-api-sketch-apiv1), [§15](../../MVP/MVP.md#15-decision-log) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md), [`docs/spec/plugin-feeds.md`](../../spec/plugin-feeds.md)

## Goal

Scope names are unique **per workspace**, not per instance (owner, 2026-10-09): several teams each
want a `test`, `devops` or `engineering` scope. So an item's full name includes its workspace,
**`@workspace/scope/name`**, and `@scope/name` keeps meaning an item in `global`. This reverses
090 decision 2 ("not part of item names").

Because the workspace is in the name, moving a scope (115) or renaming a workspace (113) renames
every item in it. Old names become **aliases** of the item, so lockfiles, dependencies, commands and
links written before keep working, and an alias reserves its name, so nobody else's item can ever
answer to it.

## Scope

**In:**
- **Names.** `@workspace/scope/name` is an item's full name. `@scope/name` is short for
  `@global/scope/name`, and is how `global`'s items are shown everywhere. Three segments name a
  workspace, two name `global`: the count decides, never what the reader can see (decision 2).
- **Scopes unique per workspace:** `scopes` unique on `(workspace_id, name)` instead of `name`.
  Every scope's reserved names still apply in each workspace.
- **Aliases:** `item_aliases` (full name → item id). Written by this feature's migration (every
  item outside `global` keeps its old `@scope/name`), by a scope move (115) and by a workspace
  rename (113). A name that is an alias can't be an item's name, now or later (decision 3).
- **Everywhere a name is read or written:** the manifest schema (`name`, `dependencies`, 097's
  `agent:`), the registry API (paths, bodies, search), the resolver, `rmk` (arguments, lockfile,
  state file, managed markers, `export --to`), the MCP tools, the plugin feeds' plugin names, the
  web app's URLs, storage paths for new versions.
- **Releasing writes the full name** into the packed `ronne.yaml`; a version keeps the name it was
  released with, and the registry and `rmk` accept a version whose packed name is its item's name or
  one of its aliases.
- **`rmk` moves on to the new name:** an install, update or `outdated` that reaches an item by an
  alias rewrites the lockfile and state file to its name and says so ("@acme/deploy is now
  @platform/acme/deploy").
- **Submit nudges dependencies:** a draft that depends on an item through an alias passes, with a
  warning and **Use the new name**, which rewrites the dependency.
- **Old `rmk`** (from before 118): `global`'s items work as before; anything else answers
  `client_too_old` ("Update rmk to x.y.z to install @acme/infra/deploy"), its old names included,
  since an old `rmk` can't write a three-part name to its lockfile.

**Out** (and where it goes instead):
- **Renaming a scope or an item on its own.** Only as part of a move (115, when the target has the
  scope's name).
- **Relative names** (a dependency on "my own workspace's" scope without naming it). Every name is
  explicit; two segments always mean `global`.
- **Freeing an alias.** Kept for as long as the item exists; root can't reuse it (decision 3).

## Behaviour

**Grammar.** `@<scope>/<name>` or `@<workspace>/<scope>/<name>`, each segment the name rule
(`names.ts`: lowercase letters, digits and hyphens, 1–64, no leading or trailing hyphen). A
three-part name whose workspace is `global` is accepted and shown in the short form. Parsing lives
in `@ronneai/core` (`parseItemName`, `formatItemName`), the one place every package uses.

**Where the short form shows.** `global`'s items are shown as `@scope/name` everywhere (pages, API
answers, `rmk` output, lockfiles, packed manifests). Every other item is shown in full. So an
instance that never makes a second workspace sees no change at all.

**Aliases.**
- Written when a name changes: this migration (each non-`global` item's `@scope/name`), a move
  (115: `@from/scope/x`, or `@scope/x` from `global`, for each item), a workspace rename (113:
  `@old/scope/x` for each item). Also when the item's scope is renamed during a move.
- Looked up wherever a name is read: the API (`GET /api/v1/items/{name…}`, versions, tarballs,
  resolve, search by exact name), `rmk`, MCP, dependency checks at submit and release, the web
  app's item URLs (which redirect to the full name). The answer always carries the item's current
  name.
- **Visibility first** (093): an alias answers only for a viewer who sees the item it points to.
  Anyone else gets what an unknown name gets, so an alias can't tell them where a private item went.
- **An alias reserves its name.** Creating a scope is allowed even if aliases start with it, but
  creating a draft whose full name is an alias is refused ("@acme/deploy was the name of another
  item; pick another name"), to members who see the item, and as "taken" to others. A workspace
  rename or a move that would give an item a name that's another item's alias is refused.
- A chain (renamed, then moved) keeps every old name, each pointing straight at the item.
- An item that gets one of its own old names back (a scope moved back where it came from, a
  workspace renamed back) drops that alias: the name is its name again.

**Released versions.** At release (015) the packed `ronne.yaml` gets the item's full name
(`@scope/name` in `global`), and dependencies are written as the dependency's current name. A
version's tarball never changes, so after a move its `name` and its dependencies may be old names;
the registry checks a tarball's name against the item's name and aliases, and the resolver reads
dependency names through aliases. Two names for one item in one install are one item: the resolver
keys on item ids.

**Storage.** New versions are stored at `storage/<workspace>/<scope>/<name>/<version>.tgz`
(`global`'s keep `storage/<scope>/<name>/…`); each version already records its path (112), so
nothing stored moves.

**`rmk`.** Accepts both forms wherever it takes a name. The lockfile (`rmk.lock`) and the state
file key items by their name as the registry answers it; when it answers a different name for an
entry (an alias was followed), `rmk` rewrites the entry and the state file's keys and markers in the
same apply, and prints the change. A managed marker (`<!-- managed by rmk: @scope/name@1.4.0 -->`)
with an old name is still `rmk`'s: the state file maps it. Rendered files are named after the
item's last segment, as today, so a move doesn't rename anything on disk. `rmk export --to` takes
`@workspace/scope` (or `@scope` for `global`). `rmk search` shows full names.

**Plugin feeds.** A plugin's name is `scope.name` in `global` and `workspace.scope.name`
elsewhere (one dot more; still reversible, since names have no dots). Longer names reach Codex's
64-character limit sooner; such an item is left out of that tool's feed with the existing warning.
When an item's name changes, its plugin's name does too: Claude Code sees a new plugin and the old
one gone from the marketplace (decision 4); the feed's description says "Moved from <old>" for 30
days so people know to install it again.

**Web app.** Item pages are `/items/@workspace/scope/name` (`/items/@scope/name` for `global`); an
alias's address redirects to the item's for those who see it. Admin › Scopes shows each scope with
its workspace, and the same name may appear in several rows.

**The migration.** `scopes.name` loses its unique index for `(workspace_id, name)`; every item
outside `global` gets its `@scope/name` as an alias. Nothing else is renamed and no tarball changes.

## Edge cases

- **`@acme/x` and `@acme/infra/x`:** the first is `global`'s scope `acme`, the second the
  workspace `acme`. Both can exist; the segment count tells them apart, and pages show the
  workspace label next to the scope (090) so people can too.
- **An old lockfile naming a team item `@infra/deploy`** (from before 118): the alias finds it;
  the new `rmk` rewrites the entry to `@acme/infra/deploy`. An old `rmk` gets `client_too_old`.
- **A team creates `@infra` in `global` after 118, while a migrated alias `@infra/deploy` exists:**
  the scope is created; the item name `@infra/deploy` stays refused (alias). Other items in it are
  fine.
- **A private item's alias:** answers only for who sees the item; others get not found.
- **The same item twice in one install** (by an old name in one dependency, the new name in
  another): one node, one version, resolved by item id; the lockfile has the new name.
- **A yanked or deprecated version** keeps its packed old name; nothing changes about yanking.
- **Usage and download counts** are kept per item id, so a rename doesn't split them; check the
  usage tables in task 1 and move any name key to the item id.
- **Audit events** keep the names they were written with; the audit log shows them as written.
- **Long names:** up to 194 characters; URLs and the API take them; Windows paths don't, since
  rendered files use the last segment only.
- **Search for `test/lint`** finds every visible `@*/test/lint`; results always show full names.
- **Export of an item `rmk` installed under an old name:** export still refuses `rmk`'s items; a
  change proposal (042) finds its base through the alias.

## Documentation

- **Scopes → What a scope is** and **Naming rules** (`scopes#what`, `scopes#names`): scope names
  are unique within a workspace; the full name `@workspace/scope/name`, the short form for
  `global`.
- **Workspaces → What a workspace is** (`workspaces#what`): the workspace is part of the name,
  except in `global`.
- **Items and types → ronne.yaml and the files** (`items#manifest`) and **Dependencies**
  (`items#dependencies`): writing three-part names; two parts mean `global`.
- **`rmk` → Installing** and **Keeping items up to date** (`rmk#installing`, `rmk#updating`): old
  names keep working and the lockfile moves to the new one; update `rmk`.
- **Plugin marketplaces → Names**: the workspace in plugin names; a moved item is a new plugin.
- **Helpers:** next to the name on New draft, "Why does the name include the workspace?" →
  `scopes#names`.
- **The manifest, `cli-files` and `plugin-feeds` contracts** in `docs/spec/`.

## Acceptance criteria

- [ ] Two workspaces each have a scope `test` with an item `lint`; both install by full name, in
  `rmk`, MCP and the feeds, and the catalogue shows both.
- [ ] `global`'s items keep `@scope/name` in every page, answer, lockfile and packed manifest.
- [ ] After the migration, every item outside `global` answers to its old `@scope/name` for those
  who see it, and an old lockfile installs it; nobody else learns it exists.
- [ ] An alias can't become another item's name, by a draft, a move or a rename.
- [ ] `rmk install`, `update` and `outdated` rewrite an alias entry to the new name in the lockfile
  and state file, and keep the rendered files.
- [ ] A dependency through an alias passes submit and release with a warning and Use the new name.
- [ ] An `rmk` from before 118 installs `global`'s items and gets `client_too_old` for the others.
- [ ] Released versions carry the full name; tarballs released before keep theirs and still install.
- [ ] Service tests pass on the four databases; an end-to-end test installs two same-named items
  from two workspaces.
- [ ] The Documentation, the contracts and the inline helper listed above say what the feature does
  now.

## Decisions

1. **Scope names are unique per workspace, and the workspace is part of the item's name,
   `@workspace/scope/name`** (owner, 2026-10-09). Reverses 090 decision 2.
2. **`@scope/name` always means `global`** (Claude): the meaning of a name can't depend on who
   reads it or what exists, or a new workspace with a `test` scope would change what someone's
   `@test/lint` installs. It keeps every existing name in `global` valid.
3. **Old names are aliases that reserve their name for good** (Claude): otherwise, after a move,
   someone else could release an item under the old name and every lockfile and dependency that
   still says it would install theirs.
4. **A moved item is a new plugin in the feeds** (Claude): plugin names must match item names to be
   reversible (077); keeping old plugin names would need a second name per plugin. The 30-day
   "Moved from" note is the bridge.
5. **Old `rmk` gets `client_too_old` for three-part names** (Claude): it can't write them, and
   showing it a two-part alias instead would write the old name into new lockfiles.

## Open questions

None.
