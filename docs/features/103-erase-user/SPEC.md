# 103 — Erase a user

> Milestone: M15 · Depends on: 008, 059, 102 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) (Personal data) · Contracts: none changed

## Goal

A person can have their personal data erased, as Law 25, PIPEDA and the GDPR expect, without a
hole in the instance's record (owner, 2026-10-06). Root erases an account: its email, name and
every credential go, and what the person did (the items they published, the reviews they wrote,
the audit events) stays under a pseudonym, `deleted-user-<id>`, so an item's history and the
audit log keep making sense. Disabling (008) keeps everything and stops access; erasing is the
end of the account and can't be undone.

## Scope

**In:**
- **Erase**, for root, from Admin › Users: a row action with a confirmation that spells out what
  goes and what stays, and the Erase link 108 left beside *Deprovisioned by*.
- **The anonymisation** (Behaviour): what is replaced, deleted, kept and renamed, in one
  transaction, audited as `user.erased`.
- **The audit log's rewriting:** the erased person's email in any event's metadata becomes the
  pseudonym.
- **The rules:** root can't erase themself, the last enabled root, or an account already erased;
  an erased account can't be enabled, signed in to, or provisioned again.
- **The Erase section** of the Privacy topic, and the helper `erase-user`.

**Out** (and where it goes instead):
- **A person erasing themself:** they ask root (the Documentation says how); the request is a
  decision someone accountable makes, and a stolen session mustn't be able to erase an account.
- **Erasing by SCIM:** 108 deprovisions, root erases.
- **Deleting published versions, items or reviews:** never; they are the registry's record and
  other people depend on them (MVP §15). Yanking (030) exists for a version that must go.
- **A download of the person's data before erasing:** 104; the confirmation reminds root.
- **A `rmk-server erase-user` command:** not needed; erasing is a root's considered act in the
  web app, and root always has a password (106).

## Behaviour

### What erasing does

In one transaction (`readCommittedTransaction`, the user's row locked, deadlocks retried as 113),
for the account `<id>`:

| Data | What happens |
|---|---|
| `user.email`, `user.name` | `deleted-user-<id>@ronne.invalid` and `deleted-user-<id>`; `image` cleared; `email_verified` false; `two_factor_enabled` false; `disabled_at` set if it wasn't; a new `erased_at` set |
| `account` (passwords, identity-provider links), `two_factor`, `verification` rows | deleted |
| `session` | deleted; `access_tokens` deleted (not only revoked: a revoked token's row names the token, which the person chose); `device_grants` of the person deleted |
| SCIM (108): `scim_users` links, tombstones included, `scim_group_members` | deleted, so no `externalId` or `userName` ever links this account again; the provider's next create makes a new account |
| Workspace memberships, open access requests (094), open scope moves (024) | memberships deleted (a workspace whose only admin they were is left to root, as 092 already handles); requests and moves cancelled, with no reason text |
| The personal workspace (114) | renamed from the pseudonym by 114's rule when it holds a published item or a submitted submission; otherwise deleted with its scopes and drafts |
| Drafts (`submissions` in `draft`) and their files | deleted: only their author could ever see them |
| Submitted, approved and rejected submissions, revisions, review events (comments) | kept; the author or actor is the pseudonym |
| Items owned, versions published, scopes and workspaces created | kept; `owner_id`, `published_by`, `created_by` keep the id, which now resolves to the pseudonym |
| Audit events where the person is actor or target | kept; `ip_address` cleared on all of them now, not at retention's age |
| Audit metadata holding the email | rewritten: every event whose `metadata` holds the erased email as a value (`user.created`, `user.updated`'s `relinked`, `auth.sign_in_failed`, SCIM's) gets the pseudonym in its place; found by the target's id and by a `LIKE` over `metadata` for the address, in batches, inside the transaction on PostgreSQL and SQLite and right after it on MySQL (Edge cases) |
| Usage reports (046) | nothing: they hold no person |

The old email is free for a new account at once. The audit event `user.erased` (target the
user) records `{ sessionsEnded, tokensDeleted, scimLinksDeleted, draftsDeleted, eventsRewritten,
personalWorkspace: "renamed" | "deleted" }`, never the email or the name; its sentence (060) is
*Erased deleted-user-<id>*.

### Where it's shown afterwards

Everywhere a name or email appears, the pseudonym does: Admin › Users (with an *Erased on <date>*
badge in place of the disabled one, the row's only action *Download their data* (104) greyed out
with "erased"), the audit log (actor and target), item pages ("published by deleted-user-…"),
review threads, workspace member lists (they're no longer members), and the API's item and version
bodies (`publishedBy`). Search in Admin › Users finds the pseudonym by id. No page ever says what
the name was.

### The confirmation

A dialog, from the row's menu and from the Erase link beside *Deprovisioned by* (108): the
account's name and email, then what will be deleted and what stays under the pseudonym (the lists
above in plain words), a reminder to download their data first when the request asked for it
(104's link), and a field where root must type the account's email to enable **Erase**. The
helper `erase-user` sits in the dialog. Root's own row has no Erase; the last enabled root's says
why (059's wording).

### Rules

- Root only (`users.manage`); moderators and admins never see it.
- Refused with a message, nothing changed: the actor's own account; the last enabled root (059's
  rule, counted inside the transaction); an account already erased (its row says so).
- A root account can be erased by another root once it's not the last; its role is set to `user`
  in the same transaction so an erased row never counts as a root.
- An erased account refuses sign-in by password (no `account` row), by identity provider (106's
  link is gone, and a sign-in whose email matches no account makes a new one, which is right), by
  token (none), and SCIM (108) can't adopt it (`erased_at` set is one more condition against
  adoption) or re-create it (no tombstone, no email match).
- Every change root's user admin makes refuses an erased account with one message ("That account
  was erased. It can't be changed, signed in to or provisioned again."): enable, disable, the
  role, reset password, reset two-factor, and the disable dialog's impact.
- SCIM (108) never reaches it: a link or tombstone that survived by hand (erasing deletes them)
  answers 404 on `GET`, `PUT`, `PATCH` and `DELETE /Users/{id}`, is left out of `GET /Users`, and a
  create by the tombstone's `externalId` makes a new account.
- `rmk-server reset-root-password` and `reset-two-factor` given the pseudonym's email: refused,
  "that account was erased", before the address is validated (it never is a valid one, below).

### Phones (065)

The dialog is the full-screen sheet 008's are; the typed-email field is the last thing before the
button.

## Edge cases

- **The person is mid-review of a submission** (a changes-requested thread): the thread keeps its
  comments under the pseudonym; the submission stays where it is, for its author or the reviewers.
- **The person is the only admin of a shared workspace:** 092's rule for a removed last admin
  applies (root manages it); the confirmation lists such workspaces.
- **The person owns items in a private workspace** (093): unchanged; the pseudonym is visible to
  the same members as the item.
- **A SCIM provider still lists the person:** its next sync gets 404 for the old id (the link is
  gone) and creates a new account with the same `userName`; the Documentation's SCIM steps say to
  unassign the person at the provider first.
- **Erasing while the person is signed in:** the sessions go in the transaction; their next
  request is signed out.
- **Two roots erase the same account at once:** the second finds `erased_at` set after the lock
  and is refused.
- **The email appears in another person's metadata** (a `user.created` by this root for someone
  else names *that* person's email, not this one): the `LIKE` matches the whole address as a JSON
  string value (`"email":"<address>"`), so only values equal to the erased address are rewritten,
  never a longer address containing it.
- **MySQL and MariaDB:** rewriting many rows' JSON inside the main transaction can hold gap locks
  on `audit_log` for a long time on a big instance; there, the metadata rewrite runs in batches
  right after the main transaction commits, and `user.erased` is written only when the rewrite is
  done; a crash in between leaves the pseudonym in the row and the rewrite to finish on the next
  attempt, which the Privacy tab shows as "an erasure wasn't completed" with a Retry (the
  retention job also finishes it on its next run, since an erased account with unrewritten events
  is a state it checks). On PostgreSQL and SQLite it's one transaction.
- **The pseudonym's email, typed anywhere:** `ronne.invalid` is a reserved domain (RFC 2606), so
  nothing resolves it, and `normalizeEmail` refuses every `.invalid` address (106's rule), so no
  form, SCIM body or provider can create, find or sign in to such an account: the erase service
  writes it straight to the row, and the two commands recognise it before validating (above).
  Nothing re-reads a stored email through `normalizeEmail`.
- **Backups made before the erasure** hold the person's data; the backup runbook (099) says so,
  and that a restore brings it back, which is the operator's to manage within the retention.
- **The threat model** (098): an erased account is one fewer credential; nothing weakens.

## Documentation

- **Privacy → Erase an account** (`privacy#erase`): what erasing does and keeps, in the person's
  words and the root's; that a person asks root; that it can't be undone; the SCIM and backup
  notes above. Both `topics.ts` get the section.
- **Administration → Users** (`admin#users`): the Erase action and the Erased badge.
- **Authentication → Provisioning with SCIM** (`authentication#scim`): unassign at the provider
  before erasing; 108's second-account recovery now says "erase the second" as a link.
- **Backups** (`backups#restore`): a restore brings back what an erasure removed.
- **Incidents** (`incidents`): nothing new; erasing isn't an incident step.
- **Helpers:** `erase-user` in the dialog → `privacy#erase`.

## Acceptance criteria

- [ ] Root erases an account from Admin › Users and from the deprovisioned badge's link; the
      dialog needs the email typed; anyone else never sees it (404 on the action).
- [ ] After erasing, a db test finds the pseudonym in `user`, no `account`, `session`,
      `two_factor`, `access_tokens`, `device_grants`, `scim_users` (live or tombstone),
      `scim_group_members`, `workspace_members` or draft rows for the id; cancelled requests and
      moves; the personal workspace renamed or deleted by the rule; items, versions, submitted
      submissions and review events kept with the id; every audit event of the person with
      `ip_address` null and no event's metadata holding the email, on SQLite and the three servers.
- [ ] The old email can be used for a new account right after.
- [ ] Refused, with nothing changed: self, the last enabled root, an erased account, and every
      later enable, disable, reset or SCIM create, adopt or patch against it.
- [ ] Sign-in by password, identity provider and token all fail for an erased account; a 106
      sign-in with its old email makes a new account.
- [ ] `user.erased` is recorded with the counts and no personal data; the audit page shows the
      pseudonym as actor and target; item and review pages show it.
- [ ] A rewrite interrupted on MySQL is finished by Retry and by the retention job.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Anonymise, never delete the row** (owner, 2026-10-06, MVP §15): audit events and items point
   at the id; a deleted row would break them or force cascading deletes of the record.
2. **The pseudonym's email is `deleted-user-<id>@ronne.invalid`** (Claude): the column is unique
   and every reader expects an address; a reserved domain can't be anyone's.
3. **Drafts are deleted; everything submitted is kept** (Claude, to confirm): a draft is the
   person's private work; a submission entered the record other people acted on.
4. **The personal workspace is kept only when it holds the record** (Claude, to confirm): with
   nothing published or submitted it's an empty private workspace with a name made from the email.
5. **The metadata rewrite is part of erasing, not a later purge** (Claude): the law's "erased"
   should be true when root is told it is; the MySQL exception keeps the transaction short and
   still finishes before the event is written.
6. **No self-service erasure** (Claude, to confirm): a session shouldn't be able to destroy the
   account; the request goes to someone accountable, as it does for the data download's root path.

## Open questions

- Decisions 3, 4 and 6 are for you to confirm.
- Should erasing also delete the person's *rejected* submissions (never published, visible only to
  them and the reviewers)? Kept, in this spec.
