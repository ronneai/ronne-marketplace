# 021 — Renderer interface and golden-file harness

> Milestone: M4 · Depends on: 011 · Design: [MVP §3.1–§3.3](../../MVP/MVP.md#33-platform-renderers), [§4.3](../../MVP/MVP.md#43-install--update) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md) §4–§5, [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

Each AI tool is one small module that turns a released item into that tool's files, without
touching the disk: it returns the changes to make, and `rmk` (022) applies them. This feature
defines that interface, the helpers every renderer shares, and a golden-file harness that shows,
for every example item, exactly what a renderer writes, so a change to any renderer is reviewed as
a file diff.

## Scope

**In:**
- The `PlatformRenderer` interface and the change types it returns, in `packages/core`.
- Shared helpers: the managed marker, fenced sections, the hashes `.rmk/state.json` stores, the
  canonical tool names (manifest spec §5), and env var references.
- The renderer registry (`RENDERERS`), which `rmk platforms` lists.
- The golden-file harness over `examples/items/`, and a small reference renderer that exercises it.

**Out:**
- Real renderers: Claude Code → 023; Codex, Cursor → 024, 025; tier 2 → 028–030.
- Applying changes to disk, the state file, conflicts and `--force` → 022.

## Behaviour

**The interface.** Pure functions of their input; no file system, network or clock.

```ts
interface PlatformRenderer {
  id: string;                           // "claude-code", "codex", …, the manifest's `targets` keys
  name: string;                         // "Claude Code"
  version: string;                      // bumped when its output changes (MVP §3.3)
  /** Whether the project looks like it uses this tool: paths it checks through `probe`. */
  detect(probe: ProjectProbe): Promise<boolean>;
  /** How well it supports a type; `none` makes rmk warn and skip (MVP §3.3). */
  supports(type: ItemType): "native" | "degraded" | "none";
  /** What installing one item writes. */
  render(item: RenderInput, context: RenderContext): RenderResult;
}

type RenderInput = {
  name: string;                         // "@platform/secure-coding"
  version: string;
  manifest: Manifest;                   // as released
  files: PackageFile[];                 // the artifact's files, unpacked (011)
};
type RenderContext = { scope: "project" | "user" };
type RenderResult = { changes: Change[]; warnings: RenderWarning[] };
```

Removal needs no renderer method: `.rmk/state.json` records every change rmk made, so 022 removes
exactly those.

**Changes** mirror the state file's `kind`s (cli-files.md), with paths relative to the project root
(or home folder for user scope) and always `/`:

| Change | Carries |
|---|---|
| `file` | path, content (bytes or text), `executable` |
| `dir` | path, and its files (relative path, content, `executable`) |
| `json-key` | path, key path, value |
| `toml-key` | path, key path, value |
| `json-array-item` | path, the array's key path, the element (hooks and permission rules, 023) |
| `section` | path (a Markdown file), the item's name as the key, text |

A change that several targets make identically (`.agents/skills/<n>/` for Codex and Cursor) is
written once; 022 merges equal changes and records every target on one state entry.

**Shared helpers** (`packages/core/src/render/`):
- `managedMarker(item, version, syntax)`: the `managed by rmk: @scope/name@1.4.0` comment in each
  comment syntax (`<!-- -->`, `#`, `//`), for files that allow comments.
- `section(item, text)`: the `rmk:begin` / `rmk:end` fence for shared Markdown files.
- `stateHash(change)`: what `.rmk/state.json` stores for each kind: the file's bytes, a hash of a
  folder's sorted paths and file hashes, the canonical JSON of a key's value or an array element,
  the text between fences. Canonical JSON sorts keys and has no whitespace.
- `toolName(canonical, table)`: maps `read`, `shell`, `mcp:<server>/<tool>` … through a renderer's
  table, and reports a name it can't map as a warning rather than failing.
- `envRef(name, syntax)`: a reference to an environment variable, in each tool's syntax
  (`${GITHUB_TOKEN}` and others), so no secret value is ever written (MVP §4.3).
- `targetsFor(manifest, rendererId)`: honours the manifest's `targets.<id>.enabled`, and hands
  `overrides` to the renderer, which validates them.

**Warnings** have a stable `code` and a message: `unsupported_type`, `unsupported_field` (a field
the tool can't express), `unmapped_tool`, `invalid_override`, `disabled_by_manifest`. `rmk` prints
them and carries on (MVP §3.3).

**The golden-file harness.** For every renderer and every item in `examples/items/`, in both scopes,
the harness renders the item and compares the result with files under
`packages/core/src/render/<renderer>/__golden__/<item>/<scope>/`: each change as a file (JSON keys
as a small JSON document naming the target file and key path), plus `warnings.json`. A difference
fails the test and prints a diff. `UPDATE_GOLDEN=1` rewrites them, so a renderer change shows up in
review as a change to its golden files.

**The reference renderer** (`example`, not in `RENDERERS`) writes each item type in a different
change kind, so the harness and the helpers are tested before any real renderer exists.

## Edge cases

- **An item whose type a renderer doesn't support:** no changes, one `unsupported_type` warning.
- **Binary files in a skill:** carried as bytes, and hashed as bytes.
- **Two items writing the same JSON key:** a render error names both; renderers key JSON entries by
  item name (for example `mcpServers.<name>`), so it only happens with a bug.
- **A path that would leave the project folder:** refused by the helpers (`..`, absolute paths).

## Documentation

None in the app: the renderer interface and the harness are for people building Ronne, and change
nothing people see or do. They're documented in this spec and in `packages/core`'s code. What each
tool gets from an item is documented by each renderer's feature (023 for Claude Code).

## Acceptance criteria

- [x] `PlatformRenderer`, the change types, warnings and helpers are exported from `packages/core`, with unit tests for each helper.
- [x] The harness renders every example item with the reference renderer in both scopes, and fails with a readable diff when output changes; `UPDATE_GOLDEN=1` rewrites the golden files.
- [x] `RENDERERS` lists the renderers with their ids, names, versions and supported types, for `rmk platforms`.
- [x] Renderers can't write outside the project (or home) folder.

## Open questions

The owner started 021 (2026-09-28) without answering these, so it's built on the recommendations;
either can still change.

1. **Golden files live next to each renderer** in `packages/core` (recommended: a renderer and its
   expected output change together), or in one top-level `golden/` folder.
2. **Renderers stay in `packages/core`** (recommended for the MVP: one package, and the web app's
   support matrix, 026, reads `supports()`), or each is its own package so the community can publish
   renderers separately.
