# 025 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Re-check and the file types.** The locations against Cursor's docs; then `skill`,
  `agent`, `rule` (project only) and `command`, with markers and mappings.
  *Done when:* golden files for their example items in both scopes are committed.

- [x] **2. Settings.** `hook` (with the shared `version` key and the applier change it needs),
  `mcp-server` with `${env:NAME}`, and `permission-policy` for the CLI.
  *Done when:* golden files are committed, and applier tests cover a key two items want.

- [x] **3. The rest.** `output-style`, `statusline` and `lsp-server` as `none`, bundles, user-scope
  rules, and the renderer in `RENDERERS`.
  *Done when:* golden files and `rmk platforms` show them.

- [x] **4. End to end and documentation.** `rmk install --target cursor` and `--target
  claude-code,cursor` in the Playwright suite, and the Documentation section and helper.
  *Done when:* it passes in CI, and the docs render tests cover the new section.

## Notes

- Task 1, the re-check (2026-09-29, cursor.com/docs: context/skills, context/subagents,
  context/rules, context/mcp, agent/hooks, reference/third-party-hooks, cli/reference/permissions):
  - Skills: also `.cursor/skills/`, and `.claude/skills/` and `.codex/skills/` for compatibility;
    frontmatter adds `paths`, `icon`, `color`, `metadata`. Precedence between folders isn't documented.
  - Agents: also read from `.claude/agents/` and `.codex/agents/`; `.cursor/` wins a name clash.
    Frontmatter: `name`, `description`, `model` (`inherit` or a model id), `readonly`,
    `is_background`.
  - Rules: `globs` unquoted and comma-separated in every example.
  - Hooks: Claude Code's hooks are imported by default and all of them run, which is why a hook is
    left to Claude Code's copy when both are targets. Project hooks run from the project root.
  - Permissions: `Shell(command:args)` takes a glob over the arguments, which changes open
    question 2 (task 2).
- `RenderContext` gained `targets`, and `RenderWarningCode` gained `covered_by_target`; rmk passes
  the install's target ids. The harness renders without targets, so golden files show Cursor alone.
- Task 2: `planChanges` merged an identical change from a second item only when the first was a
  pending write; when the key was already on disk (the first item's entry `unchanged`), the second
  item hit a false `name_clash`. It now looks in both, so `hooks.json`'s `version` stays one entry
  while any hook item wants it. The CLI permissions note is `toolNotes()` in `install.ts`, as
  Codex's are.

