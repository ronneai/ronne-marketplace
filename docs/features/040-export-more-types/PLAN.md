# 040 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Check the mappings.** Every row of `docs/spec/native-readers.md` §5–8 against Claude
  Code's current documentation (CLAUDE.md: platform paths change often) and against
  `render/claude-code/`; fix the contract and this spec where they differ.
  *Done when:* the contract carries the date of the check, and any change is in the spec.

- [x] **2. The agent reader.** `read/claude-code/agent.ts`, with the tool and model tables
  reversed from `mappings.ts`.
  *Done when:* golden and round-trip tests pass for the example agent, and tests cover a warning
  per dropped field, `tools` as a string, and a missing `tools`.

- [x] **3. The command reader.** `read/claude-code/command.ts`: body, arguments, placeholders.
  *Done when:* named placeholders round-trip, and tests cover a subfolder name and a positional
  placeholder left as written.

- [x] **4. The rule reader.** `read/claude-code/rule.ts`.
  *Done when:* tests cover `paths` as a list and as a string, and no `paths`.

- [x] **5. The MCP server reader.** `read/claude-code/mcp-server.ts`: transports, names without
  values, literal credentials replaced, unsupported transports.
  *Done when:* a test proves no value from the fixture's `env` or headers is in the output, and the
  output passes `checkPackage`'s secret check.

- [ ] **6. Finding them and whose they are.** In `packages/cli/src/export.ts`: the three folders,
  the two JSON files (only `mcpServers`), state entries of kind `file` and `json-key`, the marker,
  and `rmk mcp-setup`'s entry left out.
  *Done when:* tests cover each type written here, installed, and installed and edited.

- [ ] **7. The CLI and the tools.** `--type` and `--description`, ambiguous names, the kept-and-lost
  warnings in the preview; `type` and `description` in `list_local_items` and `plan_export`.
  *Done when:* `cli.test.ts` and the MCP tests cover each, and the secret grep over the fake
  registry's requests passes.

- [ ] **8. End to end.** One agent and one MCP server exported with the built `rmk` against the
  Playwright instance.
  *Done when:* `pnpm test:e2e` passes.

- [ ] **9. Documentation.** The sections in the spec's Documentation section.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
