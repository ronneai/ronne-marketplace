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

- [ ] **2. The harness and the reference renderer.** Rendering every example item in both scopes,
  comparing with golden files, and `UPDATE_GOLDEN=1`.
  *Done when:* the reference renderer's golden files are committed, and a test proves the harness
  fails on a changed output.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 021 without answering the
  spec's open questions: golden files live next to each renderer, and renderers stay in
  `packages/core`.
- **Task 1 (2026-09-28): the interface and helpers.** `@ronneai/core/render`: `PlatformRenderer`
  (`detect` takes a `ProjectProbe` with `exists(path)`), the six change kinds including
  `json-array-item` (023), warnings, `RENDERERS` (empty until 023) and `rendererById`. Helpers:
  `managedMarker` (html, hash, slashes), `section`, `canonicalJson`, `stateHash` (async, over
  core's `sha256Hex`), `toolName` over a `ToolTable` (`names` plus an `mcp` function), `envRef`
  (`$VAR` or `${VAR}`), `targetsFor`, `disabledWarning`, `pathProblem` and `changePaths`.
