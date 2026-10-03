# rmk

`rmk` installs items from a [Ronne AI Marketplace](https://github.com/ronneai/ronne-marketplace)
into your AI coding tools: skills, agents, rules, commands, hooks, MCP servers and more, reviewed
before release. It writes each tool's own files (Claude Code, Codex and Cursor), records what it
wrote in a lockfile and a state file, and never overwrites a file or setting you made by hand.

```sh
npm install --global @ronneai/rmk
rmk login --registry https://your-marketplace.example
rmk search review
rmk install @platform/code-reviewer
rmk update
```

Commands: `login`, `logout`, `whoami`, `auth headers`, `search`, `info`, `list`, `platforms`,
`install`, `update`, `outdated`, `remove`, `mcp-setup`, `plugin-setup`, `export`, `submit` and
`telemetry`. `rmk --help` lists them, and `--json` makes any of
them answer with one JSON object.

To manage items from inside your AI tool instead, install the registry MCP server,
[`@ronneai/mcp`](https://www.npmjs.com/package/@ronneai/mcp), and run `rmk mcp-setup`.

To install items as Claude Code plugins, from `/plugin`, run `rmk plugin-setup claude-code` once.

Your marketplace's Documentation (Docs → Installing with rmk) explains the commands, the files
`rmk` writes, and each AI tool. Needs Node.js 22.12 or later. MIT licensed.
