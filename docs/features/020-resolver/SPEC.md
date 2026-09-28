# 020 — Resolver

> Milestone: M4 · Depends on: 011, 019 · Design: [MVP §3.4](../../MVP/MVP.md#34-versions-and-dist-tags), [§4.3](../../MVP/MVP.md#43-install--update), [§11](../../MVP/MVP.md#11-rest-api-sketch-apiv1) · Contracts: [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

One function decides which version of every item an install gets: what the user asked for, plus
everything those items depend on, one version each. It lives in `packages/core`, so `rmk`, the MCP
server and the registry's `POST /api/v1/resolve` all resolve the same way (MVP §4.3).

## Scope

**In:**
- `resolve()` in `packages/core`, over a small `RegistryReader` interface, with no network or
  database code of its own.
- The rules of MVP §4.3: one version per item, conflicts, cycles, yanked and deprecated versions,
  dist-tags, and versions pinned by a lockfile.
- `POST /api/v1/resolve`, running it on the server over the database.

**Out:**
- Downloading, rendering and writing files → 021, 022.
- Several versions of one item side by side: never in the MVP, since rendered files are named after
  the item (MVP §4.3).
- Optional or peer dependencies: not in the manifest.

## Behaviour

**Input.**
```ts
type ResolveRequest = {
  /** What was asked for directly: a semver range, an exact version, or a dist-tag. */
  dependencies: Record<string, string>;
  /** Versions a lockfile already pins: kept when they still satisfy every range. */
  locked?: Record<string, string>;
};
```

**The registry it reads** (implemented over the HTTP API by `rmk`, and over the database by the web
app):
```ts
interface RegistryReader {
  /** An item's versions, yanked ones included, and its dist-tags; null if it doesn't exist. */
  item(name: string): Promise<{
    type: ItemType;
    tags: Record<string, string>;
    versions: { version: string; sha256: string; yanked: boolean; deprecated: string | null;
                dependencies: Record<string, string> }[];
  } | null>;
}
```

**Output.**
```ts
type Resolution = {
  /** One entry per item, as `rmk.lock` stores it (cli-files.md). */
  items: Record<string, { version: string; type: ItemType; sha256: string;
                          dependencies: Record<string, string> }>;
  /** Deprecated versions chosen, with their messages, for rmk to print. */
  warnings: { item: string; version: string; code: "deprecated"; message: string }[];
};
```
`dependencies` in each entry maps to the pinned versions chosen, as the lockfile does.

**Rules.**
- **Tags first.** A requested value that's a dist-tag (not a valid range) becomes that tag's exact
  version before anything else. An unknown tag fails with `tag_not_found`.
- **One version per item.** Each item gets the highest non-yanked version that satisfies every
  range asking for it, from the request and from every chosen version's dependencies.
- **Locks win while they fit.** A version in `locked` is kept if it satisfies every range, even if
  it's yanked (a pinned yanked version still installs, MVP §4.3). If it no longer fits, the item is
  resolved as if unlocked. `rmk update` passes no locks for the items it updates.
- **Deterministic.** The same request and registry always give the same result: items are
  processed in name order, and re-examined whenever a newly chosen version adds a range to them.
- **Conflicts fail.** If no version satisfies all the ranges on an item, resolution stops with
  `resolve_conflict`, naming the item and, for each range, who asked for it (the request, or
  `@scope/name@version`). Nothing is returned for the rest.
- **Cycles fail** with `dependency_cycle` and the path, though submission already refuses them (013).
- **Missing** items or versions fail with `item_not_found` or `no_matching_version`.
- **Deprecated** versions resolve normally and add a warning.

Failures are a `ResolveError` with a stable `code` and `details`, so `rmk` and the API can show the
same message.

**`POST /api/v1/resolve`** — body `ResolveRequest`, token required (019). It answers the
`Resolution`, or MVP §11's error shape: 409 `resolve_conflict` and `dependency_cycle`, 404
`item_not_found`, `tag_not_found` and `no_matching_version`, 400 `invalid_request` for a body that
isn't a map of names to ranges or tags, or has more than 200 entries.

## Edge cases

- **A range matched only by yanked versions:** `no_matching_version`, unless a lock pins one.
- **The same item asked for directly and as a dependency:** one entry, satisfying both.
- **A newer version of A needs a range of B that an older A didn't:** re-examining A and B settles
  on versions that fit, or fails with the conflict; there's no search through older versions of A
  (see Open questions).
- **Pre-releases:** a range only matches a pre-release if it names one (semver's own rule), so
  `^1.0.0` never picks `1.1.0-beta.1`.

## Documentation

- **Items and types → Dependencies:** how an install picks versions: one version of each item, the
  highest that fits every range asking for it; what a conflict looks like and how the author fixes
  it (widen a range, or release a version that fits); pre-releases only when a range names one.
- **Versions and tags → Tags:** a tag is resolved to its version when installed, and the lockfile
  keeps that version until `rmk update`.

## Acceptance criteria

- [ ] Unit tests cover each rule and edge case with an in-memory registry, including a conflict that names who asked for each range.
- [ ] The same request against the same registry always gives the same `Resolution`.
- [ ] `POST /api/v1/resolve` answers resolutions and each error code, on all four databases.
- [ ] The resolution's shape is exactly `rmk.lock`'s `items`.
- [ ] The Dependencies and Tags sections say how versions are chosen, as above.

## Open questions

The owner started 020 (2026-09-28) without answering these, so it's built on the recommendations;
either can still change.

1. **No backtracking** (recommended: the highest version that fits every range, re-examined as
   ranges arrive; a rare dead end is reported as a conflict the author can fix by widening a
   range), or a backtracking search that tries older versions to escape a conflict.
2. **`rmk` resolves with `POST /resolve`** (recommended: one request, and the server reads the
   database directly), or on the client with `resolve()` over the read API, one request per item.
