# Plugin feeds

The contract for **native plugin feeds**: how a Ronne instance offers its released items as plugin
marketplaces that Claude Code, Codex and Cursor can add as a source (M11:
[076](../features/076-plugin-builders/SPEC.md), [077](../features/077-claude-code-marketplace/SPEC.md),
[078](../features/078-plugin-feed-mirror/SPEC.md); design in [MVP §3.3](../MVP/MVP.md#33-platform-renderers)).

Vendor formats were checked on 2026-10-03, again for 076 the same day, Claude Code again for 077,
and Codex and Cursor again for 078, both the same day (sources:
code.claude.com/docs/en/plugins-reference, /en/plugins/components, /en/plugins/marketplace-reference,
/en/plugins/host-marketplace;
cursor.com/docs/plugins, cursor.com/changelog/05-01-26 and the Cursor 2.6 release notes;
developers.openai.com/codex/plugins/build and agent-plugins.org/specification;
cursor.com/docs/reference/plugins). They change often: re-check them when each feature is built,
and record the date here.

## What each tool accepts

| | Claude Code | Codex | Cursor |
|---|---|---|---|
| Marketplace file | `.claude-plugin/marketplace.json` | `.agents/plugins/marketplace.json` (also reads `.claude-plugin/marketplace.json`) | `.cursor-plugin/marketplace.json` |
| Plugin manifest | `.claude-plugin/plugin.json` (optional) | root `plugin.json` ([Agent Plugins 1.0](https://agent-plugins.org/specification)); `.codex-plugin/plugin.json` as fallback | `.cursor-plugin/plugin.json` (reads Agent Plugins too) |
| Added from | a git repo, or **an HTTPS URL to `marketplace.json`** | a git repo (`owner/repo`, a git URL, `--ref`, `--sparse`), or a local folder: `codex plugin marketplace add` | a git repo (GitHub; GitLab, Bitbucket and Azure DevOps since Cursor 3.9), imported by a **team admin** (Teams or Enterprise) in Dashboard › Settings › Plugins › Team Marketplaces › Import |
| Plugin sources usable from a URL marketplace | `archive` (zip + `sha256`), `github`, `git-subdir`, `npm` | none | none |
| Auth | `headers` / `headersHelper` on a URL source; git credentials for git | not documented (it clones with git, so presumably the machine's git credentials) | the git host's connection to Cursor |
| Updates | `/plugin marketplace update`, or auto-update | `codex plugin marketplace upgrade` | on push, with **Enable Auto Refresh** (GitHub imports) |

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

### Codex and Cursor, re-checked for 078

Checked 2026-10-03:

- **Codex** reads `.agents/plugins/marketplace.json` first, and `.claude-plugin/marketplace.json`
  as a legacy location. An entry has `name`, `source`, `policy` (`installation`: `AVAILABLE`,
  `INSTALLED_BY_DEFAULT` or `NOT_AVAILABLE`; `authentication`: `ON_INSTALL`) and an optional
  `category`, and no version. Sources: `local` (a `path`), `git-subdir`, `url` and `npm`. Codex
  caches plugins under `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`.
- **Agent Plugins 1.0.0** (Codex's `plugin.json`): a name is 1–64 lowercase letters, digits, `-`
  and `.`, starting and ending with a letter or digit, with no `--` or `..`; `acme.tools` is one of
  its own examples. Codex's guide recommends kebab-case, which a dot doesn't break.
- **Cursor** reads `.cursor-plugin/marketplace.json` (`name`, `owner`, `plugins`, optional
  `metadata`) and a plugin's `.cursor-plugin/plugin.json` or root `plugin.json`; names allow
  periods. Only team admins add a marketplace: a Teams plan has one team marketplace, Enterprise
  any number, and Team Access groups choose who sees it.

Ronne serves:
- **Claude Code live from the instance** (077): a URL marketplace whose entries are `archive` zips
  built and served by the instance, read with a personal access token.
- **Codex and Cursor from a git mirror** (078): `rmk feed build` writes a repository tree that an
  admin commits to a git host, and refreshes on a schedule. Claude Code can use the same repository.

## Names

- **Marketplace name:** `ronne-<host>`, from the instance's `PUBLIC_URL` host with `.` and `:`
  replaced by `-` (for example `ronne-registry-example-com`). `rmk` derives the same name from its
  registry URL.
- **Plugin name:** `@scope/name` becomes `scope.name`, and `@workspace/scope/name` (an item outside
  `global`, 118) becomes `workspace.scope.name`; `global.…` is never made. Ronne names never
  contain a dot ([manifest](./manifest.md)), so the dots are the separators and the mapping can be
  reversed. All
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
- An item whose name changed in the last 30 days (its scope moved, or its workspace was renamed,
  118) says `Moved from <old name>.` before its description: to the tool it's a new plugin, and
  the old one is gone from the marketplace.
- A tool that refuses a plugin's name (above) leaves it out of that tool's feed; the instance logs
  it once, when the plugin is first built.
- Only items the caller can see appear ([093](../features/093-private-workspaces/SPEC.md)): the
  public workspaces' items, and a private workspace's for its members and root. Everyone else gets
  the feed as if those items didn't exist.
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
| `GET marketplace.json` | The tool's feed as a marketplace file, in Claude Code's shape for every tool: entries use `archive` sources pointing at the zip route below, with the zip's `sha256`. Claude Code reads its own; `rmk feed build` reads Codex's and Cursor's, and writes their real marketplace files into the mirror (078). It holds what the token's user sees; with `?workspaces=<names>` (093, comma-separated, may be empty), only the public workspaces' items and those of the private workspaces it names |
| `GET plugins/{scope}/{name}/{version}.zip`, `GET workspaces/{workspace}/plugins/{scope}/{name}/{version}.zip` | The built plugin: `global`'s items at the first, every other workspace's at the second (118). `ETag` is the sha256, `If-None-Match` answers 304, `cache-control: private, max-age=31536000, immutable`. 404 when the version doesn't exist, is yanked, has nothing for this tool, or its item isn't one the token's user sees (093), the same answer for each |

The marketplace answers `cache-control: private, no-cache` and an `ETag`, because it changes with
every release.

Each server process keeps the last complete marketplace in memory (079) per tool and **visibility
key** (093): the sorted ids of the private workspaces the caller sees, empty for everyone who sees
only public ones, so they share one. An entry is used until the catalogue revision, the builder
version or `PUBLIC_URL` changes. At most 32 marketplaces are kept (a tool's for a key; about ten
keys when all three tools are asked), the least recently used going first.
Admin › Settings shows each tool's largest marketplace of the current revision, and the size and
time warnings are logged once per revision, for whichever key comes near a limit first.

Errors use the API's shape (MVP §11), with these codes (077):

| Status | Code | When |
|---|---|---|
| 401 | `token_missing`, `token_invalid`, … | No valid token (`WWW-Authenticate: Bearer realm="ronne"`) |
| 404 | `feed_not_found` | The instance has no feed for that tool (`claude-code`, `codex` and `cursor` have one) |
| 404 | `plugin_not_found` | The version doesn't exist, is yanked, has nothing for the tool, or the caller doesn't see its item (093) |
| 404 | `workspace_not_found` | `?workspaces=` names a workspace the caller doesn't see: unknown, or private and they aren't a member (093). One message for both: "There's no workspace acme you can use." |
| 503 | `public_url_missing` | The instance has no `PUBLIC_URL`, so it can't write absolute URLs |
| 503 | `plugin_unavailable` | The zip can't be built: an artifact is missing, or dependencies don't resolve |
| 507 | `feed_too_large` | The marketplace would be past the tool's limit (5 MiB for Claude Code). From 079, only Claude Code's route answers it, and the message names the git mirror |

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

The mirror holds the **public workspaces' items** (093): rmk asks for `?workspaces=`. `--workspace
<name>` (repeated, or separated by commas) adds a private workspace the token's user is a member
of (root may name any); naming one they don't see stops the build with `workspace_not_found`, and
nothing is written. With `--workspace`, rmk says to keep the repository it's pushed to private:
anyone who can read it can install what's in it. `--print-workflow` takes `--workspace` too: it
goes in the workflow's build, and a comment at the top says to keep the repository private. An rmk
from before 093 doesn't send `?workspaces=`: a request from any rmk (`user-agent: rmk/…`) without it
is answered for the public workspaces only, so its mirror stays public too.
