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

- [x] **3. Submissions reads.** [risky] Name-taken check, dependency marks, review page and queue,
  usage ingest and the item page's usage.
  *Done when:* submissions and usage db tests pass with private cases.

- [x] **4. The dependency rule.** [risky] 089's picker filtered; `dependency_not_visible` at submit
  and release; resolve as the caller.
  *Done when:* registry-check, resolve and picker tests cover own workspace, public, other private.

- [x] **5. Visibility setting.** [risky] Private in the dialogs; the turning-private check and list;
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
- **Task 3: submissions and usage reads** (Claude). `kyselySubmissionRepository`,
  `kyselyRegistryLookup` and `kyselyUsageRepository` take the viewer like the items repositories.
  A submission is readable when it's in a workspace the viewer sees, or it's their own
  (`isReadableSubmission`), so a removed member keeps reading and withdrawing theirs (091); a
  scope is found only in a visible workspace, so a non-member can't start a draft there, and an
  unknown scope and a private one get one message ("There's no scope @… you can use",
  `DraftScopeNotFoundError`, in SPEC.md). The queue, review page, dependency marks, the composer's
  reports and picker, and usage (ingest and the item page) read through them, so the composer leak
  from task 2 is closed. The submissions actions build the dependencies and the actor together
  (`bound`), the viewer from the session or the token. The release store reads every workspace
  (`UNFILTERED`): a release is authorised by 015 and 091. The guard
  (`submissions/repositories/visibility-guard.db.test.ts`) covers the three repositories.
  From the witnesses: the queue and review page were already hidden by 091's role checks, so the
  repository filter there is pinned by the guard test; dependency marks have a private case in
  `private-submissions.db.test.ts`. The release transaction still resolves dependencies
  unfiltered: task 4's `dependency_not_visible` at release closes it.
- **Task 4: the dependency rule** (Claude). The registry lookup reports each dependency's
  workspace and whether it's private (`PublishedItem.workspace`, `NamedSubmission.workspace`, read
  from `workspaces.visibility`, not from the viewer: an `UNFILTERED` lookup would otherwise see no
  private workspace and let everything through), plus `privateWorkspaces(ids)`. `dependencyIssues`
  takes the dependent's `workspaceId` (null when its scope isn't known: every private one is
  refused) and gives `dependency_not_visible` for another private workspace's item, published or
  on its way, at submit and at release (publish runs the checks with `release: true` before its
  store transaction). Someone who can't see the item gets `dependency_not_found` instead (SPEC,
  decision 5). The pickers (the form's `findDependencies`, the canvas's `searchDependencies`, which
  now gets the item's name) and the composer's reports filter to the item's own workspace and
  public ones (`CatalogueFilter.dependableFrom`). The resolver (core) names who asks for a missing
  dependency: "@x isn't a published item (asked for by @y@1.0.0)".
  From the witnesses: the pickers took the person's newest dozen unreleased items before
  filtering by workspace, so another workspace's drafts could crowd out allowed ones; the filter
  is now in SQL (`listOwnUnreleased({ dependableFrom })`), as the published list's is. "Public" is
  matched byte for byte (`isPublicWorkspace`: a binary cast on MySQL and MariaDB, because their
  collations took "Public", and even `utf8mb4_bin` pads "public "), while the viewer and the check
  count those private. Tests now pin the
  pickers' own-items filters (unreleased and published), the canvas reports' workspace, an own submission on its way in another
  private workspace (at submit and in a bulk batch), and an outsider resolving a public item that
  depends on a private one. Left as remarks: `prepareRelease`'s preview still lists a dependent
  whose dependency turned private (the release refuses it); the release's check runs before the
  store transaction, not inside it (task 5's turning-private refusal covers released dependents).
  For task 6: the registry API answers a missing item `item_not_found` (404), where the spec says
  `not_found`.
- **Task 5: the visibility setting** (Claude). `workspaceVisibilityFrom` takes "private";
  `setWorkspaceVisibility` and `visibilityImpact` (workspaces service) are root's only (SPEC,
  decision 6); `global` refuses (GlobalWorkspaceError). Turning private is refused in the same
  transaction while `outsideDependents` (released items outside whose listed version depends on
  an item in it) isn't empty (`WorkspaceHasOutsideDependentsError`, listing them); open submissions
  outside that depend on it (`openSubmissionsOutside`: their latest revision's ronne.yaml, parsed
  in the service against the workspace's scope names) are only a warning. `setVisibility` raises
  the catalogue revision; the event is `workspace.updated` with `{ name, visibility, from }`
  (flat, as the audit helper takes), shown as "Made workspace acme private". The UI: New
  workspace's Public/Private radios; the page's Make private (loads the impact; Save is disabled
  with the list while outside items depend on it; open ones as a warning) and Make public (a
  confirm); `revalidatePath("/", "layout")` after a change.
  From the adversarial witness: a release checked before Make private and committed after it
  still added an outside dependent; now Make private locks the workspace's row and reads it again
  (`lockWorkspace`), and a release locks its dependencies' workspaces (`lockWorkspaces`, in id
  order) inside its transaction and refuses a private one outside its own workspace
  (`dependency_not_visible`, at release). That lock also makes two roots' Make private one change
  on MySQL. The setter takes exactly "public" or "private" (`visibilityChoice`; an empty value had
  meant public); `outsideDependents` counts every version that isn't yanked, not only the listed
  one (SPEC); the invalid-visibility message is "A workspace is public or private."
  Then, from its re-check: since a yanked version doesn't hold Make private back, unyanking one
  that depends on a private workspace's item (not its own) is refused under the same lock
  (`dependencyWorkspaces` + `lockWorkspaces` in `unyank`, `VersionDependsOnPrivateError`).
  Counting yanked versions instead would block Make private forever: versions aren't deleted.

