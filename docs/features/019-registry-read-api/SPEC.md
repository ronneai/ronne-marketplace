# 019 — Registry read API

> Milestone: M4 · Depends on: 009, 015, 018 · Design: [MVP §4.3](../../MVP/MVP.md#43-install--update), [§11](../../MVP/MVP.md#11-rest-api-sketch-apiv1), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

`rmk` and the registry MCP server can read everything they need over `/api/v1` with a personal
access token (009): search the catalogue, read an item with its tags and versions, read a version's
manifest and dependencies, and download its artifact. Downloads are counted, for the home page's
Most used (018).

## Scope

**In:**
- `GET /api/v1/items`: search and filter, over 018's catalogue service.
- `GET /api/v1/items/{scope}/{name}`: an item, its dist-tags and its versions.
- `GET /api/v1/items/{scope}/{name}/{version}`: one version's manifest, dependencies, files and risk flags.
- `GET /api/v1/items/{scope}/{name}/{version}/tarball`: the artifact, with its checksum, counted.
- The response and error shapes every later endpoint follows.

**Out:**
- `POST /api/v1/resolve` → 020, with the resolver it runs.
- Writing through the API (authoring, review, release, admin): web only in the MVP (MVP §11).
- Rate limits on reads, and the `426` "rmk too old" reply: when a breaking change first needs them.

## Behaviour

**Access.** Every endpoint needs a bearer token (009's guard: `Authorization: Bearer rmk_…`). A
missing, invalid, expired or revoked token, or a disabled user's, gets 401 with 009's codes
(`token_missing`, `token_invalid`, `token_expired`, `token_revoked`, `user_disabled`), which
clients may already rely on; before setup, 503 `setup_required`. Tokens read what any signed-in user reads in the web app: everything published.
Cookies are ignored (009).

**Names in paths.** `{scope}` and `{name}` are the item name's parts, without `@`
(`/items/platform/code-reviewer`). `{version}` is an exact version; tags and ranges are 020's.

**`GET /items`** — query: `q`, `type`, `scope`, `sort` (`recent` or `name`), `cursor`, `limit`
(default 20, at most 100). Unknown `type` or `sort` is 400 `invalid_request`, not ignored as the
web page does, so scripts find their mistakes.

```json
{
  "items": [
    {
      "name": "@platform/secure-coding",
      "type": "skill",
      "description": "Checks code for common security mistakes.",
      "keywords": ["security", "review"],
      "version": "2.3.0",
      "publishedAt": "2026-09-28T10:00:00.000Z",
      "deprecated": null,
      "installable": true,
      "risky": false,
      "downloads": 42
    }
  ],
  "nextCursor": null
}
```

**`GET /items/{scope}/{name}`**

```json
{
  "name": "@platform/secure-coding",
  "type": "skill",
  "description": "…",
  "owner": "Ada Author",
  "downloads": 42,
  "tags": { "latest": "2.3.0", "next": "2.4.0-beta.1" },
  "versions": [
    {
      "version": "2.3.0",
      "publishedAt": "2026-09-28T10:00:00.000Z",
      "sha256": "c07e…",
      "size": 4096,
      "deprecated": null,
      "yanked": false,
      "dependencies": { "@platform/github-mcp": "^1.1.0" }
    }
  ]
}
```

Versions are newest first, yanked ones included and marked, since a lockfile may pin one.
`deprecated` is the message or null. An item without a published version is 404.

**`GET /items/{scope}/{name}/{version}`** adds, for that version: `manifest` (as released, with
`version`), `readme`, `files` (`path`, `size`, `executable`), `riskFlags` (014), `notes`, and the
same `deprecated` and `yanked` (with its `reason`).

**`GET …/{version}/tarball`** returns the `.tgz` (`application/gzip`) with `X-Checksum-Sha256` and
`Content-Length`, from the StorageAdapter (015). A yanked version still downloads: a lockfile that
pins it keeps working (MVP §4.3). Each successful download adds one to the item's
`download_count` in a single `UPDATE … SET download_count = download_count + 1`; nothing about who
downloaded is stored. A `HEAD` request answers the same headers without counting. A stored file
that's missing, or whose checksum doesn't match the version's, is 500 `artifact_unavailable` and
isn't counted.

**Caching.** A tarball never changes, so it carries
`Cache-Control: private, max-age=31536000, immutable` and an `ETag` of the sha256 (`If-None-Match`
answers 304, not counted). Search, item and version responses are `private, no-cache`: a version's
files never change, but it can still be deprecated, yanked or re-tagged.

**Errors** use MVP §11's shape, with these codes: 009's token codes (401), `invalid_request` (400),
`item_not_found` and `version_not_found` (404), `artifact_unavailable` (500), `setup_required` (503).

**Where it lives.** Route handlers in `app/api/v1/items/…` are thin adapters over the `items`
domain's actions (018's catalogue, 016's versions, 018's item page), with a mapper from domain
exceptions to API errors in `server/http/`. The domain actions the web pages use read the user from
the session; the API uses variants that take the token's user (`searchCatalogueAs`, `itemPageAs`).

## Edge cases

- **`%` and `_` in `q`:** escaped by 018's search helper.
- **Names with capitals or `@` in the path:** looked up as given after removing a leading `@`; names
  are lowercase, so anything else is 404.
- **A cursor from another sort or query:** starts from the first page, as the catalogue does.
- **Concurrent downloads:** each one is counted; the single `UPDATE` can't lose one.

## Documentation

- **Installing with rmk → a new section, "Tokens and the API":** what a personal access token is,
  where to make one (Account → Access tokens), that `rmk` and the MCP server read the registry with
  it, what a token can read (everything published), and that each download is counted for Most used
  without recording who downloaded.
- **Inline helper on the Access tokens page:** "What's a token for?", linking to that section.
- **Home page:** Most used needs no new text; its count is explained in the section above.

## Acceptance criteria

- [x] Each endpoint answers the shapes above, and 401 with 009's codes without a valid token, on all four databases.
- [x] Search, filters, both sorts and cursor paging match the catalogue, with `limit` capped at 100.
- [x] The tarball downloads with a matching `X-Checksum-Sha256`, yanked versions included, and each download adds exactly one to `download_count`, also under concurrent requests; HEAD and 304 don't.
- [x] Unknown items and versions are 404 with their codes; a missing or corrupt artifact is 500 `artifact_unavailable`.
- [x] The home page's Most used shows items once they've been downloaded (018).
- [x] The Documentation section and helper above are in the app, and the helper links to a real section.

## Open questions

Both answered by the owner on 2026-09-28, as built:

1. **Tarballs need a token.** The instance stays private, and `rmk` always has one.
2. **Every successful `GET` of a tarball counts.** Simple, and nothing about who downloaded is
   stored; a CI job that installs on every run counts every time.
