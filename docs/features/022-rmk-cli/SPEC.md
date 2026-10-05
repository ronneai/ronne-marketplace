# 022 — `rmk` CLI

> Milestone: M4 · Depends on: 019, 020, 021 · Design: [MVP §4.3](../../MVP/MVP.md#43-install--update), [§6](../../MVP/MVP.md#6-cli--rmk), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

People install reviewed items into their projects with one command, and keep them up to date:
`rmk install @platform/secure-coding` finds the right versions, downloads and checks them, writes
each AI tool's files, and records what it did, so a teammate gets the same result and nothing a
person wrote by hand is ever overwritten.

## Scope

**In:**
- The commands in MVP §6: `login`, `logout`, `whoami`, `search`, `list`, `info`, `install`,
  `update`, `outdated`, `remove`, `platforms`.
- The files in cli-files.md: `rmk.config.json`, `rmk.lock`, `.rmk/state.json`, and the user config
  and user-scope files.
- Applying renderers' changes (021) to disk, with the state file, conflicts and `--force`.
- `--json` output for scripts and agents, and exit codes.

**Out:**
- Renderers themselves → 023 (Claude Code, the first), 024, 025.
- `rmk mcp-setup` → 027.
- Publishing `@ronneai/rmk` to npm: a release chore once M4 is done.
- Creating accounts: never; root creates users in the web app (MVP §2).
- Sending local items to the registry: `rmk export` → [038](../038-rmk-export/SPEC.md) (M7, added 2026-09-30). It adds `--to`, `--name`, `--yes` and `--dry-run`, and the first yes/no question; this feature's flags and exit codes keep their meaning.

## Behaviour

**Commands.**

| Command | Does |
|---|---|
| `rmk login [--registry <url>]` | Asks for email and password (the password isn't echoed), exchanges them at `POST /api/v1/auth/token` (009), and stores the token in `~/.config/rmk/config.json` (mode `0600`). |
| `rmk login --token <token>` | Stores a token made in the web app, after checking it with `GET /me`. |
| `rmk logout` | Revokes the token on the server (`DELETE /auth/token`) and removes it locally, even if the server can't be reached. |
| `rmk whoami` | The registry, and the user from `GET /me`. |
| `rmk search <query> [--type] [--scope]` | The catalogue (019), newest first. |
| `rmk info <item>[@version]` | Description, tags, versions (deprecated and yanked marked), dependencies, risk flags. |
| `rmk list [--installed]` | What `rmk.config.json` asks for, or with `--installed`, what `rmk.lock` holds. |
| `rmk install [<item>[@tag\|range]]... [--target <ids>\|all] [--scope project\|user] [--force]` | With items: adds them to `rmk.config.json` (a tag is kept as the tag; a bare name means `latest`), resolves, and installs. Without: installs exactly `rmk.lock`, or resolves `rmk.config.json` when there's no lockfile. |
| `rmk update [<item>...]` | Re-resolves within the ranges, without locks for the named items (or all), and re-renders what changed. |
| `rmk outdated` | For each direct dependency: locked, the newest that fits its range, and the newest overall. |
| `rmk remove <item>...` | Removes it from `rmk.config.json`, re-resolves, and deletes the files and keys it no longer needs, dependencies included. |
| `rmk platforms` | The renderers (021), and which types each supports. |

Every command except `login`, `platforms` and `--help` needs a token. `RMK_TOKEN` and
`RMK_REGISTRY` override the config file, for CI (cli-files.md). `RMK_TOKEN` goes only to a
registry the person chose (`--registry`, `RMK_REGISTRY`, the default, or a login), never to one
only a project's `rmk.config.json` or `rmk.lock` names (2026-10-05).

**An install, step by step.**
1. Read `rmk.config.json` and `rmk.lock`; decide the targets (`--target`, else `targets` in the
   config, else each renderer's `detect()`; if none or several match and there's a terminal, ask,
   else fail with `no_target`).
2. Resolve with `POST /api/v1/resolve` (020), passing the lockfile's versions as `locked`.
3. Download each tarball that isn't in the local cache, and check its sha256 against the
   resolution (or the lockfile); a mismatch stops everything with `checksum_mismatch`.
4. Unpack (011) and render each item for each target (021). A type a target doesn't support is a
   warning, and the rest carry on (MVP §3.3).
5. Plan the changes against `.rmk/state.json` and the disk (below). Nothing is written until the
   whole plan is known to succeed.
6. Write the files, then `rmk.lock` and `.rmk/state.json`, then print what changed, the warnings,
   deprecation messages, and any environment variables an MCP server needs that aren't set.

**Applying changes** (cli-files.md, MVP §3.3):
- A new file, folder, key or section is created, and recorded with its `stateHash`.
- One that rmk wrote before is compared with the hash in the state file. If it still matches, it's
  replaced (or removed); if the user edited it, that entry is a **conflict**: rmk leaves it alone,
  reports it, and exits with code 3, unless `--force` is given.
- A file or key rmk didn't write is never overwritten or removed. If a change would replace one,
  it's a conflict too.
- A recorded file or key that's gone is taken as removed by the user: the entry is dropped, and
  only `install` or `update` puts it back.
- JSON files are edited key by key, keeping every other key and the file's indentation; an empty
  parent object that rmk created is removed with its last key.
- Changes are written through a temporary file and renamed, so an interrupted run never leaves half
  a file.

**Downloads cache** in `~/.cache/rmk/` (or `$XDG_CACHE_HOME/rmk/`), by sha256, so reinstalling or
switching branches doesn't download again.

**Output.** Plain sentences by default. `--json` prints one JSON object per command with the same
facts (`installed`, `removed`, `warnings`, `conflicts`, `missingEnv`), for scripts and agents.

**Exit codes:** 0 done; 1 an error (network, registry, resolution, checksum); 2 a usage error; 3
conflicts left in place. Errors from the API show its message and `code`.

**Security** (MVP §12):
- The token is only sent to the registry it belongs to, over HTTPS; `http://` works only for
  `localhost` or with `--insecure`.
- The config file must be private: rmk refuses to read one that other users can read, and says how
  to fix it.
- Nothing from an item is executed at install time; hooks and scripts are written, not run.
- Paths from renderers never leave the project (or home) folder (021).

**Package.** `@ronneai/rmk`, binary `rmk`, Node 22 or later. Argument parsing and prompts use
Node's own modules (`util.parseArgs`, `readline`), so the CLI adds no dependencies beyond
`@ronneai/core`.

## Edge cases

- **Offline, with everything cached and locked:** `rmk install` works without the network, except
  that it can't check the token; it says so and carries on.
- **A lockfile from another registry:** refused with a message, unless `--registry` matches it.
- **A yanked version in the lockfile:** installs, with a warning.
- **Two targets writing the same shared folder:** one state entry with both targets (cli-files.md).
- **User scope:** the same, with `~/.config/rmk/user.lock` and `user-state.json`, and each tool's
  user folders.

## Documentation

- **Installing with rmk** is rewritten from "coming soon" to how it works: logging in, `install`
  (with a tag, a range or a pinned version), `update`, `outdated`, `remove`, `list`, `info`,
  `search`, `--json`, and the exit codes. Its sections become What rmk does, Logging in,
  Installing, Keeping items up to date, The files it writes (`rmk.config.json`, `rmk.lock`,
  `.rmk/state.json`, and which to commit), and Your own edits (conflicts and `--force`).
- **The "When it arrives" section is removed**, and the overview's install step links to the new
  sections.
- **Item page:** an inline helper by the install commands, "How do I install it?", linking to
  Installing.
- **Versions and tags → Deprecate or yank:** what `rmk` prints for a deprecated version, and that a
  yanked one pinned in a lockfile still installs.

## Acceptance criteria

- [x] Each command works as above against a real instance, with `--json` output and the exit codes.
- [x] `install` writes `rmk.lock` and `.rmk/state.json` exactly as cli-files.md describes, and a second `install` from the lockfile writes the same files.
- [x] A checksum mismatch stops before anything is written.
- [x] An edited managed file or key is reported as a conflict and left alone, and `--force` replaces it; unmanaged content is never touched.
- [x] `update`, `outdated` and `remove` follow the lockfile and ranges as specified; `remove` takes away dependencies nothing else needs.
- [x] The token file is created `0600`, and a readable one is refused.
- [x] An end-to-end test installs an item from a running instance into a temporary project with the reference renderer (021), updates it after a new release, and removes it.
- [x] The Installing with rmk topic describes the released commands and files, the item page has its helper, and nothing in the app still says `rmk` isn't released.

## Open questions

The owner started 022 (2026-09-28) without answering these, so it's built on the recommendations;
any can still change.

1. **A download cache in the home folder** (recommended: faster reinstalls, keyed by sha256 so it
   can't serve a wrong file), or always download.
2. **`install` with a bare name records `latest`** in `rmk.config.json` (recommended: it follows
   the tag, and the lockfile pins the version), or records `^<version>` of what it resolved, as npm
   does.
3. **Resolution through `POST /resolve`** (020's open question 2).
