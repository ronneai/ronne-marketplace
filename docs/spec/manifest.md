# Manifest spec — `ronne.yaml`

> Status: draft · Part of the [MVP](../MVP/MVP.md) (§3) · Machine-readable form: [`ronne.schema.json`](../../packages/core/src/schema/ronne.schema.json) (in `packages/core`, published as `@ronneai/core/schema.json`)
> · Samples of every type: [`examples/items/`](../../examples/items/)

Every item version is a folder with a `ronne.yaml` at its root plus the files it lists. The manifest
is platform-neutral. Renderers in `packages/core` turn it into each AI tool's own files at install
time (MVP §3.3).

## 1. Common fields

| Field | Required | Type | Notes |
|---|:-:|---|---|
| `name` | ✅ | string | `@scope/name`. Scope and name are lowercase `a-z`, `0-9` and `-`, 1–64 characters each, and can't start or end with `-`. |
| `type` | ✅ | enum | One of the types in §2. Fixed when the item is first created. |
| `version` | — | semver | **Set by the release process.** Authors leave it out; it is ignored in drafts and filled in when the tarball is packed. |
| `description` | ✅ | string | One or two sentences, max 300 characters. Shown in search results and used by AI tools to decide when to load the item. |
| `license` | — | SPDX id | Defaults to the instance's default license (MIT). |
| `keywords` | — | string[] | Max 10, lowercase. Used by search. |
| `readme` | — | path | Defaults to `README.md` if present. Shown on the item page. |
| `files` | — | path[] | Files included in the package. Defaults to every file in the folder except `.ronne/`. Paths are relative, use `/`, and can't contain `..`. |
| `dependencies` | — | map | `"@scope/name": "<semver range>"`. Only allowed for the types listed in §3. |
| `targets` | — | map | Per-platform settings, see §4. |
| `<type block>` | depends | object | Settings for the item's type, under a key named after the type (for example `agent:`). §2 lists what each type needs. |

Unknown top-level fields are rejected, so typos fail validation instead of being ignored.

## 2. Type blocks

### `skill`

A folder following the [Agent Skills](https://agentskills.io/specification) standard. The item
folder **is** the skill folder.

```yaml
skill:
  entry: SKILL.md        # default; must exist
```

- `SKILL.md` frontmatter must have `name` and `description`. `name` must equal the item's name
  without the scope, because renderers name the output folder after it.
- Scripts and resources next to `SKILL.md` are copied as they are. Executable scripts raise a risk
  flag in review.

### `agent`

```yaml
agent:
  prompt: prompt.md      # system prompt, Markdown
  tools: [read, grep, glob, shell]   # canonical tool names, see §5; omitted = platform default
  model: default         # default | fast | strong — a hint, mapped per platform
```

Skills, MCP servers, hooks, rules and commands the agent uses go in `dependencies`.

### `rule`

```yaml
rule:
  body: rule.md
  activation: glob       # always | glob | model | manual
  globs: ["src/**/*.ts"] # required when activation is glob
```

For `model` activation, the item's `description` tells the AI when to apply the rule.

### `command`

```yaml
command:
  body: command.md       # prompt template; $ARGUMENTS or {{name}} placeholders
  args:
    - name: target
      description: File or folder to review
      required: false
```

Renderers use each platform's placeholder syntax. Platforms without commands get it rendered as a skill.

### `hook`

```yaml
hook:
  event: tool.after      # canonical event, see MVP §3.1
  matcher:
    tool: edit           # canonical tool name; omitted = every tool
  run:
    command: "npx biome format --write $RMK_FILE_PATHS"   # or: script: format.sh
  timeout: 30            # seconds, default 60
```

- Exactly one of `run.command` or `run.script`.
- Renderers expose the event's data through the platform's own mechanism (stdin JSON or env vars).
  `$RMK_FILE_PATHS` and similar canonical variables are documented per renderer.
- Always a risk flag in review.

### `mcp-server`

```yaml
mcp-server:
  transport: stdio       # stdio | http
  command: npx           # stdio only
  args: ["-y", "@modelcontextprotocol/server-github"]
  url:                   # http only
  env:
    - name: GITHUB_TOKEN
      description: A token with repo read access
      required: true
      secret: true
  headers:               # http only; values may reference env vars
    Authorization: "Bearer ${GITHUB_TOKEN}"
```

- Only env var **names** are allowed. Literal values that look like secrets fail validation.
- The server's key in platform configs is the item's name without the scope.
- Always a risk flag in review.

### `permission-policy`

```yaml
permission-policy:
  rules:
    - tool: shell
      pattern: "git push*"
      decision: ask      # allow | ask | deny
    - tool: web-fetch
      decision: deny
```

A policy that contains any `allow` raises a **widening** risk flag in review.

### `output-style`

```yaml
output-style:
  body: style.md
```

### `statusline`

```yaml
statusline:
  script: statusline.sh
```

The script reads the platform's status JSON from stdin and prints one line. Always a risk flag.

### `lsp-server`

```yaml
lsp-server:
  command: typescript-language-server
  args: ["--stdio"]
  languages:
    - id: typescript
      extensions: [".ts", ".tsx"]
```

Always a risk flag, because it runs a command.

### `bundle`

No type block. A bundle is a `name`, `description` and `dependencies`. The visual composer edits bundles and agents.

## 3. Dependencies

Any item may depend on any item, of any type ([096](../features/096-any-dependency/SPEC.md),
owner 2026-10-05): a skill on the agent it works with, a rule on an MCP server, an agent on another
agent. A `bundle` must list at least one dependency. An item can't depend on itself, and the
dependencies can't go round in a circle (MVP §4.3). Until 096, the type decided: a bundle on
anything, an agent on skills, MCP servers, hooks, rules and commands, a skill or command on MCP
servers, and the other types on nothing.

Ranges use npm's semver syntax (`^1.2.0`, `~1.1.0`, `>=2 <3`, `1.4.0`). Dist-tags aren't allowed
in ranges. The resolver rules are in MVP §4.3.

## 4. Targets

```yaml
targets:
  cursor:
    enabled: false       # don't offer this item for Cursor
  claude-code:
    overrides:
      model: sonnet      # platform-specific values passed to that renderer
```

- Keys are renderer ids (`claude-code`, `codex`, `cursor`, `copilot`, `gemini`, `devin`, …).
- `enabled` defaults to `true` for every platform that supports the type.
- `overrides` is free-form here and validated by the renderer, which documents what it accepts.

## 5. Canonical tool names

Used in `agent.tools`, `hook.matcher.tool` and `permission-policy` rules. Renderers map them to each platform's names.

| Name | Meaning |
|---|---|
| `read` | Read files |
| `edit` | Edit existing files |
| `write` | Create or overwrite files |
| `glob` | Find files by pattern |
| `grep` | Search file contents |
| `shell` | Run shell commands |
| `web-fetch` | Fetch a URL |
| `web-search` | Search the web |
| `mcp:<server>` | Any tool from an MCP server; `mcp:<server>/<tool>` for one tool |

## 6. Validation layers

1. **Schema** (`packages/core/src/schema/ronne.schema.json`): shape, names, enums, required blocks per type.
2. **Package checks** (`packages/core`): every referenced file exists; `SKILL.md` frontmatter
   matches; no path escapes the folder; the upload limits in MVP §12 hold.
3. **Registry checks** (server): the scope exists; dependencies exist (any type, §3), and each range matches at
   least one published version; no cycles; the type hasn't changed since the item was created.

Risk flags (MVP §12) are computed from the manifest and files. Authors can't set them.
