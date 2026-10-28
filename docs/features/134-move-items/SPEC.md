# 134 — Moving an item to another scope

> Milestone: M13 · Depends on: 091, 092, 094, 113, 115, 118, 017, 044 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Old names", "Scopes") · Contracts: none changed (118 defines names and aliases)

## Goal

An item moves from one scope to another in the same workspace (owner, 2026-10-27): it was put in
the wrong scope, or a team reorganises its scopes. Its versions stay exactly as they are; only its
name changes, `@acme/infra/deploy` becoming `@acme/devops/deploy`, and the old name keeps working
as an alias (118). Anyone in the workspace can ask; a regular member's request waits for the
workspace's moderators, admins or root. Every name the item has had is kept and shown as its
history.

115 left this out ("Moving one item to another scope. Its name would change; not planned"); 118's
aliases and 115's requests make it safe now.

## Scope

**In:**
- **Who asks** (owner, 2026-10-27): any member of the item's workspace (091), as anyone there
  may propose a change (017), and root.
- **Who decides** (owner, 2026-10-27):

  | Asked by | What happens |
  |---|---|
  | Root, or a moderator or admin of the item's workspace | Moved at once, after a confirmation |
  | Any other member of the workspace | A request, answered by the workspace's moderators and admins, or root; never by its asker |

  In a personal workspace (114) its owner is its admin, so the owner moves at once.
- **Same workspace only.** The target is another scope of the item's workspace. Who sees,
  reviews, installs and may depend on the item doesn't change, so none of 093's dependency checks
  apply.
- **The item keeps its name inside the scope:** `@ws/from/x` becomes `@ws/to/x` (`@from/x` →
  `@to/x` in `global`). Renaming the item itself is out (below).
- **Nothing about its versions changes** (owner, 2026-10-27): not the versions, their tarballs and
  checksums, tags, deprecations, yanks, download counts, usage, pins or favorites. Every old name
  becomes an alias (118, reason `move`), so lockfiles, dependencies, links and installs keep
  working; `rmk` moves projects to the new name as they install or update.
- **A name clash refuses the move:** the target scope already has an item with that name, an open
  submission of a new item with that name (submitted, changes requested or approved), or the new
  name is another item's alias (118).
- **The request:** one open per item, an optional message (500 characters); cancelled by its asker
  or anyone who could answer it; approved or declined (optional reason). On the Requests page and
  the workspace's Requests tab (094, 115), counted in the nav.
- **The move itself:** one transaction under the item's release lock: the item's scope, its alias,
  its open work renamed (its own drafts and change proposals, and the workspace's other drafts
  and submissions that depend on it: 113's rewrite; open work in other workspaces keeps the old
  name, which resolves through the alias), a history entry, the request closed, the catalogue revision
  raised (079), `item.moved` audited.
- **History** (owner, 2026-10-27): a **History** tab on the item page lists every name the item
  has had and how each changed: moved to another scope (this feature), its scope moved to another
  workspace (115), its workspace renamed (113), or the workspace added to names (118's migration).
- Audit events `item.move_requested`, `item.moved`, `item.move_declined`, `item.move_cancelled`, on
  the item, naming both scopes.

**Out** (and where it goes instead):
- **Moving an item to another workspace.** Its visibility, reviewers and dependents would change:
  move the whole scope (115), or a later feature with 115's checks.
- **Renaming an item** (`deploy` → `deploy-tool`). Not planned; the history tab is ready for it.
- **Moving several items at once.** One at a time.
- **Moving from `rmk`, MCP or the API.** Web only, as 115. The API and `rmk` already follow the
  new name through the alias.
- **History of versions** (released, yanked, deprecated): the Versions tab has them.

## Behaviour

**Where.** On the item page, beside Propose a change, **Move to another scope…** for every member
of the item's workspace and root, when the workspace has another scope. While a request is open
the item page shows its asker and those who can answer a notice: "Moving to @acme/devops, asked by
Ana · Cancel". A declined request shows its asker "Move to @acme/devops declined" with the reason,
until the next request.

**The Move dialog.**
1. **To which scope:** a select of the workspace's other scopes, with their descriptions.
2. **What it changes**, as soon as a scope is picked: the new name (`@acme/infra/deploy` →
   `@acme/devops/deploy`); that the old name keeps working and `rmk` moves projects to the new one;
   that in Claude Code it shows as a new plugin, with "Moved from" for 30 days (118); its open
   drafts and proposals, and the workspace's open work that depends on it, take the new name. A
   clash (above) is shown with the reason and disables the button. Other people's drafts are
   counted, never named (only root sees them).
3. **Message** (optional), when it will be a request.
4. **The button** says what will happen: **Move item** (at once) or **Ask to move** ("acme's
   moderators, admins or root will answer").

A move made at once asks once more: "Move @acme/infra/deploy to @acme/devops, as
@acme/devops/deploy?"

**Answering.** The Requests page (`/workspaces/requests`) gains a third table, **Item moves**, for
root (every open one) and each workspace's moderators and admins (their workspace's); the
workspace's Requests tab shows its own. The nav count adds them. Each row: the item and its type,
from and to, who asked and when, the message, and a clash if one has appeared. **Approve** re-checks
and moves, or says what refuses it now and leaves the request open; **Decline** takes an optional
reason. A second answer is told "Already answered". The asker never sees Approve on their own
request.

**When the asker can no longer ask.** Approving checks the asker is still a member of the item's
workspace (or root). If not, the request closes as cancelled (`item.move_cancelled`,
`reason: "asker_lost_role"`) and the answerer is told why.

**History.** `?tab=history` on the item page, for everyone who sees the item. The current name
first, then each change, newest first: when, from → to, why ("Moved to another scope", "Its scope
moved to another workspace", "Its workspace was renamed", "Workspace added to item names"), and
who asked and who approved (or "moved by" when nobody had to answer), by display name as Versions
shows who released. People erased (103) show as their pseudonym. Entries from before this feature
show what and when, and who only where it is known (below).

**After the move.** From the next request the item shows, filters and installs under the new
scope and name in the catalogue, item page, search, the registry API, resolve, MCP and the feeds;
the old name answers as an alias (redirect on the item page, resolve and install in the API).
Reviews of its open submissions stay with the same workspace's moderators.

## Edge cases

- **Moving back** to the scope it came from: the earlier name was this item's own alias, so it
  becomes its name again (118 only refuses another item's alias), and History shows both moves.
- **A clash that appears while the request is open** (an item released in the target with that
  name): Approve says so and leaves it open; the asker cancels.
- **The target scope is deleted, or moved to another workspace (115), while a request is open:**
  deleting it removes the request with it; a scope moved out makes the request cross-workspace, so
  Approve refuses it ("@beta/devops is now in another workspace than the item": the scope where it
  is now, or as it was in the item's workspace, `@acme/devops`, when the answerer doesn't see its
  new workspace, so a private workspace is never named) and closes it as cancelled
  (`reason: "target_moved"`).
- **The item's own scope moves to another workspace while a request is open:** the same, as the
  request now crosses workspaces.
- **A release while the item moves:** they take the same lock, so one waits for the other; a
  release packed under the old name is refused ("moved while it was being released … release it
  again"), as in 115.
- **The asker is the item's only author and a regular member:** still a request; authorship gives
  no rights (MVP §15, `owner_id` is informational).
- **Two answerers approve at once:** the first wins under the request's row lock; the second gets
  "Already answered".
- **A yanked or deprecated item, or one with no installable version:** moves like any other.
- **History across workspaces** (115 moved its scope): an earlier name in a workspace the viewer
  can't see (093) shows as "a workspace you can't see", never its name, so History tells nobody
  where a private item came from.
- **The message and decline reason** stay out of the audit log, as 094's and 115's do.
- **An item pinned on a shelf or favorited:** pins and favorites are by item id (125), so they
  follow it.

## Data

- `item_moves` (like `scope_moves`): id, item_id, from_scope_id, to_scope_id, requested_by,
  message, status `open/approved/declined/cancelled`, decided_by, reason, created_at, decided_at;
  cascade with the item and with the target scope; one open per item, checked in the service
  under the item's row lock (MySQL has no partial indexes).
- `item_name_history`: id, item_id, old_name, new_name, reason (`move_item`, `move_scope`,
  `rename_workspace`, `migration`), requested_by, decided_by (both nullable, set null when the
  user is deleted), source id (the `item_moves` or `scope_moves` row, nullable), created_at.
  Written from now on by this feature, by 115's move and by 113's rename, in their transactions.
- **Backfill:** one entry per existing `item_aliases` row, its reason mapped, its date kept, its
  new name the next alias's name in date order or the current name; for a 115 move, who asked and
  approved from the `scope_moves` row decided in the same transaction (the same scope and
  timestamp), otherwise nobody.

## Documentation

- **Scopes**, a new section **Moving an item to another scope** (`scopes#moving-items`): who asks,
  who answers (the table), what changes and what doesn't, clashes, moving back.
- **Scopes → Who creates and uses them** (`scopes#who`): an item can move to another scope of its
  workspace.
- **Workspaces → Joining a workspace** (`workspaces#joining`) and **Creating and managing them**:
  the Requests page also holds item moves; moderators answer them.
- **Workspaces → Moving a scope** (`workspaces#moving`): moving one item instead, within the
  workspace.
- **Items and types**, a new section **An item's history** (`items#history`): the History tab and
  what each entry means.
- **Roles** (`roles`): moderators answer item moves in their workspace.
- **Helpers:** in the Move dialog, "Who has to agree?" → `scopes#moving-items`; on the History tab,
  "Why did the name change?" → `items#history`.
- New sections change `apps/web/src/components/help/topics.ts` and ronne-web's `topics.ts`
  together, in English, Portuguese and French.

## Acceptance criteria

- [ ] Only members of the item's workspace and root can ask; the service refuses everyone else.
- [ ] Root and the workspace's moderators and admins move at once after a confirmation; any other
  member's move is a request that only they answer, never the asker.
- [ ] The target is always another scope of the same workspace; anything else is refused.
- [ ] A clash (an item, an open submission of a new item, or another item's alias with the new
  name) refuses the move, when asked and when approved.
- [ ] After a move the item has the new name everywhere from the next request; the old name works
  as an alias; versions, tarballs, checksums, tags, downloads, pins and favorites are unchanged;
  the catalogue revision rose; open work names the new name.
- [ ] One open move per item; asker and answerers cancel; a second answer gets "Already answered";
  an asker who left the workspace has the request cancelled at approval.
- [ ] History lists every name change (this feature's, 115's, 113's, 118's), old ones backfilled,
  without naming a workspace the viewer can't see.
- [ ] Every step is audited.
- [ ] The dialog, the Item moves table and History are in English, Portuguese and French (129) and
  pass the phone sweep (065).
- [ ] The Documentation and inline helpers listed above say what the feature does.

## Decisions

1. **Any member asks; moderators, admins and root decide** (owner, 2026-10-27). Moderators answer
   here, not only admins as in 115: within the workspace nothing about visibility changes, so it
   is a moderator's kind of decision.
2. **Same workspace only, for now** (owner, 2026-10-27).
3. **Versions untouched** (owner, 2026-10-27): the name changes through an alias; tarballs keep
   the name they were released with (118).
4. **History shows every name change** (owner, 2026-10-27), in its own table rather than read from
   the audit log, since the audit log is root's alone and its events aren't shaped for the item
   page (one table keyed by item, read with the item's visibility).
5. **A clash refuses rather than renames** (Claude): renaming the item is out of scope, and the
   asker can pick another scope.

## Open questions

None.
