# 021 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The interface and helpers.** `PlatformRenderer`, changes, warnings, `RENDERERS`, and the
  shared helpers.
  *Done when:* unit tests cover the marker in each syntax, sections, every `stateHash` kind,
  canonical JSON, tool-name mapping and its warning, env references, `targets` handling, and refused
  paths.

- [x] **2. The harness and the reference renderer.** Rendering every example item in both scopes,
  comparing with golden files, and `UPDATE_GOLDEN=1`.
  *Done when:* the reference renderer's golden files are committed, and a test proves the harness
  fails on a changed output.

## Notes
- **Open questions (2026-09-28).** Built on the recommendations, then confirmed by the owner:
  golden files live next to each renderer, and renderers stay in `packages/core`.
- **Task 1 (2026-09-28): the interface and helpers.** `@ronneai/core/render`: `PlatformRenderer`
  (`detect` takes a `ProjectProbe` with `exists(path)`), the six change kinds including
  `json-array-item` (023), warnings, `RENDERERS` (empty until 023) and `rendererById`. Helpers:
  `managedMarker` (html, hash, slashes), `section`, `canonicalJson`, `stateHash` (async, over
  core's `sha256Hex`), `toolName` over a `ToolTable` (`names` plus an `mcp` function), `envRef`
  (`$VAR` or `${VAR}`), `targetsFor`, `disabledWarning`, `pathProblem` and `changePaths`.
- **Task 2 (2026-09-28): the harness and the reference renderer.** `render/harness.ts` (Node only,
  imported by tests, not exported from `@ronneai/core/render`): `loadItemDir` reads an item folder
  as a `RenderInput`; `goldenFiles` lays a result out as `changes.json` (every change's kind, path,
  key and executable bits, in order), `warnings.json`, file and folder contents under `files/`,
  and each key, array item or section under `keys/NN-<kind>`; `checkGolden` renders every example
  item in both scopes, refuses a path that leaves the folder, and returns the differences (missing,
  differs, unexpected) or rewrites the files with `UPDATE_GOLDEN=1`. `render/example/renderer.ts`
  is the reference renderer, each type through a different change kind, with 74 golden files under
  `render/example/__golden__/`. Biome skips `**/__golden__`: generated fixtures stay byte-exact.
- **Sections carry the body (2026-09-28, from 022).** A `section` change's `text` is the body
  between the fences, and rmk adds the fences when it writes; `stateHash` hashes the body with
  one trailing newline. Building the applier showed the fenced text and the state file's
  "text between the fences" couldn't otherwise hash the same. The example renderer's golden files
  changed accordingly.
