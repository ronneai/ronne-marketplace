# 027 — Registry MCP server and `rmk mcp-setup`

> Milestone: M5 · Depends on: 022 · Design: [MVP §7](../../MVP/MVP.md#7-registry-mcp-server), [§4.3](../../MVP/MVP.md#43-install--update), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

People manage items without leaving their AI tool: from inside Claude Code, Codex or Cursor, the
assistant searches the registry, explains what an install would change, and, once the person
approves, applies it. The server runs locally, reuses `rmk`'s token, config and code, and never
writes anything the person hasn't seen as a plan first (MVP §7).

## Scope

**In:**
- `packages/mcp`: an MCP server over stdio with the tools in MVP §7, built on `rmk`'s own
  resolver, renderers and applier.
- `rmk mcp-setup [--target <ids>|all] [--scope project|user]`: registers the server with each
  tool, through the renderers, as an MCP server entry.
- The plan-then-apply flow, with expiring plans.

**Out:**
- Authoring, review and release through MCP: web only in the MVP (MVP §11).
- A remote (HTTP) MCP server: the server is local, next to the project.
- Prompts and resources beyond what the tools need; a `ronne://` resource scheme can come later.

## Behaviour

**Running.** `packages/mcp` ships the binary `rmk-mcp` (the names `ronne` and `ronneai` are
reserved, CLAUDE.md), started by the AI tool with the project folder as its working directory. It
reads `~/.config/rmk/config.json` and `RMK_TOKEN`/`RMK_REGISTRY` exactly as `rmk` does
(cli-files.md), so `rmk login` is the only setup. Without a token, every tool answers an error
that says to run `rmk login`. Logs go to stderr, never stdout (the protocol's channel).

**Tools.** Each returns text for the assistant to read, plus structured content for the ones that
carry data. Names and shapes:

| Tool | Input | Does |
|---|---|---|
| `search_items` | `query`, `type?`, `scope?`, `limit?` | 019's search, as `rmk search` |
| `get_item` | `name`, `version?` | the item, its tags and versions, and the version's README, dependencies, risk flags and support (026) |
| `list_installed` | `scope?` | what the lockfile holds, as `rmk list --installed` |
| `check_outdated` | `scope?` | as `rmk outdated` |
| `plan_install` | `items: string[]`, `targets?`, `scope?` | resolves, downloads and checks, renders and plans, **writes nothing**; returns a `planId`, the list of files and keys it would write or remove, the warnings (skipped types, unmapped tools), deprecation messages, risk flags of every new item, missing env vars, and any conflicts |
| `plan_update` | `items?`, `targets?`, `scope?` | the same for `rmk update` |
| `plan_remove` | `items`, `targets?`, `scope?` | the same for `rmk remove` |
| `apply_plan` | `planId` | writes exactly that plan, then the lockfile, state and config, as `rmk` would, and returns what was written |

**Why two steps.** An AI tool asks the person's permission before a tool call runs, not after.
The plan appears in the conversation, and the person approves the `apply_plan` call knowing what
it does (MVP §7). `plan_*` tools are marked read-only in their annotations; `apply_plan` isn't.

**Plans** live in the server's memory, keyed by a random `planId`, for **10 minutes**. A plan
records the hashes of the lockfile and of every file or key it will touch (021's `stateHash` of
what's on disk). `apply_plan` refuses, with `plan_expired` or `plan_stale`, when the plan is gone
or anything it touches changed since; the assistant then plans again. A plan with conflicts can
be made but not applied: `apply_plan` answers `conflicts`, and there's no `force` over MCP
(the person uses `rmk --force` at the terminal, on purpose).

**Targets** are chosen as `rmk` chooses them (022): the argument, the config's `targets`, or
detection over the working directory. The server is started by one tool, so when detection finds
several, the plan says which and asks the assistant to pass `targets`.

**`rmk mcp-setup`** writes the registry server into each target's MCP configuration through that
target's renderer, as if it were an `mcp-server` item named `ronne-registry` with `command:
rmk-mcp`, and records it in `.rmk/state.json` like any change, so `rmk mcp-setup --remove` takes
it away and it never overwrites an entry the person made. It prints what it wrote and, for Claude
Code, that the project's MCP servers need approving once. Its entries are recorded under the item
name `rmk mcp-setup` (not a valid item name, so it can't clash), and `rmk install`, `update` and
`remove` leave them alone. `--command "<cmd> <args>"` registers another command than `rmk-mcp`,
for a server run from a copy of the repository instead of the npm install (034).

**Shared code.** The install pipeline lives in `packages/cli` (022). It's exported as a library
entry, `@ronneai/rmk/lib` (targets, resolve, fetch, render, plan, apply, and the report), and
`packages/mcp` depends on it, so the server and the command can't drift. `rmk mcp-setup` is a
CLI command; the server never imports the CLI's command layer. MVP §9.1 said `mcp` depends on
core only; the owner chose this over moving the pipeline into core (2026-09-29), and the Biome
rule allows `@ronneai/rmk/lib` (and `/testing` in tests) and nothing else from `rmk`.

**Security** (MVP §12): the server does what the person's token allows and nothing more; it
writes only inside the project (or home, for user scope), through the same path checks as `rmk`
(021); it never prints the token; and it runs no item code.

## Documentation

- **Registry MCP server**, a page of its own in the Documentation's "Installing" group (owner's
  request, 2026-09-29): what it does; setting it up (getting `rmk-mcp` from npm, or a clone with `--command`,
  `rmk mcp-setup` and its options, approving and trusting it in each tool); the tools, as a table
  of what each does and writes; plans (the two steps, 10 minutes, applied once, stale plans,
  conflicts); and what it can reach. Installing with rmk keeps a short "From inside your AI tool"
  section that links to it.
- **Item page:** the "How do I install it?" helper mentions asking the assistant, which shows the
  plan first.
- **Tokens and the API:** `rmk-mcp` uses the same token, can do what it can, and never shows it.
- The README's status and `rmk` section.

## Edge cases

- **Two clients at once** (Claude Code and Cursor, both with the server running): each has its own
  plans; the second `apply_plan` finds the lockfile changed and answers `plan_stale`.
- **The registry can't be reached:** `plan_*` fail with `unreachable`; `list_installed` still works.
- **`mcp-setup` on a tool with no MCP support:** none of the built-in renderers lacks it; a future
  one answers with the renderer's `unsupported_type` warning.

## Acceptance criteria

- [x] The server lists and runs every tool above over stdio, with a test client; read tools match `rmk`'s output.
- [x] `plan_install` writes nothing; `apply_plan` writes the plan and the files, and refuses expired and stale plans and plans with conflicts.
- [x] `rmk mcp-setup` registers the server for Claude Code (and every renderer that lands), records it in the state file, and `--remove` undoes it without touching other entries.
- [x] Without a token, every tool says to run `rmk login`; the token never appears in any output.
- [x] An end-to-end test drives the built `rmk-mcp` with an MCP client against the Playwright instance: search, plan, apply, and a stale apply refused.
- [x] The Documentation has the Registry MCP server page, the pointer from Installing with rmk, the token note and the helper, with render tests.

## Open questions

The owner started 027 (2026-09-29) without answering these, so it's built on the recommendations;
any can still change. Separately, the owner chose to let `packages/mcp` import `@ronneai/rmk/lib`
(see Shared code).

1. **Build on `@modelcontextprotocol/sdk`** (recommended: the reference implementation of the
   protocol, MIT, current; its 17 dependencies are all permissive, but it's the heaviest package
   Ronne would add, so it goes through the dependency checklist), or write the small stdio
   JSON-RPC surface by hand and track the protocol ourselves.
2. **A separate binary, `rmk-mcp`, in `packages/mcp`** (recommended: the MVP's package layout,
   and the server can't depend on the CLI's command layer), or a `rmk mcp` subcommand, which would
   make the CLI package depend on the MCP package.
3. **Plans expire after 10 minutes** (MVP §7), or on the next plan from the same client.
