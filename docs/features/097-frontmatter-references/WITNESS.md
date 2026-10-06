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
