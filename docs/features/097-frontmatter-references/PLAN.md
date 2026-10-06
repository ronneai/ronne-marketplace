# 097 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Reading frontmatter.** `frontmatter.ts` quotes an unquoted `@scope/name` value before
  parsing and keeps the YAML error; `frontmatter_yaml` with the message and line; `agent` must be a
  string, and an item name must be in `dependencies` (`frontmatter_dependency`).
  *Done when:* core tests cover unquoted, quoted, list items, a real YAML error with its line, and
  both new checks.

- [x] **2. Saving and submitting.** The draft save quotes such values in `SKILL.md` and adds missing
  `agent:` dependencies to `ronne.yaml`; the registry check refuses a non-agent
  (`frontmatter_agent_type`).
  *Done when:* db tests on the four databases cover the save (quoting and the added dependency) and
  the type check.

- [x] **3. Rendering.** `RenderInput.dependencies`, filled by `rmk install` and the plugin builders;
  Claude Code's skill (`agent`, `context: fork`) and agent (`skills:`); the `.agents/skills/` copy
  without `agent` and `context`, with the warning.
  *Done when:* the renderer golden files and the install and plugin tests pass.

- [x] **4. Export.** The Claude Code skill reader's `agent` reference; export's dependency step and
  the uploaded `SKILL.md` naming `@scope/name`.
  *Done when:* the reader and CLI tests cover a skill with `agent:` and `context: fork`.

- [x] **5. End-to-end.** A skill's `SKILL.md` gets `agent: @…` typed in the editor; after Save the
  manifest lists it; it submits.
  *Done when:* the Playwright test passes, and the whole suite.

- [x] **6. Decisions and Documentation.** MVP §3.3 and §15; the manifest spec §2 (skill), the
  native readers spec; the website topics in the spec.
  *Done when:* the docs render tests pass in ronne-web.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 1.** Quoting works line by line: it quotes an item name standing alone after `key:` or
  `- `, and skips the lines of a `|` or `>` block. It doesn't recognise a block whose key has an
  escaped quote (`'it''s': |`), whose value starts with a tag or anchor (`!!str |`, `&a |`), or a
  `? x` key; an item name inside such a block would be quoted. Both regexes are linear (tested).
- **Task 2.** One helper, `withFrontmatter` (drafts.ts) over `frontmatterChanges`, runs in the
  save's and both uploads' transactions; the save answers `rewritten`, which the editor applies. A
  `ronne.yaml` rewritten from CRLF comes back with LF (the yaml library's output).
- **Task 3.** The Claude Code rewrite replaces the `agent:` line (and an indented value under it):
  a comment on that line, and a leading BOM, aren't kept in a file it rewrites. It doesn't match a
  quoted `"agent":` key, or an unquoted `@scope/name` on the line after `agent:` (that YAML doesn't
  parse), and leaves those files as they are. `RenderInput.dependencies` and `RenderContext.plugin`
  are filled by `rmk install`, the plugin builder and the golden harness; `rmk export`'s base render
  (`export-proposal.ts`) doesn't fill them, which task 4 takes up.
- **Task 4.** The change-proposal path (`export-proposal.ts`) needs no dependencies: the agent reader
  turns `skills:` into references only, and the skill renderer doesn't use dependencies, so an
  unedited install reads the same as its base. An edited installed skill whose agent isn't installed
  any more is uploaded with the bare `agent:` name and a warning, while the base's dependency stays.
- **Task 5.** Writing it found an editor bug: the code editor echoes a change made from outside it
  (the form, or now a save's rewrite) as an edit, which the reducer marked unsaved even with the
  same text, so a save that rewrote the open file left it "unsaved". An edit with the same text is
  now no edit (`files.ts`).
