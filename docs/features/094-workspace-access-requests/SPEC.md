# 094 — Asking to join a workspace

> Milestone: M13 · Depends on: 090, 091, 092, 093, 007 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles) · Contracts: none new

## Goal

A user can ask for access to a workspace (owner, 2026-10-05), and root or that workspace's
moderators answer. It replaces "ask root" with a request that's tracked and audited.

## Scope

**In:**
- **Workspaces page** (`/workspaces`, every signed-in user): the workspaces the user can see (public
  ones, and private ones they're in), their role in each, and **Ask to join** on the public ones
  they aren't in.
- **A request link** for a private workspace, `/workspaces/<name>/join`, which root or its
  moderators copy and send; it works for any signed-in user and shows only the name and description.
- **The request:** an optional message (500 characters); one open request per user and workspace;
  the requester can cancel it.
- **Answering:** root, or a moderator of that workspace, approves (as `user`; root may pick
  `moderator`) or declines, with an optional reason. A **Requests** tab on the workspace's page
  (090) and a count in the nav for those who can answer.
- Audit events `workspace.access_requested`, `workspace.access_approved`
  (`workspace.member_added` too), `workspace.access_declined`, `workspace.access_cancelled`.
- The "not a member" refusals (091) link to Ask to join.

**Out** (and where it goes instead):
- **Email or other notifications:** out of scope for the MVP (MVP §15). The requester sees the
  answer on the Workspaces page; answerers see the nav count.
- **Asking for moderator.** A request is to join; root changes roles (092).
- **Requests from `rmk` or the MCP server.** `rmk` prints the web address to ask from (095).

## Behaviour

**Workspaces page.** A list: name, visibility, description, your role or **Ask to join** /
**Requested (cancel)** / **Declined on <date>**. `global` shows "Everyone". Private workspaces
appear only to their members (093).

**The join link.** `/workspaces/<name>/join`: for a public workspace, the same as Ask to join. For
a private one, the page shows its name and description and the request form. The link needs no
secret: knowing a private name only lets you ask, and the answer is a person's decision (decision 2). An unknown name and a private name show the same page until the request is sent; the
answer after sending is "Request sent", so the page doesn't confirm that a name exists.

**Answering.** The workspace page's **Requests** tab (root and that workspace's moderators): who,
when, message; **Approve** (role select only for root, default `user`) and **Decline** (optional
reason, shown to the requester). Approving writes the membership as 092 does. The nav shows a
count, "Requests 2", next to Reviews, for anyone who can answer at least one.

**Limits.** At most 10 open requests per user; a declined request can be sent again after 7 days.
Requests by a disabled user are cancelled with them.

## Edge cases

- **Root adds the requester directly** (092) while the request is open: the request is closed as
  approved by that root.
- **The requester is removed from the workspace later:** they can ask again at once.
- **The workspace is deleted or turns private** with open requests: deleting removes them; turning
  private keeps them (the people asked while it was public).
- **Two moderators answer at once:** the first decision wins, under a row lock; the second gets
  "Already answered".
- **A moderator answers a request from themself:** impossible, since moderators are members.

## Documentation

- **Workspaces**, a new section **Joining a workspace** (`workspaces#joining`): the Workspaces
  page, the join link for private ones, who answers.
- **Workspaces → Members and roles** (`workspaces#roles`): answering requests.
- **Helpers:** the 091 "How do I join?" helper now opens Ask to join; on the Requests tab, "Who can
  answer?" → `workspaces#joining`.

## Acceptance criteria

- [ ] A user asks to join a public workspace from the Workspaces page and a private one from its
  link; one open request each; they can cancel it.
- [ ] Root and the workspace's moderators approve or decline; others can't; approving adds the
  membership; every step is audited.
- [ ] The join page doesn't tell an unknown name from a private one.
- [ ] The limits hold (10 open, 7 days after a decline).
- [ ] The nav count shows only to people who can answer.
- [ ] The pages pass the phone sweep (065).
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Requests are answered by root or the workspace's moderators** (Claude, taken while the owner's
   answer was pending): those who know the workspace best.
2. **A plain join link for private workspaces** (owner, 2026-10-05): no secret to revoke; it only
   lets people ask, and a person decides.

## Open questions

None.
