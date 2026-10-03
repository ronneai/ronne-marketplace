# 076 — Plugin builders

> Milestone: M11 · Depends on: 020, 021, 023, 024, 025, 026 · Design: [MVP §3.3](../../MVP/MVP.md#33-platform-renderers) · Contracts: [`docs/spec/plugin-feeds.md`](../../spec/plugin-feeds.md)

## Goal

Turn a released item, with its dependencies, into a native plugin for Claude Code, Codex or Cursor,
and turn a list of plugins into each tool's marketplace file. This is the shared core that the live
Claude Code marketplace (077) and the git mirror (078) both serve.

## Scope

**In:**
- `@ronneai/core/plugins`, a new export of `packages/core`. Like the renderers, it is pure: no file
  system, network or clock.
- `buildPlugin(tool, input)`: the plugin's files and warnings.
- `pluginArchive(files)`: a deterministic zip and its sha256.
- `marketplaceFor(tool, entries, options)`: the marketplace file for each tool.
- `pluginName` / `itemNameOfPlugin`: the naming rule in the contract.
- `PLUGIN_BUILDER_VERSION`.

**Out:**
- Serving anything: 077 and 078.
- Plugin forms for permission policies and status lines. No tool has one, so they're skipped with a
  warning.
- Signing plugins (MVP §14.2).

## Behaviour

**Input.** `buildPlugin(tool, { item, members, scope })`:
- `item` is the item the plugin is named after (`name`, `version`, `manifest`, `description`).
- `members` is every item to put in it, each as a `RenderInput` (`render/types.ts`). For a bundle
  that is its resolved members; for anything else it is the item plus its resolved dependencies,
  in the resolver's install order. The caller resolves (`resolve()`, `resolve.ts`): the builder
  doesn't.

**Building.**
1. Render each member with `rendererById(tool)` at `scope: "user"` and `targets: [tool]`, so a
   member isn't skipped as "covered by another target".
2. Move each `Change` into the plugin layout with the tool's adapter, as the contract's table says:
   - `dir` and `file` changes move from the tool's folders (`.claude/skills/`, `.agents/skills/`,
     `.claude/agents/`, `.cursor/agents/`, `.cursor/rules/`, `.claude/output-styles/`, the hook
     script folders) to the plugin's.
   - Hook entries (`json-array-item` on `hooks.<Event>`, or the Codex and Cursor `hooks.json`
     entries) collect into the plugin's `hooks/hooks.json`. Script paths are rewritten from the
     project-relative path to `${CLAUDE_PLUGIN_ROOT}/…` (Claude Code), `${PLUGIN_ROOT}/…` (Codex)
     or the plugin-relative path (Cursor).
   - MCP entries (`json-key mcpServers.<n>`, `toml-key mcp_servers.<n>`) collect into `.mcp.json`
     (Claude Code) or `mcp.json` (Codex, Cursor), keeping env var references.
   - The Claude Code lsp-server output (the local plugin from `renderLspServer`) gives its `.lsp.json`.
   - Anything else (settings keys, `AGENTS.md` sections, permission entries) is skipped with a
     `RenderWarning` of code `not_in_plugin`, naming the member.
3. Add the tool's manifest (`.claude-plugin/plugin.json`, the root `plugin.json` with the Agent
   Plugins `$schema`, or `.cursor-plugin/plugin.json`). It carries the plugin name, the item's
   version, description, and `author: { name: <scope> }`.
4. Paths are sorted. Two members writing the same plugin path is an error (`plugin_conflict`); it
   can only happen with a broken dependency set, and the caller leaves that item out of the feed.

The result is `{ files: PackageFile[]; warnings: RenderWarning[]; empty: boolean }`. `empty` is true
when nothing but the manifest was written, and that item is left out of the tool's feed.

**Archive.** `pluginArchive(files)` zips with `fflate`'s `zipSync` (already a core dependency):
sorted paths, fixed mtime, the executable bit as Unix mode. It returns `{ bytes, sha256 }`. The
same files always give the same bytes.

**Marketplaces.** `marketplaceFor(tool, entries, { name, owner, source })`. `source` decides how
entries point at plugins: `archive` (a URL and the sha256, Claude Code only) or `path`
(`./plugins/<tool>/<plugin>`, for the git mirror). Each entry has `name`, `version`, `description`,
and the tool's extras (Codex: `policy: { installation: "AVAILABLE" }`; Cursor: none).

## Edge cases

- An item whose type the tool doesn't support (`supportFor` gives `none` or `off`) is never built for
  it. The caller checks first, and `buildPlugin` throws if called anyway.
- A member's renderer warnings (degraded support) are passed through with the member's name.
- A rule with `always`/`glob` activation has no plugin form in Claude Code or Codex. If that leaves
  the plugin empty, the item isn't in that feed. The item page's support matrix doesn't change: it
  describes `rmk install`.
- Hook scripts keep their executable bit in the zip.

## Documentation

None in this feature: nothing is visible until 077 serves it. 077 and 078 add the topic.

## Acceptance criteria

- [ ] Golden files for every example item in `examples/items/` × the three tools, checked like the renderer goldens (`render/harness.ts`).
- [ ] Each generated `.claude-plugin/plugin.json` and `marketplace.json` passes `claude plugin validate`. The Codex root `plugin.json` validates against the Agent Plugins 1.0 schema. Both are run once by hand, and the results are recorded in PLAN.md's notes.
- [ ] Building the same input twice gives byte-identical zips.
- [ ] A bundle's plugin contains each member; an item's plugin contains its dependencies.
- [ ] Skipped content gives a `not_in_plugin` warning; an item with nothing left is `empty`.
- [ ] `pluginName("@team/secure-coding")` is `team--secure-coding`, and `itemNameOfPlugin` reverses it.
- [ ] `pnpm packages:check` allows the new `dist/plugins` files.

## Open questions

- Can a Claude Code plugin carry always-on rules (re-check the plugins reference when building)? If
  it can, `always`/`glob` rules go there instead of being skipped.
- Does a Codex plugin carry agents? If so, `.codex/agents/<n>.toml` moves into the plugin.
