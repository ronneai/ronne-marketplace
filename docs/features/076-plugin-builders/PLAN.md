# 076 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Re-check the vendor formats.** Read the current Claude Code, Codex and Cursor plugin and
  marketplace docs. Update the tables and the date in `docs/spec/plugin-feeds.md`, and settle the
  open questions.
  *Done when:* the contract says what was checked and when.

- [x] **2. Names, types and the export.** `packages/core/src/plugins/{types,names}.ts`,
  `PLUGIN_BUILDER_VERSION`, and the `./plugins` export in `packages/core/package.json`.
  *Done when:* unit tests for `pluginName` / `itemNameOfPlugin` pass, and `pnpm build` emits `dist/plugins`.

- [x] **3. The archive.** `plugins/archive.ts`: `pluginArchive(files)` on `zipSync`.
  *Done when:* the same files zip to the same sha256, and `unzipSync` gives the files and modes back.

- [x] **4. Claude Code adapter.** `plugins/claude-code.ts`: moves the Claude Code renderer's changes
  into the plugin layout, and writes the manifest.
  *Done when:* golden files for every example item pass.

- [x] **5. Codex and Cursor adapters.** `plugins/codex.ts`, `plugins/cursor.ts`.
  *Done when:* golden files for every example item pass for both tools.

- [ ] **6. `buildPlugin` and bundles.** `plugins/build.ts`: renders members, runs the adapter,
  finds conflicts, and sets `empty`.
  *Done when:* tests cover a bundle, an item with a dependency, a conflict and an empty plugin.

- [ ] **7. Marketplaces.** `plugins/marketplace.ts`: `marketplaceFor` with `archive` and `path`
  sources.
  *Done when:* golden marketplace files for the three tools pass, and `claude plugin validate`
  accepts a built mirror tree (record it in the notes).

- [ ] **8. Package check.** Add the new files to the `@ronneai/core` allowlist.
  *Done when:* `pnpm build && pnpm packages:check` pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- `buildPlugin` and the golden harness (`plugins/harness.ts`) landed with task 4, because the
  goldens need them; task 6 adds the tests for bundles, dependencies, conflicts and empty plugins.
- Skill folders carry the item's `ronne.yaml`, as the renderers' `.claude/skills/<n>/` do.
- To check by hand in 077: an agent's tools name an MCP server as `mcp__<server>`. Claude Code may
  name the tools of a server that comes from a plugin differently (with the plugin's name in
  them); if so, the Claude Code adapter has to rewrite the agent's `tools` when the server is in
  the same plugin.

