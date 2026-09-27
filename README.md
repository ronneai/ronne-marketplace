# Ronne AI Marketplace

An open-source, self-hosted, curated registry of AI capabilities: skills, agents, rules, commands,
hooks, MCP servers and more. A team installs it on its own infrastructure, proposes items, reviews
and releases them, and installs them into AI coding tools such as Claude Code, Codex and Cursor with
the `rmk` CLI or from inside those tools through an MCP server.

> **Status:** early development (milestone M0). Nothing is usable yet. The design is in
> [`docs/MVP/MVP.md`](docs/MVP/MVP.md), and progress is tracked in [`docs/features/`](docs/features/README.md).

## Development

**Requirements**

- Node.js 24 LTS (see [`.nvmrc`](.nvmrc)). Node.js 22.12 or later also works.
- pnpm. Install it directly with `npm install --global pnpm`; it then switches to the version pinned
  in `package.json` (`packageManager`) on its own. Don't use Corepack: current Corepack releases
  can't start pnpm 12. If `pnpm` is a Corepack shim on your machine, run `corepack disable pnpm` first.

**Commands**

| Command | What it does |
|---|---|
| `pnpm install` | Installs dependencies, with the supply-chain checks in `pnpm-workspace.yaml` |
| `pnpm dev` | Runs the web app at http://localhost:3000 |
| `pnpm build` | Builds every package and the web app |
| `pnpm lint` | Checks lint and formatting with Biome |
| `pnpm format` | Fixes formatting and safe lint issues |
| `pnpm typecheck` | Type-checks every package |
| `pnpm test` | Runs every test with Vitest |
| `pnpm hooks:install` | Turns on the local commit-message check (once per clone) |
| `pnpm exec rmk --version` | Runs the local `rmk` CLI (after `pnpm build`) |

**Layout**

| Path | What it holds |
|---|---|
| `apps/web` | The Next.js app: UI, server actions and the `/api/v1` registry API |
| `packages/core` | Manifest schema, resolver, packer and platform renderers |
| `packages/cli` | The `rmk` CLI |
| `packages/mcp` | The registry MCP server |
| `packages/config` | Shared TypeScript, Biome and Vitest presets |
| `packages/repo-tools` | Checks for this repository, such as the commit message format |
| `docs/` | The MVP design, specs, feature plans and policies |
| `examples/items/` | One sample item of each type |

## Contributing

Commits and pull request titles use `[type] NNN: Description`, where `type` is `docs`, `feat`,
`chore` or `bugfix` and `NNN` is the feature ID (left out, as `[type]: Description`, when the change
isn't part of a feature). Run `pnpm hooks:install` once to check commit messages locally; CI checks
pull request titles.


Work is organised as features in [`docs/features/`](docs/features/README.md): read a feature's
`SPEC.md`, then follow its `PLAN.md`. Every new dependency must follow the
[dependency policy](docs/policies/dependencies.md): free and redistributable licenses only, the
latest stable or LTS versions, and no known vulnerabilities.

## License

[MIT](LICENSE)
