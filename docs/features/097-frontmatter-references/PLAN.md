# 097 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Reading frontmatter.** `frontmatter.ts` quotes an unquoted `@scope/name` value before
  parsing and keeps the YAML error; `frontmatter_yaml` with the message and line; `agent` must be a
  string, and an item name must be in `dependencies` (`frontmatter_dependency`).
  *Done when:* core tests cover unquoted, quoted, list items, a real YAML error with its line, and
  both new checks.

- [ ] **2. Saving and submitting.** The draft save quotes such values in `SKILL.md` and adds missing
  `agent:` dependencies to `ronne.yaml`; the `@` list in frontmatter inserts the name quoted; the
  registry check refuses a non-agent (`frontmatter_agent_type`).
  *Done when:* db tests on the four databases cover the save (quoting and the added dependency) and
  the type check; the mention test covers frontmatter.

- [ ] **3. Rendering.** `RenderInput.dependencies`, filled by `rmk install` and the plugin builders;
  Claude Code's skill (`agent`, `context: fork`) and agent (`skills:`); the `.agents/skills/` copy
  without `agent` and `context`, with the warning.
  *Done when:* the renderer golden files and the install and plugin tests pass.

- [ ] **4. Export.** The Claude Code skill reader's `agent` reference; export's dependency step and
  the uploaded `SKILL.md` naming `@scope/name`.
  *Done when:* the reader and CLI tests cover a skill with `agent:` and `context: fork`.

- [ ] **5. End-to-end.** A skill's `SKILL.md` gets `agent: @…` typed in the editor; after Save the
  manifest lists it; it submits.
  *Done when:* the Playwright test passes, and the whole suite.

- [ ] **6. Decisions and Documentation.** MVP §3.3 and §15; the manifest spec §2 (skill), the
  native readers spec; the website topics in the spec.
  *Done when:* the docs render tests pass in ronne-web.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
