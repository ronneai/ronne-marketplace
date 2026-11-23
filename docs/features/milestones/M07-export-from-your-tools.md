# M7 — Export from your tools

> [All milestones](README.md) · [Features index](../README.md)

An item a person wrote in their AI tool goes to the marketplace as a draft, from `rmk` or from
inside the tool (owner, 2026-09-30). The mapping from a tool's files back to an item is the
contract [`docs/spec/native-readers.md`](../../spec/native-readers.md).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [037](../cli-api/037-draft-upload-api/SPEC.md) | Draft upload API: `GET /api/v1/scopes`, `POST /api/v1/drafts` (a draft with its files, as the token's user), the audit event, and limits for writes by token | 007, 009, 010, 012, 013, 019 | done |
| [038](../export-import/038-rmk-export/SPEC.md) | `rmk export` for skills: the reader in `packages/core`, finding local skills, choosing the scope, the preview, the upload | 037, 011, 022 | done |
| [039](../export-import/039-mcp-export-tools/SPEC.md) | MCP export tools: `list_local_items`, `plan_export`, `export_items` | 038, 027 | done |
| [040](../export-import/040-export-more-types/SPEC.md) | Export more types: agents, commands, rules and MCP servers from Claude Code's files | 038, 039, 023 | done |
| [041](../export-import/041-export-dependencies/SPEC.md) | Dependencies on export: detect what an item uses, ask, recommend exporting it too, upload in order | 040 | done |
| [042](../export-import/042-export-change-proposal/SPEC.md) | Export a change as a proposal: an edited install, or a published item of the person's own, merged onto its base version; `POST /api/v1/drafts` with `base` | 041, 017 | done |
| [043](../export-import/043-codex-cursor-readers/SPEC.md) | Export from Codex's and Cursor's files: agents, rules, commands and MCP servers, `--from` | 040 | done |
| [051](../export-import/051-update-drafts-on-export/SPEC.md) | Update your own drafts on export: exporting an item again updates your draft (or one sent back for changes) instead of making another; one in review is left alone; `GET /api/v1/drafts`, `PUT /api/v1/drafts/{id}`, `--new-draft` | 037, 038, 039, 042 | done |
| [052](../items/052-bulk-submit/SPEC.md) | Submit drafts in bulk: `rmk submit` (names, ids, `--all`), `check_drafts` / `submit_drafts`, and multi-select on My submissions; only ready drafts go, the others say what's missing; `POST /api/v1/drafts/check` and `/submit` | 013, 014, 037, 038, 039, 051 | done |
| [053](../export-import/053-export-descriptions/SPEC.md) | Every exported item has a description: written by the AI tool from the item's content (MCP), or asked in `rmk`, shown before upload, kept when exporting again | 038, 039, 040, 043, 051 | done |
| [054](../review/054-bulk-approve/SPEC.md) | Approve in bulk: the approval message is optional (the override's too), and the review queue approves several at once with one optional message for all; risk flags listed first, each approved on its own | 014, 017, 052 | done |
| [055](../review/055-bulk-release/SPEC.md) | Release in bulk: My submissions and the review queue's To release tab release several approved submissions at once, dependencies first, with one set of settings (stable or pre-release, suggested bump for each, tag, notes) | 015, 017, 052, 054, 056 | done |
| [056](../items/056-pending-dependencies/SPEC.md) | Dependencies on their way: a dependency in review counts at submit (range checked at release); bulk submit and release include dependencies; rejecting a dependency offers to request changes on its dependents; request changes from approved | 013, 014, 015, 041, 052, 054 | done |
| [057](../items/057-withdraw-archive-delete/SPEC.md) | Withdraw: archive or delete. Withdrawing asks: archive (out of the list, private, restorable as a draft) or delete for good (only if nobody has reviewed it); `submission.deleted` and `submission.restored` | 012, 013, 014, 052, 056 | done |
| [058](../review/058-review-decisions-everywhere/SPEC.md) | Reject and request changes from the queue and the page: per-row actions with a required reason, the decisions always visible on the review page (disabled with the reason on your own), and the reviewer's message at the top of the author's page | 014, 054, 055, 056 | done |
