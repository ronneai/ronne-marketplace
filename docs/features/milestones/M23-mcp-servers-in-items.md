# M23 — MCP servers in items

> [All milestones](README.md) · [Features index](../README.md)

Planned on 2026-10-29, with M21, M22, M24, M25, M26, M27: why, and in what order, in [the milestones](README.md#planned-on-2026-10-29).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [145](../cli-api/145-mcp-server-references/SPEC.md) | Reference MCP servers from items: an MCP servers field on skills, agents and commands (a picker of `mcp-server` items that adds the dependency), `mcp:<server>` in agents' tools; checks that tool references match a dependency and that two servers don't share a short name; Claude Code agents get `mcpServers`; the Overview lists "Uses MCP servers" | 096, 097, 089, 012, 031, 023, 024, 025 | specified |
| [146](../cli-api/146-mcp-server-setup/SPEC.md) | Install referenced MCP servers, with set-up steps: an optional `mcp-server.setup` file in the manifest; after install or update `rmk` lists each server's variables as set or not (never a value); `rmk mcp check` and MCP `check_mcp_servers`; "Set up on your machine" on the item page, per tool and system; the Documentation topic MCP servers | 145, 022, 027, 044, 045, 076, 077 | specified |
