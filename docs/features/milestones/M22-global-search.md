# M22 — Global search

> [All milestones](README.md) · [Features index](../README.md)

Planned on 2026-10-29, with M21, M23, M24, M25, M26, M27: why, and in what order, in [the milestones](README.md#planned-on-2026-10-29).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [142](../catalogue/142-search-index/SPEC.md) | Search index in the server: Orama inside the web app's process (no new image or service) over each item's listed version (full name, old names, type, description, keywords); rebuilt in the background per catalogue revision, by each replica; filtered by the workspaces the reader sees and every hit checked again; today's `LIKE` until the first build; `GET /api/v1/search` and `searchEverywhere` | 018, 019, 079, 093, 114, 118 | specified |
| [143](../catalogue/143-search-everywhere/SPEC.md) | Search on every page: Search in the sidebar and an icon in the phone header, ⌘K/Ctrl+K; a dialog with items as you type, limited to the current workspace if wanted, and Go to entries for the pages the reader can open; a `/search` results page that works without JavaScript | 142, 119, 120, 066, 067, 129 | specified |
| [144](../catalogue/144-search-file-contents/SPEC.md) | File contents in search, at scale: `search_texts` holds each version's text files (64 KiB each), written at publish and backfilled; snippets with the file path; `rmk search` and MCP `search_items` move to `/api/v1/search` (older servers fall back); `RONNE_SEARCH_CONTENTS`; `bench:search` at 1k, 5k and 10k items | 142, 143, 044, 015, 022, 027 | specified |
