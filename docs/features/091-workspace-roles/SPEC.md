# 091 — Roles per workspace

> Milestone: M13 · Depends on: 090, 014, 016, 059 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§9.5](../../MVP/MVP.md#95-auth) · Contracts: none new

## Goal

Today a user has one role for the whole instance. With workspaces, **moderator and user are
roles in a workspace** (owner, 2026-10-05): someone can moderate their team's workspace and be a
plain user in `global`. **Root stays instance-wide** and can do everything in every workspace.
This feature adds memberships, moves the permission checks to the item's workspace, and converts
today's moderators.

## Scope

**In:**
- The `workspace_members` table: a user's role in a workspace, `moderator` or `user`.
- `user.role` keeps only `root` or `user` (instance-wide). `moderator` moves to memberships.
- **Migration:** every user becomes a member of `global`, with role `moderator` if they were a
  moderator, otherwise `user`; their `user.role` becomes `user`. Roots stay root and get no rows.
- **Permission checks with a workspace:** each check about an item, a submission or a scope is made
  in that scope's workspace.
- **The review queue and the nav:** a moderator sees the submissions of the workspaces they
  moderate; Reviews shows when they moderate at least one.
- **Who may submit where:** creating a draft, proposing a change, exporting and submitting need
  membership of the scope's workspace (any role). Scope lists for drafts (the editor, `GET
  /api/v1/scopes`, `rmk export`) offer only those scopes.

**Out** (and where it goes instead):
- **Managing members in the app**, and the roles chosen when creating a user:
  [092](../092-workspace-members/SPEC.md). Until then, memberships come from the migration and new
  users get `global` / `user`.
- **Who can see what** (private workspaces): [093](../093-private-workspaces/SPEC.md). Reading,
  installing and depending are open to every signed-in user in public workspaces (owner,
  2026-10-05).
- **Workspace admins** (a role that manages members without being root). Not asked for; root
  manages members, and moderators approve access requests (094).

## Behaviour

**Roles.**

| Role | Where | Can |
|---|---|---|
| **root** | instance (`user.role`) | everything, in every workspace, as today; instance admin |
| **moderator** | a workspace | review, approve, reject, release, move tags, deprecate and yank, for items in that workspace |
| **user** | a workspace | create drafts, submit, propose changes, comment on own, release own approved, in that workspace |

Everyone signed in can browse, install and depend on what's published in public workspaces
(093 adds private ones), member or not. A user with no role in a workspace can't submit there.

**Data.** `workspace_members`: workspace_id, user_id, role (`moderator`/`user`), added_by (set
null), created_at, updated_at; PK (workspace_id, user_id); cascade on both. Every user has a
`global` row (092 keeps it so); a root may have rows, which are ignored for permissions.

**Checks.** `can(user, permission, workspace?)` in `identity/models/permissions.ts`:
- instance permissions (`users.manage`, `audit.view`, `scopes.manage`, `workspaces.manage`,
  `settings.manage`, `submissions.override`) need root, as today;
- workspace permissions (`submissions.create`, `submissions.view_submitted`, `submissions.review`,
  `submissions.publish`, `versions.manage`) take the workspace and look up the membership. Root
  passes;
- `account.manage_own` stays "signed in".

The membership is loaded once per request with the user (a map workspace → role), so a check
doesn't query. A call site that checks a workspace permission without a workspace fails type-check.

**Converting the call sites** (about 84, in ~35 files): each resolves the workspace from the
scope of the submission, item or version it acts on. Bulk actions (054, 055, 052) check each
submission on its own and skip, with a reason, those outside the actor's workspaces ("Not a
moderator in acme").

**The four-eyes rule** (014) is unchanged: a moderator never approves their own submission; root's
override stays root only and audited.

**The review queue** (062): the queue's query filters on the scopes of the workspaces where the
actor is moderator (root: all). The tabs' counts follow. A **Workspace** filter appears when there
are several.

**Drafts.** The editor's scope select, `GET /api/v1/scopes` (for `rmk export`) and the draft upload
API list only the scopes of workspaces the user is a member of; a draft or upload for another scope
is refused (`not_a_member`, 403). `GET /api/v1/scopes` keeps its shape and adds `role` per scope's
workspace.

**Losing a role.** If a moderator becomes a user, open review decisions aren't undone. If a member
is removed (092), their drafts and open submissions in that workspace stay: they can still read and
withdraw them, but can't edit, submit or resubmit; moderators may still decide them.

**Sign-in, tokens and roots.** Unchanged. 059's "at least one active root" is unchanged (`user.role`
still holds root).

## Edge cases

- **A user who was a moderator** keeps moderating `global` after the migration, and nothing else.
- **A moderator in two workspaces** sees both in the queue, filterable.
- **A submission's scope is in a workspace where the author is no longer a member:** see "Losing a
  role".
- **A change proposal** to an item in a public workspace by a non-member: refused at draft creation
  ("Ask to join acme to propose changes", linking to 094's request once it exists).
- **The last moderator of a workspace is demoted:** allowed; root can still review there. Admin ›
  Workspaces shows "No moderators" on it.
- **Tokens in flight** keep working; the next request reads the new memberships.

## Documentation

- **Roles** (`roles`): **The three roles** (`roles#roles`) rewritten: root is instance-wide,
  moderator and user are per workspace; **Who can do what** (`roles#permissions`): the matrix, by
  workspace.
- **Workspaces** (090's topic), a new section **Members and roles** (`workspaces#roles`).
- **Submitting and review → What reviewers look at** (`review#reviewing`): the queue shows your
  workspaces.
- **Exporting your own items → Choosing the scope** (`export#scope`): only scopes of your
  workspaces.
- **Helpers:** on the review queue's Workspace filter, "Why only these?" → `workspaces#roles`; on
  the "not a member" refusal, "How do I join?" → `workspaces#roles` (094 changes it to the request).

## Acceptance criteria

- [ ] The migration gives every user a `global` membership (moderator for former moderators) and
  leaves only `root` / `user` in `user.role`, on the four databases.
- [ ] A moderator of workspace A can approve, release, tag, deprecate and yank in A and not in B;
  root can in both; a user can't in either.
- [ ] Drafts, proposals, exports and submits need membership of the scope's workspace; others get
  `not_a_member`.
- [ ] The review queue and its counts show only the actor's moderated workspaces; root sees all.
- [ ] Bulk approve, release and submit skip items outside the actor's workspaces, with the reason.
- [ ] A removed member can read and withdraw their open submissions there, but not edit or submit.
- [ ] Every call site of a workspace permission passes a workspace (type-check), and a test walks
  the permission matrix.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Root is instance-wide; moderator and user are per workspace** (owner, 2026-10-05).
2. **Public workspaces: anyone reads, installs and depends; members submit** (owner, 2026-10-05).
3. **A removed member keeps read and withdraw on their open submissions** (Claude): nothing is
   lost, and the workspace's moderators still decide them.

## Open questions

None.
