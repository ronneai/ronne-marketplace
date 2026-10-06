# 096 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The manifest.** `DEPENDENCY_TYPES` gives every type every type (`item-types.ts`); the
  schema's "must be absent" rule goes (the bundle's "required" stays); `dependencies_not_allowed`
  goes from `package-checks.ts`; manifest spec §3.
  *Done when:* core tests cover a dependency on every type, a bundle without one still refused, and
  the examples still pass the schema.

- [ ] **2. The checks and the pickers.** No type check in `dependencyIssues`
  (`DependencyTypeNotAllowedError` goes); the pickers offer every type; the form's Dependencies
  field, `@` and the Canvas view on every type.
  *Done when:* submissions db tests (a skill on an agent, a rule on a skill, a cycle still refused)
  pass on the four databases, and the editor's component tests pass.

- [ ] **3. Export.** `export-dependencies.ts` drops `not_allowed`; the MCP export tools follow.
  *Done when:* the CLI and MCP tests pass with a skill that uses another skill declared as a
  dependency.

- [ ] **4. End-to-end.** A skill depends on an agent and a rule on a skill, from the form and the
  canvas, and both submit.
  *Done when:* the Playwright test passes, and the whole suite.

- [ ] **5. Decisions and Documentation.** MVP §3.1 (the table becomes one rule) and §15 ("Resolver";
  a new "Dependencies between types" row); the ronne-web topics in the spec.
  *Done when:* the docs render tests pass in ronne-web.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
