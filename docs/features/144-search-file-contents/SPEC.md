# 144 — File contents in search, at scale

> Milestone: M22 · Depends on: 142, 143, 044, 015, 022, 027 · Design: [MVP §9.4](../../MVP/MVP.md#94-database) ("Search"), [MVP §6](../../MVP/MVP.md#6-cli--rmk), [MVP §7](../../MVP/MVP.md#7-registry-mcp-server), [MVP §15](../../MVP/MVP.md#15-decision-log) ("Search") · Contracts: `GET /api/v1/search` (142) gains file matches; `rmk search` and the MCP `search_items` move to it

## Goal

"Search any content of any item" (owner, 2026-10-29) means the files too: the words inside a
`SKILL.md`, an agent's prompt, a rule, a command or an MCP server's config. This feature adds the
listed version's text files to 142's index, shows where in a file a word was found, gives `rmk
search` and the MCP server the same search, and measures it all at 1,000–10,000 items the way 079
measured the feeds, so its limits are numbers rather than guesses.

## Scope

**In:**
- **Text kept for search, in the database.** When a version is published (015, `publish.ts`), in
  the same transaction, Ronne writes its text files into `search_texts`: one row per version, the
  files' paths and text, at most 64 KiB in all (configurable, below). The index is built from these
  rows, never from the artifacts, so a rebuild costs a database read on every replica and works the
  same with S3 storage (110).
- **Which files:** valid UTF-8 without NUL bytes, in path order, `ronne.yaml` and the body file
  first; binaries and files past the cap are skipped and the row says how many were left out.
- **Backfill:** versions published before this feature get their row from their artifact (044's
  `artifactFiles`, checked against its sha256), in batches of 50 in the background after start;
  any process may do it, as rows are upserted (`db/upsert.ts`) and a version already done is
  skipped. A missing or damaged artifact gets an empty row and a `warn` line.
- **The index:** each item's listed version adds a `contents` field, ranked below the description
  (142's order).
- **Snippets:** a result that matched in a file shows the file's path and up to 160 characters around
  the first match, with the matched words marked; in 143's dialog (one line) and on `/search` (up
  to three per item). Snippets are made after 142's visibility check, from the version's row.
- **`GET /api/v1/search`** adds `contents` matches: `{ field: "contents", path, snippet }`.
- **`rmk search` and MCP `search_items` use `GET /api/v1/search`** (MVP §6, §7): same arguments as
  now; each result says where it matched (`matched in SKILL.md`), and `--json` and the tool's output
  carry the matches. A server without the endpoint (an older instance: `404`) gets today's
  `GET /api/v1/items?q=` and the old output, so `rmk` keeps working against both.
- **Settings for the operator:** `RONNE_SEARCH_CONTENTS` (`on` by default, `off` to index metadata
  only) and `RONNE_SEARCH_CONTENTS_MAX_KIB` (64, from 8 to 512), for servers short on memory; read
  at start, listed in the install guide.
- **The benchmark:** `pnpm --filter @ronneai/web bench:search [--items 1000,5000,10000]
  [--db sqlite|postgres|mysql] [--contents-kib 2,16,64]` (`apps/web/scripts/search-benchmark.ts`,
  079's throwaway database and seeding). It prints, per size: the full rebuild time, heap after
  build, the median and 95th-percentile query time for one-word, three-word, prefix and typo
  queries, with a 1- and a 50-workspace viewer.
- **Targets the numbers are judged against** (at 10,000 items with 16 KiB of text each, on the CI
  runner): a query's 95th percentile under 50 ms, a rebuild under 10 s, the index under 512 MiB of
  heap. If one is missed, the fix (a lower default cap, rebuilding only changed items, contents
  off by default) is chosen with the numbers and recorded here before release.

**Out** (and where it goes instead):
- **Older versions' contents:** only the listed version is searched; the item page's Files viewer
  (044) reads any version.
- **Drafts and submissions:** as 142, not indexed.
- **Code-aware search** (symbols, regular expressions): later, if asked.
- **Binary files and archives inside items:** skipped.

## Behaviour

- **At publish:** `publish.ts` already has the version's files to pack; it passes them to a
  `searchText(files, maxBytes)` function in the search domain and inserts the row with the version.
  A failure to build the row fails the release, as any other insert would; the text step can't
  throw on content (a file that can't be decoded is skipped).
- **Rebuilding (142):** the builder joins `search_texts` on the listed version; a version without a
  row (backfill not reached it) is indexed without contents until it has one, and the backfill's
  batch raises the catalogue revision so the next search rebuilds.
- **Matching:** words in `contents` are matched as in other fields (prefix on the last word, one
  typo from five letters). A query that matches the name and a file shows the name match first and
  the file's snippet under it.
- **`rmk search`** prints, under each item's line, `  matched in <path>: …<snippet>…` for contents
  matches (plain text, the marks dropped); nothing changes for name or description matches.

## Edge cases

- **An item whose text is mostly one huge file:** the cap cuts it; the row counts it as truncated,
  and words past the cap aren't found (documented).
- **A version yanked and the listed version changed:** the next rebuild indexes the new listed
  version's row.
- **`RONNE_SEARCH_CONTENTS=off`:** rows are still written (so turning it on needs no backfill),
  only the index leaves them out.
- **A file that looks like a secret** (a `.env` someone published): it's published content anyone
  who sees the item can already read in the Files viewer; search shows no more than that. The scan
  (135, 137) is what flags it.
- **Backfill on a large instance:** batches yield between each other (no long transaction), and a
  restart resumes where it stopped (versions without a row).
- **Restore (099):** `search_texts` is in the dump like any table; restored rows are used as they
  are.
- **Erase a user (103):** nothing personal is in `search_texts` beyond what the published files say,
  which 103 doesn't change.

## Data

- **Migration:** `search_texts` (`version_id` primary key and foreign key to `item_versions` with
  cascade, `text` (a large text column on every dialect, as `column-types.ts` has), `files_indexed`,
  `files_skipped`, `truncated` (boolean), `created_at`). One migration, all three dialects.
- The text is stored as `path\0text` blocks so snippets can name the file.

## Documentation

- **Items › Searching** (`items#search`): file contents are searched for the listed version, up to
  the cap; snippets; what isn't found.
- **`rmk`** (`rmk#search`, or the topic's search section): "matched in", and older servers.
- **MCP** (`mcp`): `search_items` returns where it matched.
- **Install guide** and the **Settings** runbook: `RONNE_SEARCH_CONTENTS` and
  `RONNE_SEARCH_CONTENTS_MAX_KIB`, with the benchmark's memory numbers.
- Helpers: none new (143's helper points at `items#search`).

## Acceptance criteria

- [ ] A word that appears only in an item's file finds the item, with the file's path and a snippet,
  in the dialog, on `/search`, in `GET /api/v1/search`, in `rmk search` and in `search_items`.
- [ ] Every newly published version gets its `search_texts` row in the release's transaction;
  existing versions get theirs from the backfill, which resumes after a restart and is safe on
  several processes at once.
- [ ] Binary files and text past the cap are left out and counted.
- [ ] Contents never show for an item the reader can't open (142's tests extended to snippets).
- [ ] `rmk search` and the MCP server work against a server with and without `GET /api/v1/search`.
- [ ] The benchmark runs on SQLite and PostgreSQL at 1,000, 5,000 and 10,000 items; its numbers are
  in PLAN.md's Notes, and the targets are met or the chosen fix is recorded in this spec.
- [ ] `RONNE_SEARCH_CONTENTS` and `RONNE_SEARCH_CONTENTS_MAX_KIB` work as described.
- [ ] The migration runs on SQLite, PostgreSQL 15, MySQL 8.4 and MariaDB 10.11.
- [ ] The Documentation listed above says what the feature does.

## Decisions

1. **Text stored in the database at publish, not read from artifacts at rebuild** (Claude): 10,000
   artifacts unpacked on every revision change and on every replica would be slow and would hit
   storage; one row per version is a cheap read and survives S3 (110).
2. **Only the listed version** (Claude): it's what the catalogue shows and what `rmk install`
   gets by default; indexing every version multiplies memory for results people rarely want.
3. **A cap per version, settable by the operator** (Claude): the index lives in memory on every
   process, so its size must be bounded; 64 KiB covers typical skills and agents whole (the
   benchmark checks this against the examples in `examples/items/`).
4. **`rmk` and MCP move to the new endpoint, with a fallback** (Claude): AI tools searching for an
   item gain the most from contents; the fallback keeps a new `rmk` working against an instance not
   yet upgraded.

## Open questions

- Should root see the backfill's progress in Admin (a line in Settings), or is the log enough?
