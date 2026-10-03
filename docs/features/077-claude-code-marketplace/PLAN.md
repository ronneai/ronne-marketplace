# 077 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Re-check Claude Code.** URL marketplaces, `archive` sources, `headers` /
  `headersHelper`, and the size and time limits. Update the contract if anything moved.
  *Done when:* `docs/spec/plugin-feeds.md` has today's date for Claude Code.

- [ ] **2. The feeds domain.** `server/domains/feeds/{services,actions,exceptions}`: list the feed's
  items, resolve members, build and cache zips through `StorageAdapter`.
  *Done when:* `plugin-feed.db.test.ts` covers listing, yanked, deprecated, an empty plugin, and a
  cache hit.

- [ ] **3. The routes.** `app/api/v1/feeds/[tool]/marketplace.json/route.ts` and
  `…/plugins/[scope]/[name]/[file]/route.ts`, over `server/http/feeds-api.ts`. Only `claude-code` is
  accepted for now; the others answer 404 until 078.
  *Done when:* route tests cover 401, 503 without `PUBLIC_URL`, 304, 404, and the download count.

- [ ] **4. `rmk auth headers`.** In `packages/cli`.
  *Done when:* a test checks stdout is only the JSON header, and that it exits 1 without a token.

- [ ] **5. `rmk plugin-setup claude-code`.** `packages/cli/src/plugin-setup.ts`, modelled on
  `mcp-setup.ts`, through the applier; also `--remove` and `--static-headers`.
  *Done when:* tests cover both scopes, removal, an edited key, and `--static-headers` refused at
  project scope.

- [ ] **6. Warn on both.** `rmk install` warns when the item is also enabled as a plugin from this
  registry.
  *Done when:* an install test covers the warning.

- [ ] **7. Documentation.** The topic, sections and helper in the spec's Documentation section.
  *Done when:* the docs render tests pass, and the Install panel helper links to the new topic.

- [ ] **8. End to end by hand.** `pnpm dev`, `rmk login`, `rmk plugin-setup claude-code`, then
  `/plugin` in Claude Code: install a skill, an MCP server and a hook.
  *Done when:* the result and the Claude Code version are written in the notes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Claude Code won't fetch from `http://localhost`** (checked 2026-10-03). Archive URLs must be
  `https://` and not a loopback host, and the `headersHelper` only runs for an `https://`
  marketplace. The manual test (task 8) needs the dev server behind an HTTPS address that isn't
  loopback (a tunnel, or a LAN name with a trusted certificate), with `PUBLIC_URL` set to it.
- The marketplace's top-level `description` is the field Claude Code reads first; the spec's
  example used `metadata.description`, which is only the alternate, and now uses `description`.
