# 133 — Witness record

Passes by the `state-witness` agent, one block per task ([how it works](../../knowledge/state-witness.md)).

## Task 1 — Inventory

Witnessed: 2026-10-27, by a fresh agent (blind). Commit: f1b783a6. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The list of uncovered `.tsx` files is complete | no | confirmed | The agent's own script over the `biome.json` override's globs printed the same 9 files as the document (the three styleguide demos share a row) |
| 2 | `admin/layout.tsx` and `admin/page.tsx` have no text | no | confirmed | read both: a permission check and a redirect |
| 3 | The two workspace item pages are thin wrappers | no | confirmed | read both; their only text is a title already from `getTranslations("item.page")` |
| 4 | `app/layout.tsx` has one real hit, the static metadata | no | confirmed | `layout.tsx:19-22` |
| 5 | The styleguide is out of scope as the SPEC says | no | can't check here | files present and unmatched; the SPEC's Out was not opened |
| 6 | The `.ts` routes write no screen text | no | confirmed | `language`, `current-workspace`, and the two `data` routes read; `server/http/user-data-api.ts` not read |

**Overall:** met.

Witnessed: 2026-10-27, by a fresh agent (blind, re-check of row 5). Commit: f1b783a6. Machine: macOS (Darwin), read-only check.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | The styleguide is out of scope as the SPEC says, and is a developer reference | no | confirmed | `133 SPEC.md:19-20,59-60` and `132 SPEC.md:60-62` record it (provisional until task 8); `032 SPEC.md:22` and `features/styleguide/access.ts` (open outside production, root only in production) |
| 6 | `server/http/user-data-api.ts` writes no component screen text | no | confirmed | it writes English API error bodies for the download route (lines 45-103), under the server/API exclusion; the wording belongs to task 8's server-text decision |

**Overall:** met.

