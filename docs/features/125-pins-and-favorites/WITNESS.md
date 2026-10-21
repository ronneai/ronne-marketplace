# 125 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — Tables and repositories

Witnessed: 2026-10-21 17:10 local, by a fresh agent (blind). Commit: f032abcf plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `item_favorites` has a primary key on user and item, and cascades on user and item delete | no | confirmed | `0033_pins_and_favorites.ts` has `item_favorites_pk` and two cascade keys; the migration test passes on SQLite, PostgreSQL and MySQL. |
| 2 | `item_pins` has a unique key on shelf and item that holds for the instance shelf, cascades on item and workspace, and sets `created_by` null | no | confirmed | The migration tests "one per shelf and item" and "keeps the pin when its creator's row is deleted" pass on all three. |
| 3 | The migration is registered and the schema types match | no | confirmed | `migrations/index.ts` lists `0033_pins_and_favorites`; `pnpm --filter @ronneai/web typecheck` → clean. |
| 4 | The migration is safe to run again | no | confirmed | "is safe to run again" passes on all three. |
| 5 | The repositories sit behind interfaces | no | confirmed | `favorite-repository.ts` and `pin-repository.ts` are interfaces; the Kysely files return them. |
| 6 | The models have the limits and the position | no | confirmed | `models/shelf.ts`: `MAX_FAVORITES = 200`, `MAX_PINS = 12`, `Pin.position`. |
| 7 | Both repositories' `*.db.test.ts` pass on SQLite | no | confirmed | `vitest run --project db src/server/domains/shelves src/server/db/migrations/0033` → 3 files, 16 tests passed. |
| 8 | The same pass on PostgreSQL and MySQL | no | confirmed | `pnpm test:db:postgres` and `:mysql` on the same paths → 16 passed each (MariaDB too). |
| 9 | The migration guard test passes | no | confirmed | `migrations.guard.test.ts` → passed. |
| 10 | Lint is clean | no | confirmed | `biome check apps/web` → no errors. |
| 11 | Pin renumbering is tested | no | confirmed | Removing `renumber` from `remove` made "closes the gap" fail. |
| 12 | The shelf lock holds the pin limit | no | confirmed | Removing `lockShelf` from `add` made the concurrency test fail on PostgreSQL. |
| 13 | The favorite lock holds the favorite limit | no | partly | Read and passed, but no mutation was run in this pass (the adversarial pass did). |

**Overall:** not met: row 13.

### Re-check (row 13)

Witnessed: 2026-10-21 17:25 local, by a fresh agent (blind re-check). Commit: f032abcf plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | The favorite repository's user-row lock holds the 200 limit under concurrency, and a test notices it missing | no | confirmed | Replacing the `forUpdate` on the user row with a plain select made "two favorites at once cannot pass the limit" fail 3 of 3 on PostgreSQL. |
| 14 | The shelves tests and the 0033 test pass on SQLite, PostgreSQL and MySQL | no | confirmed | SQLite → 113 tests passed in the migrations and shelves folders; `pnpm test:db:postgres` and `:mysql` on the shelves and 0033 files → 21 passed each. |
| 15 | The migration guard test passes | no | confirmed | `migrations.guard.test.ts` → 34 passed. |
| 16 | Lint and typecheck are clean | no | confirmed | `biome check` → no fixes; `pnpm --filter @ronneai/web typecheck` → no errors. |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-21 17:15 local, by a fresh agent (adversarial). Commit: f032abcf plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tables, keys and cascades, with the migration registered | no | confirmed | Probe: deleting a workspace leaves 0 pins and deleting an item leaves 0 favorites, on SQLite, PostgreSQL, MySQL and MariaDB. |
| 2 | The migration runs again safely; the guard test passes | no | confirmed | "is safe to run again" and `migrations.guard` pass. |
| 3 | Models, interfaces and Kysely implementations | no | confirmed | `models/shelf.ts`, the two interfaces and their implementations read and typechecked. |
| 4 | Both repositories' tests pass on all four databases | no | confirmed | `test-db.mjs` on sqlite, postgres 15, mysql 8.4, mariadb 10.11 → 16 passed each. |
| 5 | Favorites `add` holds the 200 limit under concurrency, and the test notices the lock gone | no | confirmed | Removing the `forUpdate` on the user row made the concurrency test fail 3 of 3 on PostgreSQL (4 added instead of 2). |
| 6 | Pins `add` holds the limit and no duplicates under concurrency, and the test notices the lock gone | no | confirmed | Removing `lockShelf` → PostgreSQL got 4 added instead of 3; MySQL threw a duplicate-key error. |
| 7 | Mixed adds, removes and moves keep positions dense and within the limit | no | confirmed | A probe of 15 rounds × 8 concurrent operations: positions always 1..n on all four databases. |
| 8 | Edge inputs: limit 0, a missing item, an unknown item, `instance` against a workspace id | no | confirmed | Limit 0 → "full"; remove of a missing item → false; an unknown item is the foreign key's error. |
| 9 | Positions stay dense when a pin leaves by cascade | no | partly | By reading: a cascade left positions 1 and 3, and the next add wrote 3 again. |
| 10 | Ids in another case behave like canonical ones on MySQL and MariaDB | no | partly | On MySQL and MariaDB `shelvesOf` and `count` matched a lower-case id, but the JS comparison did not. |
| 11 | The tests assert tightly enough | no | partly | No concurrent move or remove test; the cascade test didn't check positions. |

**Overall:** not met: rows 9, 10 and 11.

### Adversarial re-check (rows 9, 10, 11)

Witnessed: 2026-10-21 17:20 local, by a fresh agent (adversarial re-check). Commit: f032abcf plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | Pin positions stay dense and unique after a cascade, and after concurrent add, remove and move | no | confirmed | `add` renumbers before inserting; two new tests pass on all four databases. Removing the renumber made the cascade test fail on PostgreSQL, MySQL and SQLite. |
| 10 | Ids in another case behave like canonical ones in both repositories | no | confirmed | Every id goes through `canonicalId`; "takes ids in any case" passes on all four; with `canonicalId` as the identity both case tests fail. |
| 11 | Shelves and 0033 tests pass on all four databases, with lint and typecheck clean | no | confirmed | 21 tests passed on each of sqlite, postgres, mysql and mariadb; `biome check` and `typecheck` clean. |
| 12 | The shelf lock is still noticed when removed | no | confirmed | With `lockShelf` removed from add, remove and move, the pin tests failed in 9 of 9 runs (one failed only one of the two tests). |

**Overall:** met.

## Task 2 — Favorites service and actions

Witnessed: 2026-10-21 17:25 local, by a fresh agent (blind). Commit: d2bd2524 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `addFavorite`, `removeFavorite` and `listFavorites` exist in a service, and every call is about the signed-in user | no | confirmed | `services/favorites.ts`: each call uses `signedIn(actor).id`; no function takes another person's id. |
| 2 | The server actions are thin adapters | no | confirmed | `actions/favorites.ts` builds the actor and the viewer-scoped dependencies and delegates in one line each. |
| 3 | A private workspace's item: a member can favorite it, an outsider is refused as for an unknown id, a favorite hides when membership is lost and returns with it | no | confirmed | Tests pass; removing the visibility filter, the list filter or the availability check each failed 2 tests. |
| 4 | Unreleased and yanked items are refused on add; a yanked favorite is hidden but kept and returns on un-yank | no | confirmed | Tests "refuses…" and "hides a favorite of an item with no installable version, and keeps it" pass. |
| 5 | The 200 limit is enforced and a removal makes room | no | confirmed | "stops at the limit" fills 200 rows and expects `FavoriteLimitError` with `max` 200; raising the limit by 1000 failed it. |
| 6 | Adding is idempotent; removing a non-favorite is false | no | confirmed | First test: added, exists, true, false. |
| 7 | The list is newest first | no | confirmed | Changing the order to ascending failed the first test. |
| 8 | One person cannot read or change another's list, root included; `favoritedAmong` does not leak | no | confirmed | "is one person's" passes; dropping the user filter in `remove` and a wrong user each failed tests. |
| 9 | Signed out is refused with `ForbiddenError`, and `favoritedAmong` is empty | no | confirmed | "is refused to someone signed out" passes. |
| 10 | Item ids in any case or padded are accepted | no | partly | `canonicalId` is applied everywhere by reading, but no test passed such an id. |
| 11 | The tests pass on SQLite, PostgreSQL and MySQL | no | confirmed | 23 tests on SQLite; the actions file, 7 passed on PostgreSQL and on MySQL. |
| 12 | Lint and typecheck are clean | no | confirmed | `biome check apps/web` → no errors; typecheck clean. |
| 13 | The error classes exist and carry what people are told | no | confirmed | `ShelvesError`, `ShelfItemNotAvailableError`, `FavoriteLimitError(max)`, both asserted. |

**Overall:** not met: row 10.

### Re-check (row 10)

Witnessed: 2026-10-21 17:35 local, by a fresh agent (blind re-check). Commit: d2bd2524 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | Item ids in any case or padded work across add, exists, list and remove, and a test covers it | no | confirmed | The new test adds a padded lower-case id, then the canonical one ("exists"), lists, removes and lists again; it passes on SQLite (24 tests), PostgreSQL and MySQL (8 each). With `canonicalId` as the identity, exactly that test failed. |

**Overall:** met.

## Task 3 — Pins service and actions

Witnessed: 2026-10-21 17:50 local, by a fresh agent (blind). Commit: 037daf04 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only root pins, unpins or reorders on Start here; admins, moderators, members, outsiders and anonymous users are refused | no | confirmed | `pins.manage_global: ["root"]`, checked first in the service; the test loops over six roles; removing the check made it fail. |
| 2 | On a workspace shelf only its admins and root; a moderator, a member, another workspace's admin and anonymous are refused | no | confirmed | `pins.manage: ["admin"]`; removing the check failed 4 tests; adding moderator to the role list failed 2. |
| 3 | A refusal reveals nothing: a missing workspace gives the same Forbidden as an existing one | no | confirmed | The permission check runs before the workspace lookup; the moderator gets `ForbiddenError`, root gets `WorkspaceNotFoundError`. |
| 4 | Start here takes only items of a public workspace | no | confirmed | `PinNeedsPublicWorkspaceError`; dropping the check failed 2 tests. |
| 5 | Only released items can be pinned; an item the pinner cannot see counts as unavailable | no | confirmed | A draft-only item, a nonexistent id and another workspace's private item are all refused as not available. |
| 6 | The limit is 12 per shelf, each shelf counted apart, the error names the shelf, and a removal makes room | no | confirmed | 12 on Start here and 12 on acme, then `PinLimitError` for each; a limit of 999 made the test fail. |
| 7 | Pinning twice is a no-op with no audit row | no | confirmed | "pinning twice is a no-op" → `["pin.added"]` only. |
| 8 | New pins go last, move up and down swap neighbours, edge and missing answer so, and positions stay dense | no | confirmed | "new pins go last" asserts the order after each step and positions `[1, 2]`. |
| 9 | `listPins` is filtered by what the viewer can see, on the server | no | confirmed | An outsider sees `[betaItem]` where root sees both; replacing the filter with "everything" failed 2 tests. |
| 10 | A pin in a private workspace is invisible to a non-member | no | confirmed | Member sees both pins; outsider and beta's admin see none; losing and regaining membership hides and shows them; a yanked-only pin is "not available" in Manage and removable. |
| 11 | Reading needs a signed-in user and the Manage list needs the permission | no | confirmed | Member → Forbidden for "all"; anonymous → Forbidden. |
| 12 | `pin.added`, `pin.removed` and `pin.reordered` are written with the right target and metadata, and nothing for a no-op or a refusal | no | confirmed | The sequence, targets and metadata are asserted; removing the audit from add or move failed tests. |
| 13 | The audit row is in the same transaction as the change | no | partly | `recordAudit(trx, …)` in all three methods, but no test showed the pin and the audit rolling back together. |
| 14 | The `pin` audit group exists and every action has a summary | no | confirmed | `ACTION_OPTIONS` builds from the groups; `summary.test.ts` requires one summary per action. |
| 15 | The permissions test lists the new permissions | no | confirmed | `permissions.test.ts` adds `pins.manage` and `pins.manage_global`. |
| 16 | It works on all four databases | no | confirmed | 40 tests passed on SQLite, PostgreSQL, MySQL and MariaDB. |
| 17 | Lint and types are clean | no | confirmed | `biome check apps/web` → no errors; typecheck clean. |

**Overall:** not met: row 13.

### Re-check (row 13 and the changes)

Witnessed: 2026-10-21 18:05 local, by a fresh agent (blind re-check). Commit: 037daf04 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | The audit is in the same transaction as the change, and a test covers it | no | confirmed | "an audit the log refuses undoes the pin, the removal and the move" passes; writing the audit outside the transaction with its failure swallowed made it fail. A plain swap of the handle that still throws is not told apart (a throw rolls back anyway). |
| a | The suites pass on the four databases | no | confirmed | 43 tests passed on each. |
| b | Unpin and move answer an item the actor cannot see like an unknown one | no | confirmed | Removing both guards failed "an item the admin cannot see answers as an unknown one does". |
| c | `summary.test.ts` has the pin wording | no | confirmed | Lines for Pinned, Unpinned and Moved up and down are asserted. |
| d | Tests for ids in another case or padded exist | no | confirmed | `pins.db.test.ts` has the padded lower-case workspace id test. |
| e | Lint and types are clean | no | confirmed | `biome check apps/web` → no errors; typecheck clean. |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-21 17:50 local, by a fresh agent (adversarial). Commit: 037daf04 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Service and thin actions over viewer-scoped dependencies | no | confirmed | `services/pins.ts` and `actions/pins.ts` read; each action is the context plus one call. |
| 2 | Permissions are root-only for Start here and admin-or-root per workspace, refused on the server | no | confirmed | Probes with every role; an acme admin on beta's shelf and anonymous get `ForbiddenError`. |
| 3 | An unknown workspace id is Forbidden for non-root and not found for root; `instance` is not the global shelf | no | confirmed | A ghost id and the id `instance` probed for an admin and for root. |
| 4 | Workspace ids in another case or padded work the same, audited under the canonical id | no | partly | A probe worked, but no test failed with `canonicalId` dropped. |
| 5 | Global pins only for public workspaces; workspace shelves take what the pinner sees | no | confirmed | Dropping the check failed two tests; the check is an exact comparison. |
| 6 | The limit holds under concurrency across both shelves | no | confirmed | 16 concurrent pins on each shelf: 24 added, 8 refused, 12 on each shelf. |
| 7 | Audit is in the same transaction and only when the change happened | no | partly | By reading; no test showed the rollback together. |
| 8 | Visibility is filtered at read, including an instance pin whose workspace turned private | no | confirmed | The outsider's list is empty and root's is not; the Manage list needs the permission. |
| 9 | A pin's existence reveals nothing to someone who cannot see the item | no | partly | Pin answered uniformly, but unpin gave true against false and move gave "edge" against "missing" for an unseen pinned item. |
| 10 | Suites pass on the four databases; lint and types are clean | no | confirmed | 40 tests on each; `biome check` and typecheck clean. |

**Overall:** not met: rows 4, 7 and 9.

### Adversarial re-check (rows 4, 7, 9)

Witnessed: 2026-10-21 17:55 local, by a fresh agent (adversarial re-check). Commit: 037daf04 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | A padded or lower-case workspace id is the same shelf, audited under the canonical id, with a test | yes | confirmed | With `canonicalId` dropped from `requireManage`, exactly that test failed (1 failed, 28 passed). |
| 7 | An audit the log refuses undoes the pin, the removal and the move, with a test | yes | confirmed | Writing the audit outside the transaction (failure swallowed) failed the test on PostgreSQL; the test shows the rollback, not the handle. |
| 9 | Unpin and move answer an unseen item like an unknown id, with a test | yes | confirmed | Removing the two early returns failed "an item the admin cannot see answers as an unknown one does" (1 failed, 28 passed). |
| 10 | A hidden pin still counts toward the 12 and its shelf's admin cannot remove it | yes | confirmed | Accepted as a design edge: only root can pin what the admins cannot see; recorded in the spec's edge cases. |
| 11 | Shelves tests on the four databases, lint and types | yes | confirmed | 43 passed on each; biome and typecheck clean. |

**Overall:** met.

## Task 4 — The star

Witnessed: 2026-10-21 18:10 local, by a fresh agent (blind). Commit: 6c318bbb plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A `FavoriteButton` exists and is used on `ItemCard` and in the item page header | no | confirmed | `features/favorites/FavoriteButton.tsx`; `ItemCard.tsx` renders it when `favorited` is given; `ItemPageView.tsx` renders it next to Propose. |
| 2 | Catalogue, Home and the item page ask which items are favorites and pass the state down | no | confirmed | New page tests assert the call arguments and the Add and Remove labels; removing `favorited=` in `CatalogueView` and the `favorited` in `load.ts` each failed a test. |
| 3 | `aria-pressed`, the filled star and the hidden value match the state | no | confirmed | `favorite-button.test.tsx` covers both states; deleting `aria-pressed` failed 2 tests and flipping on and off failed 2. |
| 4 | The label carries the item's name, in English, Portuguese and French | no | confirmed | `aria-label` and `title` asserted in three languages; `shelves` registered in `namespaces.ts`; the parity tests pass. |
| 5 | The target is 44px on a touch screen | no | confirmed | `IconButton` is `size-8 pointer-coarse:size-11`; the test asserts the class and renaming it failed the test. |
| 6 | The star is a form with a server action, hidden inputs and a submit button | no | confirmed | Markup asserted; swapping the form for a div failed 2 tests; the same pattern as `SetupForm`, which the `wizard-nojs` project submits with JavaScript off. |
| 7 | The no-JavaScript submit toggles a favorite end to end | no | can't check here | Not run in this pass; task 9 proves it end to end. |
| 8 | The touch test (067) includes it | no | partly | `touch-rules.test.ts` only checks text fields; the only 44px check is a class assertion. |
| 9 | A refusal (the limit, an unavailable item) shows under the star as translated text | no | confirmed | `actions.ts` returns `errorText`; the three languages have the messages; no test rendered the error under the star. |
| 10 | Checks are green | no | confirmed | Unit run 2714 tests passed; `biome check` no errors; typecheck clean. |

**Overall:** not met: rows 7, 8 and 9.

### Re-check (rows 7, 8, 9)

Witnessed: 2026-10-21 18:20 local, by a fresh agent (blind re-check). Commit: 6c318bbb plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The no-JavaScript submit is proved end to end in task 9, so this task needs only the form markup | no | confirmed | Task 4's Done when no longer asks for the end-to-end submit; the markup test passes; task 9 covers favoriting end to end and now names the case with JavaScript off. |
| 8 | The 44px target is the shared icon button's (067), checked by a class assertion | no | confirmed | `IconButton` has `pointer-coarse:size-11`; the test asserts it. |
| 9 | Why a click was refused is shown under the star, and a test renders it | no | confirmed | `favorite-button-error.test.tsx` asserts the alert and the text; removing the paragraph made it fail. |
| 10 | Checks are green | no | confirmed | Unit run 2715 tests passed; `biome check` no errors; typecheck clean. |

**Overall:** met.

## Task 5 — Pin menu and Manage dialog

Witnessed: 2026-10-21 18:20 local, by a fresh agent (blind). Commit: e628e1b1 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Unit and SQLite database tests, lint and typecheck are green | no | confirmed | Pins and item page unit tests, 48 shelves database tests, `biome check apps/web` no errors, typecheck clean. |
| 2 | The Pin menu offers Start here only to root and each workspace only to the people who administer it | no | confirmed | `pinTargets` uses `pins.manage_global` and `workspacesWith(pins.manage)`; the database tests cover root, both admins, a moderator, a member and anonymous; giving Start here to everyone and widening `pins.manage` each failed tests. |
| 3 | The menu is hidden when there is nowhere to pin; the entries and the blocked reason are tested | no | confirmed | `pins.test.tsx` covers the empty menu, root's rows, an admin without Start here, the disabled reason and the search field; dropping the reason failed a test. |
| 4 | The menu is wired into the item page | no | confirmed | `load.ts` maps the targets and `ItemPageView` renders `PinMenu` only when there are some. |
| 5 | Component tests cover the Manage dialog's actions: Move up and down, Remove, count and limit, Not available rows | no | not met | No DOM test environment; only "Loading…" was asserted. Move up not disabled at the top, the badge removed and the count blanked all survived. |
| 6 | A phone test shows the full-screen dialog behaving: 44px targets, buttons in view | no | confirmed | The Playwright test passed on phone, WebKit and tablet: the dialog fills a phone, the heading and Done are in view, targets are 44px tall, no sideways scroll, and Pin, Manage and Remove work. |
| 7 | A moderator and a member do not see the menu and an admin does not see Start here in the real UI | no | partly | The service and the component are covered; the end-to-end test signs in as an admin only. |

**Overall:** not met: rows 5 and 7.

### Re-check (rows 5, 7)

Witnessed: 2026-10-21 18:30 local, by a fresh agent (blind re-check). Commit: e628e1b1 plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | Component tests cover Move up and down, Remove, count and limit, and the Not available rows | no | confirmed | `ShelfList` is tested by static render; Move up enabled at the top, Move down enabled at the bottom, the badge removed and the count blanked each failed a test. The clicks run in the phone test, which pins two items, checks the disabled ends, moves up and down and removes both. |
| 7 | Root gets Start here; admins never do; a member or moderator never gets Start here or another workspace's shelf | no | confirmed | The moderator and member test now asserts no Start here; giving Start here to everyone failed two database tests. A member or moderator sees a Pin button for their own personal workspace only (the spec's "each workspace the person administers"). |
| 8 | The phone test passes on phone, WebKit and tablet | no | confirmed | 3 passed. |
| 9 | Lint and typecheck are clean | no | confirmed | `biome check apps/web` no errors; typecheck clean. |

**Overall:** met.

## Task 6 — Shelves on Home, the workspace page and the catalogue

Witnessed: 2026-10-21 18:30 local, by a fresh agent (blind). Commit: 0b64101b plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Home shows "Your favorites" with See all to `/catalogue?favorites=1`, and nothing, not even a heading, when empty | no | confirmed | Empty and present cases in `page.test.tsx`; changing the href failed a test. |
| 2 | Start here shows to everyone and is hidden when empty; Manage only for root | no | confirmed | Making the condition true failed the test. |
| 3 | "Pinned in <workspace>" only when a workspace is current, with Manage only for its admin or root | no | confirmed | Admin, member and no-current cases; dropping the condition and making `can` true each failed a test. |
| 4 | The workspace page has its own "Pinned items" shelf, hidden when empty, Manage only for admins and root | no | confirmed | Five tests in `admin-workspaces.test.tsx`; making Manage unconditional failed two. |
| 5 | `?favorites=1` is read from the address (exactly 1), shown as a checkbox and a removable chip, counted as active, kept by search, sort and paging links | no | confirmed | Four tests in `catalogue.test.tsx`; removing the line in `catalogueHref` failed one. |
| 6 | The filter uses the reader's own favorites and combines with search, type, scope, sort and paging | no | confirmed | Six database tests; dropping the `favoriteOf` filter failed three. |
| 7 | Type counts reflect the favorites | no | partly | Removing `installable` from the counts call left all tests green. |
| 8 | A favorite or pin the reader cannot see is not shown, and a favorite is the reader's alone | no | confirmed | Access-loss test; outsider and root see none of the member's; `byIds` probe in the visibility guard. |
| 9 | A favorite with no installable version is hidden but kept; pins are shown only if available | no | partly | The catalogue filter is tested; Home's and the workspace's loaders had no test. |
| 10 | Component tests cover empty and present, the current workspace's pins and the filter in the URL | no | confirmed | Unit run 2745 tests passed. |
| 11 | The loaders, `entriesOf` and `workspaceNamed` are tested enough | no | partly | Tested only through mocks. |
| 12 | The database tests for the filter pass on the four databases | no | confirmed | 12 tests on each of SQLite, PostgreSQL, MySQL and MariaDB. |
| 13 | Lint, typecheck and messages are clean | no | confirmed | `biome check apps/web` no errors; typecheck clean. |

**Overall:** not met: rows 7, 9 and 11.

### Re-check (rows 7, 9, 11)

Witnessed: 2026-10-21 18:50 local, by a fresh agent (blind re-check). Commit: 0b64101b plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | Type counts for Favorites count only the reader's installable favorites | no | confirmed | The search, type, scope and sort test now adds a yanked favorite; dropping `installable` from the counts call failed it. |
| 9 | Hidden or yanked favorites and unavailable pins are left out of the shelves, and un-yanking brings them back | no | confirmed | Making `listFavorites` keep unavailable items failed the Home loader test and the favorites test; making `listPins` keep them failed the yanked-pin test. |
| 11 | The loaders, `entriesOf` and `workspaceNamed` are tested enough | no | confirmed | `load-shelves.db.test.ts` runs the real loaders: the six, newest first, skipping yanked newest, own and visible only, pin order, a private workspace's pins for members only, and `workspaceNamed`; changing the six to seven and dropping the visibility filter by name each failed tests. |
| 13 | Unit, database, lint and type checks pass | no | confirmed | 2745 unit tests; 60 shelves tests on SQLite, PostgreSQL, MySQL and MariaDB; `biome check` no errors; typecheck clean. |

**Overall:** met.
