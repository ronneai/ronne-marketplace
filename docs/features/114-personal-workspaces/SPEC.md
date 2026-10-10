# 114 — Personal workspaces

> Milestone: M13 · Depends on: 090, 091, 092, 093, 094, 095, 118, 113, 008, 059, 077, 079 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (118 defines names)

## Goal

Every user has a workspace of their own (owner, 2026-10-09): private, only theirs, always. It's
where a person builds items for themselves, installs them and tries them out, before moving a scope
into a team's workspace or `global` (115). Today a person can only work in workspaces someone else
set up and in scopes root created; a personal workspace lets anyone start without asking.

## Scope

**In:**
- **One personal workspace per user**, created for every existing user by the migration, and with
  every new user (Create user, 008; the root account from setup, 003 and 036). Roots get one too.
- **Only the owner is in it.** The owner is its admin (092): they create its scopes, edit its
  description and rename it (113). Nobody else can be added; nobody can ask to join it (094).
- **Always private** (093): Make public is never offered and the services refuse it.
- **Root manages it**, as root manages every workspace: sees it and its items (093), renames it,
  edits its description, creates scopes in it, moves scopes out of it (115). Root doesn't become a
  member.
- **Releasing without review in your own workspace** (decision 3): the
  owner's submissions there are approved when submitted, marked as not reviewed, and released as
  usual. 115 makes moving such versions out need someone else's review.
- **Its items are named `@<workspace>/<scope>/<name>`** like any outside `global` (118), so a
  personal scope can have any name, the same as a team's or another person's.
- **Where it shows:** the Workspaces page (094) lists it first as "Personal" with Manage; the
  catalogue's Workspace filter offers it as "Personal"; `GET /api/v1/workspaces`, `rmk workspaces`
  and MCP's `list_workspaces` mark it `personal`; `rmk export` lists its scopes first.
- **Admin › Workspaces** (root): a Kind filter, Shared (default) or Personal; a personal row shows
  its owner.
- Audit events: `workspace.created` with `personal: true` and the owner; the others as for any
  workspace.

**Out** (and where it goes instead):
- **Moving scopes out of it or into it:** [115](../115-move-scopes/SPEC.md).
- **Sharing a personal workspace.** It stays the owner's alone; a scope that others should use
  moves to a shared workspace (115).
- **Deleting a personal workspace.** It lives as long as its user. Erasing a user (103) decides what
  happens to it then.
- **Turning a shared workspace into a personal one, or back.**

## Behaviour

**Data.** `workspaces.owner_id`: the owner's user id for a personal workspace, null for every other
(`global` and the shared ones); unique, so a user has at most one; FK to `user`, RESTRICT (users
are disabled, never deleted). The owner has a `workspace_members` row with the role `admin`, so
every permission check (091, 092) works unchanged; the services refuse any other row for a personal
workspace, and any change to the owner's.

**Its name.** The local part of the owner's email, made into a valid name (lowercased, anything
other than letters and digits becomes a hyphen, repeated and outer hyphens dropped, cut to 60);
if that's reserved, empty or taken, `-2`, `-3`… is added. `ana.silva@acme.com` gets `ana-silva`.
The owner or root renames it (113). Its description starts as "<name>'s personal workspace".
Only the owner and root ever see the name (093).

**The owner's view.**
- **Workspaces page** (094): "Your personal workspace" first, with its name and **Manage**, which
  opens its page (`/admin/workspaces/<name>`): Scopes (Create scope), Rename, Edit description. No
  Members or Requests tab, no visibility setting, no Delete. Owning a personal workspace doesn't
  open the Admin area or put Admin in the nav: that stays for root and admins of shared workspaces
  (092), and the page is reached from the Workspaces page.
- **Writing items:** a personal scope is offered in the editor and in `rmk export` like any scope
  the user may use (091), listed first, labelled "Personal".
- **Submitting** a submission in a personal workspace approves it at once (decision 3): its page
  says "Approved by you: personal workspaces aren't reviewed", the risk flags (014) are shown at
  submit as they would be to a reviewer, and Release works as for any approved submission (015,
  055, 112). The submission's approval is recorded as the author's own (`self_approved`), and every
  version released from it is marked **not reviewed**. Nothing reaches the review queue.
- **Installing:** the owner installs their personal items as any item they can see: `rmk`, MCP,
  their plugin marketplace (077).

**Everyone else.** A personal workspace and its items don't exist for anyone but its owner and
root (093's not found, not forbidden). Its join link answers as a name no workspace has (094):
the request is kept, by name, and nobody answers it, so asking can't tell a personal workspace
from no workspace. Add members, a user's Workspaces dialog (092) and the move dialog's destinations
(115) never offer someone else's personal workspace.

**Root's view.** Root sees every personal workspace and its items (093) but isn't flooded with
them: the catalogue, search, home page and root's own plugin marketplace leave out other people's
personal workspaces, unless the catalogue's Workspace filter or `?workspace=` names one; item
pages, the API by name and Admin › Scopes (with its Workspace column) still show them. Root can't
approve or release on the owner's behalf any differently than anywhere else (root override, 014).

**Dependencies** (093's rule, unchanged): a personal workspace's items may depend on its own items
and on public workspaces' items, and nothing outside depends on them.

**Plugin feeds** (077, 079). A private workspace now exists per user, so the visibility key (093)
counts only the private workspaces that have a released item: a user whose personal workspace is
empty shares the public marketplace with everyone else, as today. The key changes when a personal
workspace releases its first item, which raises the catalogue revision as any release does.

**Disabled users and roots.** A disabled user's personal workspace and items stay, seen only by
root. Making someone root (059) keeps their personal workspace and admin row; taking root away
keeps them too.

**API, `rmk` and MCP** (095). `GET /api/v1/workspaces` and `GET /api/v1/me` carry
`"personal": true` on the caller's own (root's list leaves out others', unless asked by name).
`rmk workspaces` shows it in the VISIBILITY column as `personal`. `rmk export` groups its scopes
first, under "Personal (<name>)".

## Edge cases

- **Two users whose emails share a local part** (`ana@a.com`, `ana@b.com`): `ana` and `ana-2`, in
  the order they were created; the unique index decides a race, and the loser tries the next.
- **A name that later collides with a shared workspace root wants to create:** root sees "That name
  is taken" and can rename the personal workspace (113) or pick another name.
- **Root's own personal workspace:** like anyone's; root's catalogue shows it.
- **The owner is removed from it:** impossible; the services refuse any change to the owner's row,
  for root too.
- **Scope names are per workspace** (118): creating `@ana-silva/acme` says nothing about whether
  another workspace has an `acme` scope, and takes no name from anyone.
- **The workspace's name is in its items' names** (`@ana-silva/tools/lint`), which only the owner
  and root see. Moving a scope out (115) gives its items the target's names; the old ones become
  aliases that only who sees the item can use.
- **The migration on a large instance:** one workspace and one membership row per user, in
  batches, on the four databases.
- **A user created while the migration runs:** Create user makes the workspace in the same
  transaction, so nobody is left without one; the migration skips users who have one.

## Documentation

- **Workspaces**, a new section **Your personal workspace** (`workspaces#personal`): what it is,
  who sees it, releasing without review, moving a scope out (115).
- **Workspaces → Public and private** (`workspaces#visibility`): personal workspaces are always
  private.
- **Roles → The roles** and **Who can do what** (`roles#roles`, `roles#permissions`): you're the
  admin of your own workspace; its items aren't reviewed.
- **Review → Statuses** (`review#statuses`): submitting in a personal workspace approves at once.
- **Export → Choosing the scope** (`export#scope`): the personal workspace's scopes first.
- **Administration → Workspaces** (`admin#workspaces`): the Kind filter, root's view.
- **Helpers:** on the Workspaces page next to Personal, "What's my personal workspace?" →
  `workspaces#personal`; on a personal submission's Approved notice, "Why wasn't this reviewed?" →
  `workspaces#personal`.

## Acceptance criteria

- [ ] The migration gives every existing user (roots too) a private personal workspace with an
  admin membership, on SQLite, PostgreSQL, MySQL and MariaDB; Create user and setup do the same.
- [ ] Nobody can be added to, ask to join, or change the owner in a personal workspace; it can't be
  made public or deleted; in the UI and the services.
- [ ] Only its owner and root see it and its items; anyone else gets what an unknown name gets.
- [ ] The owner creates scopes, drafts, submits and releases there without review; the
  versions are marked not reviewed; the review queue never shows them.
- [ ] Root's catalogue, search and plugin marketplace leave out others' personal workspaces unless
  one is named.
- [ ] Users with an empty personal workspace share the public marketplace's cache entry.
- [ ] The API, `rmk workspaces`, `rmk export` and MCP's `list_workspaces` mark it personal.
- [ ] The pages pass the phone sweep (065).
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Every user has one, private always, only theirs; root still manages it** (owner, 2026-10-09).
2. **The owner is its admin through an ordinary membership row** (Claude): every existing
   permission check works; the personal rules are a few refusals in the members service.
3. **The owner's submissions there are approved when submitted and their versions marked not
   reviewed** (owner, 2026-10-09, on Claude's proposal): only the owner and root can see or
   install them, so a second pair of eyes protects nobody, and only root could give it. The four-eyes rule (MVP
   §15, "Approval") moves to the boundary: 115 makes moving not-reviewed versions out of a personal
   workspace need someone else's review.
4. **Scope names are unique per workspace** (owner, 2026-10-09; 118): so a personal scope takes no
   name from anyone, and creating one reveals nothing. No limit on how many scopes a personal
   workspace has, since they no longer squat names.
5. **Root's lists leave out others' personal workspaces unless asked** (Claude): with one per user,
   they would bury the shared ones.

## Open questions

None.
