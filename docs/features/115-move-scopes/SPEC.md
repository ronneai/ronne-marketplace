# 115 — Moving a scope to another workspace

> Milestone: M13 · Depends on: 090, 091, 092, 093, 094, 118, 113, 114, 014, 015, 077, 079 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (118 defines names and aliases)

## Goal

A scope, with every item in it, moves from one workspace to another (owner, 2026-10-09): a team
takes over a scope, a personal project (114) becomes a team's, or something proven in a team goes
to `global` for everyone. 090 left it out because a move changes who sees, reviews and can depend
on every item in the scope; this feature says who decides, and what a move may not break.

## Scope

**In:**
- **Who asks:** an admin of the scope's workspace (092), its owner when it's a personal workspace
  (114), or root.
- **Who decides** (owner, 2026-10-09):

  | The move | What happens |
  |---|---|
  | Asked by root | Moved at once, after two confirmations |
  | To `global`, asked by an admin of `global` | Moved at once, after two confirmations |
  | To `global`, asked by anyone else | A request that only root answers |
  | To a shared workspace where the asker is admin | Moved at once, after a confirmation (unless it carries not-reviewed versions, below) |
  | To a shared workspace where the asker isn't admin | A request that its admins or root answer |
  | To the asker's own personal workspace | Moved at once, after a confirmation |

- **Not-reviewed versions** (114): a scope whose released versions include any marked not reviewed
  always goes through a request, answered by root or a target admin other than the asker, who sees
  them listed. Approving the move marks them reviewed, by that person.
- **Its items are renamed** (118): `@from/scope/x` becomes `@to/scope/x` (`@scope/x` in
  `global`), and every old name becomes an alias, so lockfiles, dependencies and links keep
  working.
- **A name clash:** when the target already has a scope with that name, the asker gives the scope a
  new name, free in the target, and the move renames it (owner, 2026-10-09).
- **What a move may not break**, checked when asked and again when it happens, refused with the
  list: dependencies outside the target that would lose sight of the scope's items, and the scope's
  items' own dependencies that the target couldn't depend on (093's rule).
- **The request:** one open per scope, an optional message (500 characters), cancelled by its
  asker or any admin of the scope's workspace (or root), approved or declined (optional reason) by
  those above. Shown on the Requests page and the workspace's Requests tab (094) with the join
  requests, counted in the nav.
- **The move itself:** one transaction: the scope's workspace (and name, if renamed), the items'
  aliases; drafts and submissions not released yet name the items by their new names (as a rename
  does, 113); versions and tags are unchanged; the catalogue revision rises (079).
- Audit events `scope.move_requested`, `scope.moved`, `scope.move_declined`,
  `scope.move_cancelled`, on the scope, naming both workspaces.

**Out** (and where it goes instead):
- **Moving one item to another scope.** Its name would change; not planned.
- **Moving several scopes at once.** One at a time; a workspace with many can ask for each.
- **Moving into someone else's personal workspace.** Only its owner moves scopes in (114: only
  the owner has access), so it's never offered to anyone else, root included.
- **Deleting a workspace after its last scope moves.** Still 090's Delete, by root.

## Behaviour

**Where.** On a workspace's page (`/workspaces/<name>`, the Scopes tab), each scope row has
**Move…** for root and the workspace's admins (for a personal workspace, its owner and root). A row
with an open move shows "Moving to acme · Cancel"; a declined one shows "Move to acme declined" with
the reason until the next request.

**The Move dialog.**
1. **Where to:** a select of the workspaces the asker can see (093), except the scope's own and
   other people's personal workspaces; the asker's own personal workspace is listed as "Personal".
2. **The scope's name there:** filled in with its current name. If the target has a scope with that
   name, the field says "acme already has a scope called test: pick another name for it there" and
   Move stays disabled until the name is free in the target (checked as typed, the name rule, the
   reserved names), and none of the items' new names is another item's alias (118). Changing the
   name when there's no clash is allowed too.
3. **What it changes**, from the checks below, shown as soon as a workspace is picked:
   - the items' new names (`@infra/deploy` → `@acme/infra/deploy`), and that the old ones keep
     working and `rmk` moves projects to the new ones; in Claude Code they show as new plugins;
   - who will see the items ("Everyone on this instance" for a public target; "Only acme's members
     and root" for a private one; "Only you and root" for a personal one), and, when fewer people
     will, that installs by people who lose sight of them stop updating (093);
   - who will review them (the target's moderators and admins);
   - open submissions by people who aren't members of the target: they'll be able to read and
     withdraw them, not edit or submit (091's rule for a removed member);
   - not-reviewed versions (114), listed;
   - what refuses the move (below), listed, with Move disabled.
   Anything in a workspace the asker doesn't see (093: someone's personal workspace, a private
   one they aren't in) is counted, never named, and so are other people's drafts (only root
   sees those); a count still refuses when what it counts would.
4. **Message** (optional), when the move will be a request.
5. **The button** says what will happen: **Move scope** (moved at once) or **Ask to move**
   (a request, "acme's admins or root will answer" or "Root will answer" for `global`).

**Confirmations.** A move made at once asks once: "Move @infra and its 12 items to acme, as
@acme/infra?" (or "renamed to @acme/infra-tools" when renamed) with the changes above. Root, and an admin of `global` moving to `global`, are asked twice (owner,
2026-10-09): the dialog's confirmation, then a second one where they type the scope's name, since
the move needs nobody's answer and, to `global`, shows the items to everyone. The service checks
the typed name too: without it, nothing moves.

**What refuses a move.** Under the scope's row lock and the same lock a release takes for its
dependency checks (093), when asked, when approved and when moved:
- **Outside dependents:** a released, not-yanked version of an item outside the target workspace
  that depends on an item in the scope, when the target is private (the same check as turning a
  workspace private, 093, for one scope's items). With a public target nothing outside loses sight.
- **The scope's own dependencies:** a released, not-yanked version in the scope, or an open
  submission, that depends on an item in a private workspace other than the target (its current
  one included, for items outside the scope). After the move they'd break 093's rule.
  A dependency still in review (056, 112: submitted, changes requested or approved, never a draft)
  is judged by where it is, as its release will be; in the scope itself it never counts. For anyone but root, a submission's dependency that names no item,
  released or in review, refuses as a hidden one would, so a refusal never tells a hidden item
  from a name nobody has; the dialog says it's something the asker can't see or that doesn't
  exist.
- **An open move** already for the scope ("A move to acme is waiting for an answer").
- **A name clash** that appeared since it was asked: the target now has a scope with the new name,
  or a new name is now another item's alias. Approve says so and leaves the request open; the asker
  cancels it and asks again with another name.
Open submissions outside that depend on the scope's items are listed as a warning when the target
is private: they'll fail at release, as with turning a workspace private.

**Answering.** The Requests page (`/workspaces/requests`, 094) gains a second table, **Scope
moves**, for root (every open move) and each shared workspace's admins (moves into theirs).
Requests to move to `global` come from people who aren't its admins (its admins move directly) and
are root's alone. The workspace's Requests tab in Admin shows the moves into it. The nav count adds
them. Each row: the scope and its item count, from and to, the name it will have there (marked when
renamed), who asked and when, the message, the not-reviewed versions if any, and what would refuse it now.
**Approve** re-runs the checks and moves, or says what refuses it now and leaves the request open;
**Decline** takes an optional reason, shown to the asker on the scope's row. A second answer is told
"Already answered".

**When the asker can no longer ask.** Approving checks that the asker is still root or an admin of
the scope's workspace (or still its owner). If not, the request is closed as cancelled
(`scope.move_cancelled`, `reason: "asker_lost_role"`) and the answerer is told why.

**The move.** One transaction: `scopes.workspace_id` changes (and `scopes.name`, when renamed), each
item's old name is written as an alias (118), the open work in the scope names its items by their
new names (its `name`, its dependencies, a skill's agent: 113's rewrite), not-reviewed versions approved by the
answerer become reviewed (`reviewed_by` the answerer), the request closes, the catalogue revision
rises, and `scope.moved` is audited (`{ scope, newName, from, to, askedBy, approvedBy, direct,
items, reviewed }`; `direct: true` when nobody had to answer). From the next request:
- the items show and filter under the new workspace, and its moderators and admins review their
  open submissions;
- people who can't see the target get not found (093) for its items, in the catalogue, `rmk`, MCP
  and the feeds; nothing already installed is touched;
- people who now can see them (a public target) find them in the catalogue and their marketplace;
- the items have their new names; their old names answer as aliases to those who see them, and
  `rmk` rewrites lockfiles to the new names as projects install or update (118);
- versions, tags and download counts don't change.

**Personal workspaces** (114). The owner moves a scope out of theirs like any admin: to their own
admin workspace at once (unless it carries not-reviewed versions, which every version released in
the personal workspace is), to another shared one as a request, to `global` as a request to root (or at once, with two
confirmations, when they're an admin of `global` and nothing is not reviewed). Root can move
a scope out of anyone's personal workspace. Moving into a personal workspace is its owner's only:
from a workspace they administer, to keep working on a scope alone.

**Workspaces in one place** (owner, 2026-10-11). Managing a workspace leaves the Admin area:
everything is on the Workspaces pages, and each option shows only to those allowed.
- **A workspace's page** is `/workspaces/<name>`, for anyone who sees the workspace (093; a
  personal one only for its owner and root, 114): its description, visibility, their role (or Ask
  to join), and its **Scopes** tab. Create scope, each scope's Edit and Move…, Edit description,
  Rename, the visibility, Delete, and the **Members** and **Requests** tabs show only to those who
  may use them, as before. A scope row's actions are icon buttons on one line, each with its name
  as a tooltip and an accessible label. The Move dialog is wider (640px), and nothing in it
  scrolls sideways: long names break, and its buttons stay in view.
- **The list** is `/workspaces`, every workspace's name a link to its page. Root also gets
  **New workspace** and two tabs above the list, **Shared** and **Personal** (each personal
  workspace with its owner), each with how many match the search (owner, 2026-10-11: the Kind
  select was hard to notice).
- **Admin › Scopes is gone too** (owner, 2026-10-11): a scope is created, edited and moved on its
  workspace's page, so Create scope there makes it in that workspace, with no workspace to pick.
  `/admin/scopes` redirects to `/workspaces`, and `/admin/scopes?workspace=<name>` to that
  workspace's page. Admin keeps Users, Audit log and Settings.
- **Admin › Workspaces is gone:** `/admin/workspaces` and `/admin/workspaces/<name>` redirect to
  the Workspaces pages, so links and bookmarks keep working. The Admin area is root's alone again:
  a workspace's admin no longer sees Admin in the menu.

## Edge cases

- **A workspace named `requests`:** `/workspaces/requests` is the Requests page, so `requests`
  joins the reserved workspace names (a personal workspace from `requests@…` gets `requests-2`,
  114). One created before can't open its page: root renames it (113).

- **The target workspace is deleted, or its visibility changes, while a request is open:** deleting
  a workspace removes the requests into it (cascade, counted in `workspace.deleted`); a visibility
  change is caught when the request is approved, by the checks above.
- **The source workspace is deleted** (090: only once it has no scopes, so after its last scope
  moved out): the moves out of it are kept, without it; the audit log names both workspaces.
- **The scope gets a new outside dependent while the request is open:** caught at approval; the
  release that adds it and the move take the same lock, so one of them waits and sees the other.
- **The asker is the only admin of both workspaces:** moved at once (unless not-reviewed versions
  need someone else).
- **Moving to the same workspace:** not offered; the service refuses it.
- **Moving to a workspace renamed while the request is open** (113): requests hold ids, so nothing
  changes; the rows and the items' new names show the target's new name.
- **Moving a scope back where it came from:** its items take their earlier names again; those names
  were aliases of these same items, so they stop being aliases and become names again (118 only
  refuses another item's alias).
- **Two scopes asked to move into the same target under the same new name:** the second to be
  approved meets the clash and stays open.
- **A dependency written with an old name** (in another item's draft or released version): it
  still resolves through the alias; the next submit offers Use the new name (118).
- **A scope with no items:** moves like any other; nothing to check.
- **Root moves a private workspace's scope to `global`:** after two confirmations, its items become
  everyone's; the confirmation says so in those words.
- **The request's message and the decline reason** stay out of the audit log, as 094's do.
- **Two answerers approve at once:** the first wins under the request's row lock; the second gets
  "Already answered".
- **A release while the scope moves:** they take the same locks (the scope's submissions and items,
  then the workspaces), so one waits for the other. A release packed under the scope's old
  workspace, or one whose dependency moved between its lookup and its locks, is refused ("moved to
  another workspace while it was being released … release it again").

## Documentation

- **Workspaces**, a new section **Moving a scope** (`workspaces#moving`): who can ask, who answers
  (the table above), what a move changes and what refuses it, root's double confirmation,
  not-reviewed versions from personal workspaces.
- **Workspaces → Your personal workspace** and **Creating and managing them**, and
  **Administration → Workspaces**: moving a scope out (Delete needs the scopes moved first), Move…
  on a scope's row, and the moves on the Requests tab.
- **Workspaces → Joining a workspace** (`workspaces#joining`): the Requests page also holds scope
  moves.
- **Scopes → Who creates and uses them** (`scopes#who`): a scope can move to another workspace;
  its items take the new names, and their old names keep working.
- **`rmk` → Installing** (`rmk#installing`): an item can disappear when its scope moves to a
  workspace you can't see.
- **Helpers:** in the Move dialog, "Who has to agree?" → `workspaces#moving`; on the Scope moves
  table, "What does approving do?" → `workspaces#moving`.
- **Scopes on the workspace's page** (task 15): **Scopes → Who creates them** and **Workspaces →
  Creating and managing them** say a scope is created on its workspace's page; Admin › Scopes is
  gone, and **Members and roles** no longer gives a workspace's admins an Admin menu. The "Which
  workspace?" helper went with the dialog's picker.
- **Items name their workspace** (task 16): **Workspaces → What a workspace is** says cards and the
  item page show the workspace (a link) and the scope, and that an item installs by its full name;
  **Public and private** puts the lock beside the workspace, and a personal one says
  `(personal)`. **Items → the agent field** takes `@workspace/scope/name` outside `global`. `rmk`'s
  usage says what an `<item>` is, and its and the MCP server's messages name both forms.
- **Workspaces in one place:** **Administration → Workspaces** (`admin#workspaces`) goes, in both
  repositories' `topics.ts`; what it said moves to **Workspaces → Creating and managing them**
  (`workspaces#managing`): the Workspaces list (root's every workspace, Kind, New workspace), a
  workspace's page for everyone who sees it and its tabs for those allowed, and Admin as root's.
  **Your personal workspace**, **Members and roles** and **Joining a workspace** name the
  workspace's page instead of Admin › Workspaces; Administration's summary says it's root's. No
  helper links to the removed section, and no helper's words change.

## Acceptance criteria

- [x] Only root, the scope's workspace's admins (or its personal workspace's owner) can ask; the
  service refuses everyone else.
- [x] Each row of the "who decides" table holds: root, and an admin of `global` moving to `global`,
  move after two confirmations; anyone else moving to `global` needs root; an admin of both moves
  at once; otherwise the target's admins or root answer.
- [x] A scope with not-reviewed versions always needs root or another target admin, and approving
  marks them reviewed by that person.
- [x] Moves that would break a dependency (outside dependents with a private target, the scope's
  own dependencies on another private workspace) are refused with the list, when asked and when
  approved.
- [x] After a move, the items are seen, reviewed and installed per the new workspace from the next
  request, under their new names; their old names work as aliases for those who see them;
  versions are unchanged; the catalogue revision rose.
- [x] A move into a workspace with a scope of the same name needs a new name, free in the target,
  and renames the scope; a clash that appears before approval leaves the request open.
- [x] One open move per scope; asker and source admins cancel; a second answer gets "Already
  answered"; an asker who lost the role has the request cancelled at approval.
- [x] Every step is audited.
- [x] The dialog and the Scope moves table pass the phone sweep (065).
- [x] The Documentation and inline helpers listed above say what the feature does now.
- [x] A workspace's page and the list are under Workspaces for everyone who sees them, with each
  option shown only to those allowed; Admin › Workspaces redirects there; Admin is root's.
- [x] Root's list has Shared and Personal tabs with their counts; the Move dialog never scrolls
  sideways and keeps its buttons in view.
- [x] Admin › Scopes is gone and redirects; scopes are created on their workspace's page.
- [x] Item cards and the item page name the item's workspace.

## Decisions

1. **Who asks and who decides** as in the table (owner, 2026-10-09).
2. **Root's moves, and moves to `global` by its admins, need two confirmations, the second typing
   the scope's name** (owner, 2026-10-09, "double confirmation"; the typed name is Claude's).
   Admins of `global` move to `global` without root (owner, 2026-10-09).
3. **Refused rather than broken** (Claude): a move that would make released items stop installing
   for people who did nothing is refused with the list, as turning a workspace private is (093).
4. **Not-reviewed versions need someone else's answer** (Claude, with 114 decision 3): the four-eyes
   rule applies at the moment a personal item can reach other people.
5. **Moves into a personal workspace are its owner's alone** (Claude, from 114: only the owner has
   access).
6. **A name clash renames the scope as part of the move** (owner, 2026-10-09): scope names are
   unique per workspace (118), and the old names stay as aliases.
7. **Requests sit with join requests** (Claude): one Requests page and one nav count for everything
   waiting on an answer.

## Open questions

None.
