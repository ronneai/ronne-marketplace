# Plugin feeds

The contract for **native plugin feeds**: how a Ronne instance offers its released items as plugin
marketplaces that Claude Code, Codex and Cursor can add as a source (M11:
[076](../features/076-plugin-builders/SPEC.md), [077](../features/077-claude-code-marketplace/SPEC.md),
[078](../features/078-plugin-feed-mirror/SPEC.md); design in [MVP §3.3](../MVP/MVP.md#33-platform-renderers)).

Vendor formats were checked on 2026-10-03. They change often: re-check them when each feature is
built, and record the date here.

## What each tool accepts

| | Claude Code | Codex | Cursor |
|---|---|---|---|
| Marketplace file | `.claude-plugin/marketplace.json` | `.agents/plugins/marketplace.json` (also reads `.claude-plugin/marketplace.json`) | `.cursor-plugin/marketplace.json` |
| Plugin manifest | `.claude-plugin/plugin.json` (optional) | root `plugin.json` ([Agent Plugins 1.0](https://agent-plugins.org/specification)); `.codex-plugin/plugin.json` as fallback | `.cursor-plugin/plugin.json` (reads Agent Plugins too) |
| Added from | a git repo, or **an HTTPS URL to `marketplace.json`** | a git repo, or a local folder | a git repo, imported by a **team admin** in the dashboard |
| Plugin sources usable from a URL marketplace | `archive` (zip + `sha256`), `github`, `git-subdir`, `npm` | none | none |
| Auth | `headers` / `headersHelper` on a URL source; git credentials for git | the machine's git credentials (not documented) | the git host's app (GitHub App, …) |

Ronne serves:
- **Claude Code live from the instance** (077): a URL marketplace whose entries are `archive` zips
  built and served by the instance, read with a personal access token.
- **Codex and Cursor from a git mirror** (078): `rmk feed build` writes a repository tree that an
  admin commits to a git host, and refreshes on a schedule. Claude Code can use the same repository.

## Names

- **Marketplace name:** `ronne-<host>`, from the instance's `PUBLIC_URL` host with `.` and `:`
  replaced by `-` (for example `ronne-registry-example-com`). `rmk` derives the same name from its
  registry URL.
- **Plugin name:** `@scope/name` becomes `scope--name`. Scopes and names are lowercase letters,
  digits and single hyphens ([manifest](./manifest.md)), so `--` appears only as the separator and
  the mapping can be reversed. The name is valid in all three tools.
- **Plugin version:** the item's released version. Each release is a new version, so Claude Code
  fetches it again. Ronne versions are immutable, so a version's plugin never changes, except when
  the builder changes (below).

## Which items appear

- Every **installable** item (it has a version that isn't yanked) at the version `latest` points to:
  the catalogue's listed version (`items.listed_version_id`).
- An item appears in a tool's feed when `installsIn(supportFor(type, disabled)[tool])` is true
  ([026](../features/026-support-matrix/SPEC.md)), **and** its plugin has at least one file once
  built. Types that have no plugin form for that tool (table below) leave the item out of that
  tool's feed.
- A deprecated version appears, with `Deprecated: <message>` at the start of its description.
- A **bundle** is a plugin that contains its resolved members. Any other item's plugin contains the
  item and its resolved dependencies, like `rmk install` would install them (the resolver, 020).

## Plugin contents per type

The builder renders each member with the tool's `PlatformRenderer` and moves the result into the
plugin layout. Anything that has no place in a plugin is skipped with a warning, as renderers do.

| Type | Claude Code plugin | Codex plugin | Cursor plugin |
|---|---|---|---|
| skill, command | `skills/<n>/` | `skills/<n>/` | `skills/<n>/` |
| agent | `agents/<n>.md` | skipped (no plugin form documented) | `agents/<n>.md` |
| rule | `skills/<n>/` for model and manual rules; `always`/`glob` rules skipped (plugins can't add rules) | skipped (`AGENTS.md` sections aren't part of a plugin) | `rules/<n>.mdc` |
| hook | `hooks/hooks.json` + `hooks/<n>/…` (`${CLAUDE_PLUGIN_ROOT}`) | `hooks/hooks.json` + `hooks/<n>/…` (`${PLUGIN_ROOT}`) | `hooks/hooks.json` + `hooks/<n>/…` |
| mcp-server | `.mcp.json` | `mcp.json` (each server has `type`) | `mcp.json` |
| output-style | `output-styles/<n>.md` | none | none |
| lsp-server | `.lsp.json` | none | none |
| permission-policy, statusline | skipped | skipped | skipped |
| bundle | its members | its members | its members |

Every plugin has the manifest for its tool, with `name`, `version`, `description` and `author`
(`{ "name": "<scope>" }`). The Codex plugin's root `plugin.json` carries the Agent Plugins
`$schema`. Generated Markdown keeps the rmk managed marker. MCP configs keep env var references:
secrets are never written.

## The archive

- A zip, built with `fflate`'s `zipSync`: paths sorted, fixed mtimes (`1980-01-01`), executable bits
  kept. The same input always gives the same bytes and the same `sha256`.
- The builder has a version (`PLUGIN_BUILDER_VERSION`, an integer in `@ronneai/core/plugins`). It
  goes up whenever the output for the same input changes, and is part of the cache key
  (077).

## Endpoints

All under `/api/v1/feeds/<tool>/`, where `<tool>` is `claude-code`, `codex` or `cursor`. Each needs a
bearer token, like the rest of `/api/v1` (401 without one).

| Method & path | Answers |
|---|---|
| `GET marketplace.json` | The tool's marketplace file. For Claude Code, entries use `archive` sources pointing at the zip route below, with the zip's `sha256` |
| `GET plugins/{scope}/{name}/{version}.zip` | The built plugin. `ETag` is the sha256, `If-None-Match` answers 304, `cache-control: private, max-age=31536000, immutable`. 404 when the version doesn't exist, is yanked, or has nothing for this tool |

The marketplace answers `cache-control: private, no-cache` and an `ETag`, because it changes with
every release.

## The git mirror

`rmk feed build --out <dir>` writes this tree (078):

```
.claude-plugin/marketplace.json     sources "./plugins/claude-code/<plugin>"
.agents/plugins/marketplace.json    sources "./plugins/codex/<plugin>"
.cursor-plugin/marketplace.json     sources "./plugins/cursor/<plugin>"
plugins/claude-code/<plugin>/…
plugins/codex/<plugin>/…
plugins/cursor/<plugin>/…
.rmk-feed.json                      what rmk wrote: registry, tools, plugins and their sha256
```

rmk only writes or deletes these paths; any other file in the folder (a README, a CI workflow) stays
as it is.
