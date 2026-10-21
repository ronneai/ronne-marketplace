# 125 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Tables and repositories.** [risky] Migration `item_favorites` and `item_pins` (keys,
  unique constraints, cascade on item delete), Kysely repositories behind interfaces, the models
  (limits, `Position`).
  *Done when:* `*.db.test.ts` for both repositories pass on SQLite and, run once, on PostgreSQL and
  MySQL; the migration guard test passes.

- [x] **2. Favorites service and actions.** `addFavorite`, `removeFavorite`, `listFavorites`
  (visibility-filtered, newest first, 200 limit), server actions as thin adapters.
  *Done when:* tests cover visibility (a private workspace's item), the limit, idempotency and
  that one person can't read another's.

- [x] **3. Pins service and actions.** [risky] `pinItem`, `unpinItem`, `movePin`, `listPins`
  (global or a workspace; visibility-filtered at read), permissions in `permissions.ts` (root;
  workspace admins), global pins limited to public workspaces' items, limit 12, audit events
  `pin.added`/`removed`/`reordered` and the new `pin` audit group.
  *Done when:* tests cover every row of the permission table (moderator refused), the limits, the
  public-only rule, reordering, and the audit rows; a private-workspace test shows a pin is
  invisible to a non-member.

- [x] **4. The star.** A `FavoriteButton` (in `features/favorites`, with the form action) used on
  `ItemCard` and the item page header, `aria-pressed`, 44px touch target, a form without JavaScript.
  *Done when:* component tests cover both states, the label, why it was refused, and the form
  markup; the 44px target is the shared icon button's (067), checked by a class assertion; the
  no-JavaScript submit is proved end to end in task 9.

- [x] **5. Pin menu and Manage dialog.** The item page's Pin menu (Start here for root, each
  administered workspace), the Manage dialog on both shelves (Move up/down, Remove, count/limit,
  "Not available" rows).
  *Done when:* component tests cover who sees which entries and the dialog's actions; a phone test
  shows full-screen dialogs behave (067).

- [x] **6. Shelves on Home, the workspace page and the catalogue.** Fill 124's slots (favorites,
  Start here, Pinned in <workspace>), the workspace page's shelf, the catalogue's `?favorites=1`
  filter with paging.
  *Done when:* component tests cover empty/present, the current workspace's pins, and the filter in
  the URL; `*.db.test.ts` for the catalogue filter pass on the servers.

- [x] **7. Privacy.** Favorites in the data download (104), deleted on erase (103), pins'
  `created_by` pseudonymised, pins and favorites deleted with the item, global pins removed when a
  workspace turns private (093).
  *Done when:* the data-export, erase and private-workspace tests are extended and pass.

- [x] **8. Messages and phone.** Everything in messages (129) in three languages; the scan covers
  the new code; phone sweep.
  *Done when:* parity and scan pass; the sweep passes on every project in each language.

- [ ] **9. End to end.** A user favorites (also with JavaScript off, where the star is a plain form) and filters; root pins and reorders; an admin pins to a
  workspace and a member sees it as current workspace; a non-member of a private workspace sees
  none.
  *Done when:* the end-to-end tests pass on every project.

- [ ] **10. Decision log and index.** MVP §15 row "Pins and favorites" (two tables, who may pin,
  visibility at read).
  *Done when:* the row is in.

- [ ] **11. Documentation.** The sections and helpers in the spec, both `topics.ts`, in a ronne-web
  branch.
  *Done when:* the docs tests pass in ronne-web, and the helper link test passes here.

## Notes

Needs 124's layout and slots. Pins and favorites reference items by id.
