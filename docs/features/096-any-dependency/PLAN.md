# 096 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The rule, and every check that reads it.** `DEPENDENCY_TYPES` gives every type every type
  (`item-types.ts`); the schema's "must be absent" rule goes (the bundle's "required" stays);
  `dependencies_not_allowed` goes from `package-checks.ts`; manifest spec §3. What read the table
  follows in the same change, since the pre-commit hook runs every suite: no type check in
  `dependencyIssues` (`DependencyTypeNotAllowedError` goes), the pickers offer every type, and
  `rmk export` drops `not_allowed`; the tests that asserted the old rule assert the new one.
  *Done when:* core tests cover a dependency on every type and a bundle without one still refused;
  the submissions db tests (a skill on an agent, a cycle still refused) pass on the four databases;
  the CLI tests pass with a skill that uses another skill declared as a dependency.

- [x] **2. Authoring on every type.** The form's Dependencies field, `@` in markdown and the Canvas
  view on every type.
  *Done when:* the editor's component tests cover a rule with the field and the Canvas view; `@`
  lives inside CodeMirror and isn't in a static render, so task 3's end-to-end test covers `@` on
  a rule.

- [ ] **3. End-to-end.** A skill depends on an agent and a rule on a skill, from the form, `@` in
  the rule's markdown and the canvas, and both submit.
  *Done when:* the Playwright test passes, and the whole suite.

- [ ] **4. Decisions and Documentation.** MVP §3.1 (the table becomes one rule) and §15 ("Resolver";
  a new "Dependencies between types" row); the ronne-web topics in the spec.
  *Done when:* the docs render tests pass in ronne-web.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **The plan's order changed** while building task 1: changing the table in core changes what the
  web app's checks and pickers and `rmk export` do, and the pre-commit hook runs every suite, so the
  rule and the checks that read it are one task (tasks 1–3 of the first plan became task 1).
- **Task 1.** `DEPENDENCY_TYPES`, `mayDependOn` and `mayHaveDependencies` stay, now always every
  type and true, so callers keep one place to ask. Through `mayHaveDependencies`, the form's
  Dependencies field and `@` were already on every type after this task; the Canvas (`hasCanvas`)
  is task 2.
