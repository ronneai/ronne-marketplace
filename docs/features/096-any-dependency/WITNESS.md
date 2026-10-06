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

## Task 2 — Authoring on every type

Witnessed: 2026-10-05 20:54 EDT, by a fresh agent. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | `hasCanvas` true for every type; the editor's views, the form's Dependencies field and `@` (markdown, not read-only) on every type | confirmed | `model.ts` → `mayHaveDependencies(type)`, true for all 11; `DraftEditor.tsx:210`, `ManifestForm.tsx:390`, `DraftEditor.tsx:299-330`, `CodeEditor.tsx:122`. |
| 2 | `@` can't be covered by a static render | confirmed (with a caveat) | CodeMirror mounts in `useEffect`; no DOM test library in the app; `mentions.test.ts` already tests the mention logic, which doesn't depend on type. Deferring the gate to task 3's end-to-end test is fair. |
| 3 | The component tests pass | confirmed | 249 passed; "offers Form, YAML and Canvas for every type (096)" (seven types) and "gives a rule the Dependencies field, with its search (096)". |
| 3b | They cover a rule's Canvas view | partly | The Canvas switch is rendered for a rule, not the canvas itself (the static render starts on Form); task 3 opens it in a browser. |
| 4 | Task 1's follow-ups: the docstring, the picker's empty text and comments, the spec's older-`rmk` paragraph; no old-rule wording left | confirmed | "Nothing yet to depend on."; "(of any type since 096…)"; SPEC lines 46–52; the grep finds only new-rule comments. |
| 5 | Nothing on the canvas assumes agent or bundle | confirmed | Only the bundle's required `dependencies` key and its own description; the item page's graph shows whenever there are dependencies. |
| 6 | lint, typecheck | confirmed | 0 errors (43 warnings, as on main); 7/7. |

**Not checked here:** the end-to-end tests (task 3), the canvas in a browser, the website (task 4).
**Differences from the notes:** the plan's *Done when* moved `@` to task 3 in this change, for the reason above.
**Overall:** met.

## Task 3 — End-to-end

Witnessed: 2026-10-05, by a fresh agent. Machine: macOS 27.0.1, Node v24.0.0, Playwright 1.63.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | A skill depends on an agent (form); a rule on the skill (Canvas, opened on a rule) and on the agent (`@` in `rule.md`); `ronne.yaml` shows both; both submit | confirmed | `any-dependency.e2e.ts`; this covers task 2's two open points (the Canvas and `@` on a non-agent type in a browser). The drafts are uploaded with a token; the dependencies are all added in the browser. The skill's `ronne.yaml` wasn't checked after the form step. |
| 2 | 089's test needed a change | confirmed | After 096, the composer user's own agent draft `composed` (from `composer.e2e.ts`) is offered to an agent, so "draft, yours" matched two rows while the canvas search hadn't settled; the badge is now checked on `pick-mine`'s row. |
| 2c | That canvas step's negative check runs on settled results | partly | Both checks could pass on the first, unfiltered list. |
| 3 | hookAuthor under the sign-in limit | confirmed | 3 a run. |
| 4 | The test, alone and in the whole suite; lint | confirmed | 1 passed; 90 passed; 0 errors. |
| 5 | The data it leaves doesn't change other tests | confirmed (low risk) | Three submitted items, none published. |

**Not checked here:** CI on Node 22.
**Differences from the notes:** none.
**Overall:** met. Two hardenings followed (below).

### Re-check after fixes

Witnessed: 2026-10-05 21:10 EDT, by a fresh agent.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| a | Waiting for `composed` to leave the list makes the canvas checks run on settled results | partly | Still a race on the picker's initial empty list, and a no-op when the file runs alone. |
| b | The skill's `ronne.yaml` is checked after the form step | confirmed | YAML view → `"@e2e-seeded/any-agent": ^1.0.0`. |
| c | Runs and lint | confirmed | 3 targeted passed; full suite 90 passed; lint 0 errors. |

**Overall:** partly met; replaced by a marker of the test's own (below).

### Re-check after the settle marker

Witnessed: 2026-10-05 21:15 EDT, by a fresh agent.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | The test uploads its own `settle-089` draft, waits for it to be visible before typing "pick-", then for it to leave | confirmed | It can only appear once the unfiltered answer has arrived, and leaves only when the "pick-" answer replaces it (the picker keeps entries while loading; the debounce makes one search; older answers are dropped). Own items come first on the first page, so it's always there. |
| 2 | Composer's sign-ins and tokens under the limit | confirmed (4) | A CI retry right after a failure could reach 6 in one window. |
| 3 | Runs and lint | confirmed | Alone 1 passed; with `composer.e2e.ts` 2 passed; lint 0 errors. |

**Overall:** met. After this check, the test asks for one token per user and uploads both of composer's
drafts with it (3 uses a run, so a retry stays within 5); the two tests passed again after that change.

## Task 4 — Decisions and Documentation

Witnessed: 2026-10-05 21:20 EDT, by a fresh agent. Machine: macOS 27.0.1 (Darwin), Node v24.0.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | MVP §1, §3.1, §8, §15 and the manifest spec match the code | partly | All updated and accurate, but the manifest spec's field table still said `dependencies` is "Only allowed for the types listed in §3", and its agent line read like the old list. |
| 2 | The website's English says what the app does; no leftovers | partly | Intro, cards, canvas, item page and export done; the picker sentences in all three languages still said "of the types this one / the draft may depend on". |
| 3 | Portuguese and French match and agree | confirmed | Terms and the bundle card's gender agreements right (proofread before). |
| 4 | The cards and their component comment | confirmed | All 11 types on cards 1 and 3; `bundle` on card 2. |
| 5 | Checks | confirmed | Worktree: lint, typecheck, 136 tests; here lint 0 errors. |
| 6 | No in-app helper states the old rule | confirmed | |

**Not checked here:** the website in a browser (the cards' layout with 11 type badges).
**Differences from the notes:** "a bundle lists at least one" wasn't enforced: an empty
`dependencies: {}` passed (on `main` too).
**Overall:** not met, narrowly. Fixed (below).

### Re-check after fixes

Witnessed: 2026-10-05 21:28 EDT, by a fresh agent.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | The manifest spec's field table and agent line | confirmed | "Any type, on any type (§3); a bundle lists at least one."; "The skills, MCP servers and other items the agent uses…". |
| 2 | The website's picker sentences, and Portuguese card 1 | confirmed | "of any type, never this item itself" (pt, fr alike); "Qualquer tipo pode depender de qualquer tipo"; no leftovers in `www/src`. |
| 3 | `bundle_empty` refuses an empty bundle; tests; the spec | confirmed | Core 305, submissions and editor 436 passed. Saving still works (problems are reported, not thrown); Submit stays off until an item is added; nothing else leaves a bundle stuck; a released empty bundle installs as before (`rmk` never runs the package checks). |

**Overall:** met. After this check: the website's `types.ts` comment was reworded, and the spec now
says what happens to bundles saved empty before 096. The full suite (build, unit, 90 end-to-end, and
the submissions tests on PostgreSQL, MySQL and MariaDB) passed with these changes.
