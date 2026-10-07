# 093 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The viewer.** [risky] `Viewer` (user id, root, visible workspace ids, the private ones
  among them) built once per request with the memberships (091); `visibleWorkspaces`. Reads
  filter scopes by their workspace with a subquery (tasks 2–3), so no scope ids are listed.
  *Done when:* unit tests cover root, a member, a non-member, and a public-only user.

- [x] **2. Items reads.** [risky] The catalogue, item, version, dependents ("Used by") and download
  repositories take a `Viewer`; services and pages pass it; the guard test listing read methods.
  *Done when:* items db tests pass with a private workspace on the four databases, and the guard
  test fails on a read without a `Viewer`.

- [ ] **3. Submissions reads.** [risky] Name-taken check, dependency marks, review page and queue,
  usage ingest and the item page's usage.
  *Done when:* submissions and usage db tests pass with private cases.

- [ ] **4. The dependency rule.** [risky] 089's picker filtered; `dependency_not_visible` at submit
  and release; resolve as the caller.
  *Done when:* registry-check, resolve and picker tests cover own workspace, public, other private.

- [ ] **5. Visibility setting.** [risky] Private in the dialogs; the turning-private check and list;
  the confirm; the revision bump and audit.
  *Done when:* service tests and the dialog test pass.

- [ ] **6. API and MCP.** [risky] The registry API, tarball, resolve and `GET /api/v1/scopes`
  through the viewer; the MCP read tools unchanged in code but tested against a private item.
  *Done when:* API tests answer `not_found` for a non-member and data for a member.

- [ ] **7. Plugin feeds.** [risky] The visibility key, the cache per key, the per-key stats; zips
  checked; `rmk feed build --workspace` and its warning; `docs/spec/plugin-feeds.md` updated.
  *Done when:* feed tests cover two keys sharing nothing, and the 079 benchmark still passes its
  budget with one key.

- [ ] **8. Labels and end-to-end.** Lock label on card and item page; Workspace filter shows only
  visible ones; the end-to-end test with two users.
  *Done when:* Playwright passes on desktop, phone and phone-webkit.

- [ ] **9. Decisions and Documentation.** MVP §12 (what private means and doesn't), §15 (a
  "Private workspaces" row; "Native plugin feeds" and "Plugin feeds at scale" updated); the topics
  and helpers.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 1: the viewer** (Claude). `Viewer` (`workspaces/models/viewer.ts`) holds the user id,
  whether root, the visible workspace ids and the private ones among them (the plugin feeds'
  visibility key), sorted. `visibleWorkspaces(user, workspaces)` is pure; `loadViewer` reads every
  workspace's id and visibility once per request (anything but "public" counts as private, so an
  odd value hides a workspace); `viewerFor(headers)` and `viewerOf(user)` are the entry points.
  No scope ids: the repositories will filter with a subquery on the scope's workspace, so the
  list stays as long as the number of workspaces, not of scopes. Nobody signed out sees nothing.
  From the adversarial witness: decide membership in the viewer, never by joining
  `workspace_members` in SQL. MySQL and MariaDB accept a membership row whose ids differ in case,
  which the case-sensitive viewer ignores but a SQL join would count. And `viewerFor` isn't
  memoised: build it once per request and pass it down.
- **Task 2: items reads** (Claude). `kyselyCatalogueRepository` and `kyselyItemRepository` take
  the viewer when they're built, so every method has it: the catalogue's shared `listed()` and its
  workspaces filter on the workspace; the item reads by name, item id, version id and submission
  id filter with `workspaces/repositories/visible.ts` (`inVisibleWorkspace`, `isVisibleItem`,
  `isVisibleSubmission`: subqueries on the scope's workspace, `1 = 1` for root, `1 = 0` for
  nobody). "Used by" lists only visible dependents. The actions build the viewer once per call
  from the session or the token's user. Writes don't filter; they're named in the guard test
  (`items/repositories/visibility-guard.db.test.ts`), which fails on a method that's neither a
  probed read nor a named write. For now: the plugin feeds read as a public-only viewer (one
  shared cache, task 7), and the registry lookup and release store as `UNFILTERED` (the
  dependency rule is task 4; a release is authorised by 015 and 091). Tests, the e2e seed and the
  feed benchmark use `UNFILTERED`.
  Left for later tasks, from the witnesses: the composer's dependency reports read through the
  unfiltered registry lookup, so a non-member can tell a private name from an unknown one (tasks
  3 and 4); a public item that depends on a private one (old data, or one made before task 4)
  shows the private name in its versions and manifest (tasks 4 and 5 stop new ones); the scope
  repository isn't under the guard yet (task 6); the `IN (…)` list grows with the number of
  visible workspaces, untested in the thousands.

