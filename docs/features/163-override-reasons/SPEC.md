# 163 — Overrides need a reason

> Milestone: M28 · Depends on: 014, 054, 058, 137 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles) (the permission matrix's "Approve own submission (override, with a reason, audited)"), [§15](../../MVP/MVP.md#15-decision-log) ("Approval", "Review decisions") · Contracts: none changed

## Goal

When root approves their own submission, nobody else looks at it. That is the one approval made
without a second person, so it must say why. 014 asked for a reason. 054 made it optional,
together with the ordinary approval message, so that approving many at once stays quick. This
feature makes the override's reason required again, while an ordinary approval's message stays
optional (owner, 2026-11-01).

## Scope

**In:**
- **One override** (the review page's Approve on root's own submission, `decide` with `override`):
  - a reason is required, as for rejecting, requesting changes (058) and overriding the security
    scan (137);
  - the dialog's field reads "Why approve your own submission?";
  - the service refuses an empty reason (`ReviewMessageError`, `required`, as for the others), whatever the screen sent.
- **Approve many** (054): when the selection includes root's own submissions, which are marked as
  overrides, the one message becomes required. It is labelled "Reason (required: 3 of these are
  yours)", and the button stays disabled until it's written. Root can instead untick their own
  submissions and approve the rest with no message.
- **The reason's rules:** every review message's (`messageFrom` in `reviews.ts`): trimmed, at
  most 5,000 characters (`REVIEW_MESSAGE_MAX_LENGTH`), plain text. Empty is refused for an
  override. A message with nothing visible in it counts as empty, for every required review
  message: spaces, control and format characters (a zero-width space, a word joiner), combining
  marks on their own, unassigned code points, the object replacement character (U+FFFC) and blank
  letters (the Hangul fillers, the braille blank); a format character
  that draws a sign (۝, the Arabic number signs) is visible. Anything that isn't text counts as
  empty too, and NUL characters are removed (PostgreSQL can't store them).
- **Room in the audit:** the audit metadata limit rises from 4 KB to 32 KB (007), so a reason of
  5,000 characters is stored whole however its characters are escaped. Before, a message over
  about 4,000 characters (about 1,000 emoji) failed with a server error, for every decision.
- **On the record:**
  - `submission.override_approved` keeps the reason in its metadata, as today;
  - the review page and the item's Overview (045) show it next to "approved by root (override)".
- **Before this feature:** overrides without a reason show "No reason given" and stay as they are.
- **The permission matrix's comment** (`identity/models/permissions.ts`, "with a reason") becomes
  true again.

**Out** (and where it goes instead):
- **A second root for root's own submissions:** a stronger rule, left for the configurable
  approvals planned in M31 (178, 179).
- **Self-approval in a personal workspace** (114): not an override (nobody else can see or install
  it), and it stays automatic.
- **A required message on ordinary approvals:** stays optional (054).

## Behaviour

**Root approves their own skill.** The Approve dialog shows the override notice and a required
reason field. "Hotfix for the outage; reviewed by A. in a call" is saved with the approval. The
audit log line and the review page show it.

**Root approves twelve submissions, two of them their own.** The bulk dialog lists the two first,
marked override, and the message field is required. Root writes one reason, and it is recorded on
all twelve approvals. Alternatively root unticks the two, and the other ten go with no message.

## Edge cases

- **An old screen sends an override without a reason** (an open tab during the upgrade): refused
  (`ReviewMessageError`, `required`), and the dialog shows the field.
- **An override that is also past the scan's gate:** `scan_override` already requires a reason,
  and one reason covers it.
- **Root's override inside root's own personal workspace** (rare: re-approving after changes):
  needs a reason too. It is still marked not reviewed (114).
- **The data download** (104): the reason is in the person's own audit events, as before.
- **A reason made only of characters newer than the server's Unicode data** (an emoji added after
  its Node.js was released): they count as unassigned, so as empty. Adding a word is enough;
  accepted as the cost of refusing invisible unassigned code points (owner, 2026-11-01).
- **Approve many with root's own archived meanwhile:** it isn't an override any more, so no reason
  is asked for it; it's reported as not approvable for its status, and the rest go.

## Documentation

- **Review** (`review#decisions`): overriding your own submission needs a reason.
- **Review** (`review#approve-many`): the message becomes required when your own submissions are in
  the selection.
- **Roles** (`roles#permissions`): "Approve own submission (override, with a reason, audited)".
- **Helpers:** none new; the dialog's own text says it.

## Acceptance criteria

- [x] `decide` refuses an override with an empty reason (`ReviewMessageError`, `required`) and records the reason
  when given; db tests.
- [x] Approve many requires the message when the selection has an override, and not otherwise;
  db tests and a component test.
- [x] The review page and the Overview show an override's reason, and "No reason given" for older
  ones.
- [x] Every new text is a message in English, Portuguese and French; both dialogs pass the phone
  sweep.
- [x] The Documentation and the permission matrix (MVP §2, `permissions.ts`) say what the feature
  does.

## Decisions

1. **Required again for overrides, optional for ordinary approvals** (owner, 2026-11-01). An
   override is the one approval nobody else checks. 054's reason for optional messages was speed
   for reviewers approving others' work, which this doesn't touch.
2. **One reason for a bulk selection with overrides** (Claude). It's what 054's dialog already has.
   Asking for one per submission would make root untick them instead.
3. **The audit metadata limit rises to 32 KB** (owner, 2026-11-01, from task 2's witnesses). The
   audit keeps the whole reason, which is what an auditor needs, rather than a shortened copy or
   shorter review messages for everyone.

## Open questions

- None.
