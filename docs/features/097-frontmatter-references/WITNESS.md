# 097 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, a fresh agent that didn't do the work checks it: it gets the task's *Done
when*, the claims in the notes and where to look, runs the commands itself, and reports each claim as
confirmed, partly or not met (owner, 2026-10-04). A task is ticked only when every claim holds.
Its record lands here, in the same commit as the task. Differences it finds are fixed in the notes
in that commit.

## Task 1 — Reading frontmatter

Witnessed: 2026-10-05 21:49 EDT, by a fresh agent. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1a | An unquoted `@scope/name` after `key:` or `- ` is quoted | confirmed | Probe against the built core: keys, list items, comments, tabs, nested keys, CRLF. |
| 1b | Anything else is left alone | confirmed | Quoted values, `@team`, `a@b/c`, uppercase, extra words, flow lists, complex keys. |
| 1c | Quoting never changes a valid document's meaning | partly | Lines inside `|` and `>` blocks were quoted, changing their text. |
| 1d | The YAML error with its line in the file | confirmed | Duplicate key on the block's line 2 → line 3. |
| 2 | `normalizeFrontmatter` changes only the block | partly | `$&`, `$'` and `` $` `` in the frontmatter corrupted the file (`String.replace` with a string). |
| 3 | `frontmatter_yaml`, `frontmatter_agent`, `frontmatter_dependency` | confirmed, with a note | An empty or non-mapping block said "isn't valid YAML". |
| 4 | Tests, typecheck, lint, CLI and web suites | confirmed | Core 311, CLI 223, web 1513 passed; lint 0 errors. |
| 5 | No ReDoS | confirmed | Linear by construction; no hostile-input timing test yet. |

**Overall:** met, with two bugs to fix before task 2 relies on `normalizeFrontmatter`. Fixed (below).

### Re-check after fixes

Witnessed: 2026-10-05 21:53, by a fresh agent.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | No `$` corruption | confirmed | Built by slicing; `$&`, `$'`, `` $` `` in frontmatter and body, LF and CRLF, unchanged but for the quoted name. |
| 2 | Block scalars left alone | partly | Right for `|`, `|-`, `>+2`, comments, list items, blank lines, nesting; missed `|2-` (digit first) and a quoted key containing `#`. |
| 3 | An empty or non-mapping block keeps the old message | confirmed | `skill_frontmatter`; real errors still `frontmatter_yaml`. |
| 4 | Timing test; linear | confirmed | 14 hostile 100k inputs, 0.5–6 ms. |
| 5 | Spec and plan | confirmed | |

### Re-check of the block-scalar headers

Witnessed: 2026-10-05 21:54, by a fresh agent.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Indicators in either order, quoted keys with `#` or `:` | confirmed | `|2-`, `>1+`, `|-2`, `'d #': |`, `"d": >`, `"a:b": |`, `key : |`, `- |2`, `d: |  # c`; `note: a |` doesn't start a block. |
| 2 | Both regexes linear | confirmed | Hostile 100k lines ≤ 0.7 ms each; 1M 6 ms; no overlapping quantifiers. |
| 3 | Tests and lint | confirmed | Core 315 passed; lint 0 errors. |

**Overall:** met. Still missed, all rare in frontmatter and noted in the plan: keys with escaped quotes
(`'it''s': |`, `"a\"b": |`), a tag or anchor before the indicator (`!!str |`, `&a |`), `? x` keys.

## Task 2 — Saving and submitting

Witnessed: 2026-10-05 22:02 EDT, by a fresh agent. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | The save quotes the skill's entry file and adds a missing `agent:` dependency (`^<latest stable>` or `^1.0.0`), keeping `ronne.yaml`'s comments; plain names, listed agents and other types untouched; in the transaction; the stale check still works | confirmed | A script against `frontmatterChanges`: `^1.4.2` from 1.0.0, 1.4.2, a pre-release and a yanked 1.9.0; comments and flow style kept; CRLF kept in `SKILL.md`; rewritten files get the save's `updatedAt` and come back as saved. |
| 2 | Uploads do the same; `rewritten` doesn't reach the API's JSON | confirmed | Create tested on the database; replace (051) shares the code; `uploadedJson` builds its object field by field. |
| 3 | The editor shows what the save rewrote, unless edited meanwhile, and the next save isn't stale | confirmed | The reducer and its unit test; `CodeEditor` follows outside changes. |
| 4 | `frontmatter_agent_type` at submit and release | confirmed, partly on the type's source | It took the newest of anyone's non-draft submissions: a rejected one of another type could give a false error, and another author's unreleased item's type was told. |
| 5 | Tests, lint, typecheck | confirmed | 441 passed; 171 each on PostgreSQL, MySQL, MariaDB; lint 0 errors; 7/7. |
| 6 | A YAML error, an unparsable `ronne.yaml`, a binary entry | confirmed | No crash; nothing added; nothing touched. |

**Not checked here:** the editor in a browser (task 5); replace against a database.
**Differences from the notes:** the spec said "each SKILL.md" and "`^1.0.0` for an unreleased one of
your own"; the test of the latest release couldn't tell it from the fallback. A `dependencies` list
would have been replaced. Fixed (below).
**Overall:** met.

### Re-check after fixes

Witnessed: 2026-10-05 22:13, by a fresh agent.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | The type is judged by the published item or the submitter's own open submission | confirmed | Others' and closed submissions are ignored; the message test passes. |
| 2 | A `dependencies` that isn't a map is left alone | confirmed | A list is saved byte for byte. |
| 3 | The test proves the latest release (`^1.1.0`) | confirmed | Passes on SQLite, PostgreSQL 15, MySQL 8.4, MariaDB 10.11. |
| 4 | The spec's wording | confirmed | |

**Overall:** met. Afterwards the test helper throws when the item has no owner instead of falling back
to `""` (test-only). Noted: the submitter's own *draft* of the wrong type isn't flagged by this check
(only open submissions are), but a draft dependency is already refused at submit (056).

## Task 3 — Rendering

Witnessed: 2026-10-05 22:20–22:30 EDT, by a fresh agent. Machine: macOS 27.0.1 (Darwin 27.0.0), Node v24.0.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Claude Code's skill: `agent: <short>` (`<plugin>:<short>` in a plugin), `context: fork` only without a top-level `context`, plain names and the rest of the file untouched, CRLF kept | confirmed (two small gaps) | Probe against the built core: comments, a value on the next line, nested keys, `context: inline`, broken YAML, CRLF, a `|` block. A comment on the `agent:` line and a BOM aren't kept in a rewritten file; an unquoted name on the next line and a quoted `"agent":` key are left as they are. |
| 2 | Claude Code's agent: `skills:` from preloadable skill dependencies, sorted, short (plugin-prefixed) names; none without dependency facts | confirmed | `renderAgent`, `renderDependencyOf`; unit test with a skipped `disable-model-invocation` skill and an MCP server. |
| 3 | The `.agents/skills/` copy drops `agent`/`context` with `unsupported_field` | confirmed (one gap) | Both renderers return `skillFolder`'s warnings; Cursor gives none when it leaves the skill to Claude Code's copy (which keeps both keys); with both Codex and Cursor, one warning each. |
| 4 | `dependencies` filled by `rmk install` and the plugin builder | confirmed | `prepareInstall` builds `known` from every resolved item; `buildPlugin` from its members, with `plugin` for Claude Code. `mcp-setup.ts` needs none; `export-proposal.ts`'s base render doesn't fill them (task 4). |
| 5 | Golden diffs | confirmed | Only the code-reviewer agent gained `skills:` (renderer goldens: `secure-coding`; plugin goldens: `"examples.code-reviewer:secure-coding"`, `"examples.starter-kit:secure-coding"`, matching each `plugin.json` name; valid YAML). |
| 6 | Suites, typecheck, lint | confirmed | Core 323, CLI 224 (with the new install test), MCP 40, web feeds 32 + 23 (db); typecheck 7/7; lint 0 errors. |
| 7 | ReDoS | confirmed | `BLOCK` and `TOP_KEY` linear (200k-character inputs ≤ 2 ms); no adversarial test yet. |

**Not checked here:** the database servers, the whole build, Playwright; Claude Code reading
plugin-prefixed names (from the 2026-10-05 docs check); Cursor's handling of the two keys.
**Differences from the notes:** the spec's "one warning per skill" and its warning text didn't match
the code. After this check, the spec says what the code does, the plan's notes record the gaps in
claim 1 and the export base render left to task 4, and a hostile-input timing test was added (test
and documentation only; no behaviour changed).
**Overall:** met.

## Task 4 — Export

Witnessed: 2026-10-05 22:28 EDT, by a fresh agent. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | `readSkill`: `agent: <local>` is an `agent` reference; built-ins (any case), `plugin:agent`, item names and empty values aren't; `context: fork` isn't required | confirmed | A probe and the new reader test. |
| 2 | Matching finds local, installed and published agents; self-references skipped; messages say "the agent X" | confirmed | `matches` by type and name; Claude Code agents named from their frontmatter; installed through the state file; published through `checkPublished`. |
| 3 | The uploaded `SKILL.md` names the declared agent `"@scope/name"`, only that line changed; not when it isn't declared | confirmed (only the planned path tested) | `nameAgent` in all three declaring branches; CRLF kept, an inline comment on the line dropped. |
| 4 | Other users of the reference kind | confirmed | Messages updated; `export-command.ts` already generic; no kind enum in the MCP tools; the native readers spec is task 6. |
| 5 | Tests, typecheck, lint | confirmed | Core 325, CLI 225, MCP 40; typecheck 7/7; lint 0 errors. |
| 6 | The proposal path doesn't misbehave | confirmed (no new test) | `readAgent` turns `skills:` into references only, and the skill renderer doesn't use dependencies, so an unedited install doesn't look changed; an edited skill's `agent:` is declared and rewritten back to `"@scope/name"`. |

**Not checked here:** proposals from a plugin install; the full build, database and end-to-end tests.
**Differences from the notes:** task 3's note left the base render open for this task; nothing needed
changing there (claim 6). After this check: `readSkill`'s doc comment, displaced by the new code, was
moved back; a test covers an installed agent (`^2.1.0`, `agent: "@team/helper"`); the plan's notes say
why the proposal path needed nothing.
**Overall:** met.
