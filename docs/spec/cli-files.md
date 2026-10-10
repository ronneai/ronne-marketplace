# CLI files spec

> Status: draft · Part of the [MVP](../MVP/MVP.md) (§4.3, §6, §7)

The files `rmk` reads and writes. All are JSON, UTF-8, with sorted keys and a trailing newline, so
diffs stay small and stable. Each has a `version` field so the format can change later.

| File | Where | Committed? | Written by |
|---|---|:-:|---|
| `rmk.config.json` | project root | ✅ | the user (or `rmk init`), `install` |
| `rmk.lock` | project root | ✅ | `install`, `update`, `remove` |
| `.rmk/state.json` | project root | ✅ | `install`, `update`, `remove` |
| `~/.config/rmk/config.json` | home | — | `login`, `logout` (mode `0600`) |
| `~/.config/rmk/user.lock` | home | — | user-scope installs |
| `~/.config/rmk/user-state.json` | home | — | user-scope installs, `rmk mcp-setup --scope user`, and the usage hooks (046) |
| `~/.cache/rmk/usage/` | home | — | usage reporting (046): one queue per registry and `state.json` |

The lockfile and state file are committed together, because a team shares the rendered files too.
Without the state file, a teammate's `rmk` couldn't tell which keys in `.claude/settings.json` it owns.

## `rmk.config.json`

Project settings. Optional: without it, rmk uses the lockfile's registry or the default one from the user config, and detects targets.

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

- `registry`: the registry this project uses. `rmk install` writes it when it's missing, and
  replaces it when `--registry` is given (the lockfile follows). See [Which registry](#which-registry).
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
- Items are keyed by their full name: `@scope/name` in `global`, `@workspace/scope/name` in any
  other workspace (118). When the registry answers that an item has a new name (its scope moved, or
  its workspace was renamed), `rmk install` and `update` rewrite the entry, the project's
  `dependencies`, the state file's entries and the managed markers to the new name in the same
  apply, and say so; `rmk outdated` says the new name and writes nothing. An old name keeps
  working until then: the registry reads it as the item's name now.
- The tarball URL isn't stored. It comes from the registry and the name and version, so a registry can move without changing lockfiles.
- rmk fails if a download's sha256 doesn't match the lockfile: when an item resolves to the version
  the lockfile already holds, the registry's sha256 for it must be the lockfile's, on `install`,
  `update` and `remove` alike, or rmk stops with `checksum_mismatch` before downloading or writing
  anything (a released version never changes). Accepting other bytes for a version is deliberate:
  remove the item from `rmk.lock` and run again.

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
- **rmk only touches paths inside that folder** (2026-10-05). The file is committed, so anyone
  with a commit can edit it: an entry (or a rendered change) whose path is absolute, has a drive
  letter or `\`, or a `..`, `.` or empty segment stops `install`, `update` and `remove` with
  `unsafe_path`, before anything is written, `--force` or not. In project scope the real path
  must stay in the project too, so a committed symbolic link (`.claude` or `.rmk` pointing
  elsewhere, or a link to nothing) stops it the same way. In user scope a linked folder (a dotfiles
  `~/.claude`) is allowed: that state file is rmk's own. Each change and removal checks its path
  again just before it's written.
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
  },
  "telemetry": { "enabled": false, "decidedAt": "2026-10-05T12:00:00.000Z" }
}
```

- Created with mode `0600`. rmk warns and refuses to read it if it's readable by other users.
- `registries` holds a token per registry URL, so one machine can be logged in to several.
- `defaultRegistry` is the first registry logged in to, or the last one named with
  `rmk login --registry`. A login through `RMK_REGISTRY` or a project's registry doesn't change it.
- The `RMK_TOKEN` and `RMK_REGISTRY` env vars override the file, for CI.
- The file holds only rmk's own token. Secrets for MCP servers are never stored (MVP §4.3).
- `telemetry` is the person's `rmk telemetry on|off`. It only counts where a registry's usage policy
  lets people choose; absent means on there ([046](../features/046-usage-telemetry/SPEC.md)).

## Which registry

Every command, and the registry MCP server, talks to the first registry it finds:

1. `--registry <url>`;
2. `RMK_REGISTRY`;
3. the project's, in the current folder: `registry` in `rmk.config.json`, else in `rmk.lock`
   (skipped by `install`, `update`, `outdated` and `remove` with `--scope user`);
4. `defaultRegistry` in `~/.config/rmk/config.json`.

The token is `RMK_TOKEN`, else the one saved for that registry. `RMK_TOKEN` goes only to a
registry the person chose (2026-10-05): one from `--registry`, `RMK_REGISTRY` or the default, or
one they logged in to. A registry only the project names (3., files anyone with a commit can edit)
never gets it: a command that needs a token stops with `token_withheld`, saying to set
`RMK_REGISTRY` to it too, or to log in to it. A token saved for that registry is used as usual.
`rmk whoami` says which registry it used and where it came from. URLs are compared without
trailing slashes.

## `~/.cache/rmk/usage/`

Usage reporting (046). Nothing here is needed to install anything; deleting the folder loses only
counts not sent yet.

- `<sha256 of the registry, 16 hex>.jsonl`: the queue for one registry, one usage line per line
  (`{ day, item, version, tool, event, trigger?, outcome?, count }`), appended by commands and by
  the tools' hooks. Lines older than 3 days and anything past 1 MB (oldest first) are dropped when
  it's read.
- `state.json`: per registry, its usage policy and when it was checked, which policy's notice was
  printed, and the last send and send attempt.
- The usage hooks themselves are entries in each tool's user-level settings, recorded in
  `user-state.json` under the item name `rmk telemetry`.

## User scope

`--scope user` uses the same formats with home-folder paths: `~/.config/rmk/user.lock` and
`~/.config/rmk/user-state.json`, and renderers write to each platform's user-level folders
(for example `~/.claude/skills/`). There is no user-level `rmk.config.json`; direct dependencies
are kept in `user.lock` under a top-level `dependencies` field.
