# 096 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, a fresh agent that didn't do the work checks it: it gets the task's *Done
when*, the claims in the notes and where to look, runs the commands itself, and reports each claim as
confirmed, partly or not met (owner, 2026-10-04). A task is ticked only when every claim holds.
Its record lands here, in the same commit as the task. Differences it finds are fixed in the notes
in that commit.

## Task 1 — The rule, and every check that reads it

Witnessed: 2026-10-05 20:47–20:55 EDT, by a fresh agent. Machine: macOS 27.0.1 (Darwin), Node v24.0.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Core: the table, the schema, the package checks, the tests, manifest spec §3 and §6 | confirmed | Every type maps to `ITEM_TYPES`; the schema's "not required dependencies" block is gone and the bundle's "required" stays (valid JSON); `dependencies_not_allowed` gone, `self_dependency` kept and tested; the tests check all 11×11 pairs, a rule, a skill on an agent and an MCP server with dependencies, and still reject a bundle without one; core 304 tests passed. |
| 2 | An older `rmk` installs a rule with dependencies | confirmed | `parseManifest` returns the manifest with its schema issues (also at v0.3.1); `install.ts` reads only the manifest (also at v0.3.1); `resolve.ts` has no type check. v0.3.1's export still has the type rule, as the spec says. |
| 3 | The web app: no type check, the error gone, the pickers offer every type | confirmed (with notes) | `dependency_type`, `DependencyTypeNotAllowedError` and `not_allowed` are nowhere in `src`; the pickers' `DEPENDENCY_TYPES[type]` is every type; the form's field and `@` (`mayHaveDependencies`) are already on every type, the Canvas (`hasCanvas`) not yet (task 2). |
| 4 | The db test: a skill on an agent passes, a cycle between them is refused | confirmed | `registry.db.test.ts` "any type on any type (096)"; submissions and editor 435 passed on SQLite; 167 each on PostgreSQL, MySQL, MariaDB. |
| 5 | `rmk export` without `not_allowed`; its test declares a skill a skill uses | confirmed | CLI 223 passed, MCP 40 passed. |
| 6 | lint, typecheck | confirmed | 0 errors (43 warnings, as on main); 7/7. |
| 7 | The composer end-to-end assertion updated | confirmed (not run) | The build was stale; task 3 runs the suite. |
| 8 | Nothing still states the old rule | partly (comments only) | A stale docstring in `registry-checks.ts`, picker comments, and the canvas picker's empty text "Nothing yet that this item may depend on." MVP §3.1 and the website are task 4. |

**Not checked here:** the end-to-end tests; `pnpm build` and the full `pnpm test` (the pre-commit
hook runs them); a released `rmk` binary (read from the v0.3.1 source instead).
**Differences from the notes:** the comments and the empty text in claim 8 were reworded in this
commit ("Nothing yet to depend on."), and the spec now says an older `rmk export` or `rmk submit`
reports a dependency its bundled rule forbids. Task 2's witness checks these too.
**Overall:** met.
