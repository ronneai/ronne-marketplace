# CLI files spec

> Status: draft · Part of the [MVP](../MVP/MVP.md) (§4.3, §6, §7)

The files `rmk` reads and writes. All are JSON, UTF-8, with sorted keys and a trailing newline, so
diffs stay small and stable. Each has a `version` field so the format can change later.

| File | Where | Committed? | Written by |
|---|---|:-:|---|
| `rmk.config.json` | project root | ✅ | the user (or `rmk init`) |
| `rmk.lock` | project root | ✅ | `install`, `update`, `remove` |
| `.rmk/state.json` | project root | ✅ | `install`, `update`, `remove` |
| `~/.config/rmk/config.json` | home | — | `login`, `logout` (mode `0600`) |
| `~/.config/rmk/user.lock` | home | — | user-scope installs |
| `~/.config/rmk/user-state.json` | home | — | user-scope installs |

The lockfile and state file are committed together, because a team shares the rendered files too.
Without the state file, a teammate's `rmk` couldn't tell which keys in `.claude/settings.json` it owns.

## `rmk.config.json`

Project settings. Optional: without it, rmk uses the default registry from the user config and detects targets.

```json
{
  "version": 1,
  "registry": "https://ronne.example.internal",
  "targets": ["claude-code", "codex"],
  "dependencies": {
    "@platform/code-reviewer": "^1.4.0",
    "@platform/secure-coding": "latest"
  }
}
```

- `targets`: the renderers to use. If absent, rmk runs each renderer's `detect()` and asks when
  none or several match. `--target` on the command line overrides it.
- `dependencies`: what the user asked for directly. `rmk install <item>` adds to it and `rmk remove`
  removes from it. A value can be a range or a dist-tag. A dist-tag is resolved at install time and
  the result is pinned in the lockfile.

## `rmk.lock`

The resolved, flat set. `rmk install` with no arguments installs exactly this.

```json
{
  "version": 1,
  "registry": "https://ronne.example.internal",
  "items": {
    "@platform/code-reviewer": {
      "version": "1.4.0",
      "type": "agent",
      "sha256": "9f2c…",
      "dependencies": {
        "@platform/github-mcp": "1.1.3",
        "@platform/secure-coding": "2.3.0"
      }
    },
    "@platform/github-mcp": {
      "version": "1.1.3",
      "type": "mcp-server",
      "sha256": "41aa…"
    },
    "@platform/secure-coding": {
      "version": "2.3.0",
      "type": "skill",
      "sha256": "c07e…"
    }
  }
}
```

- One entry per item (one version per item, MVP §4.3). `dependencies` maps to the pinned versions chosen.
- The tarball URL isn't stored. It comes from the registry and the name and version, so a registry can move without changing lockfiles.
- rmk fails if a download's sha256 doesn't match the lockfile.

## `.rmk/state.json`

What rmk wrote, so it can update or remove it without touching anything else (MVP §3.3).

```json
{
  "version": 1,
  "entries": [
    {
      "item": "@platform/secure-coding",
      "version": "2.3.0",
      "targets": ["claude-code"],
      "kind": "dir",
      "path": ".claude/skills/secure-coding",
      "sha256": "…"
    },
    {
      "item": "@platform/github-mcp",
      "version": "1.1.3",
      "targets": ["claude-code"],
      "kind": "json-key",
      "path": ".mcp.json",
      "key": ["mcpServers", "github-mcp"],
      "sha256": "…"
    },
    {
      "item": "@platform/house-style",
      "version": "1.0.0",
      "targets": ["codex"],
      "kind": "section",
      "path": "AGENTS.md",
      "key": ["@platform/house-style"],
      "sha256": "…"
    }
  ]
}
```

| `kind` | Meaning | `sha256` covers |
|---|---|---|
| `file` | A whole file rmk created | the file's bytes |
| `dir` | A whole folder rmk created (skills) | a hash of the sorted file paths and their hashes |
| `json-key` | One key path inside a JSON file | the canonical JSON of the value at `key` |
| `toml-key` | One key path inside a TOML file | the canonical JSON of the value at `key` |
| `json-array-item` | One element of the array at `key` in a JSON file, such as a Claude Code hook or permission rule ([023](../features/023-claude-code-renderer/SPEC.md)) | the canonical JSON of the element, which is how rmk finds it again |
| `section` | A fenced `rmk:begin` / `rmk:end` block in a Markdown file | the text between the fences |

- Paths are relative to the project root (or the home folder for user scope) and always use `/`.
- One rendered file shared by several targets (for example `.agents/skills/<n>/` for Codex and
  Cursor) is one entry, and `targets` lists every renderer that uses it. The entry is removed only
  when no target needs it any more.
- **Before changing an entry**, rmk hashes what is on disk now. If the hash differs from the state
  file, the user edited it: rmk reports a conflict and skips that entry unless `--force` is given.
- **If an entry's file or key is missing**, rmk treats it as removed by the user, drops the entry
  and re-renders it only on `install` or `update`.
- When the last entry that uses a key's parent object is removed, the parent is removed too if it
  is empty and rmk created it.

## `~/.config/rmk/config.json`

```json
{
  "version": 1,
  "defaultRegistry": "https://ronne.example.internal",
  "registries": {
    "https://ronne.example.internal": {
      "token": "rmk_…",
      "email": "dev@example.com"
    }
  }
}
```

- Created with mode `0600`. rmk warns and refuses to read it if it's readable by other users.
- The `RMK_TOKEN` and `RMK_REGISTRY` env vars override the file, for CI.
- The file holds only rmk's own token. Secrets for MCP servers are never stored (MVP §4.3).

## User scope

`--scope user` uses the same formats with home-folder paths: `~/.config/rmk/user.lock` and
`~/.config/rmk/user-state.json`, and renderers write to each platform's user-level folders
(for example `~/.claude/skills/`). There is no user-level `rmk.config.json`; direct dependencies
are kept in `user.lock` under a top-level `dependencies` field.
