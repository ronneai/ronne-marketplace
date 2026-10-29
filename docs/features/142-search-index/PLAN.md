# 142 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §9.4's "Search" row, §11's `GET /search` and §15's "Search" row say what SPEC.md's
    Decisions say.
  - `docs/features/README.md` lists 142 in M22 with its dependencies.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. Engine check and the dependency.**
  - A throwaway script builds Orama and MiniSearch indexes from 10,000 generated items (names,
    descriptions, keywords) and prints build time, heap used, and the median and 95th-percentile
    query time with a workspace filter of 1 and of 50 workspaces.
  - If Orama holds, add `@orama/orama` to `apps/web` through
    [the dependency policy](../../policies/dependencies.md) checklist (latest stable, licence,
    `minimumReleaseAge`, no install scripts); if not, MiniSearch, and SPEC.md's Decision 3 changes.
  - *Done when:* the numbers are in this plan's Notes, `pnpm install --frozen-lockfile`,
    `pnpm licenses:check` and `pnpm audit --audit-level high` pass.

- [ ] **3. Revision coverage.** [risky]
  - List every write that changes an indexed field (description, listed version, tags, deprecation,
    yank, item and scope moves, renames, aliases, workspace visibility) and check each raises the
    catalogue revision in its transaction; add the ones that don't.
  - *Done when:* a db test per write shows the revision raised, and the existing feed tests pass.

- [ ] **4. The port, the adapter and the builder.**
  - `server/domains/search/`: `SearchIndex` and its documents in `models`, the Orama adapter and a
    fake in `repositories`, `buildSearchIndex` reading listed items in keyset pages.
  - Ranking, prefix, one typo, accent and case folding as SPEC.md says.
  - *Done when:* unit tests on the adapter cover ranking order, prefix, typo, accents, aliases and
    the `where` filter; a db test builds from a seeded database on the four databases.

- [ ] **5. The search service.** [risky]
  - The process's index, its revision check, one background rebuild at a time, the `LIKE` fallback
    before the first build, and a failed rebuild keeping the old index.
  - Visibility: the allowed workspaces in the engine's query, then the ids read again through the
    catalogue repository with the viewer.
  - *Done when:* db tests cover a member, a non-member, root and a signed-out viewer; a stale index
    after a member is removed, a workspace made private and a scope moved out (nothing leaks); root
    and another user's personal workspace named and not; the fallback; a failed rebuild; the cursor
    across a revision change.

- [ ] **6. `GET /api/v1/search` and the web action.** [risky]
  - The route through `apiRoute` with the read API's bearer guard, errors and limits; `searchEverywhere`
    as a server action over the same action.
  - No query text in any log line.
  - *Done when:* route tests cover the answer, `invalid_query`, an unknown workspace, a token whose
    user sees nothing, the cursor, and a log capture without the query.

- [ ] **7. Documentation.**
  - The `items#search` section (website, three languages) and the API reference, if it lists
    endpoints; `topics.ts` here and in ronne-web.
  - *Done when:* the docs render tests pass, and the section is reachable from `topics.ts`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
