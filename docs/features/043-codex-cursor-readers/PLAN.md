# 043 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Check the mappings.** Codex's and Cursor's current documentation for agents, rules,
  commands and MCP servers (CLAUDE.md: platform paths change often), against the renderers (024,
  025); write the contract's Codex and Cursor sections with the date, and fix this spec where they
  differ.
  *Done when:* the contract carries the date of the check, and any change is in the spec.

- [x] **2. The Codex readers.** `read/codex/agent.ts` (from the parsed TOML) and
  `read/codex/mcp-server.ts` (stdio, http, `bearer_token_env_var`, `env_http_headers`, literal
  headers through 040's credential rules).
  *Done when:* the example agent and MCP server rendered for Codex read back and render the same,
  and a test proves no value from the fixture's `env` or headers is in the output.

- [ ] **3. The Cursor readers.** `read/cursor/{agent,rule,command,mcp-server}.ts`: `readonly`,
  the rule's activation from `alwaysApply`, `globs` and `description`, `${env:NAME}`.
  *Done when:* each example item rendered for Cursor reads back and renders the same where nothing
  is lost, and tests cover every activation and the edge cases in the spec.

- [ ] **4. Finding them and whose they are.** In `packages/cli/src/export.ts`: the Codex and
  Cursor places in both scopes, TOML parsed with `smol-toml`, `LocalItem.tool`, state entries of
  kind `toml-key`, the `#` marker, and each tool's `ronne-registry` left out.
  *Done when:* tests cover each type written here, installed, installed and edited, and a config
  that doesn't parse.

- [ ] **5. The CLI and the tools.** `--from` and `from`, the tool in the list and the preview,
  ambiguity across tools, and 041's matching by the dependent's own tool first.
  *Done when:* `cli.test.ts` and the MCP tests cover each, and the secret grep over the fake
  registry's requests passes.

- [ ] **6. End to end.** A Cursor rule and a Codex MCP server exported with the built `rmk`.
  *Done when:* `pnpm test:e2e` passes.

- [ ] **7. Documentation.** The sections in the spec's Documentation section.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
