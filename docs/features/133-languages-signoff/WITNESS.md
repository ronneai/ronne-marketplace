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

## Task 2 — The rule over the whole app

Witnessed: 2026-10-27 16:45, by a fresh agent (blind). Commit: b2dc52e0 plus the uncommitted diff. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint` passes | no | confirmed | exit 0; 44 warnings and 2 infos, the same as a clean worktree of HEAD (no new diagnostics) |
| 2 | The override is `apps/web/src/**` minus the stated exceptions | no | confirmed | `git diff biome.json` |
| 3 | A new file in a new folder fails the rule | no | confirmed | probes in `features/zzprobe` and `app/zz` gave a `plugin` diagnostic; deleted |
| 4 | The exceptions are not linted | no | confirmed | a probe in the styleguide folder gave none; the test also covers `server/` |
| 5 | A fixture test proves a new folder fails | no | confirmed | the includes-equality test and `lintAs` over three new folders and three exceptions pass; the test was not watched failing under a changed config |
| 6 | The i18n tests pass | no | confirmed | `npx vitest run src/i18n` → 18 files, 350 tests |
| 7 | The root description is served in three languages | no | confirmed | `next start` on a blank instance, curl with Accept-Language en, pt-BR, fr-CA → the three descriptions |
| 8 | The setup page still renders with no database | no | confirmed | `/setup` 200 in all three |
| 9 | No JSX screen text lives outside the new coverage | no | confirmed | only the four styleguide files are excluded |
| 10 | The remaining inventory text is moved or carries a reasoned `biome-ignore` | no | confirmed | 24 `biome-ignore lint/plugin` hits, each with a reason |

**Overall:** met.

