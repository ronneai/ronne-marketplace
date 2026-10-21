# 125 — Pinned items and favorites

> Milestone: M18 · Depends on: 018, 090, 091, 093, 120, 124, 129 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (the web app only; `rmk` and the API don't change)

## Goal

Three levels of "start with these". **Root** pins items for the whole instance, a **workspace
admin** pins items for their workspace, and **anyone** keeps a private list of favorites that only
they see (owner, 2026-10-20). Pins answer "what should I try first"; favorites answer "what do I
come back to".

## Scope

**In:**
- **Favorites.** A star on every item card and item page; one click adds or removes it. They are
  the person's own: nobody else sees them, root included, except in the person's data download
  (104).
  - Shown on Home as **Your favorites** (the latest six, with "See all"), and as a **Favorites**
    filter on the catalogue (`?favorites=1`, which reuses its search, filters, sort and paging).
  - At most 200 per person.
- **Global pins ("Start here").** Root pins and unpins items and sets their order. Shown on Home to
  everyone who can see the item. At most 12. Only items in a **public** workspace can be pinned
  globally, since a private item can't be shown to everyone.
- **Workspace pins.** A workspace's admins (and root) pin items for that workspace and set their
  order. Shown on the workspace's page, and on Home under **Pinned in <workspace>** while it is
  the current workspace (120). At most 12 per workspace. Any item the pinner can see may be
  pinned; a member sees a pin only if they can see the item.
- **Where to pin.** On the item page, a **Pin** menu: *Start here* (root), *<workspace>* for each
  workspace the person administers (root: any workspace, searched by name). Each shelf has a
  **Manage** dialog: a list with Move up, Move down and Remove buttons (no drag-only controls, for
  touch and keyboard), and the item count against its limit.
- **Only released items.** An item can be pinned or favorited once it has a released version
  (it is in the catalogue). An item that later has no installable version, or is deleted, drops
  out of the shelves; a pin stays in Manage marked "Not available" until removed, a favorite is
  kept but hidden.

**Out** (and where it goes instead):
- Folders, tags or notes on favorites; sharing a favorites list; favorites in `rmk` or the API
  (ratings, `rmk favorites`): later if asked.
- Pinning to a scope or an item type; "recommended by" curation with text: later.
- Ratings and "worked for me" feedback: not planned yet.

## Behaviour

- **Two tables,** not one: `item_favorites` (`user_id`, `item_id`, `created_at`, primary key on
  both) and `item_pins` (`id`, `workspace_id` null for the global shelf, `shelf`, `item_id`, `position`,
  `created_by`, `created_at`, unique on `shelf` + `item_id`). A unique key can't hold a null, so
  `shelf` is the same shelf as a plain key: the workspace's id, or `instance`. They differ in who writes, who
  reads and whether order matters, and favorites must be erasable per person. Items are referenced
  by id, so renames and aliases (113, 118) never break a pin.
- **Who may do what.**

  | Action | Allowed |
  |---|---|
  | Favorite, unfavorite | anyone who can see the item |
  | Pin or unpin globally, reorder the global shelf | root |
  | Pin or unpin for a workspace, reorder it | that workspace's admins, root |

  Every action checks permissions on the server (`permissions.ts`); a moderator who isn't an admin
  can't pin. Pinning is idempotent: pinning an already pinned item is a no-op with a message.
- **Visibility filtering is on the server,** where the shelf is read: a pin or favorite is
  returned only if the viewer can see the item now (093). A pin's existence reveals nothing to
  someone who can't see the item.
- **Order.** Pins are ordered by `position` (new pins go last); Move up and down swap neighbours
  in one transaction. Favorites are newest first.
- **The star** is a button with `aria-pressed`, a 44px target on touch, and the item's name in its
  accessible label ("Add <name> to favorites"). It works without JavaScript (a form).
- **Home** (124) renders the shelves in their slots: favorites (section 5), then Start here and the
  current workspace's pins (section 6), each hidden when empty.
- **Audit.** Pin changes are audited: `pin.added`, `pin.removed`, `pin.reordered` (target: the
  workspace or the instance, metadata: the item). Favorites are personal and not audited.
- **Privacy.** "Your data" (104) lists the person's favorites; erasing a user (103) deletes their
  favorites and keeps pins they created (their `created_by` becomes the pseudonym, like the audit
  log). Deleting an item deletes its pins and favorites.

## Edge cases

- Pinning at the limit refuses with "Start here has 12 items; remove one first".
- An item moved to another workspace (115) keeps its pins; the private-visibility rule is applied
  at read time. Turning a workspace private (093) removes its items' global pins in the same step
  and says so beforehand.
- A workspace deleted or renamed: its pins go with it, or follow the id.
- A person who loses access to a private workspace loses sight of its pins and favorites at once.
- Two admins reordering at the same time: the last save wins; positions stay unique and dense.
- Favorites and pins of a yanked-only item are hidden, not deleted, so un-yanking brings them back.
- Root may pin an item that a workspace's admins can't see onto that workspace's shelf. They never see
  it; it still counts toward the 12, and only root can remove it. Unpinning or moving such an item
  answers as it would an unknown one.

## Documentation

- **Catalogue** (`overview.tsx` / `items.tsx`, wherever the catalogue is described): Favorites, the
  star, the Favorites filter.
- **Workspaces:** a new section **Pinned items** (`workspaces#pins`): who pins where, the limit,
  what members see.
- **Admin** (`admin.tsx`): root's Start here shelf (`admin#pins`).
- **Overview → Finding your way:** Home's shelves in one sentence each.
- **Account** or **Privacy** (`privacy.tsx`): favorites are in the data download and are erased
  with the account.
- **Helpers:** on the star, "What are favorites?"; on Manage, "Who sees these pins?" →
  `workspaces#pins`.
- Both `topics.ts` get the new sections.

## Acceptance criteria

- [ ] The star toggles a favorite on cards and item pages, with and without JavaScript, and only
      its owner sees it; the 200 limit is enforced.
- [ ] Root pins globally (public workspaces' items only); admins pin for their workspace; others
      are refused on the server, not only hidden in the UI.
- [ ] Shelves honour visibility: a viewer who can't see an item never gets its pin or favorite;
      a test covers a private workspace.
- [ ] Order: new pins go last; Move up/down work and persist; limits (12) enforced.
- [ ] Home shows favorites and pins in the slots of 124; the catalogue's Favorites filter works
      with search, filters and paging.
- [ ] Pin changes are audited and listed in the audit filter; favorites are in "Your data" and are
      deleted on erase.
- [ ] Migrations run on all three database kinds; everything is in messages (129) in three
      languages; the phone sweep passes.
- [ ] The Documentation and helpers above say what the feature does now.

## Decisions

- **12 pins per shelf** (owner, 2026-10-20).

## Open questions

- **Should a member be able to suggest a pin** to their workspace's admins? Not planned.
