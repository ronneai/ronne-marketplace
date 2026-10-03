# 079 — Plugin feeds at scale

> Milestone: M11 · Depends on: 077, 078 · Design: [MVP §3.3](../../MVP/MVP.md#33-platform-renderers), [§15](../../MVP/MVP.md#15-decision-log) · Contracts: [`docs/spec/plugin-feeds.md`](../../spec/plugin-feeds.md)

## Goal

077 left an open question: what happens when an instance's Claude Code marketplace nears the limits
Claude Code puts on it? The answer for now (owner, 2026-10-03) is to measure first, cache the
marketplace, warn root early, and point large instances at the git mirror. Splitting the marketplace
by scope waits until a measurement or a real instance shows it's needed.

## Why

Claude Code reads a URL marketplace only if it's at most **5 MiB** and arrives within **10 seconds**
(checked 2026-10-03). One entry is about 400–500 bytes, so the size limit is near 10,000 items, far
above what a curated, self-hosted registry is expected to hold. Time may run out sooner: today every
request pages through the whole catalogue and reads one sidecar per item from storage. Until now the
first sign of trouble was a 507 `feed_too_large`.

Splitting by scope would cost every user: several marketplaces to add per instance, `plugin-setup`
choosing among them, and dependencies that cross marketplaces, which Claude Code allows only when
the marketplace opts in (`allowCrossMarketplaceDependenciesOn`). So it isn't built until it's needed.

## Scope

**In:**
- A benchmark script that measures each tool's marketplace (size and time) at 1,000, 5,000 and 10,000
  items, on SQLite and PostgreSQL. Not run in CI.
- A **catalogue revision**: a counter that goes up whenever something that can change a feed changes.
- A **marketplace cache**: each tool's marketplace file kept in memory per revision, so a request
  with nothing new released doesn't touch the catalogue or the storage.
- **Feed stats and warnings**: each build records the marketplace's size, plugin count and build
  time. Past 80% of a limit, the server logs a warning and root sees a notice in Admin › Settings.
- **The 5 MiB cap only for Claude Code**, with a 507 message that names the fallback: the git mirror.
- The trigger for splitting, written in the decision log.

**Out:**
- Per-scope marketplaces (sketched under Later).
- A cache shared between server processes. Each process keeps its own, and builds it once per
  revision.
- Changing the zip cache: zips are already built once per version and builder version (077).

## Behaviour

**The benchmark.** `pnpm --filter @ronneai/web bench:feeds [--items 1000,5000,10000] [--tools …]
[--db sqlite|postgres|mysql]` runs `apps/web/scripts/feed-benchmark.ts`. It uses a throwaway database:
SQLite in memory by default, or a new database on the local test servers (`pnpm test:db:up`),
created and dropped as the database tests do, so it never touches a real one. It seeds skills,
each a small artifact with a description of about 160 characters, into a temporary storage folder,
and prints a Markdown table with, per tool and item count:
- the marketplace's size, and how close it is to 5 MiB;
- the time of a **cold** request (no zips built yet: every plugin is built);
- a **warm** one (the zips built, the marketplace built again);
- a **repeat**, the same request again. It equals the warm one before the cache; with the cache
  (task 3) it's answered from memory, and the cold and warm columns each start with an empty one.

The cold numbers ignore the 5-second build budget (077), so they show the real cost. The results go
in PLAN.md's notes and the Measured section below.

**The catalogue revision.**
- One counter for the instance, stored in the database, starting at 0.
- It goes up by one in the same transaction as every change that can change a feed:
  - a release (a new version);
  - a tag moved or removed;
  - a version deprecated or undeprecated;
  - a version yanked or unyanked;
  - an item's description changed.
- The item repository does it, as it already refreshes the catalogue listing on those changes
  (`ItemRepository`), so no caller can forget it.

**The marketplace cache.**
- The served marketplace file is kept in the server's memory, keyed by tool, the database's id, the
  catalogue revision, `PLUGIN_BUILDER_VERSION` and `PUBLIC_URL`. A request reads the revision (one
  query) and answers from the cache when the key matches. One file per tool is kept: a newer key
  replaces the older one.
- The database's id is a random id the migration writes next to the counter. Without it, another
  database at the same revision (a test's, or a dev instance after `reset-setup` or a new
  `DATABASE_URL` without a restart) could be answered from this one's cache.
- Every signed-in user reads the same feed, so one file serves them all. The token is still checked
  on every request.
- Only a **complete** marketplace is cached: one where no plugin was left out for the build budget
  or a failed build. Otherwise the next request builds again, as in 077.
- **Building the rest in the background** (owner, 2026-10-03, after the baseline showed the cold
  path): when a request runs out of build budget, it answers what it has, and the server then builds
  every missing plugin with no budget, after the response is sent (Next.js `after`). At most one
  such build runs per tool at a time. The next request then lists everything, and is cached. A
  failed build isn't retried in the background: the next request tries it again.
- The `ETag` and the 304 behaviour don't change.

**Feed stats.**
- Each time a **complete** marketplace is built (not answered from the cache, and nothing left
  out), the server records for that tool: its size in bytes, its plugin count, how long the build
  took, the revision, and when. A build that's refused with a 507 is still recorded, so root sees
  why. One that ran out of budget isn't: its numbers would be too small.
- Past either threshold, it logs a warning once per revision, across every server process sharing
  the database (the row remembers the revision it warned for):
  - **size**: at least 4 MiB, which is 80% of Claude Code's limit (Claude Code only);
  - **time**: the build took at least 5 seconds, half of Claude Code's 10 (any tool, since the CI
    job's request can time out too).

**Admin › Settings › Plugin feeds** (root only) shows, per tool:
- the last build's size, plugin count, build time and date, or "Not built yet";
- for Claude Code, a warning notice (amber) past either threshold, saying which limit is near and
  that the git mirror has no such limit.

**The size cap.**
- Only the Claude Code route answers 507 `feed_too_large` past 5 MiB. Codex's and Cursor's
  marketplaces are read only by `rmk feed build`, which has no such limit.
- The 507's message says that Claude Code reads at most 5 MiB from a URL, and that the instance's
  git mirror (`rmk feed build`), added in Claude Code as a repository, has no such limit.

**The trigger for splitting.** Per-scope marketplaces get specified and built when either:
- the benchmark shows a **warm** build of at least 5 seconds at 5,000 items or fewer, even with
  the cache; or
- a real instance's stats show either warning.

Until then, the open question in 077 points here.

## Edge cases

- **A restart empties the cache.** The first request after it builds the marketplace again; the zips
  are still cached, so that's a warm build.
- **A new instance, or a new `PLUGIN_BUILDER_VERSION`**, has no zips: the first request lists what
  it built in 5 seconds and starts the background build for the rest (about 5 ms a plugin on
  PostgreSQL), so a 10,000-item instance is complete about a minute later.
- **Two requests on a revision not yet cached** may both build it. Both answer correctly, and the
  cache keeps one.
- **A change commits during a build.** The build may have read the old data, so it's stored under
  the revision read *before* the build started. The next request sees the newer revision and
  builds again.
- **`PUBLIC_URL` changes** (setup, 036): it's part of the key, so the URLs in the cached file never go
  stale.
- **Several server processes** keep one cache each, and record stats each time they build.

## Later: per-scope marketplaces

Not built in 079. The design, if the trigger fires:
- `GET …/claude-code/marketplace.json?scope=team`, named `ronne-<host>-team`, with the scope's items;
- `rmk plugin-setup claude-code --feed-scope team`;
- the whole-instance marketplace kept for small instances;
- dependencies across scopes allowed with `allowCrossMarketplaceDependenciesOn`.

## Measured

Filled in by tasks 1 and 6.

## Documentation

- **Plugin marketplaces** topic (`plugins`): a new section *Large marketplaces* (`large`):
  - the 5 MiB and 10-second limits Claude Code puts on a marketplace read from a URL;
  - that the marketplace is cached until something is released, yanked, tagged or deprecated;
  - the warning in Admin › Settings;
  - the git mirror as the way past the limit.
- **Admin** topic (`admin`): a sentence on the Plugin feeds panel under Settings, linking to *Large
  marketplaces*.
- An inline helper on the panel, "What do these numbers mean?" (`plugin-feeds`), linking to *Large
  marketplaces*.

## Acceptance criteria

- [ ] The benchmark runs on SQLite and PostgreSQL, and its numbers before and after the cache are in PLAN.md's notes and the Measured section.
- [ ] Each change in the revision's list raises it by one, in the same transaction; a failed change doesn't (database tests on SQLite, PostgreSQL and MySQL).
- [ ] With nothing changed, a second marketplace request reads neither the catalogue nor the storage. After a release, the next one has the new item.
- [ ] A marketplace with a plugin left out isn't cached.
- [ ] Stats are recorded on each build. Past each threshold the server logs one warning per revision, and Admin › Settings shows the notice.
- [ ] Codex's and Cursor's routes never answer 507. Claude Code's 507 names the git mirror.
- [ ] The decision log has the trigger, and 077's open question points here.
- [ ] The Documentation and the inline helper listed above say what the feature does now.
