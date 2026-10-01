# 048 — Runtime requirements

> Milestone: M8 · Depends on: 011, 022, 045 · Design: [MVP §4.3](../../MVP/MVP.md#43-install--update) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

An item can say what it needs on the machine it runs on: a minimum `rmk`, a Node.js version, commands
such as `git` or `docker`, the operating systems its scripts work on. `rmk install` checks them before
writing anything, and the item's Overview shows them, so people learn about a missing `git` before
the hook fails instead of after. It's the "Runtime requirements" card from the owner's mockup that 045
left out.

## Scope

**In:**
- A new optional top-level manifest field, `requires`, for every type: `rmk`, `node`, `commands`,
  `os`. The schema, the manifest spec, an example item, and the editor's form (generated from the
  schema, 012).
- `rmk install`, `update` and the install with no arguments check each resolved item's requirements
  after downloading and before writing. The MCP server's `plan_install` and `plan_update` report them
  the same way, since they share `rmk`'s pipeline (027).
- `rmk` reads a released manifest leniently: a top-level field it doesn't know is a warning, not a
  failure, so the next field added won't break installs with an older `rmk` (see Behaviour).
- `requires` in the registry API's version JSON (`GET /api/v1/items/{scope}/{name}/{version}`), in
  `rmk info` and in the MCP server's `get_item`.
- A **Runtime requirements** card in the Overview's side column (045).

**Out** (and where it goes instead):
- Installing or upgrading what's missing: `rmk` says what's missing; it never installs Node.js, `git`
  or anything else.
- Versions of arbitrary commands (`git >= 2.40`): finding a command's version means running it with a
  flag that differs per command. Only presence on `PATH` is checked. Node.js is the exception because
  `node --version` is stable.
- Python, Deno, Bun or other runtimes by name: `commands: [python3]` covers presence; versioned
  checks can be added later as more keys of `requires`.
- The resolver choosing an older version whose `requires.rmk` fits: `rmk` stops and says to update
  itself (Open questions).
- Catalogue filters by requirement: not asked for.
- Reading requirements on export (M7): Claude Code's, Codex's and Cursor's files have no such field,
  so exported drafts have no `requires`; the author adds it in the editor.

## Behaviour

**The field** (added to [`manifest.md`](../../spec/manifest.md) §1 and the schema):

```yaml
requires:
  rmk: ">=0.2.0"          # semver range; the rmk (or rmk-mcp) that installs it
  node: ">=20"            # semver range; the node found on PATH
  commands: [git, docker] # must be on PATH; names only
  os: [linux, macos]      # linux | macos | windows; omitted = any
```

- Every key is optional; `requires: {}` is the same as leaving it out. Unknown keys under `requires`
  are rejected, like unknown top-level fields.
- `rmk` and `node` use npm's range syntax (as `dependencies`, manifest §3); dist-tags aren't allowed.
- `commands`: at most 20, unique, each a plain executable name (letters, digits, `.`, `_`, `+`, `-`;
  1–64 characters; no `/` or spaces), so a requirement can never be a path or a command line.
- `os`: at most three, unique, from the enum.
- Allowed for every type, bundles included. A bundle's own `requires` is what the bundle adds; each of
  its dependencies is checked for its own.
- No risk flag: `requires` runs nothing. Reviewers see it in the manifest diff (014).

**Checking on install** (in `packages/cli`, after each artifact is downloaded and checked, before
the plan is written; [MVP §4.3](../../MVP/MVP.md#43-install--update)):

| Key | How it's checked | When it isn't met |
|---|---|---|
| `rmk` | the running `rmk`'s own version (also inside `rmk-mcp`) | **Error, nothing written.** "@scope/name 1.2.0 needs rmk >=0.3.0; this is 0.2.0. Update rmk: `npm install --global @ronneai/rmk`." Exit code 1, code `rmk_too_old` |
| `node` | `node --version` found on `PATH`, run directly (no shell) with a 5-second timeout | Warning: "needs Node.js >=20; found 18.19.0" or "…; node isn't on PATH" |
| `commands` | looked up on `PATH` (with `PATHEXT` on Windows); never run | Warning: "needs git and docker on PATH; docker wasn't found" |
| `os` | the platform `rmk` runs on | Warning: "is made for Linux and macOS; this is Windows" |

- **Only `rmk` blocks.** An older `rmk` may render the item wrongly, which is `rmk`'s business. The
  others are about where the item runs, which may not be where `rmk` runs (a container, CI, a
  teammate's machine), and the project's rule for what a tool can't take is "warn, don't fail the
  install" (CLAUDE.md). The item is still installed.
- Each failed check is one line per item, under the install's other warnings, and in `--json` as
  `requirements: [{ item, version, key, wanted, found }]` (`found` is `null` when absent).
- Checked again on `rmk update` and on `rmk install` with no arguments (a new teammate's machine).
  Not on `rmk remove`.
- **MCP server:** `plan_install` and `plan_update` list the unmet requirements in the plan's warnings;
  a `requires.rmk` that isn't met fails the plan with the same message, before any `planId`.
- **Lenient reading.** When `rmk` renders a released item whose manifest has a top-level field it
  doesn't know, it renders the rest and warns: "@scope/name uses `<field>`, which this rmk doesn't
  know; update rmk." (Today `rmk` ignores schema problems in released manifests silently; this makes
  that visible.) The registry already validated the manifest at submit, so nothing else is relaxed.

**Older `rmk` versions** (0.1.x, before this feature) install an item with `requires` and ignore the
field silently. `requires.rmk` therefore only protects from this feature's release on; the in-app
Documentation says so.

**Web:**
- **Editor (012):** the form, generated from the schema, gets a `requires` group: two text fields for
  the ranges, a list for commands and a list of choices for `os`. Submit checks (013) are the
  schema's; nothing new on the server.
- **Overview (045), side column, after Package verification:** **Runtime requirements**, one row per
  key: "rmk" and "Node.js" with the range as written (monospace) and in words ("0.3.0 or later" for a
  plain `>=`; otherwise the range alone), "Commands on PATH" with each name, "Operating systems". When
  the shown version declares none: "This version declares none. rmk checks whatever an item declares
  before installing it." The card reads the stored manifest (`item_versions.manifest`), so it shows
  even when the artifact can't be read.
- **API:** the version JSON gains `requires` (the manifest's block, or `{}`), so clients don't parse
  the manifest. `rmk info` prints "requires: rmk >=0.3.0, Node.js >=20, git, docker, Linux or macOS";
  `get_item` returns the field.

## Edge cases

- **`node` on PATH prints something that isn't a version** (a wrapper, a broken install): treated as
  not found, with what it printed (first line, at most 80 characters) in `found`.
- **`node --version` hangs:** killed after 5 seconds; "couldn't tell the Node.js version".
- **The same check fails for several items:** one line per item, so each says who asked.
- **User scope (`--scope user`):** checked the same way.
- **A pre-release `rmk`** (`0.3.0-beta.1`) against `>=0.3.0`: npm's semantics, so it doesn't match;
  the message names both versions.
- **A range no `rmk` ever satisfies** (`<0.0.1`): valid by the schema; every install fails with the
  `rmk_too_old` message. Reviewers see the range in the diff.
- **`commands` on Windows:** `git` matches `git.exe` through `PATHEXT`.
- **`os` and WSL:** WSL is Linux, as Node reports it.
- **Draft editor with an old draft:** a draft without `requires` is unchanged; nothing migrates.

## Documentation

- **Topic `items`, section `manifest`:** `requires` with the example, what each key means, that only
  `rmk` blocks an install, and that rmk 0.1.x ignores it.
- **Topic `items`, section `contents`:** the Runtime requirements card; the sentence saying runtime
  requirements aren't shown yet (045) is removed.
- **Topic `rmk`, section `installing`:** what `rmk` checks before writing, the warnings, and the
  `rmk_too_old` error with the update command.
- **Topic `mcp`, section `plans`:** unmet requirements appear among the plan's warnings.
- **Inline helpers:** a new `requires` helper next to the Runtime requirements card and on the
  editor's `requires` group: "What this item needs on the machine it runs on. rmk checks it before
  installing; only a too-old rmk stops the install." It links to `items#manifest`.

## Acceptance criteria

- [ ] The schema accepts `requires` with the four keys on every type and rejects unknown keys, bad
      ranges, command names with `/` or spaces, duplicates, and more than 20 commands.
- [ ] `examples/items/` has an item with `requires`, and it passes the schema test.
- [ ] `rmk install` stops with `rmk_too_old` and writes nothing when `requires.rmk` isn't met.
- [ ] `rmk install` warns, and still installs, for a missing command, a Node.js out of range or
      missing, and another OS; `--json` lists them under `requirements`.
- [ ] `rmk` warns about an unknown top-level field in a released manifest and installs the rest.
- [ ] `plan_install` lists unmet requirements and fails on `requires.rmk`.
- [ ] The version JSON, `rmk info` and `get_item` show `requires`.
- [ ] The Overview shows the Runtime requirements card, and "declares none" without the field.
- [ ] The editor's form edits `requires`, and saving writes it to `ronne.yaml`.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

- **Should the resolver skip versions whose `requires.rmk` doesn't fit** (pnpm does this with
  `engines` under `engine-strict`)? It would need `/resolve` to know the client's
  version (it's in `User-Agent`) and the requirement stored per version. Built as: `rmk` stops and
  says to update itself, which is simpler and always right.
- **Should `node` and `os` block too** for some types (a `statusline` script that only runs on
  Linux)? Built as warnings everywhere; a `--strict` flag can be added if teams ask.
- **Agent Skills' `compatibility` frontmatter** is free text about the environment. A skill's
  renderer could fill it from `requires` when the author left it empty. Not in this feature.
