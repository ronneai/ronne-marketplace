# Plugin feeds

The contract for **native plugin feeds**: how a Ronne instance offers its released items as plugin
marketplaces that Claude Code, Codex and Cursor can add as a source (M11:
[076](../features/076-plugin-builders/SPEC.md), [077](../features/077-claude-code-marketplace/SPEC.md),
[078](../features/078-plugin-feed-mirror/SPEC.md); design in [MVP §3.3](../MVP/MVP.md#33-platform-renderers)).

Vendor formats were checked on 2026-10-03, again for 076 the same day, and Claude Code again for
077 the same day (sources:
code.claude.com/docs/en/plugins-reference, /en/plugins/components, /en/plugins/marketplace-reference,
/en/plugins/host-marketplace;
developers.openai.com/codex/plugins/build and agent-plugins.org/specification;
cursor.com/docs/reference/plugins). They change often: re-check them when each feature is built,
and record the date here.

## What each tool accepts

| | Claude Code | Codex | Cursor |
|---|---|---|---|
| Marketplace file | `.claude-plugin/marketplace.json` | `.agents/plugins/marketplace.json` (also reads `.claude-plugin/marketplace.json`) | `.cursor-plugin/marketplace.json` |
| Plugin manifest | `.claude-plugin/plugin.json` (optional) | root `plugin.json` ([Agent Plugins 1.0](https://agent-plugins.org/specification)); `.codex-plugin/plugin.json` as fallback | `.cursor-plugin/plugin.json` (reads Agent Plugins too) |
| Added from | a git repo, or **an HTTPS URL to `marketplace.json`** | a git repo, or a local folder | a git repo, imported by a **team admin** in the dashboard |
| Plugin sources usable from a URL marketplace | `archive` (zip + `sha256`), `github`, `git-subdir`, `npm` | none | none |
| Auth | `headers` / `headersHelper` on a URL source; git credentials for git | the machine's git credentials (not documented) | the git host's app (GitHub App, …) |

### Claude Code's limits on a URL marketplace

Checked 2026-10-03 (077):

- **Versions:** `archive` sources need Claude Code v2.1.224; `headersHelper` (and entry `headers`)
  v2.1.238.
- **`marketplace.json`:** at most 5 MiB, answered within 10 seconds. `name`, `owner` and `plugins`
  are required; `description` is read at the top level (`metadata.description` is the alternate,
  and `claude plugin validate` warns when there is none). One invalid entry doesn't fail the
  marketplace. Unknown keys are ignored (validate warns).
- **Archives:** a zip over `https://`, never a loopback, link-local or cloud-metadata host; at most
  256 MiB, answered within 120 seconds, five redirects. The plugin root is at the top of the zip or
  one folder down. `sha256` is 64 hex characters; a download that doesn't match is refused.
- **Headers:** `headers` / `headersHelper` on the marketplace's `url` source are sent with the
  `marketplace.json` fetch and with every archive download **on the same origin** (scheme, host and
  port); a redirect to another origin carries none. The helper runs only when the marketplace URL
  is `https://`.
- **`headersHelper`:** a command of at most 500 printable ASCII characters, run through `sh` from
  `~/.claude` (so `rmk` must be on `PATH`), that prints one JSON object of string values and exits 0
  within 10 seconds. One run's output is reused for up to 60 seconds. From user settings it runs
  without asking; from a project's `.claude/settings.json` only once the folder is trusted, and
  with every credential-looking variable (`RMK_TOKEN`, for one) removed from its environment, so
  it reads rmk's stored token.
- **Versions and updates:** the version comes from `plugin.json` first, then from the entry, so
  Ronne sets it only on the entry. A new version string is what makes Claude Code fetch again.
- **Deprecation:** Claude Code has no deprecated state; the description prefix is the only signal.

Ronne serves:
- **Claude Code live from the instance** (077): a URL marketplace whose entries are `archive` zips
  built and served by the instance, read with a personal access token.
- **Codex and Cursor from a git mirror** (078): `rmk feed build` writes a repository tree that an
  admin commits to a git host, and refreshes on a schedule. Claude Code can use the same repository.

## Names

- **Marketplace name:** `ronne-<host>`, from the instance's `PUBLIC_URL` host with `.` and `:`
  replaced by `-` (for example `ronne-registry-example-com`). `rmk` derives the same name from its
  registry URL.
- **Plugin name:** `@scope/name` becomes `scope.name`. Ronne names never contain a dot
  ([manifest](./manifest.md)), so the one dot is the separator and the mapping can be reversed. All
  three tools accept a dot (Claude Code: letters, digits, `.`, `_`, `-`; Agent Plugins:
  `[a-z0-9.-]`, at most 64, no `--` or `..`; Cursor: `^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$`). A name a
  tool refuses (longer than 64 characters or containing `--`, for Codex; starting with `claude-`
  or `anthropic-`, which Claude Code reserves) leaves the item out of that tool's feed, with a
  warning.
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
| agent | `agents/<n>.md` | skipped (Codex plugins carry skills, MCP servers, hooks and apps only) | `agents/<n>.md` |
| rule | model and manual rules as `skills/<n>/`; `always` and `glob` rules skipped (a plugin's `CLAUDE.md` isn't loaded, and there is no rules component) | model and manual rules as `skills/<n>/`; `always` and `glob` rules skipped | `rules/<n>.mdc` |
| hook | `hooks/hooks.json` + `hooks/<n>/…`, run as `"${CLAUDE_PLUGIN_ROOT}"/hooks/<n>/…` | `hooks/hooks.json` + `hooks/<n>/…`, run as `"${PLUGIN_ROOT}"/hooks/<n>/…` | `hooks/hooks.json` + `hooks/<n>/…`, run as `./hooks/<n>/…` |
| mcp-server | `.mcp.json` (`{"mcpServers": …}`) | `mcp.json` with the Agent Plugins `$schema`; each server has `type` (`stdio` or `streamable-http`) | `mcp.json` (`{"mcpServers": …}`) |
| output-style | `output-styles/<n>.md` | none | none |
| lsp-server | `.lsp.json` | none | none |
| permission-policy, statusline | skipped (a plugin's `settings.json` only takes `agent` and `subagentStatusLine`) | skipped | skipped |
| bundle | its members | its members | its members |

The members are rendered at project scope, the scope whose layout every renderer writes in full
(Cursor writes rules only there), and the paths are then moved into the plugin.

Every plugin has the manifest for its tool, with `name`, `description` and `author`
(`{ "name": "<scope>" }`):
- Claude Code: `.claude-plugin/plugin.json`, without `version`. Claude Code reads the version from
  the marketplace entry, so it sees an update without downloading the zip, and it warns when both
  say it.
- Codex: a root `plugin.json` with
  `"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"` and `version`.
- Cursor: `.cursor-plugin/plugin.json` with `version`.

Generated Markdown keeps the rmk managed marker. MCP configs keep env var references: secrets are
never written.

## The archive

- A zip, built with `fflate`'s `zipSync`, with the plugin root at the top of the zip: paths sorted,
  fixed mtimes (`1980-01-01`), Unix modes (0644, 0755 for executables) in the external attributes. The same input always gives the same bytes and the same `sha256`.
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
