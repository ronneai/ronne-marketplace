# 142 — Search index in the server

> Milestone: M22 · Depends on: 018, 019, 079, 093, 114, 118 · Design: [MVP §9.4](../../MVP/MVP.md#94-database) ("Search"), [MVP §15](../../MVP/MVP.md#15-decision-log) ("Search") · Contracts: [MVP §11](../../MVP/MVP.md#11-rest-api-sketch-apiv1) (`GET /api/v1/search`, new)

## Goal

Today the catalogue finds items with a case-insensitive `LIKE` on the name, scope, description and
keywords (`db/search.ts`, MVP §9.4), which knows nothing about relevance, typos or how words are
written. The owner wants a search that finds any content of any item, from every page, with the
engine shipped inside Ronne: no new Docker image, no second process (owner, 2026-10-29). This
feature is the engine and the rules every caller relies on: what is indexed, how it stays current
on one replica or many, and that nobody ever finds an item they couldn't open. 143 puts it on every
page; 144 adds the files' contents and measures it at scale.

## Scope

**In:**
- **An in-process engine behind a port.** `SearchIndex` in `server/domains/search/` (a new domain:
  `models`, `services`, `repositories`, `actions`), with one adapter on
  [Orama](https://github.com/oramasearch/orama) (`@orama/orama`, Apache-2.0, no dependencies).
  The engine runs inside the web app's Node.js process, so the Docker image (005, 035), the npm
  server (082) and the bundles (084) need nothing new. Nothing outside the adapter imports Orama.
- **What is indexed, per item** (the listed version, `items.listed_version_id`, as the catalogue
  shows it):
  - its full name as people write it (118): `@scope/name` in `global`, `@workspace/scope/name`
    elsewhere, and each old name kept as an alias (`item_aliases`), so an old name still finds it;
  - its type, description and keywords;
  - the workspace's id and whether it's personal and whose (114), stored but never searched.
- **Kept current with the catalogue revision** (079): each search reads the revision (one row);
  when it differs from the index's, a rebuild starts in the background and the search is answered
  from the index it has. Every process builds its own index from the database, so replicas (M17)
  need nothing shared.
- **Visibility, twice** ([risky]):
  - the engine's query is limited to the workspaces the viewer sees (093), and for root to all but
    other users' personal workspaces unless one is named (114), as `inVisibleWorkspace` and
    `inListedWorkspace` decide;
  - the ids it returns are then read through the catalogue repository with the same viewer, so an
    index a step behind (a member just removed, a workspace just made private, a scope just moved)
    can't show anything the database wouldn't. A result the database drops is dropped, not shown.
- **Ranking:** name and aliases first, then keywords, then description; prefix matching on the last
  word (for typing as you go); one typo allowed in words of five letters or more; accents and case
  folded alike on every database, unlike `LIKE` on SQLite (092).
- **Until the first build ends** (a cold start), the search falls back to today's `LIKE` query, so
  results never disappear while the server starts.
- **`GET /api/v1/search?q=&workspace=&type=&limit=&cursor=`** (bearer, as the read API, 019): items
  in rank order with where they matched (`name`, `alias`, `keywords`, `description`), and a cursor.
  Same errors and limits as `GET /api/v1/items`. `GET /api/v1/items?q=` is unchanged.
- **A web action**, `searchEverywhere`, the same service behind a session, for 143.
- **Logs:** a rebuild logs its revision, item count and time at `info` (100); the query text is
  never logged.

**Out** (and where it goes instead):
- **The search box on every page and the results page:** 143.
- **Files' contents, `rmk search` and the MCP server, the benchmark:** 144.
- **The catalogue's own search box** keeps `LIKE` with its filters and sorting: it filters a list,
  the global search finds things. Moving it over is an open question.
- **Drafts and submissions** (the author's own, or those in review): not indexed. They change all
  the time and their readers differ per submission (091); a later feature, if asked.
- **Workspaces, scopes, users, the Documentation:** not indexed here (143 lists pages to go to).
- **A separate engine** (Meilisearch, Typesense, OpenSearch) or the databases' own full-text
  search: not chosen (Decisions 1 and 2). The port leaves room for one later.
- **Vector or semantic search:** later. Orama supports it, which 149 (overlap and redundancy) may
  use; nothing here depends on it.

## Behaviour

**Building.** `buildSearchIndex(db)` reads every listed item with its scope, workspace, listed
version and aliases in pages of 500 (keyset, 060), and inserts them into a new Orama database; when
it's done it replaces the old one in one assignment, with the revision it was read under. One build
runs at a time per process; a second revision change during a build starts one more after it.
Building reads the revision first and the rows after, so a change that lands mid-build raises the
revision again and is picked up by the next build.

**Searching.** `searchItems(viewer, { q, workspace?, type?, limit, cursor? })`:
1. Trim `q`; an empty query, or one longer than 200 characters, is refused as `invalid_query`.
2. Work out the allowed workspaces from the viewer (none signed out; nothing is public).
3. Ask the engine for up to `limit + 1` ids past the cursor, with `where` on the allowed
   workspaces, the workspace and the type when given.
4. Read those ids through the catalogue repository (visible, listed), keep the engine's order and
   drop the ones it doesn't return.
5. Answer the items with their match fields and `nextCursor` (the rank offset and the revision; a
   cursor from another revision starts again at the top).

**The port.** `SearchIndex` has `build(documents)`, `search(query, filter, page)` and `revision`.
Tests run against the Orama adapter and an in-memory fake, so services stay engine-free.

## Edge cases

- **A workspace made private, or a member removed:** the next search still uses the old index until
  its rebuild ends, but step 4 drops anything the viewer no longer sees (tested).
- **An item moved or renamed** (113, 115, 134, 118): the revision is raised; the old name finds it
  as an alias once rebuilt, and through the catalogue's alias lookup in the fallback.
- **A yanked or deprecated version:** the listed version decides, as in the catalogue.
- **A rebuild that fails** (the database is down): logged at `error`, the old index keeps
  answering, and the next search tries again (at most once a minute).
- **A query of only punctuation or `@`:** no words, so no results, not an error.
- **Root naming another user's personal workspace** (`workspace=`): searched, as the catalogue does.
- **Memory:** the index holds metadata only here (a few hundred bytes per item); 144 measures it
  with contents.

## Data

- No migration. The index lives in each process's memory and is rebuilt from the database.
- `catalogue_revision` is reused. Task 2 checks every write that changes an indexed field raises it
  (descriptions, versions, tags, deprecations, yanks, moves, renames, visibility) and adds the ones
  that don't (scope renames, if missing).

## Documentation

- **Items**, a new section `items#search` ("Searching"): what is searched, how results are ranked,
  that only items you can open are found, and that results can lag a change by a few seconds.
- **`rmk`** and **MCP**: nothing yet (144).
- **API:** the website's API reference, if it lists endpoints, gets `GET /api/v1/search`.
- Helpers: none here (143 adds the search box and its helper).

## Acceptance criteria

- [ ] Searching finds items by full name, old name, keywords and description, ranked in that order,
  with prefix matching and one typo, accents and case folded the same on SQLite, PostgreSQL and
  MySQL/MariaDB.
- [ ] Nobody finds an item in a workspace they don't see; root doesn't find other users' personal
  items unless the workspace is named. Tests cover a stale index after a member is removed, a
  workspace made private and a scope moved out.
- [ ] A change to an indexed field is found after the rebuild that its revision starts, on every
  process; before the first build, the `LIKE` fallback answers.
- [ ] `GET /api/v1/search` answers ranked items with their match fields and a cursor, with the read
  API's errors and limits; `GET /api/v1/items` is unchanged.
- [ ] No new image, process or service: the Docker image, `rmk-server` and the bundles run it as
  they are (the release smoke and the bundle smoke pass).
- [ ] The query text is never logged.
- [ ] The Documentation lists above say what the feature does.

## Decisions

1. **An in-process JavaScript engine, not a search server** (owner, 2026-10-29: "natively", no new
   image; Claude): Meilisearch or Typesense would be a second process to start, supervise, back up
   and upgrade, which the npm package (082), the service (083) and the bundles (084) can't carry,
   and an extra container breaks "one image". In memory, rebuilt from the database, the index needs
   no backup (099) and no sharing between replicas.
2. **Not the databases' own full-text search** (Claude): SQLite FTS5, PostgreSQL `tsvector` and
   MySQL `FULLTEXT` rank, tokenize and fold differently, and MVP §9.4 keeps one behaviour on all
   three.
3. **Orama over MiniSearch** (Claude, checked 2026-10-29): both have no dependencies and an allowed
   licence (Orama Apache-2.0, 3.1.18; MiniSearch MIT, 7.2.0). Orama has typed `where` filters on
   enum fields (the workspace filter runs inside the engine, before ranking and paging), BM25,
   typo tolerance and a vector index 149 may use; MiniSearch filters after scoring and has no
   vectors. Task 2 checks this choice with the benchmark's first numbers before the adapter
   lands; MiniSearch is the fallback behind the same port.
4. **The database checks every result again** (Claude): the index is a cache and can lag; the
   visibility rule lives in one place (`visible.ts`), and search never becomes a second
   implementation of it.
5. **Rebuild whole, not in steps** (Claude): the catalogue revision says *that* something changed,
   not *what*. A full metadata rebuild at 10,000 items is expected well under a second; 144 measures
   it with contents and adds steps only if the numbers ask for them.

## Open questions

- Should the catalogue's search box use the index too (ranking, typos), keeping its filters?
- Should the search find the reader's own drafts and the submissions they can review?
