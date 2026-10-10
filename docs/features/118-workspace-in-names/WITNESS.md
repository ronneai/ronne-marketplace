# 118 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Names in `@ronneai/core`

Witnessed: 2026-10-10 00:13 EDT, by a fresh agent (blind). Commit: 7c639508 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `parseItemName` takes `@scope/name` (workspace `global`) and `@workspace/scope/name` | no | confirmed | `names.ts:91-102` decides by the number of segments; probe `@global/a/b` → `{global,a,b}`; `pnpm --filter @ronneai/core test` → 359 passed |
| 2 | Malformed names are refused | no | confirmed | `names.test.ts` refuses 4 segments, `@a//x`, `@a/b/`, `@a/b.c`, 65 chars, `@/x`, `@Platform/x`; probes `"@a/b\r"`, `" @a/b"`, `@é/b`, `@-a/b/c`, `@a/b/c/` → null |
| 3 | `formatItemName` / `canonicalItemName` write `global` short | no | confirmed | `names.ts:105-118`; `canonicalItemName("@global/team/lint")` → `@team/lint`; `sameItemName` treats both forms alike |
| 4 | `shortItemName` and `parseScopeName` are exported from core | no | confirmed | `index.ts` diff exports them with `canonicalItemName`, `formatItemName`, `formatScopeName`, `sameItemName`, `ITEM_NAME_MAX_LENGTH`; covered in `names.test.ts` |
| 5 | A full name is at most 195 characters | no | confirmed | `ITEM_NAME_MAX_LENGTH = 1 + 3*64 + 2`; probe printed 195; a 65-character last segment → null |
| 6 | The schema's `name` and `dependencies` patterns take 2 or 3 segments | no | confirmed | `ronne.schema.json:11,547` use `{1,2}`; `parseManifest` probes: `@acme/a/b`, `@global/a/b` pass, `@a/b/c/d`, `@a/B/c` fail; `manifest.test.ts` covers a `"@acme/t/x"` dependency |
| 7 | 097's `agent:` takes three-part names and matches a dependency however it's written | no | confirmed | `frontmatter.ts:24` `{1,2}`; `parseFrontmatter("agent: @acme/test/agent")` parses; `package-checks.ts:249` uses `sameItemName`; the new test covers both directions |
| 8 | Plugin names are `scope.name` in global and `workspace.scope.name` elsewhere, reversible, never `global.…` | no | confirmed | `plugins/names.ts`; `pluginName("@acme/a/b")` → `acme.a.b`, `@global/a/b` → `a.b`; `itemNameOfPlugin("global.team.secure-coding")` → null |
| 9 | Rendered files use the item's last segment | no | confirmed | `render/helpers.ts` `shortName = shortItemName`; example renderer and `plugins/harness.ts` use the last slash; `shortName("@acme/a/b")` → `b` |
| 10 | Examples still pass the schema, and golden files are unchanged for `global` | no | confirmed | `vitest run src/examples.test.ts` passed; `git status` shows nothing under `examples/` or golden folders |
| 11 | Hand-written splits in core, cli, mcp and web now go through core | no | partly | Still by hand: `cli/src/export.ts:472` `MARKER` regex (two-part only; `@acme/team/lint@1.0.0` → null), the search splitters `kysely-catalogue-repository.ts:94` and `kysely-submission-repository.ts:229` (first slash), `cli/src/testing.ts:309` `split("/")[1]` |
| 12 | A repository grep test fails on name splitting outside `names.ts` | no | partly | `item-names.test.js` 2/2 passes; planted `slice(1).split("/")` caught, but an `indexOf("/")` in a variable, `split("/")[n]` and character-class name regexes were missed |
| 13 | rmk tests and the workspace checks pass | no | confirmed | `pnpm --filter @ronneai/rmk test` → 243 passed; `pnpm typecheck` → 7/7; `pnpm lint` → no errors (43 warnings) |

**Overall:** not met: one rmk marker regex and two web search splitters still read names by hand, and the grep test doesn't catch those forms.

### Re-check of claims 11 and 12

Witnessed: 2026-10-10 00:18 EDT, by a fresh agent (blind). Commit: 7c639508 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 11 | Hand-written name splits in core, cli, mcp and web now go through core | no | confirmed | `export.ts:472-484` `markerOf` reads the name with `parseItemName`; the new `export.test.ts` case reads `@acme/examples/house-style@1.0.0-beta.1`; `pnpm --filter @ronneai/rmk test` → 244 passed; both search splitters use `typedNameParts` and filter `workspaces.name`; `vitest run --project db src/server/domains/submissions src/server/domains/items` → 299 passed; `testing.ts:309` uses `shortItemName`; a wider grep finds only paths, JSON pointers, DB URLs and `frontmatter.ts:24` |
| 12 | The repository grep test catches the forms planted before, and fails if one comes back | no | confirmed | `pnpm --filter @ronneai/repo-tools test` → 159 passed; planted `slice(1).split("/")`, an `indexOf("/")` in a variable, `split("/")[1]`, the old `MARKER` regex and `/^@([^/]+)\/([^/]+)$/` each failed the test; still missed (none in the tree): `split("/", 2)`, `replace("@", "").split("/")` destructured, `search("/")` |

**Overall:** met.

## Task 2 — Migration

Witnessed: 2026-10-10 00:24 EDT, by a fresh agent (blind). Commit: aa61e53c (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The migration's db test passes on SQLite | no | confirmed | `cd apps/web && npx vitest run --project db src/server/db/migrations` → 12 files, 53 tests passed |
| 2 | The same on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:postgres -- src/server/db/migrations`, `:mysql`, `:mariadb` → each 12 files, 53 tests passed |
| 3 | Two workspaces can each have a scope with the same name; one workspace can't have two | no | confirmed | `0022…db.test.ts:122-128`; mutations in a scratch copy: removing the SQLite composite unique fails it on SQLite, skipping the old unique's drop fails it on PostgreSQL and MariaDB |
| 4 | `scopes` is unique on `(workspace_id, name)` and the unique on `name` alone is gone, on all four | no | confirmed | Schema probes: PG `scopes_name_key` gone, `scopes_workspace_name_unique (workspace_id,name)`; MySQL/MariaDB index `name` gone; SQLite keeps 6 columns, `scopes_workspace_id_idx` and both FKs |
| 5 | The SQLite rebuild keeps the foreign keys from `items` and `submissions` to `scopes` | no | confirmed | Probe: `items.scope_id → scopes` RESTRICT after 0022; test `:131-137`; `pragma_foreign_key_check` at `0022…ts:111-117` |
| 6 | `item_aliases` has a unique name, an `item_id` FK that cascades, `created_at` and `reason` | no | confirmed | PG primary key on name, FK ON DELETE CASCADE; MySQL/MariaDB `varchar(195)` `utf8mb4_bin`, CASCADE; SQLite CASCADE; test `:139-148`, a restrict mutation fails it |
| 7 | Every item outside `global` gets `@scope/name` with reason `migration`; `global`'s none | no | confirmed | `0022…ts:42-62`; test `:113-119`; mutation `where 1=1` fails 2 tests |
| 8 | Running the migration again adds nothing | no | confirmed | Test `:150-155` passes on all four; removing the `not in (…)` filter fails it |
| 9 | Usage and download counts use item ids, with no name keys to move | no | confirmed | `usage_daily` keys on `item_id`; `download_count` is on `items`; `version_dependencies.depends_on_item_id`; no name columns in `schema.ts` |
| 10 | `schema.ts` and the migration index include 0022 and `item_aliases` | no | confirmed | `git diff`; `pnpm --filter @ronneai/web typecheck` passes; `biome check` on the 4 files → no issues |
| 11 | The guard test passes, 0022 included | no | confirmed | `npx vitest run src/server/db/migrations/migrations.guard.test.ts` → 23 passed |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-10 00:25 EDT, by a fresh agent (adversarial). Commit: aa61e53c (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The migration's db test passes on SQLite | no | confirmed | `npx vitest run --project db …/0022_workspace_in_names.db.test.ts` → 5 passed |
| 2 | The same on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:postgres`, `:mysql`, `:mariadb -- …0022….db.test.ts` → 5 passed on each |
| 3 | Two workspaces can share a scope name; one workspace can't have it twice | no | confirmed | Breaking the PG drop, or keeping `.unique()` in the SQLite rebuild, fails "lets two workspaces…" |
| 4 | `scopes` is unique on `(workspace_id, name)`, not on `name` alone, on every dialect | no | confirmed | Schema dumps after migrating on PG, MySQL 8.4, MariaDB and SQLite |
| 5 | The SQLite rebuild keeps every foreign key and index of `scopes` and of what points at it | no | confirmed | `sqlite_master` and `pragma_foreign_key_list` before and after: `scopes_created_by_fk`, `scopes_workspace_id_fk`, `scopes_workspace_id_idx`, `items`/`submissions.scope_id` RESTRICT all kept |
| 6 | A failed SQLite run leaves the database as it was | no | confirmed | A planted dangling item makes it throw; afterwards `name` still unique and no `item_aliases` |
| 7 | A failed PostgreSQL run rolls back | no | confirmed | A pre-made `item_aliases` with `varchar(3)` makes it throw; `scopes_name_key` still there, the new index absent |
| 8 | On MySQL and MariaDB, a rerun after a partial failure completes | no | confirmed | Index already made and old unique not yet dropped → completes; half the aliases deleted → rerun refills exactly |
| 9 | `item_aliases` is as specified | no | confirmed | PK on name (195), FK CASCADE, NOT NULL columns; 195 stored and 196 refused on the servers; duplicates, missing items and null reasons refused |
| 10 | MySQL's index length and collation work for the alias key | no | confirmed | `varchar(195) utf8mb4_bin` (780 bytes); `@INFRA/deploy` and `@infra/déploy` stored beside `@infra/deploy`; exact lookup returns one row |
| 11 | `reason` holds `migration`, `move` or `rename` | no | confirmed | The migration writes `migration`; like other enum-like columns, the code enforces the values |
| 12 | Every item outside `global` gets its alias, `global`'s none | no | confirmed | Test 1 on all four; empty and global-only instances → 0 aliases; 1,234 items → 1,234 aliases, rerun unchanged, on all four |
| 13 | An alias written by this migration is never a current item's name | no | confirmed | Scope names were unique before 0022, so no `@scope/name` alias equals a global item's name; later refusals are task 3's |
| 14 | Usage and download counts are kept per item id | no | confirmed | `usage_daily.item_id`, `items.download_count`; no name columns |
| 15 | Nothing else is renamed and no tarball changes | no | confirmed | 0022 touches only `scopes` constraints and `item_aliases`; scope ids and `workspace_id` unchanged |
| 16 | The guard test passes | no | confirmed | `migrations.guard.test.ts` → 23 passed |
| 17 | `migrations/index.ts` registers 0022 and `schema.ts` has `ItemAliasTable` | no | confirmed | diff; `npx biome check` on the 4 files → no issues |

**Overall:** met.
