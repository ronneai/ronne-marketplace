# 014 — Review queue

> Milestone: M3 · Depends on: 013, 007 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§8](../../MVP/MVP.md#8-web-application), [§10](../../MVP/MVP.md#10-data-model-mvp), [§12](../../MVP/MVP.md#12-security-considerations)

## Goal

Moderators and root review what authors submit: they see every file, what changed since their last
look, and a summary of what the item can do on a developer's machine, then approve, request changes
or reject. Review is Ronne's security boundary (MVP §12), so the page makes risky content hard to
miss, and every decision is recorded.

## Scope

**In:**
- Migration `0006_reviews`: `review_events`, and the submission snapshots (`submission_revisions`,
  `submission_revision_files`).
- **The queue** (`/reviews`) for moderators and root.
- **The review page**: files, diffs, the risk summary, the conversation, and the decisions.
- **Decisions**: approve, request changes, reject, and root's audited self-approval (override).
- **Resubmit** after changes were requested, with `changes_requested` becoming editable.
- **Risk flags**, computed in `packages/core` from the manifest and files.
- Permissions `submissions.review` (moderator, root) and `submissions.override` (root), and the audit
  events for each decision.

**Out:**
- Releasing an approved submission → 015.
- Diffs against a published base version, `stale` and rebase → 017 (change proposals). In 014 every
  submission is a new item.
- Notifications (email, chat): out of the MVP. The queue and My submissions show what's waiting.
- Comments pinned to a line of a file (see Open questions).

## Behaviour

**Snapshots (revisions).** Every submit and resubmit copies the submission's files into a new
revision: `submission_revisions` (id, submission_id, number, created_at, created_by) and
`submission_revision_files` (revision_id, path, encoding, content, size, executable), the same shape
as `submission_files`. Revision 1 is the first submit. Reviewers always read a revision, never the
live files, so what they approve is exactly what gets released (015 packs the approved revision).
Submissions sent before `0006_reviews` get revision 1 and their `submit` event from the migration
(`backfillRevisions`): their files have been frozen since they were submitted.

**Changes requested is editable** (recommended, see Open questions). After "request changes", the
author edits the submission as they did the draft (012's editor) and presses **Resubmit**, which runs
013's checks again, creates the next revision, and moves it back to `submitted` (`resubmit` in 013's
transition table). `isEditable` becomes `draft` or `changes_requested`.

**The queue** (`/reviews`, `submissions.review`), three tabs:
- **Needs review:** `submitted`, oldest first, so nothing waits forever.
- **Waiting on the author:** `changes_requested`.
- **Decided:** `approved` and `rejected` (and later `published`), newest first, paged.

Each row: item name, type, author, revision number, how long it has waited, and a `⚠ risk` badge when
it has risk flags. A reviewer's own submissions are listed, marked "yours", with no decision buttons.
The main nav gains **Reviews** for moderators and root, with the Needs review count.

**The review page** (`/reviews/[id]`; `/submissions/[id]` keeps the author's view):
- **Header:** item, type, author, status, revision, submitted at.
- **Risk summary** (top, when there are flags): each flag with its kind, what it does in plain words,
  and a link to the file and line. For example "hook `tool.after` runs `npx biome format --write`",
  "mcp-server starts `npx -y @github/mcp`", "permission-policy allows `shell` `git push*`",
  "`bin/run.sh` is executable", "calls `https://api.example.com`".
- **Files**, with a switch: **Changes since revision N** (the default from revision 2 on, as a
  unified line diff per changed file, with added and removed files listed) or **All files** (every
  file of the current revision, read-only, highlighted as in the editor). Revision 1 shows all files.
  Binary files show their size, and whether they changed.
- **Checks:** 011's validation and 013's registry checks on the revision, as the author saw them.
- **Conversation:** one thread per submission, oldest first, with each decision shown in it.

**Decisions** (server actions; each in one transaction with its audit event, through `transition`):
- **Approve** (`submitted` → `approved`): a moderator or root who isn't the author; an optional
  message. Audit `submission.approved`.
- **Request changes** (`submitted` → `changes_requested`): a message is required. Audit
  `submission.changes_requested`.
- **Reject** (`submitted` → `rejected`, final): a message is required, and the page says it can't be
  undone. Audit `submission.rejected`.
- **Override** (root only, on root's own submission): approve with a required reason, recorded as an
  `override` event and audit `submission.override_approved`.
- A moderator can't decide on their own submission, and there's no override for moderators.
- Deciding locks the submission's row, so two reviewers deciding at once can't both succeed: the
  second gets `InvalidStatusTransitionError` ("A submission that's approved can't be rejected.").

**Comments.** A review event of kind `comment`: Markdown text, 1 to 5,000 characters, shown as plain
text with line breaks (no HTML). Moderators and root comment on any submission they can see; the
author comments on their own (recommended, see Open questions). Comments aren't audited: the thread
is their record. Comments can't be edited or deleted, so the thread is a faithful history.

**`review_events`** (MVP §10, extended): id, submission_id (cascade), actor_id (RESTRICT), kind
(`submit`, `resubmit`, `comment`, `request_changes`, `approve`, `reject`, `override`, `withdraw`), body (text,
nullable), revision (the revision it's about), created_at. Submit, resubmit and withdraw also add an
event, so the thread tells the whole story.

**Risk flags** (`riskFlags(manifest, files)` in `packages/core`, pure, also used later by `rmk info`):

| Flag | When |
|---|---|
| `hook` | The item is a hook: its event, matcher and command or script |
| `mcp_server` | An MCP server: the command it starts, or the URL it connects to |
| `permission_policy` | A policy; `allow` rules are listed first as **widening** |
| `status_or_lsp` | A status line or LSP server: the command or script it runs |
| `executable` | Any file marked executable |
| `shell_script` | A `.sh`/`.bash`/`.zsh` file, or one starting with a shell shebang |
| `network` | An `http://` or `https://` URL in any text file, listed by host |

Flags describe; they never block. Authors can't set or hide them. The queue badge, the review page and
the author's own submission page show the same flags.

**Who sees what:** as 013 (`submissions.view_submitted`), plus the review page for
`submissions.review`. The author sees the conversation and the flags on `/submissions/[id]`.

## Edge cases

- **The author is disabled** while under review: reviewers can still decide; the author can't act.
- **A reviewer is demoted** to user: they lose the queue and the buttons at once; past events stay.
- **Withdrawn while a reviewer has it open:** their decision fails with a clear message.
- **Resubmit with no changes:** allowed; the diff says "No changes since revision N".
- **Huge diffs:** a file diff over 2,000 lines shows "Too large to diff here" and the file itself.

## Acceptance criteria

- [x] `0006_reviews` creates the three tables with table-level foreign keys on all four databases.
- [x] Every submit and resubmit creates a revision, and reviewers read the revision, not live files.
- [x] Approve, request changes, reject and override follow the permission matrix and 013's transition table, each in one transaction with its audit event; two concurrent decisions can't both succeed.
- [x] A moderator can't decide on their own submission; root's self-approval requires a reason and is audited as an override.
- [x] The author can edit and resubmit after changes were requested, and the reviewer sees the diff since the previous revision.
- [x] `riskFlags` covers every row of the table above, with a test per flag, and the review page shows them with links to file and line.
- [x] The queue's three tabs list the right submissions, and the nav shows the Needs review count to moderators and root only.
- [x] Playwright: a user submits a hook; a moderator sees its risk flag, requests changes; the user edits and resubmits; the moderator sees the diff and approves.

## Open questions

Recommendations are written into the spec above; confirm or change them. The owner started 014
(2026-09-28) without answering these, so it's built on the recommendations; any of them can still
change.

1. **Changes requested is editable, with a diff since the last revision** (recommended), or the author
   withdraws and starts a new draft, or edits without per-revision snapshots.
2. **One conversation thread per submission** (recommended), or also comments pinned to a line in the
   diff, like a pull request (more work: anchoring comments across revisions).
3. **The author can reply in their own submission's thread** (recommended; MVP §2's matrix gives
   comments to moderators and root only, and would be updated).
4. **Diff library:** `diff` (jsdiff, BSD-3-Clause) for line diffs, through the dependency checklist,
   or a small Myers diff in `packages/core`.
