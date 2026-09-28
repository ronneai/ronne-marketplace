# Example items

One sample item for every type in the [manifest spec](../../docs/spec/manifest.md). They are used as:

- inputs for the renderers' golden-file tests (M4, M5);
- seed data for local development;
- reference material for authors.

All of them use the `@examples` scope. Every `ronne.yaml` here must pass
[`ronne.schema.json`](../../packages/core/src/schema/ronne.schema.json).

| Item | Type | Shows |
|---|---|---|
| [`secure-coding`](./secure-coding/) | skill | An Agent Skills folder with `SKILL.md` |
| [`code-reviewer`](./code-reviewer/) | agent | Tools, a model hint, dependencies and a target opt-out |
| [`house-style`](./house-style/) | rule | Glob activation |
| [`review-diff`](./review-diff/) | command | Arguments |
| [`format-on-edit`](./format-on-edit/) | hook | A canonical event and tool matcher |
| [`github-mcp`](./github-mcp/) | mcp-server | HTTP transport with a secret env var |
| [`safe-git`](./safe-git/) | permission-policy | ask / deny rules |
| [`concise`](./concise/) | output-style | Claude Code only |
| [`git-branch`](./git-branch/) | statusline | A script |
| [`typescript-lsp`](./typescript-lsp/) | lsp-server | Languages and extensions |
| [`starter-kit`](./starter-kit/) | bundle | Dependencies only |
