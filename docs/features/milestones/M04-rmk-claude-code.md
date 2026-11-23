# M4 — `rmk` + Claude Code

> [All milestones](README.md) · [Features index](../README.md)

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [019](../cli-api/019-registry-read-api/SPEC.md) | Registry read API (`/api/v1` items, versions, tarball with download count, errors, pagination) | 009, 015, 018 | done |
| [020](../cli-api/020-resolver/SPEC.md) | Resolver in `packages/core`, and `POST /api/v1/resolve` | 011, 019 | done |
| [021](../renderers/021-renderer-harness/SPEC.md) | Renderer interface and golden-file test harness | 011 | done |
| [022](../cli-api/022-rmk-cli/SPEC.md) | `rmk` CLI: login, search, info, install, update, remove, outdated; lockfile and state file | 019, 020, 021 | done |
| [023](../renderers/023-claude-code-renderer/SPEC.md) | Claude Code renderer, every item type | 021 | done |
