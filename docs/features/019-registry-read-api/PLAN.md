# 019 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Conventions.** The domain-exception → API error mapper, query parsing (`limit`, `cursor`,
  enums), and the JSON shapes as typed serializers shared by the endpoints.
  *Done when:* unit tests cover the mapper and the parsers.

- [ ] **2. Search and items.** `GET /items` and `GET /items/{scope}/{name}` over 018's services.
  *Done when:* database tests cover search, filters, sorts, paging, tags and versions (yanked and
  deprecated), 404s and 401s, on all four databases.

- [ ] **3. Versions and tarballs.** `GET …/{version}` and `GET`/`HEAD …/tarball` with the checksum,
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
