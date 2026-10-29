# 146 — Install referenced MCP servers, with set-up steps

> Milestone: M23 · Depends on: 145, 022, 027, 044, 045, 076, 077 · Design: [MVP §4.3](../../MVP/MVP.md#43-install--update) ("Secrets"), [MVP §15](../../MVP/MVP.md#15-decision-log) ("MCP servers in items") · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md) §2 (`mcp-server`), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

When someone installs a skill, agent or command that uses MCP servers, in any of the AI tools Ronne
delivers to, the servers come with it, and the person knows exactly what to set up on their own
machine for each to work: which environment variables, what each one is for, and any sign-in or
local install the server needs (owner, 2026-10-29: "when using in the harness we should have this
installed. In the documentation we should have instructions how to set up on our local
environments").

## What's already built

- `rmk install` and the MCP server's install tools install dependencies, so the servers are
  written into each tool's config with env var references (MVP §4.3).
- After an install, `rmk` prints "Set these environment variables before using the MCP servers:
  `A`, `B`." and the MCP server returns `missingEnv` (`packages/cli/src/install.ts`,
  `packages/mcp/src/plan-tools.ts`): names only, only at install time.
- The item page's Overview (045) lists an MCP server item's variables with "required" and
  "secret".
- Plugin feeds (076, 077) put the servers in the plugin's MCP file; nothing checks variables, as
  `rmk` isn't involved.

What's missing: what each variable is for, at the point it's needed; a way to check later
(after a new shell, on another machine); steps beyond variables (an OAuth sign-in, `npx playwright
install`); and the set-up shown for the item that *uses* the server, not only on the server's own
page.

## Scope

**In:**
- **Set-up notes on MCP server items:** an optional `mcp-server.setup` file (Markdown, in the
  package, like a skill's body), for what variables can't say: "Sign in with `/mcp` the first
  time", "Run `npx playwright install chromium`", where to create the token. Shown as Markdown,
  sanitised as other item files. A schema change, so `docs/spec/manifest.md` changes with it.
- **After an install, per server:** `rmk install`, `rmk update` and the MCP install tools list each
  MCP server that was installed or changed, its variables (name, description, required, set or not
  set here, never a value), and the first lines of its set-up notes with the item page's link.
  Nothing is printed for a server whose required variables are set and that has no notes.
- **`rmk mcp check`** (a new subcommand; `rmk` keeps no secrets): for the installed items in this
  project, or `--scope user`, lists every MCP server, which items use it, and each variable as set
  or not set in the current environment. Exits 1 when a required one is missing, for scripts and CI.
  `--json`. The MCP server gets the same as a tool, `check_mcp_servers`.
- **"Set up on your machine" on the item page:** a section of the Overview for an MCP server item,
  and for any item that uses MCP servers (145's list), with, per server:
  - its variables with descriptions, required and secret marks;
  - how to set them, per operating system (macOS and Linux shells, Windows PowerShell) and per tool,
    as a short tabbed snippet with the variable names filled in and the value left to the person;
  - the set-up notes;
  - after a plugin install, how to check in each tool (Claude Code's `/mcp`, Cursor's MCP settings,
    Codex's `codex mcp list`).
- **GUI apps and environment variables:** the steps say where each tool reads variables from
  (a desktop app started from the Dock or Start menu doesn't see a shell profile's exports), and
  link the tool's own page for setting them.
- **A Documentation topic "MCP servers"** covering both 145 and 146: using servers from items,
  installing them with `rmk`, the MCP server or a plugin, setting variables per OS and per tool,
  `rmk mcp check`, and troubleshooting (server not listed, variable not seen, sign-in needed).

**Out** (and where it goes instead):
- **Storing or syncing secret values.** Never (MVP §15): Ronne and `rmk` don't hold them. A
  `.env` file or a secret manager is the person's choice; the Documentation says how each tool can
  read one.
- **Installing a server's own runtime** (Node.js, Docker, a browser). The notes say what's needed;
  `rmk` doesn't install it (048 was dropped).
- **Checking variables for plugin installs from Ronne.** The tools install plugins themselves; the
  item page and the plugin's README say what to set.

## Behaviour

**Installing a skill that uses the GitHub and Jira servers:**

```
Installed @team/triage-issues@1.2.0 for claude-code, with 2 MCP servers.

MCP servers to set up:
  github (@team/github)
    GITHUB_TOKEN  not set here  A GitHub token with repo read access (required, secret)
  jira (@team/atlassian)
    Sign in the first time with /mcp. Setup: https://ronne.example.com/items/@team/atlassian#setup

Check again any time with: rmk mcp check
```

**`rmk mcp check`** prints the same table for everything installed, with each server's users:
"`github` — used by `@team/triage-issues`, `@team/code-reviewer`".

**The item page** shows "Set up on your machine" below Install on the Overview, collapsed to one line
per server when everything's described and expanded on the server's own page.

## Edge cases

- **The same variable for two servers:** listed once per server, set once.
- **A variable set to an empty string:** "not set".
- **An install for several targets:** one list, with the tools each server went to.
- **A server whose update adds a required variable:** listed after `rmk update` as new.
- **A user-scope and a project install of the same server:** `rmk mcp check` reports each scope it
  was asked for.
- **Set-up notes that link elsewhere:** links are shown as text with their address, opened in a new
  tab, as item files are today; no images from other hosts.
- **An item installed before this feature:** `rmk mcp check` works from the lockfile and state file
  alone.

## Data

- **Manifest:** `mcp-server.setup` (optional, a path in the package, Markdown). Schema, package
  checks (the file exists, the size limit) and the examples (`github-mcp` gets a `SETUP.md`).
- **No migration, no change to `rmk.lock` or `.rmk/state.json`:** `rmk mcp check` reads the
  installed versions from the lockfile and their manifests from the artifact cache, or the registry
  when the cache is empty.

## Documentation

- **MCP servers**, a new topic in the Using items group, with the sections `use-in-items` (with
  145), `install`, `set-variables` (macOS, Linux, Windows; Claude Code, Codex, Cursor),
  `check` (`rmk mcp check`), `plugins` and `troubleshooting`. `topics.ts` here and in ronne-web
  together.
- **`rmk` reference:** `rmk mcp check`; the new lines after install.
- **Writing an item:** the `setup` file for MCP servers, with an example.
- **Helpers:** on the item page's "Set up on your machine", "Why do I need this?" →
  `mcp-servers#set-variables`; on the draft editor's Setup file field, "What goes here?" →
  `mcp-servers#use-in-items`.

## Acceptance criteria

- [ ] An `mcp-server` item may have a `setup` Markdown file; the schema, package checks and the
  example cover it, and the item page shows it sanitised.
- [ ] After `rmk install` or `rmk update`, each new or changed MCP server is listed with its
  variables' descriptions and set or not set, never a value; the MCP install tools return the same.
- [ ] `rmk mcp check` lists every installed server, its users and its variables, exits 1 when a
  required one is missing, and has `--json`; the MCP server has `check_mcp_servers`.
- [ ] The Overview's "Set up on your machine" shows, for a server and for every item that uses
  one, the variables, per-OS and per-tool snippets and the notes.
- [ ] No value of any environment variable appears in `rmk`'s output, the MCP tools' answers, the
  lockfile, the state file or the logs (tests set one and look for it).
- [ ] Every new screen text is in English, Portuguese and French, and the section passes the phone
  sweep.
- [ ] The Documentation and inline helpers listed above say what the feature does.

## Decisions

1. **The set-up is described, never done for the person** (Claude, 2026-10-29): Ronne never holds a
   secret (MVP §15), and a server's own sign-in or runtime is the tool's and the person's.
2. **One `setup` file on the MCP server item, not on every item that uses it** (Claude,
   2026-10-29): written once by whoever knows the server, shown wherever it's used.
3. **`rmk mcp check` under `mcp`** (Claude, 2026-10-29), next to `rmk mcp-setup`, rather than a
   general `rmk doctor`, which can come later and call it.

## Open questions

- Should `rmk` offer to write the variable names (empty) into a `.env.example` in the project?
- Should root be able to add instance-wide set-up notes (for example, where the company's tokens
  are issued) shown with every MCP server?
