# 093 — Private workspaces

> Milestone: M13 · Depends on: 090, 091, 092, 089, 018, 019, 020, 027, 077, 079 · Design: [MVP §12](../../MVP/MVP.md#12-security-considerations), [§15](../../MVP/MVP.md#15-decision-log) · Contracts: [`docs/spec/plugin-feeds.md`](../../spec/plugin-feeds.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

A workspace is **public** or **private** (owner, 2026-10-05). A private workspace's items are seen
only by its members (and root): in the catalogue, on item pages, in the API, `rmk`, the MCP server
and the plugin feeds. Its items can be dependencies only of items in the same workspace, while a
public workspace's items can be dependencies anywhere. Only that workspace's moderators approve
its items (091 already makes that so).

## Scope

**In:**
- **Private** in Admin › Workspaces (new and edit; `global` stays public).
- **Who sees a private workspace's items:** its members, any role, and root. To everyone else
  they don't exist: the catalogue, search, home page, item pages, versions, the registry API,
  tarballs, resolve, the MCP tools, plugin feeds and "Used by" answer as if the name were unknown
  (404, `not_found`).
- **The workspace itself** is hidden from non-members as well: not in the catalogue's Workspace
  filter, nor in any list they see (094 adds the one exception, a request link).
- **The dependency rule:** an item may depend on items in its own workspace, or in any public
  workspace. A private workspace's items are never dependencies of items outside it. The picker
  (089) offers only these; the checks at submit and release refuse others
  (`dependency_not_visible`).
- **Changing visibility:** public → private is refused while released items outside the workspace
  depend on its items (the list is shown); private → public is allowed with a confirm.
- **Plugin feeds** (077, 079): each caller's marketplace holds what they can see; the cache is
  keyed per set of private workspaces seen, so everyone with only public access shares one.
- **Losing access** (removed from the workspace, or it turned private): `rmk install`, `update` and
  the feeds answer `not_found` for its items from the next request; nothing already installed is
  touched.

**Out** (and where it goes instead):
- **Asking to join:** [094](../094-workspace-access-requests/SPEC.md).
- **Anonymous access.** Everything still needs a session or a token, as today (MVP §1).
- **Hiding a private item's name in another member's lockfile.** A lockfile is the project's file;
  `rmk` can't hide what it already wrote.
- **Per-workspace tokens.** Tokens still read as their user (MVP §15, "Access tokens").

## Behaviour

**Visible.** `visibleWorkspaces(user)`: every public workspace, plus the private ones the user is
a member of; for root, all. Every read of items, versions, submissions by others, scopes and
workspaces filters on it, in one place per repository (the scope's workspace among the visible
ones: a join, or a `scope_id IN (select … where workspace_id IN (…))` subquery; the viewer lists
workspaces, not scopes, so it stays short), so a new query can't forget it: the repositories
take a `Viewer` argument, and a test lists every read method and checks it filters.

**Not found, not forbidden.** A non-member asking for `@acme-infra/deploy` gets exactly what an
unknown name gets: the 404 page, `not_found` in the API, "No item named @acme-infra/deploy" in
`rmk`. The download count, usage reports (046, ignored for items the reporter can't see) and the
draft name check (013's "name is taken") don't reveal it either: a name taken in a private
workspace is refused as "taken" only to members. A non-member never gets that far: the scope
itself is unknown to them, and an unknown scope and a private one get the same answer, "There's no
scope @acme-infra you can use" (`scope_not_found`), so it can't tell them a private scope exists.

**Dependencies.**
- **Picking** (089): candidates are filtered to the draft's workspace plus public workspaces.
- **At submit and release:** a dependency in another, private workspace gives
  `dependency_not_visible`: "@acme-infra/deploy is in a private workspace; only its own items can
  depend on it." Same message whether or not the submitter can see it.
- **The resolver** (020) runs as the caller: a dependency the caller can't see is `not_found`, so
  `rmk install` fails cleanly with the dependent's name.

**Turning a workspace private.** The edit dialog checks for released items outside the workspace
whose listed version depends on an item in it. If there are any, Save is disabled and they're
listed ("3 items outside acme depend on its items: …"). Open submissions outside that depend on it
are listed as a warning: they'll fail at release. Turning private bumps the catalogue revision
(079) and is audited (`workspace.updated`, `{ visibility: { from, to } }`).

**Turning a workspace public:** a confirm ("Everyone on this instance will see its items and can
depend on them"), then the revision bump.

**Plugin feeds.** Claude Code's marketplace (077) is built per **visibility key**: the sorted ids
of the private workspaces the caller sees (empty for most callers). The in-memory cache (079) holds
one entry per key in use, with the same revision rule; the size and time warnings are per key, and
Admin › Settings shows the largest. A plugin zip is served only if its item is visible to the
caller. The git mirror (`rmk feed build`, 078) includes only public workspaces unless
`--workspace <name>` names a private one the token's user is a member of. It warns that the mirror
repository must then be private too.

**What members see.** A private workspace's items carry a lock icon and "Private · acme" next to
the scope on the card and item page. The catalogue's Workspace filter lists the visible ones.

## Edge cases

- **A member is removed while their `rmk` is mid-install:** the next request gets `not_found`;
  `rmk` stops as it does for any missing item, and nothing is half-written (022's apply rules).
- **A private item's dependents in the same workspace:** unaffected by anything here.
- **Root's view** includes private workspaces. Root's own plugin feed is built with every workspace.
- **A moderator of `global`** sees nothing of a private workspace unless a member of it.
- **Review comments and audit events** naming a private item: the audit log is root only; review
  pages need visibility (and 091's moderator role).
- **Usage on the item page** (047): shown only to those who can see the item.
- **A dependency on a public workspace that turns private:** prevented by the visibility rule
  above; if the rule is changed by hand in the database, the resolver still answers `not_found`.

## Documentation

- **Workspaces**, a new section **Public and private** (`workspaces#visibility`): who sees what,
  dependencies across workspaces, turning a workspace private.
- **Items and types → Dependencies** (`items#dependencies`): items in a private workspace can be
  dependencies only of its own items.
- **Plugin marketplaces → Tokens** (`plugins#tokens`) and **Codex and Cursor** (`plugins#mirror`):
  your marketplace shows what you can see; `--workspace` for a private mirror, kept in a private
  repository.
- **`rmk` → Installing** (`rmk#installing`): "not found" also means "not visible to you".
- **Helpers:** on the visibility setting, "Public or private?" → `workspaces#visibility`; on the
  lock label, "Who can see this?" → `workspaces#visibility`.

## Acceptance criteria

- [ ] A non-member gets the same answers for a private workspace's item as for an unknown name, in
  the catalogue, search, item and version pages, the registry API, tarball, resolve, MCP tools,
  feeds and "Used by"; a member and root see it.
- [ ] Every repository read takes a `Viewer`, and a test fails if a read method doesn't filter.
- [ ] An item can depend on its own workspace's items and on public ones; any other private one is
  refused at pick, submit and release.
- [ ] Turning a workspace private is refused while outside released items depend on it, with the
  list; turning it public asks first; both bump the catalogue revision and are audited.
- [ ] Two users with different private workspaces get different Claude Code marketplaces, from a
  cache keyed per visibility key; public-only users share one.
- [ ] `rmk feed build` leaves private workspaces out unless `--workspace` names one the user is a
  member of.
- [ ] A removed member's `rmk install` of a private item fails with `not_found` from the next request.
- [ ] Service tests pass on the four databases; an end-to-end test checks two users and a private
  workspace on desktop and phone.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Private items are visible only to members and root, and depend-able only inside their
   workspace** (owner, 2026-10-05).
2. **Not found, not forbidden** (Claude): a non-member can't learn that a private name exists.
3. **Turning private is refused while outside items depend on it** (Claude): otherwise released
   items would stop installing for people who did nothing.
4. **One marketplace per visibility key** (Claude): per-user feeds without per-user caches.

## Open questions

None.
