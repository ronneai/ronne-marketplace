# 077 — Claude Code marketplace from the instance

> Milestone: M11 · Depends on: 076, 009, 019, 022, 027 · Design: [MVP §3.3](../../MVP/MVP.md#33-platform-renderers), [§11](../../MVP/MVP.md#11-rest-api-sketch-apiv1) · Contracts: [`docs/spec/plugin-feeds.md`](../../spec/plugin-feeds.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

A Claude Code user adds their Ronne instance as a plugin marketplace once, then browses and installs
Ronne items from `/plugin` like any other plugin, with no `rmk install` and no git repository. Ronne
stays the approval gate: only released versions appear.

## Scope

**In:**
- `GET /api/v1/feeds/claude-code/marketplace.json` and `GET /api/v1/feeds/claude-code/plugins/{scope}/{name}/{version}.zip`,
  behind a bearer token.
- A `feeds` domain in `apps/web` that lists the items and builds and caches the plugins with 076.
- `rmk plugin-setup claude-code [--scope user|project]`, which adds the marketplace to Claude Code's
  settings.
- `rmk auth headers`, which prints the `Authorization` header for Claude Code's `headersHelper`.
- The Documentation topic "Plugin marketplaces".

**Out:**
- Codex and Cursor: they can't read a marketplace over plain HTTPS. They use the git mirror (078).
- Reading the feed without a token (owner, 2026-10-03: the feed needs a token, like the rest of `/api/v1`).
- Usage telemetry from plugin-installed items. Hooks installed as plugins don't report runs. Each
  zip download counts as a download, as a tarball does.

## Behaviour

**The marketplace.** `GET /api/v1/feeds/claude-code/marketplace.json` answers:

```json
{
  "name": "ronne-registry-example-com",
  "owner": { "name": "Ronne at registry.example.com" },
  "description": "Released items from the Ronne registry at https://registry.example.com",
  "plugins": [
    {
      "name": "team.secure-coding",
      "version": "1.4.0",
      "description": "…",
      "source": {
        "source": "archive",
        "url": "https://registry.example.com/api/v1/feeds/claude-code/plugins/team/secure-coding/1.4.0.zip",
        "sha256": "…"
      }
    }
  ]
}
```

- The list holds every installable item for Claude Code at its listed version, sorted by name, as
  the contract says.
- URLs are built from `PUBLIC_URL`. Without it, the server answers 503 `public_url_missing`, because
  Claude Code needs absolute archive URLs.
- The `sha256` of each entry comes from the cached zip. An entry whose zip isn't built yet is built
  while the marketplace is answered. That is bounded:
  - a build failure (a missing artifact, dependencies that don't resolve) leaves the entry out and
    is logged; it doesn't fail the whole marketplace, and isn't cached, so the next request tries
    again;
  - one request spends at most 5 seconds building (Claude Code gives the file 10). Entries not built
    by then are left out of that answer, logged, and built by the next request.

**The zip.** `GET …/plugins/{scope}/{name}/{version}.zip` answers the cached plugin zip with
`ETag: "<sha256>"`, 304 on a matching `If-None-Match`, and the contract's cache headers. A full GET
counts a download (`countDownload`).

**Building and caching.**
- `services/plugin-feed.ts` reads the listed versions through `CatalogueRepository.list` (paged
  internally), resolves each item's dependencies with `databaseRegistry` / `resolveRequest`
  (`domains/items/services/resolve.ts`), and reads members' files with `artifactFiles`
  (`domains/items/services/artifact-files.ts`).
- `services/plugin-feed.ts` lists through `CatalogueRepository.list` with `tool`, `installable` and
  `listedNotYanked` (a filter added here: the listed version itself isn't yanked).
- Zips are stored through the `StorageAdapter` at
  `feeds/<tool>/<scope>/<name>/<version>-b<PLUGIN_BUILDER_VERSION>.zip`, with their sha256 in a
  small sidecar key (`….sha256`). A version is immutable, so a cached zip only goes stale when the
  builder version changes, and then the key changes too.
- A version with nothing for the tool gets the sidecar `none` and no zip, so it isn't built again.
- Two requests can build the same version at once. If a dependency was released in between, the
  zips differ; the first one stored wins, and the sidecar follows it.
- Dependencies are pinned when the plugin is built. A dependency's later release reaches the plugin
  when the item itself is released again, as with a lockfile.

**Auth.** Both routes use `requireToken` (`server/http/require-token.ts`): 401 with
`WWW-Authenticate: Bearer realm="ronne"` without a valid token. Claude Code sends the header from the
marketplace's `headers` or `headersHelper`, and sends it again for the archive downloads, which are
on the same origin.

**`rmk plugin-setup claude-code [--scope user|project]`.**
- It needs `rmk login` first; it uses the current registry (at project scope, the project's).
- It writes `extraKnownMarketplaces.<marketplace name>` to `~/.claude/settings.json` (user, the
  default) or `.claude/settings.json` (project). `headers` and `headersHelper` are fields of the
  `url` source itself (checked 2026-10-03):

  ```json
  {
    "source": {
      "source": "url",
      "url": "https://registry.example.com/api/v1/feeds/claude-code/marketplace.json",
      "headersHelper": "rmk auth headers --registry https://registry.example.com"
    }
  }
  ```

  The write goes through the applier as a `json-key` change, tracked in the state file under
  `rmk plugin-setup` (`.rmk/state.json`, or `user-state.json` at user scope), so it follows the
  never-overwrite rules (an entry the person made or edited is a conflict, exit 3, unless
  `--force`) and `rmk plugin-setup claude-code --remove` takes it out again.
- Claude Code runs the helper through `sh` from `~/.claude`, without the person's shell setup, so
  a Node.js from nvm (or another version manager) isn't on its `PATH`, and `rmk`'s
  `#!/usr/bin/env node` fails there (found in the manual test, task 8). So:
  - at user scope, the helper names the Node.js and the `rmk` that ran `plugin-setup` by their
    absolute paths (`/…/bin/node /…/rmk/dist/bin.js auth headers --registry …`), and rmk says to
    run it again after switching or upgrading Node.js;
  - at project scope, whose settings are shared through git, it stays plain `rmk`, which must be
    on the `PATH` Claude Code starts with;
  - `--command <rmk>` replaces either, such as `/opt/homebrew/bin/rmk`.
- It prints the next step: `/plugin` in Claude Code, then the Marketplaces tab. At project scope it
  says Claude Code reads the marketplace once the folder is trusted. When the registry isn't an
  `https://` address on a host other than loopback, it warns that Claude Code won't download from
  it.
- `--static-headers` writes `"headers": { "Authorization": "Bearer <token>" }` in the source
  instead, for Claude Code versions without `headersHelper` (before v2.1.238). It's only allowed
  with `--scope user`, because a project file would put the token in git. The state file keeps a
  hash, never the token.
- Only `claude-code` is accepted: Codex and Cursor read plugins from the git mirror (078).

**`rmk auth headers [--registry <url>]`** prints `{"Authorization":"Bearer <token>"}` for the
registry's stored token (or `RMK_TOKEN`), and nothing else on stdout. Without a token it exits 1 with
the reason on stderr, and Claude Code shows the marketplace as failing to load.

**With `rmk install`.** The two don't share state. When `rmk install` installs an item into Claude
Code and `enabledPlugins` already has `<plugin name>@<marketplace name>` from this registry, it warns
that the item is also installed as a plugin, and continues. It reads `enabledPlugins` from
`~/.claude/settings.json`, `.claude/settings.json` and `.claude/settings.local.json` (Claude Code
merges them), checks every item the install resolved, and lists them under `alsoPlugins` with
`--json`. A settings file that isn't JSON counts as empty.

## Edge cases

- A revoked or expired token makes the marketplace fail to refresh. The plugins already installed
  keep working from Claude Code's cache.
- A yanked version disappears from the marketplace at the next refresh. Its zip answers 404.
- An item with nothing to put in a Claude Code plugin (only a status line, say) isn't listed.
- The marketplace stays under Claude Code's 5 MiB limit for about 10,000 entries. Past that, the
  route answers 507 `feed_too_large`. What happens before that is [079](../079-plugin-feeds-at-scale/SPEC.md)'s.

## Documentation

- New topic **Plugin marketplaces** (`plugins`) in `components/help/topics.ts` and
  `features/docs/content.tsx`:
  - *What it is*: released items as plugins; approval and versions are unchanged.
  - *Claude Code*: `rmk plugin-setup claude-code`, then `/plugin`. The marketplace URL is shown with
    this instance's address.
  - *Tokens*: how `headersHelper` uses rmk's token; what happens when it expires.
  - *Plugins or rmk*: which to use, and not both for the same item.
- `claude-code` topic: a *Plugins* section linking to the new topic.
- `claude-code` topic: the section is `plugins`.
- `rmk` topic: `plugin-setup` and `auth headers`, in a new section *As Claude Code plugins*
  (`plugins`).
- Item page Install panel: an inline helper "Install as a Claude Code plugin?" (`plugin`), linking
  to *Plugin marketplaces › Claude Code*, beside the copyable `/plugin install team.secure-coding@ronne-…`.
  It's shown when the instance has a `PUBLIC_URL`, the page shows the listed version, that version
  isn't yanked, and the item is in the Claude Code feed by its type and manifest
  (`inClaudeCodeFeed`: it installs in Claude Code, its type has a plugin form, a rule is `model`
  or `manual`, and Claude Code takes the name). The page doesn't build the plugin to decide.
- The topic shows this instance's marketplace address and name from `PUBLIC_URL` when the page
  renders (the example address when it isn't set).

## Acceptance criteria

- [x] Without a token, both routes answer 401; with one, the marketplace lists exactly the installable items that have Claude Code content.
- [x] A yanked version is left out, and a deprecated one says so in its description.
- [x] A zip's sha256 matches the marketplace entry; `If-None-Match` answers 304; a full GET counts a download.
- [x] A zip is built once per version and builder version (tested with a counting storage adapter).
- [x] `rmk plugin-setup claude-code` writes the settings key through the applier, `--remove` takes it out, and an edited key isn't overwritten.
- [x] `rmk auth headers` prints only the JSON header.
- [x] Manual: in Claude Code, `/plugin` lists the instance's items; a skill, an MCP server and a hook install and work; `claude plugin validate` accepts the served marketplace. (The hook was installed and checked from the same plugin files offline, not over HTTPS: see PLAN.md's notes.)
- [x] Database tests for the feed listing pass on SQLite, PostgreSQL and MySQL.
- [x] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

- Very large instances: one marketplace per scope (`…/marketplace.json?scope=team`) if the 5 MiB
  limit is ever close. Answered by [079](../079-plugin-feeds-at-scale/SPEC.md) (owner, 2026-10-03):
  measure first, cache the marketplace and warn early. The split is built only when a measured
  trigger is met (decision log).
