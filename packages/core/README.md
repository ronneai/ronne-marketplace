# @ronneai/core

The shared core of [Ronne AI Marketplace](https://github.com/ronneai/ronne-marketplace): the
`ronne.yaml` manifest schema and validation, the version resolver, the package format, and the
renderers that turn an item into each AI tool's own files (Claude Code, Codex, Cursor).

It's what [`rmk`](https://www.npmjs.com/package/@ronneai/rmk) and the registry MCP server are
built on. Entry points: `@ronneai/core`, `@ronneai/core/pack`, `@ronneai/core/plugins`, `@ronneai/core/render` and
`@ronneai/core/schema.json`. Its API follows the marketplace's releases and may change while the
version is 0.x.

Needs Node.js 22.12 or later. MIT licensed.
