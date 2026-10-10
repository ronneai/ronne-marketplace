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
