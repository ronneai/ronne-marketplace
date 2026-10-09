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
  moderators copy and send; it works for any signed-in user and shows only the name (a public
  workspace's shows its description too).
- **The request:** an optional message (500 characters); one open request per user and workspace;
  the requester can cancel it.
- **Answering:** root, or a moderator or admin (092) of that workspace, approves (as `user`; root
  and the workspace's admins may pick `moderator`) or declines, with an optional reason. A
  **Requests to join** page for everyone who answers, the same table as a **Requests** tab on the
  workspace's page in Admin (090), and a count in the nav for those who can answer.
- Audit events `workspace.access_requested`, `workspace.access_approved`
  (`workspace.member_added` too), `workspace.access_declined`, `workspace.access_cancelled`, on the
  requester, naming the workspace. The message and the reason stay out of the audit log.
- The "not a member" refusals (091) link to Ask to join (the workspace's join page): under Propose a
  change on an item page, in a draft's read-only notice once its author left the workspace, and in
  Submit selected's results. The API's message (for `rmk` and MCP) keeps saying "Ask to join <name>"
  in words; 095 adds the address.

**Out** (and where it goes instead):
- **Email or other notifications:** out of scope for the MVP (MVP §15). The requester sees the
  answer on the Workspaces page; answerers see the nav count.
- **Asking for moderator.** A request is to join; root changes roles (092).
- **Requests from `rmk` or the MCP server.** `rmk` prints the web address to ask from (095).

## Behaviour

**Workspaces page.** A list: name, visibility, description, your role or **Ask to join** /
**Requested (cancel)** / **Declined on <date>** (with the reason, and the date to ask again from).
`global` shows "Everyone"; root shows "Root" everywhere. Private workspaces appear only to their
members and root (093). Below, **Your other requests**: open and declined requests to names not in
the list (a private workspace asked from its link, or a name no workspace has), by name only, with
Cancel. The page is in the account menu, under Access tokens.

**The join link.** `/workspaces/<name>/join`: for a public workspace, its description and the Ask
to join form. For a private one the reader isn't in, the name and the form only, exactly as for a
name no workspace has. Members and root are told they're in already. Once asked, the page shows
the request (Requested, or Declined with the reason) instead of the form until it can be sent
again. The link needs no secret: knowing a private name only lets you ask, and the answer is a
person's decision (decision 2). An unknown name and a private name show the same page, before and
after the request is sent, so the page doesn't confirm that a name exists. Sending refreshes the
page, which then shows the request as Requested with Cancel: that's the confirmation, on the
Workspaces page as on the join page.

**Answering.** **Requests to join** (`/workspaces/requests`, root and every moderator and admin):
every open request they can answer, oldest first (the 100 oldest, with the total), with its
workspace; anyone who answers nowhere gets a 404. The same table is the **Requests** tab of a
workspace's page in Admin, for root and its admins (moderators don't open Admin, so the Requests
page is theirs). Each row: who, when, message; **Approve** (role select, `user` or `moderator`, only
for root and the workspace's admins, who manage its members; default `user`) and **Decline**
(optional reason, shown to the requester). Approving writes the membership as 092 does. Once
answered, the row is gone: the refreshed table is the confirmation, and a second answer is told
"Already answered". The nav shows **Requests** with its count, "Requests 2", next to Reviews, only
while at least one request waits for the reader, so a moderator of a quiet workspace doesn't carry
an empty item; it opens the Requests page.

**A name no workspace has.** Asking for it is kept as a request too, by name, so it answers, counts
against the limit, answers "Requested" when asked again and shows to its requester exactly as a
request to a private workspace does: asking can't tell whether a name exists. Nobody answers it; if a
workspace is created with that name, its open requests become that workspace's. The requester sees a
workspace's description and visibility only when they see the workspace (public, or theirs). A name
that can't be a workspace's (it breaks the name rule) answers "Request sent" and isn't kept.

**Limits.** At most 10 open requests per user; a declined request can be sent again 7 days after the
decline, or at once if they've been added to or removed from the workspace since. Asking again while
a request is open changes nothing. Members and root are told they're in already. A message or a
reason has at most 500 characters and no NUL character.
Requests by a disabled user are cancelled with them (`user.disabled` counts them as
`requestsCancelled`).

## Edge cases

- **Root or an admin adds the requester directly** (092) while the request is open: the request is
  closed as approved by whoever added them, audited as `workspace.access_approved` with
  `direct: true`.
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
- **Helpers:** the 091 "How do I join?" helper now opens Ask to join; on the Requests page and
  tab, "Who can answer?" → `workspaces#joining`.

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
   answer was pending): those who know the workspace best. Its admins too, since 092 gave admins a
   moderator's permissions (permission `access_requests.answer`, 2026-10-09).
2. **A plain join link for private workspaces** (owner, 2026-10-05): no secret to revoke; it only
   lets people ask, and a person decides.

## Open questions

None.
