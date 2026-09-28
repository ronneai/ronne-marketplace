# 021 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The interface and helpers.** `PlatformRenderer`, changes, warnings, `RENDERERS`, and the
  shared helpers.
  *Done when:* unit tests cover the marker in each syntax, sections, every `stateHash` kind,
  canonical JSON, tool-name mapping and its warning, env references, `targets` handling, and refused
  paths.

- [ ] **2. The harness and the reference renderer.** Rendering every example item in both scopes,
  comparing with golden files, and `UPDATE_GOLDEN=1`.
  *Done when:* the reference renderer's golden files are committed, and a test proves the harness
  fails on a changed output.

## Notes
