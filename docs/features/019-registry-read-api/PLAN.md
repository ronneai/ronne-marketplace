# 019 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Conventions.** The domain-exception → API error mapper, query parsing (`limit`, `cursor`,
  enums), and the JSON shapes as typed serializers shared by the endpoints.
  *Done when:* unit tests cover the mapper and the parsers.

- [x] **2. Search and items.** `GET /items` and `GET /items/{scope}/{name}` over 018's services.
  *Done when:* database tests cover search, filters, sorts, paging, tags and versions (yanked and
  deprecated), 404s and 401s, on all four databases.

- [x] **3. Versions and tarballs.** `GET …/{version}` and `GET`/`HEAD …/tarball` with the checksum,
  caching headers, and the download count.
  *Done when:* database tests cover the manifest and files, a yanked download, `ETag`/304, a
  missing or corrupt artifact, and concurrent downloads each counted once.

- [ ] **4. End to end.** A Playwright test (or an API test against the built app) that makes a
  token in the web app, downloads a published item's tarball with it, and sees Most used on the
  home page.
  *Done when:* it passes in CI.
- [ ] **5. Documentation.** The "Tokens and the API" section and the Access tokens helper.
  *Done when:* the docs render tests cover the section, and the helper's link lands on it.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 019 without answering the
  spec's open questions: tarballs need a token, and every successful download counts.
- **Task 1 (2026-09-28): conventions.** `server/http/api-query.ts` parses `limit` (1–100, 20 by
  default), `type`, `sort` and `q`, refusing what it doesn't understand. `domainErrorResponse` in
  `errors.ts` maps `ItemNotFoundError` and `VersionNotFoundError` to 404 `item_not_found` and
  `version_not_found`. `registry-json.ts` has the item, version and summary shapes. The catalogue
  service gains `searchCatalogue` (a page without type counts, with `limit`), which the web
  catalogue now builds on; the items domain gains `searchCatalogueAs` and `itemPageAs`, which take
  the token's user; `Item` carries `downloadCount`. The spec keeps 009's token error codes instead
  of a single `unauthorized`.
- **Task 2 (2026-09-28): search and items.** `server/http/registry-api.ts` has `listItems` and
  `getItem`, taking the token guard and the app as injectable deps for tests; the routes in
  `app/api/v1/items/` only call them. A leading `@` in the path's scope is accepted.
- **Task 3 (2026-09-28): versions and tarballs.** `getVersion` answers 018's item page data for one
  version (`versionJson`). `getTarball` serves `GET` and `HEAD`: `findDownload` looks the version up
  without touching storage (HEAD, and a matching `If-None-Match` for a 304), and `downloadArtifact`
  (`items/services/downloads.ts`) reads the file, checks its sha256, and counts it with
  `countDownload`, a single `UPDATE … download_count + 1`. A missing or corrupt file is
  `ArtifactUnavailableError`, 500 `artifact_unavailable`, not counted. The spec now says only the
  tarball is cached as immutable: a version's JSON can still change (deprecated, yanked, tags).
