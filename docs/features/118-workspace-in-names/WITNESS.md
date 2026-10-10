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

## Task 3 — Lookup by name and alias

Witnessed: 2026-10-10 00:56 EDT, by a fresh agent (blind). Commit: b0aefd1d (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | One repository method finds an item by its full name or an alias, with 093's viewer filter on both lookups | no | confirmed | `kysely-item-repository.ts:112-143`; alias branch made to return nothing → 5 of 7 `old-names.db.test.ts` tests fail |
| 2 | Alias lookup works (item page and API answer with the current name) | no | confirmed | old-names test passes; `itemJson(itemPageAs(…@old/deploy))` → `@acme/team/deploy`; `findDownloadAs` → 1.0.0 |
| 3 | A non-member gets not found by an alias | no | confirmed | test passes; probes: `findDownloadAs`, `itemPageAs` as an outsider → `ItemNotFoundError` |
| 4 | One item reached by two names in one resolve is one item, with `renamed` | no | partly | test passes; `??=` drops the second name's range: the answer depends on key order |
| 5 | `POST /api/v1/resolve` answers `renamed` | no | confirmed | `registry-api.ts:228`; `ServerResolution` carries `renamed` |
| 6 | Registry API paths for global and for a workspace's items | no | confirmed | 3 route files under `app/api/v1/workspaces/[workspace]/items/…`; `itemRefOf` defaults to global; `private-api.db.test.ts` uses them; db suite → 764 passed |
| 7 | Tarball reads go through alias lookup | no | confirmed | `downloads.ts:30` → `findByName(ref)`; probe download through an alias → 1.0.0; no packed-name check exists |
| 8 | Search by exact name uses aliases | no | not met | `searchCatalogueAs(author, {q:"@old/deploy"})` → no entries |
| 9 | A dependency through an alias passes with `dependency_renamed` | no | confirmed | `registry-checks.ts:226-234`; test passes |
| 10 | Release records a dependency through an alias as the item's id | no | confirmed | test: `depends_on_item_id` → `[base]` |
| 11 | The item page redirects an alias URL | no | partly | `load.ts:39-50` redirects; no test; the workspace item page route doesn't exist (404) |
| 12 | An alias is refused as a new draft's name to members who see the item | no | confirmed | test: `name_taken` with the exact message; `submitDraft` throws |
| 13 | An alias is refused as "taken" to others | no | not met | probe: an outsider's global `team/deploy` draft → `checkSubmission` `[]`, `submitDraft` ok |
| 14 | Release never writes into the alias's item | no | confirmed | test passes; with `ownItem`'s throw disabled it still passes (the guard has no test) |
| 15 | Aliases refused as names a move or rename would give | no | not met | no move or rename code and no shared guard |
| 16 | Scope lookups take the workspace | no | confirmed | `kysely-scope-repository.ts:77-81`; the two-`team` setup passes |
| 17 | The 093 guard tests and the new tests pass on four databases | no | confirmed | SQLite 32 passed; `pnpm test:db:postgres` / `:mysql` / `:mariadb` → 32 each |

**Overall:** not met: exact-name search ignores aliases, a non-member can take an alias's name, no move/rename refusal, the redirect leads to a missing page, resolve drops a range.

### Adversarial pass

Witnessed: 2026-10-10 00:51 EDT, by a fresh agent (adversarial). Commit: b0aefd1d (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `findByName(ref)` finds by current name or alias, both filtered | no | confirmed | `kysely-item-repository.ts:70-103`; probes P3/P5 on four databases: an outsider gets nothing |
| 2 | Tests cover alias lookup | no | confirmed | M1 (alias query matches "nope") → 5 failed |
| 3 | Tests cover visibility by alias | no | partly | M2 (filter removed from the alias query only) → all tests pass; the guard test probes only the current name |
| 4 | Tests cover one item by two names in one resolve | no | confirmed | passes on four databases; M1 breaks it |
| 5 | Two names for one item give one node, one version | no | partly | `{"@team/base":"^1.0.0","@acme/team/base":"^2.0.0"}` → 1.0.0; swapped → error |
| 6 | Resolve reads old names as current and answers `renamed` | no | confirmed | P2/P4 |
| 7 | `@scope/name` always means global | no | confirmed | `parseItemName`; P7 |
| 8 | An alias never reveals its item to a non-member | no | partly | release by an outsider says "was the name of another item" |
| 9 | A draft named like an alias is refused ("taken" to others) | no | not met | outsider: check `[]`, submit ok, approved, release fails |
| 10 | A release never writes into the alias's item | no | confirmed | P1; M3 (no `ownItem` throw) → tests still pass |
| 11 | Names a move or rename would give are refused | no | not met | no code, no shared helper |
| 12 | API, tarball, checks and proposals use `findByName` | no | confirmed | `downloads.ts:30`, `registry-checks.ts:181,226`, `publish.ts:350,391`, `proposals.ts:91` |
| 13 | Search by exact name uses aliases | no | not met | P8: `browseCatalogue {q:"@old/deploy"}` → `[]` |
| 14 | Tarball name checks | no | not met | none exist |
| 15 | The item page redirects an old name | no | partly | redirect to a route that doesn't exist; no test |
| 16 | Scope lookups take the workspace | no | confirmed | P6, P7 |
| 17 | Nothing else looks up by scope name alone | no | partly | name-sort keyset pages on `scopes.name, items.name` only: P9 skips `@acme/team/lint` |
| 18 | MySQL/MariaDB collation on names | no | partly | `ACME` and a trailing-space name match there, not on SQLite or PostgreSQL |
| 19 | The 093 guard tests still pass | no | confirmed | four databases, 16/16 each |

**Overall:** not met.

### Re-check 1

Witnessed: 2026-10-10 01:11 EDT, by a fresh agent (blind). Commit: f66a1b02 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | One item reached by two names is one item, both ranges applied whatever the order | no | confirmed | `resolve.ts:66-81`; test passes; probes in both orders → ResolveError; a tag plus a range → `resolve_conflict`; two pins dropped |
| 8 | A whole old name finds its item in search, only for who sees it | no | confirmed | `kysely-catalogue-repository.ts:107-122`; test passes; `@old/deploy`, `@OLD/Deploy`, `old/deploy`, `@global/old/deploy` → the item, `@old/dep` → none; alias part disabled → the test fails |
| 11 | The item page redirects an old name, and the workspace item pages exist | no | confirmed | new `app/(app)/workspaces/[name]/items/[scope]/[item]/` pages; `item-page.test.tsx:141` → `NEXT_REDIRECT /workspaces/acme/items/team/github?version=1.0.0`; 53 passed |
| 13 | A draft named as an alias is refused as "taken" to someone who can't see the item | no | confirmed | `registry-checks.ts:71-73`; test passes; outsider's submit → `name_taken` "is taken"; `isOldName` disabled → the test fails |
| 14 | Release never goes into an old name's item, and says "taken" to who can't see it | no | partly | refusal holds, but the outsider gets "was the name of another item": the release store is unfiltered, so `ownItem` reaches the members' branch |
| 15 | A shared `isOldName` exists, answers for everyone, and is tested | no | confirmed | `item-repository.ts:33`, `kysely-item-repository.ts:134-139`, `registry-lookup.ts:63`; exempt in the guard test with a reason; covered by claim 13 and the `ownItem` unit test |
| 16 | The new and guard tests pass on all four databases | no | confirmed | SQLite 46 passed; `pnpm test:db:postgres` / `:mysql` / `:mariadb` → 37 each |
| 17 | The tarball packed-name check is task 5's | no | confirmed | PLAN.md task 3's text |

**Overall:** not met: claim 14.

### Adversarial re-check 1

Witnessed: 2026-10-10 01:10 EDT, by a fresh agent (adversarial). Commit: f66a1b02 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Tests cover visibility by alias | no | confirmed | M2 (filter removed from the alias query) → 3 of 48 fail, the guard test among them |
| 5 | Two names for one item give one node, one version | no | partly | `^1.0.0 \|\| ^2.0.0` + `^2.0.0` → 1.0.0 (swapped: error); `1.0.0 - 1.5.0` + `>=1.0.0` read as a tag |
| 8 | An alias never reveals a hidden item to a non-member | no | partly | release by an outsider says "was the name of another item" (unfiltered release store) |
| 9 | A draft named like an alias is refused, "taken" to others | no | confirmed | P1: `name_taken "@team/deploy is taken…"`; M5 → the test fails |
| 10 | A release never writes into the alias's item | no | confirmed | P12; M3a/M3b → `publish.test.ts` fails |
| 11 | A shared `isOldName` check exists | no | confirmed | `kysely-item-repository.ts:134`, `registry-lookup.ts:63`; used by `registry-checks.ts:72`, `publish.ts:200`; M5 breaks a test |
| 13 | Search by exact name finds an old name, visibility kept | no | confirmed | P8 on four databases; P11: outsider → `[]` |
| 14 | Tarball packed-name check | no | confirmed | moved to task 5 (PLAN, SPEC:93) |
| 15 | The redirect lands on the workspace's item page | no | confirmed | pages exist; `item-page.test.tsx:141`; `tsc --noEmit` exit 0 |
| 17 | Nothing else pages or looks up by scope name alone | no | partly | scope `list` pages on the name only: `listScopesAs(limit:1)` skips acme's `team` |
| 18 | MySQL/MariaDB collation on names | no | confirmed | `ACME/team/deploy`, `"deploy "` → not found on all four |

**Overall:** not met: claims 5, 8, 17.

### Re-check 3 (claims 4 and 14)

Witnessed: 2026-10-10 01:16 EDT, by a fresh agent (blind). Commit: f66a1b02 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | One item reached by two names gets both ranges, whatever the order or form; a tag plus anything else conflicts | no | confirmed | `resolve.ts:66-82` → `bothRanges` (`versions.ts:81-89`); the db test passes on SQLite and `pnpm test:db:postgres` / `:mysql` / `:mariadb` (30 each); core 362 passed; probes `^1\|\|^2` + `^2` → 2.1.0, `~1.2` + `1.2.0 - 2.0.0` → 1.2.0, `latest` + a range → null; joining with a space instead → `versions.test.ts` and the db test fail |
| 14 | Release never goes into an old name's item, and tells everyone only "taken" | no | confirmed | `publish.ts:199-201`; `old-names.db.test.ts` 14 passed on four databases; `publish.test.ts` 2 passed; members getting "alias" again → the new test fails; guard tests pass |

**Overall:** met.

### Adversarial re-check 2

Witnessed: 2026-10-10 01:15 EDT, by a fresh agent (adversarial). Commit: f66a1b02 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | Two names for one item give one node, one version | no | partly | answers right on four databases (P10), but `bothRanges` pairs every alternative: two ranges of 3000 alternatives (70 KB) → heap out of memory |
| 8 | An alias never reveals a hidden item to a non-member | no | confirmed | P12 on four databases: the outsider's release → "@team/fmt is taken; pick another name.", one item named `fmt` |
| 17 | Nothing else pages or looks up by scope name alone | no | partly | paging fixed (P13, four databases), but `scopes.db.test.ts:290` still expects the old cursor `beta`, red on four databases |

**Overall:** not met: claims 5 and 17.

### Adversarial re-check 3

Witnessed: 2026-10-10 01:24 EDT, by a fresh agent (adversarial). Commit: f66a1b02 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | Two names for one item give one node, one version | no | partly | right answers on four databases (P10); 3000×3000 → null; but one 40,000-condition alternative with 64 short ones (590 KB, through core directly) builds a 37.7 MB range: resolve 6.1 s (20 versions) to 93 s (200) |
| 8 | An alias never reveals a hidden item to a non-member | no | confirmed | P12 on four databases: "@team/fmt is taken; pick another name.", one item named `fmt` |
| 17 | Nothing else pages or looks up by scope name alone | no | confirmed | P13 on four databases: sizes 1, 2, 3 page through all four scopes; old cursor `team` goes on past every `team`; odd cursors behave; 38/38 on the servers, 29/29 on SQLite |

**Overall:** not met: claim 5.

### Adversarial re-check 4

Witnessed: 2026-10-10 01:28 EDT, by a fresh agent (adversarial). Commit: f66a1b02 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | Two names for one item give one node, one version | no | confirmed | P10 on four databases: `^1.0.0 \|\| ^2.0.0` + `^2.0.0` → `no_matching_version`; `1.0.0 - 1.5.0` + `>=1.0.0` → 1.0.0; three spellings → 1.0.0; 9×8 alternatives → `resolve_conflict` (409); re-check 3's input → null; near-worst allowed range with 200 versions → 10 ms; the API's 256-character limit per range was already in HEAD |
| 8 | An alias never reveals a hidden item to a non-member | no | confirmed | P12 on four databases: "@team/fmt is taken; pick another name.", one item named `fmt` |
| 17 | Nothing else pages or looks up by scope name alone | no | confirmed | P13 on four databases; `pnpm test:db:{postgres,mysql,mariadb}` on scopes, old-names, both guards and the probe → 38/38 each; SQLite probe 3/3 |

**Overall:** met.

## Task 4 — Release and storage

Witnessed: 2026-10-10 01:38 EDT, by a fresh agent (blind). Commit: 5e2ad136 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A team item's packed `ronne.yaml` carries its full name | no | confirmed | old-names test (15 passed) unpacks and expects `name: "@acme/team/kit"`; `manifestNamed` as a no-op → the test fails |
| 2 | A `global` item's packed `ronne.yaml` carries `@scope/name` | no | partly | probe: `@team/lint`; `@global/team/gx # c` → `@team/gx # c`; no repository test checks the packed name |
| 3 | Dependencies are written under the dependency's current name | no | confirmed | test expects `"@acme/team/base": "^1.0.0"` and no `"@team/base"`; the no-op mutation fails it |
| 4 | New non-global versions are stored at `@<workspace>/<scope>/<name>/<version>.tgz` | no | confirmed | test expects `@acme/team/kit/1.0.0.tgz`; dropping the workspace fails it |
| 5 | `global`'s versions keep `<scope>/<name>/…` | no | confirmed | test expects `team/lint/1.0.0.tgz`; always prefixing fails it |
| 6 | Each version keeps its own path; nothing stored moves | no | confirmed | probe after a move: 1.0.0 at `team/base/1.0.0.tgz`, 1.1.0 at `@acme/team/base/1.1.0.tgz` |
| 7 | The resolver reads an old tarball's dependency names through aliases | no | confirmed | probe: `@team/kit` → `@acme/team/base` 1.0.0; dependencies read by item id |
| 8 | Release tests cover a `global` and a team item | no | partly | the global test checks only the path |
| 9 | A test shows an old tarball with an old name still installs | no | not met | no such test; the probe shows it works |
| 10 | Four databases; lint and typecheck clean | no | confirmed | 15/15 on each; 427 passed in submissions; biome and typecheck clean |

**Overall:** not met: claims 2, 8 and 9 need tests.

### Re-check 1

Witnessed: 2026-10-10 01:52 EDT, by a fresh agent (blind). Commit: 5e2ad136 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | A `global` item's packed `ronne.yaml` carries `@scope/name` | no | confirmed | old-names.db.test.ts:306-315 expects `name: "@team/lint"`; 317-346 `@global/team/gx # mine` → `@team/gx # mine`; `manifestNamed` as a no-op → 3 fail |
| 8 | Release tests cover a `global` and a team item | no | confirmed | global: path and packed name; team: path, name and dependency; 18 passed on SQLite and on `pnpm test:db:postgres` / `:mysql` / `:mariadb` |
| 9 | An old tarball with an old name still installs | no | confirmed | lines 348-374: resolve `@team/kit` → `@acme/team/base` 1.0.0; download by both names; the bytes still say `@team/base`; four databases |

**Overall:** met.

## Task 5 — `rmk` and MCP

Witnessed: 2026-10-10 01:56 EDT, by a fresh agent (blind). Commit: 4b9e6a02 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `rmk` and the MCP tools take both name forms wherever they take a name | no | partly | `update`/`remove @global/team/sk` → exit 2; `install @global/team/sk` adds a second key; `search --scope @acme/team` → `scope=acme/team`, nothing found; MCP descriptions say only "@scope/name" |
| 2 | `install` following an alias rewrites rmk.lock, state and rmk.config.json, and says so | no | confirmed | `pnpm --filter @ronneai/rmk test` → 248 passed, `install-renamed.test.ts` |
| 3 | Managed markers rewritten in the same apply, no file renamed | no | confirmed | probe: a command's marker `@team/sk@1.0.0` → `@acme/team/sk@1.0.0`, same path; no repository test |
| 4 | `update` following an alias rewrites | no | confirmed | probes `rmk update` and `rmk update @team/sk`; no repository test |
| 5 | `remove` works across a rename | no | partly | `rmk remove @acme/team/sk` before the rewrite → exit 2 (also `update`) |
| 6 | `outdated` reaching an item by an alias rewrites and says so | no | not met | `manage.ts:54-79` ignores `renamed`; `wanted: null`, no note, files unchanged |
| 7 | A version whose packed name is an old name is accepted | no | confirmed | `install-renamed.test.ts` installs a tarball saying `@team/fmt` as `@acme/team/fmt` |
| 8 | An old version's dependency by its old name still renders | no | confirmed | `resolve.ts:94-104`, `install.ts:336-339`, `skill-frontmatter.ts:117`; test passes |
| 9 | `POST /api/v1/resolve` answers `renamed` | no | confirmed | `pnpm test:db:{postgres,mysql,mariadb}` → 63/63; SQLite 17/17 |
| 10 | `rmk export --to @workspace/scope`, and the answer too | no | confirmed | `workspaces.test.ts` tests pass |
| 11 | `search` and `info` show full names | no | confirmed | they print the API's `name`, built with `formatItemName` |
| 12 | MCP plans and applies the rewrite end to end | no | confirmed | `pnpm --filter @ronneai/mcp test` → 51 passed |
| 13 | Current `rmk` and `rmk-mcp` send `x-rmk-names: workspace` | no | confirmed | `api.ts:93-98`; test passes |
| 14 | An old `rmk` gets 426 `client_too_old` for non-global items | no | confirmed | db test: getItem by old name, tarball, resolve → 426; with the header → 200; four databases; no getVersion test |
| 15 | An old `rmk` still works for global's items | no | partly | only an empty resolve and an unknown name tested |
| 16 | `docs/spec/cli-files.md` updated | no | confirmed | new bullet; no mention of markers |

**Overall:** not met: `outdated`, name forms in update/remove/install/search, and tests for markers, update and global items.

### Re-check 1

Witnessed: 2026-10-10 02:01 EDT, by a fresh agent (blind). Commit: 4b9e6a02 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both name forms wherever a name is taken | no | confirmed | probes: `install @global/team/sk` → one key `@team/sk`; `update`/`remove @global/team/sk` → exit 0; `search --scope @acme/team` → `scope=team&workspace=acme`; MCP descriptions name both forms |
| 3 | Markers rewritten in the same apply, no file renamed | no | confirmed | probe; `install-renamed.test.ts:184` checks an agent's marker; rmk 253 passed |
| 4 | `update` following an alias rewrites | no | confirmed | probes `update`, `update @team/sk`, `update @acme/team/sk` → note, lock/config/state `@acme/team/sk`; test `:251` |
| 5 | `remove` works across a rename, by any name | no | confirmed | probes `remove @team/sk`, `@acme/team/sk`, `@global/team/sk` → exit 0; `operations.ts:138-150`; tests `:251,261` |
| 6 | `outdated` reports the new name and writes nothing | no | partly | probe `rmk outdated --json` → `now`, `wanted: "1.0.0"`, note, files unchanged; MCP the same; but `SPEC.md:187` still says `outdated` rewrites |
| 14 | An old `rmk` gets 426 on item, version, tarball and resolve | no | confirmed | `private-api.db.test.ts` with `getVersion` → 12 passed on four databases |
| 15 | An old `rmk` still works for global's items | no | confirmed | "installs global's items as before": item, tarball, resolve → 200 on four databases |
| 16 | `docs/spec/cli-files.md` updated | no | confirmed | bullet at line 78: keys, rewrites with markers, `outdated` writes nothing |

**Overall:** not met: `SPEC.md:187`.

### Re-check 2

Witnessed: 2026-10-10 02:02 EDT, by a fresh agent (blind). Commit: 4b9e6a02 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both name forms wherever a name is taken | no | confirmed | probes after rebuilding: `@global/…` in install/update/remove; `--scope @acme/team` → `scope=team&workspace=acme`; `--workspace tools --scope @acme/team` → usage error, no request (`registry-commands.ts:77-84`, test `install-renamed.test.ts:275-290`); rmk 253, MCP 51 passed |
| 6 | `outdated` reports the new name, writes nothing, and the spec agrees | no | confirmed | probe `rmk outdated --json` → `now`, `wanted: "1.0.0"`, note, files unchanged; `SPEC.md:187-189` matches `:35-39` and `cli-files.md` |

**Overall:** met.

## Task 6 — Plugin feeds

Witnessed: 2026-10-10 02:13 EDT, by a fresh agent (blind). Commit: d443cff6 (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Plugin names `scope.name` in global, `workspace.scope.name` elsewhere; reversible; never `global.…` | no | confirmed | `plugins/names.ts:9-28`; `names.test.ts:10-16`; core plugins 33 passed |
| 2 | The feed lists a workspace item under the 3-part name with the workspace zip URL | no | confirmed | `plugin-feed.db.test.ts:289-295`; probe `pluginUrl` for acme and global |
| 3 | The server serves the workspace zip route; a non-member gets the unknown item's 404 | no | confirmed | the route file; `itemRefOf`; `private-feeds-api.db.test.ts:210-248` |
| 4 | Workspace zips stored under `feeds/<tool>/@<workspace>/…` | no | confirmed | `feed.ts:31-50`; probe keys; no repository test |
| 5 | `rmk feed build` fetches a workspace item's zip from the served path | no | confirmed | `feed-build.ts:203-214`; scratchpad probe; no repository test |
| 6 | A name over Codex's 64 characters is left out of Codex's feed with the warning | no | confirmed | `plugin-feed.ts:219-226`; test `:311-324`; breaking the warning fails it |
| 7 | An item renamed in the last 30 days says "Moved from <old>." | no | confirmed | `feed.ts:83-102`, `plugin-feed.ts:301-336`, `renamedSince`; setting it to null fails the test |
| 8 | The note goes after 30 days | no | confirmed | test at +31 days; a 3650-day window fails it |
| 9 | An old version naming a dependency by its old name still builds with it | no | confirmed | `build.ts:119-123`, `plugin-feed.ts:168-178`; without `oldNames` the test fails |
| 10 | `renamedSince` respects visibility | no | confirmed | guard test probe on four databases |
| 11 | The feed tests pass on the databases | no | confirmed | SQLite 52 passed; `pnpm test:db:postgres` / `:mysql` / `:mariadb` 41 each |
| 12 | `docs/spec/plugin-feeds.md` updated | no | confirmed | `:83-86`, `:105-109`, `:164` |
| 13 | Lint and typecheck clean on the changed code | no | confirmed | biome on 36 files; web `tsc --noEmit`; core typecheck; CLI `feed-build.test.ts` 13 passed |

**Overall:** met.

## Task 7 — Web app

Witnessed: 2026-10-10 02:59 EDT, by a fresh agent (blind). Commit: 80d0929b (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component tests pass | no | confirmed | web 1940 passed, 8 skipped; core 363 passed; lint and typecheck pass |
| 2 | A workspace's item page at `/workspaces/<ws>/items/<scope>/<name>`; global's unchanged | no | confirmed | the pages; `item-page.test.tsx:120-160`; the e2e reaches `/workspaces/e2e-twin/items/e2e-seeded/twin-notes` |
| 3 | An alias's address redirects, `/versions` and `?version=` kept; `/workspaces/global/…` → `/items/…` | no | confirmed | `load.ts:43-48`; tests |
| 4 | Every link to an item page carries the workspace | no | partly | `versionsPath` (`features/versions/links.ts`) and `actions.ts:60` drop it |
| 5 | Cards show full names; global keeps `@scope/name` | no | confirmed | `ItemCard.tsx`; `catalogue.test.tsx:264`; the e2e on chromium, phone, phone-webkit, tablet |
| 6 | Catalogue is current on a workspace's item pages | no | confirmed | `nav.ts` pattern; `AppShell.test.tsx` |
| 7 | The scope picker names and groups by workspace | no | partly | named and sorted, but one flat list with no headings; no test of the order |
| 8 | Admin › Scopes shows workspaces, allows same-named rows, edits the right scope | no | confirmed | Workspace column; `acme/infra` to `scopeRefFrom`; paging by `name:id` |
| 9 | A dependency through an alias passes with a warning carrying "Use the new name" | no | partly | the `rename` field isn't asserted |
| 10 | "Use the new name" rewrites the dependency | no | partly | `renameDependency` tested; duplicate key when both names are listed; CRLF lost; the editor step untested |
| 11 | The e2e creates `test/lint` in two workspaces and releases both | no | not met | the seed inserts both releases directly |
| 12 | The e2e installs each, on desktop | no | confirmed | `[chromium] workspace-names.e2e.ts` passed: `rmk install` of each full name |
| 13 | The e2e installs each, on phone | no | not met | the phone test lists and opens only |
| 14 | The full e2e suite is green | no | partly | 123 passed, 1 failed: `[phone-webkit] submit-problems.mobile.e2e.ts`, passes alone |

**Overall:** not met.

### Re-check 1

Witnessed: 2026-10-10 03:16 EDT, by a fresh agent (blind). Commit: 80d0929b (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Every link to an item page carries the workspace | no | confirmed | `versionsPath` through `itemPath`; `versions-page.test.tsx`; `actions.ts:61`; `tsc --noEmit` exit 0 |
| 7 | The scope picker names and groups by workspace | no | confirmed | headings per workspace in `NewDraftForm.tsx`; `submissions.test.tsx:457-460` checks the order |
| 9 | A dependency through an alias carries "Use the new name" | no | confirmed | `old-names.db.test.ts:279` asserts `rename`; 90 passed |
| 10 | "Use the new name" rewrites the dependency | no | confirmed | duplicate and CRLF handled; `manifest-yaml.test.ts`; probe `errors: []`; the click step read, both sides tested |
| 11 | (Done when as changed) desktop e2e lists, opens and installs two same-named items | no | confirmed | `[chromium] workspace-names.e2e.ts:18` passed: each `rmk.lock` has exactly its name |
| 13 | (Done when as changed) phone lists, opens and shows each install command | no | confirmed | phone, phone-webkit and tablet passed |
| 14 | The full e2e suite is green apart from failures that predate this work | no | partly | 122 passed, 2 failed: `submit-problems.mobile` (fails on `main` too) and `[phone] dependency-picker.mobile.e2e.ts:25` once (passes alone, 5/5 repeated) |

**Overall:** not met: claim 14.

### Re-check 2

Witnessed: 2026-10-10 03:24 EDT, by a fresh agent (blind). Commit: 80d0929b (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | The full e2e suite is green apart from failures that predate this work | no | confirmed | own `pnpm test:e2e` → 123 passed, 1 failed: `[phone-webkit] submit-problems.mobile.e2e.ts:5:1`, which fails on `main` too (`e2e-main.txt` line 219) and passes alone; `dependency-picker.mobile` passed on phone, phone-webkit and tablet |

**Overall:** met.

### Re-check 3

Witnessed: 2026-10-10 03:36 EDT, by a fresh agent (blind). Commit: 1faf899d (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | A workspace's item shows its workspace once, in its full name; a private one's keeps Private with a lock | no | confirmed | `WorkspaceLabel.tsx:16` renders only for a private workspace; catalogue and item-page tests (61 passed) assert `<h1>@acme/team/github</h1>` and no `acme · `; e2e private-workspaces, scopes and workspace-names → 11 passed on all projects; full suite 123 passed, 1 failed (`submit-problems.mobile`, fails on `main` too) |

**Overall:** met.

## Task 8 — Decision log and contracts

Witnessed: 2026-10-10 03:27 EDT, by a fresh agent (blind). Commit: 33a977fd (plus the uncommitted docs). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §3: full names, two segments mean `global` | no | confirmed | probe of `parseItemName`; `names.ts:87-99`; 13 passed |
| 2 | manifest.md `name`: `@global/…` released short; segment rules | no | confirmed | `canonicalItemName` probe; `ronne.schema.json:11`; `old-names.db.test.ts:318` |
| 3 | Releasing writes full names, dependencies under their name now | no | confirmed | `publish.ts:314-330`; `old-names.db.test.ts:266,349` |
| 4 | `agent:` may be a full name | no | confirmed | `package-checks.ts:247-250` |
| 5 | Scope names unique per workspace | no | confirmed | 0022 unique `(workspace_id, name)`; its db test |
| 6 | §15 Workspaces row | no | confirmed | `MVP.md:906`, `formatItemName` |
| 7 | 090 decision 2 marked reversed | no | confirmed | remark: the non-goal and Documentation lines still say names stay `@scope/name` |
| 8 | §15 Old names: install, resolve, redirect, find for who sees it; reserved; "taken" | no | confirmed | viewer-filtered alias lookup; redirect; errors; 18 passed |
| 9 | Old names kept when a scope moves or a workspace is renamed | no | partly | neither is built (113, 115 specified); only migration 0022 writes aliases |
| 10 | `/resolve` reads old names, `renamed` lists them | no | confirmed | `resolve.ts:56-64,95-106`; tests |
| 11 | Workspace item API paths | no | confirmed | routes under `api/v1/workspaces/[workspace]/items` |
| 12 | Workspace feed paths | no | confirmed | route; `private-feeds-api.db.test.ts:216` |
| 13 | `x-rmk-names` and `426 client_too_old` | no | confirmed | `cli/src/api.ts:97`; `registry-api.ts:49-66`; `private-api.db.test.ts:329` |
| 14 | API names are full names | no | confirmed | `registry-json.ts`; `private-api.db.test.ts:293` |
| 15 | Old rmk gets `client_too_old`; "Moved from" for 30 days | no | confirmed | `feed.ts:84,97`; `plugin-feed.ts:302-305` |
| 16 | `cli-files.md` and `plugin-feeds.md` agree | no | partly | both give moves and renames as current causes |
| 17 | Web tests behind the contracts pass | no | confirmed | 158 + 18 passed (SQLite) |

**Overall:** not met: claims 9 and 16.

### Re-check 1

Witnessed: 2026-10-10 03:28 EDT, by a fresh agent (blind). Commit: 33a977fd (plus the uncommitted docs). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | 090 SPEC: decision 2, its non-goal and its Documentation line point to 118 | no | confirmed | `090-workspaces/SPEC.md:37-39`, `:99`, `:122-124` |
| 9 | §15 Old names gives only today's cause, moves and renames once built | no | confirmed | `MVP.md:907`; only migration 0022 writes aliases |
| 16 | `cli-files.md` and `plugin-feeds.md` agree with the MVP text | no | confirmed | `cli-files.md:79-80`; `plugin-feeds.md:105-106` |

**Overall:** met.

## Task 9 — Documentation

Witnessed: 2026-10-10 03:38 EDT, by a fresh agent (blind). Commit: 1faf899d (plus the uncommitted working tree); ronne-web `docs/workspace-in-names` at 3235f81 plus its uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | ronne-web's checks pass | no | confirmed | lint, typecheck, 138 tests, build (102 pages) |
| 2 | The helper by Name links `scopes#names`; the helper link test passes | no | confirmed | help.test.tsx, submissions.test.tsx → 30 passed |
| 3 | scopes#what: the workspace first outside `global` | no | confirmed | `formatItemName`; en, pt, fr |
| 4 | scopes#names: unique per workspace; two parts mean `global`; `@global/…` read short | no | confirmed | 0022 unique index; `parseItemName`, `canonicalItemName` |
| 5 | Old names install, depend, open the page, can't be taken | no | confirmed | `load.ts:47-48`; `registry-checks.ts:67,231` |
| 6 | workspaces#what: full names and the workspace page address | no | confirmed | the route; `ItemPageView.tsx:53-58` |
| 7 | items: three-part names; Use the new name; release writes current names | no | confirmed | `registry-checks.ts:231-237`; `IssueList.tsx:80`; `publish.ts:311-330` |
| 8 | rmk#installing: full names in config and lock; `--scope @ws/scope`; old rmk told to update | no | confirmed | `registry-api.ts:45-65`; install-renamed tests |
| 9 | rmk#updating: install and update move names and print the Note; outdated only reads | no | confirmed | 12 passed (install-renamed, manage) |
| 10 | Plugin marketplaces → Names | no | partly | no Names section (text in What it is); "starts with Moved from" not so when deprecated |
| 11 | en, pt and fr say the same | no | confirmed | `git diff -U0` |
| 12 | The changed topics agree with the app elsewhere | no | partly | stale `Private · acme`, `@acme-infra/deploy isn't a published item.` and `no scope @acme-infra` examples |

**Overall:** not met: claims 10 and 12.

### Re-check 1

Witnessed: 2026-10-10 03:45 EDT, by a fresh agent (blind). Commit: 27f20de2 (plus the uncommitted working tree); ronne-web `docs/workspace-in-names` at 3235f81 plus its uncommitted diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | Plugin marketplaces → What it is: the workspace in plugin names; a moved item is a new plugin | no | confirmed | SPEC.md:176; en, pt, fr plugins#what match `pluginName` and `feed.ts:84-97` |
| 12 | The changed topics agree with the app elsewhere | no | confirmed | no stale names left (only export's `acme › @acme-infra`, as `export-command.ts:197` prints); `Private` matches WorkspaceLabel; ronne-web lint, typecheck, 138 tests, build pass |

**Overall:** met.
