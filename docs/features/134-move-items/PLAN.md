# 134 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Migration.** [risky] `item_moves` and `item_name_history` as the spec's Data section
  says (cascades with the item and the target scope; `requested_by` and `decided_by` set null when
  a user is deleted); the backfill from `item_aliases`, with 115's `scope_moves` matched by scope
  and timestamp where it can be. Kysely types in `db/schema.ts`.
  *Done when:* the migration's db test (a backfill with migration, move and rename aliases, a
  scope moved and moved back) passes on the four databases; the guard test passes.

- [ ] **2. History written by 113 and 115.** Renaming a workspace and moving a scope write an
  `item_name_history` row per item, in their transactions, with who asked and approved.
  *Done when:* their db tests assert the rows; nothing else in them changes.

- [ ] **3. The checks.** `itemMoveImpact(item, targetScope, viewer)`: the target is another scope
  of the same workspace, the new name, the clashes (an item, an open new-item submission, another
  item's alias; this item's own alias is fine), the open work that will be renamed (others'
  drafts counted, not named).
  *Done when:* db tests cover each case, `global` and a shared and a personal workspace, and
  moving back.

- [ ] **4. Asking, answering, moving.** [risky] `requestItemMove`, `cancelItemMove`,
  `approveItemMove`, `declineItemMove`, and the direct move for root and the workspace's
  moderators and admins; the asker never answers their own; the asker's membership re-checked at
  approval; a target that left the workspace cancels (`target_moved`); the move transaction (the
  item's scope, the alias, 113's rewrite of open work, the history row, the request, the
  catalogue revision, the audit event) under the item's release lock; the four audit events.
  *Done when:* db tests cover both rows of the "who decides" table, a non-member and a removed
  member, refusals at ask and at approve, a release racing a move, two answers at once and a lost
  role, on the four databases.

- [ ] **5. After the move.** Tests that the item follows its new name from the next request:
  catalogue, item page (the old name redirects), search, the registry API, resolve, MCP, feeds
  and the review queue; old names install and `rmk` rewrites the lockfile; versions, tarball
  checksums, tags, downloads, pins and favorites unchanged.
  *Done when:* those tests pass, with a move in `global`, in a shared workspace and moved back.

- [ ] **6. The Move dialog.** On the item page: Move to another scope… (members and root, when
  there is another scope), the scope select, what it changes, the clash, the message, Move item or
  Ask to move, the confirmation; the open and declined notices with Cancel. Messages in en, pt
  and fr (129, `docs/knowledge/i18n.md`); the "Who has to agree?" helper.
  *Done when:* component tests cover a direct move, a request, a clash and the notices; the
  phone sweep passes for the dialog.

- [ ] **7. Item moves on the Requests page.** The third table on `/workspaces/requests` and on a
  workspace's Requests tab, for root and the workspace's moderators and admins; Approve, Decline
  with a reason, Already answered; the nav count. Messages in en, pt and fr.
  *Done when:* db and component tests cover who sees which rows and each answer; the phone sweep
  passes.

- [ ] **8. History tab.** `?tab=history` on the item page: the current name, each change newest
  first with its reason, date and people; earlier names in a workspace the viewer can't see shown
  as "a workspace you can't see". Messages in en, pt and fr; the "Why did the name change?"
  helper.
  *Done when:* tests cover each reason, a backfilled entry without people, an erased user, and a
  private earlier workspace seen by an outsider; the phone sweep passes.

- [ ] **9. End to end.** A Playwright test: a member asks, a moderator approves, the item installs
  by its new name and its old one, History shows the move; a moderator's direct move.
  *Done when:* it passes on the desktop and phone projects.

- [ ] **10. Documentation.** The sections in the spec's Documentation list in ronne-web (a
  `feat/134-move-items` branch), in en, pt and fr; both `topics.ts` files; `pnpm docs:links`
  finds no difference; MVP.md's permissions table and decision log say what was built.
  *Done when:* `pnpm docs:links` passes against that branch and every helper links to a section
  that exists; the feature's status is `done` in the index.
