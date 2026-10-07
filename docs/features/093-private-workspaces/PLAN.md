# 093 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The viewer.** [risky] `Viewer` (user id, root, visible workspace ids, the private ones
  among them) built once per request with the memberships (091); `visibleWorkspaces`. Reads
  filter scopes by their workspace with a subquery (tasks 2–3), so no scope ids are listed.
  *Done when:* unit tests cover root, a member, a non-member, and a public-only user.

- [ ] **2. Items reads.** [risky] The catalogue, item, version, dependents ("Used by") and download
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

