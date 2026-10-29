# 144 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §9.4's "Search" row covers file contents and the cap, §6 and §7 say `rmk search` and
    `search_items` use `GET /api/v1/search`, and §15's "Search" row is current.
  - `docs/features/README.md` lists 144 in M22 with its dependencies.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. The `search_texts` migration.** [risky]
  - The table as SPEC.md's Data says, with the cascade on `item_versions`.
  - *Done when:* the migration's db tests pass on SQLite and on the servers (`pnpm test:db:up`,
    then the migration files on PostgreSQL, MySQL and MariaDB), and `migrations.guard.test.ts` passes.

- [ ] **3. The text step and publish.**
  - `searchText(files, maxBytes)`: UTF-8 check, NUL check, order, cap, counts.
  - `publish.ts` writes the row in the version's transaction.
  - *Done when:* unit tests cover binaries, invalid UTF-8, the order, the cap and truncation; db
    tests show a release (single and bulk, 055, 112) writes the row and a failed release writes none.

- [ ] **4. The backfill.**
  - Batches of 50 from the artifacts, upserted, resumable, a revision raise per batch, `warn` for a
    missing or damaged artifact.
  - *Done when:* db tests cover a fresh instance, a restart mid-way, two processes at once (no
    duplicate rows, no error) and a damaged artifact.

- [ ] **5. Contents in the index and the snippets.** [risky]
  - The builder joins `search_texts`; `contents` ranked below the description; snippets after the
    visibility check; `RONNE_SEARCH_CONTENTS` and `RONNE_SEARCH_CONTENTS_MAX_KIB`.
  - `GET /api/v1/search` adds contents matches.
  - *Done when:* db tests cover a word only in a file, the ranking against a name match, snippets with
    the path, the setting off, and no snippet for an item the viewer can't open (142's stale-index
    cases rerun with contents).

- [ ] **6. Snippets in the dialog and the page.**
  - One line in 143's dialog, up to three on `/search`, marks as `<mark>` with the theme's tokens.
  - *Done when:* component tests show the path and the marked words, and the e2e search test finds an
    item by a word in its file.

- [ ] **7. `rmk search` and `search_items`.**
  - Both on `GET /api/v1/search`, with the `404` fallback; "matched in" lines and the matches in
    `--json` and the tool's output.
  - *Done when:* CLI and MCP tests cover the new endpoint, the fallback against a server without it,
    and the output; `pnpm release:smoke` passes after `pnpm build` and `pnpm build:server`.

- [ ] **8. The benchmark.**
  - `apps/web/scripts/search-benchmark.ts` and the `bench:search` script, reusing 079's seeding.
  - Run on SQLite and PostgreSQL at 1,000, 5,000 and 10,000 items with 2, 16 and 64 KiB of text.
  - *Done when:* the numbers are in Notes, each target is met or SPEC.md records the chosen fix, and
    the fix (if any) is built and measured again.

- [ ] **9. Documentation.**
  - `items#search`, `rmk`, `mcp`, the install guide and the Settings runbook, in three languages.
  - *Done when:* the docs render tests pass, and every changed section is reachable from `topics.ts`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
