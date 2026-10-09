# #141 — The resolver tries an older version when the newest one in range conflicts

> GitHub: [#141](https://github.com/ronneai/ronne-marketplace/issues/141) · Feature: [020](../../features/020-resolver/SPEC.md) · Reported on: 0.3.2 · Design: [MVP §4.3](../../MVP/MVP.md#43-install--update), [§15](../../MVP/MVP.md#15-decision-log)

## Report

- A `1.1.0` depends on B `^1.0.0`. B `1.1.0` fits and depends on nothing.
- B `1.2.0` is published later. It also fits `^1.0.0`, and it depends on A at exactly `1.0.0`.
- `rmk install` of A fails with `resolve_conflict`: no version of A fits every range asking for
  it, `1.1.0` (the request) and `1.0.0` (B `1.2.0`).
- `rmk update` on a lock that already has A `1.1.0` fails the same way.

B `1.1.0` still fits and would install cleanly. The resolver (`packages/core/src/resolve.ts`)
takes the newest version that fits the ranges it has so far. On a conflict it throws, and never
tries an older version of the item whose dependencies caused the conflict. So publishing a new
version of one item can stop another item that is already published from installing, though
its author did nothing.

## Goal

When the newest version in range leads to a conflict, the resolver tries older versions in that
range. An install fails only when no choice of versions within the ranges works.

## Scope

**In:**
- **Backtracking in `resolve()`.** When an item has no version that fits every range asking for
  it, the resolver goes back to an item whose chosen version added one of those ranges. It
  excludes that version and resolves again, so the next older match is tried.
- **The same for a dependency's range that nothing matches** (`no_matching_version` raised by a
  range a chosen version added). An older version of the item that asked may not need it.
- **Lockfile preference stays.** A locked version that still fits is chosen first. When it is the
  one causing the conflict, it is set aside like any other version, and the resolver tries the
  newest version below it in range first.
- **Every caller gets it at once:** `rmk install` and `rmk update`, the MCP server, and the
  registry's `POST /api/v1/resolve`, since they all call `resolve()` (MVP §4.3).
- **MVP §4.3 and a §15 decision-log entry.**

**Out:**
- **Choosing which versions get published.** The registry still accepts B `1.2.0`. Submit-time
  checks (013, `registry-checks.ts`) don't predict conflicts with other items.
- **A missing item or tag** (`item_not_found`, `tag_not_found`) asked for by a dependency. It
  stays an error, as today (decision 4).
- **Cycles found after resolving.** The final cycle check is unchanged. Submission already
  refuses cycles.
- **Several versions of one item side by side.** It's still one version per item (MVP §4.3).

## Behaviour

- **First try: the same as today.** The highest non-yanked version that fits, or the locked one.
  When that works, the result is identical to 0.3.2, so nobody's lockfile changes.
- **On a conflict over X.**
  - The candidates are the chosen versions `Y@v` whose dependencies added a range on X.
  - The request's own ranges are never candidates.
  - The resolver tries the candidates one at a time, in name order. For each, it excludes `Y@v`
    and starts again from the request, keeping every exclusion made so far on that path.
  - With `Y@v` excluded, Y gets the next older non-yanked version that fits its ranges. That can
    add different ranges, or none.
- **Deterministic.** The same registry and request always give the same result. Item names are
  taken in sorted order and versions newest first, so the search prefers newer versions, item by
  item, in name order.
- **Bounded.** The existing `MAX_STEPS` counts steps across every attempt, so it bounds the
  attempts too: each takes at least one step. Once versions are being set aside, a budget on range
  checks (a version against one range) applies as well, so an item with thousands of versions, or
  one that many items ask for, can't keep a resolution going for long. Reaching either limit
  reports the original conflict. Each item's versions are sorted once,
  and each item, missing ones too, is read from the registry once.
- **When nothing works,** the error is the conflict (or `no_matching_version`) from the first
  try, with the same code, message and details as today. That is what the user can act on: the
  ranges as the newest versions asked for them.
- **Warnings** (deprecated) come from the versions finally chosen, as today.

## Edge cases

- **The issue's case:**
  - `rmk install A` gives A `1.1.0` and B `1.1.0`.
  - `rmk update` with a lock of A `1.1.0` and B `1.1.0` keeps both.
  - With a lock of A `1.1.0` and B `1.2.0` (written by a resolver that allowed it), it moves B to
    `1.1.0`.
- **The request pins the conflicting item exactly,** and every version of the other item in range
  asks for something else. The install fails with the first try's `resolve_conflict`.
- **A yanked version is never tried as a fallback,** unless it's the locked one (today's rule).
- **Two items both cause the conflict.** It still resolves when excluding either one's version
  works. When excluding both is the only way, it resolves too, since exclusions add up along the
  search.
- **An older version brings in a new dependency.** Its ranges are added and resolved like any
  others, and a conflict there can backtrack again.
- **A pre-release** is tried only when a range names one (semver's rule, as today).
- **A first try that keeps changing versions** ("The dependencies keep changing each other's
  versions.") blames no version, so nothing older is tried, as today, even where a choice of
  older versions would work. Random registries showed it only with items that need each other
  across three or more items (allowed since 112). Making that first try search too is left for
  later.
- **A registry read that fails** while versions are set aside fails the install with that error,
  never hidden behind the first conflict.

## Documentation

- **`rmk` → Installing** (`rmk#installing`) and **Updating** (`rmk#updating`), on the website
  (`../ronne-web`, en/pt/fr): "the newest version that works with every other item", and a
  conflict means no combination fits. Changed only if those sections describe the version choice
  today. The witness checks.
- **Helpers:** none. The CLI has no inline help that names the rule.

## Acceptance criteria

- [ ] The issue's scenario installs A `1.1.0` with B `1.1.0`, through `resolve()` and through
  `rmk install`. `rmk update` on its lock succeeds.
- [ ] Every existing resolver test passes unchanged, except the one that asserts the old rule
  ("doesn't search older versions to escape a conflict"), which now resolves to the older
  version. A request that resolved before resolves to the same versions.
- [ ] A conflict with no solution still fails with `resolve_conflict` and the same message and
  details as before.
- [ ] A conflict that needs two exclusions resolves. A registry built to explode stops at the
  limit with the first conflict, within a test timeout, and one with 20,000 versions per item
  only stays quick because of the budget on version checks.
- [ ] `POST /api/v1/resolve` returns the backtracked resolution (API test).
- [ ] MVP §4.3 says the resolver falls back to older versions, and §15 records the decision.
- [ ] The Documentation listed above says so, in English, Portuguese and French.

## Decisions

1. **Backtrack instead of failing** (owner, 2026-10-08). A later release of a dependency must not
   break an item that was installable. Installs still prefer the newest versions.
2. **The error is the first try's** (Claude). It names the newest versions' ranges, which is
   what an author can change. A list of every combination tried would not help.
3. **Today's result whenever today's works** (Claude). Backtracking runs only after a conflict,
   so nobody's lockfile changes.

4. **A missing item stays an error** (owner, 2026-10-09). A dependency's `item_not_found` or
   `tag_not_found` doesn't backtrack: an item that's gone, or in a private workspace the caller
   can't see (093), is rare and better reported than silently avoided with older versions.

## Open questions

None.
