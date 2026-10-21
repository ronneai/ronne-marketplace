# 127 — Send feedback

> Milestone: M18 · Depends on: 060, 007, 103, 104, 119, 129 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (the web app only)

## Goal

Anyone signed in can tell the people who run this instance what's wrong, missing or good, from
the page they are on, and root reads it in Admin. It is feedback to **this instance's**
administrators, which suits a team, a company or a demo; it is not sent anywhere else.

## Scope

**In:**
- **Send feedback** in the sidebar's Tools group (and the Menu sheet): a dialog (full-screen below
  `sm`, 067) with:
  - **Kind:** Problem, Idea, Question, Praise (required).
  - **Message:** up to 4,000 characters (required).
  - **Include the page I'm on** (checked by default): the path only, never the query string, which
    could hold a link's secrets.
  - The app version is added automatically; nothing else (no screenshots, no browser data beyond
    the version, no files).
  - After sending: "Thanks, your feedback was sent to this instance's administrators", and the
    dialog closes.
- **Admin › Feedback** (root only): a server data table (060) with the sender, kind, message,
  page, version and time; sorted by time, filtered by kind and status, searched by text; paged.
  Each row opens a detail dialog. Status: **New**, **Handled**; root marks one or several (bulk)
  and can delete.
- **A count** of new feedback beside Admin › Feedback in the sidebar for root, like the reviews
  count (it is part of "waiting for you", 120's rule that counts aren't filtered).
- **Limits:** 10 messages per person per hour (the same limiter as other writes, 037) so a stuck
  button can't flood the inbox.

**Out** (and where it goes instead):
- Replying from the app, threads, email notifications: out of scope for the MVP; root reads the
  sender's email in the row and can write to them.
- Sending feedback to the Ronne project's maintainers: use GitHub issues (the Documentation links
  there).
- Anonymous feedback: the person is always known, since they are signed in.
- Attachments and screenshots.

## Behaviour

- **Who sees what.** Only root sees the inbox; a sender doesn't see a history of their sends (it
  isn't a ticket system). The sender's name and email are shown to root with each message.
- **Stored in** `feedback` (`id`, `user_id`, `kind`, `message`, `page`, `version`, `status`,
  `handled_by`, `handled_at`, `created_at`). The message is plain text, shown as text, never
  HTML.
- **Language.** The form is translated (129); the message is the sender's own words, shown as
  written.
- **Audit.** Marking handled and deleting are audited (`feedback.handled`, `feedback.deleted`,
  with ids, not text); sending isn't (it's the person's own content and could be frequent).
- **Privacy.** A message can contain personal data, so: "Your data" (104) includes the person's
  feedback; erasing a user (103) **deletes** their feedback rows (the message is not kept under a
  pseudonym); root can delete any row; and the Privacy tab's retention (102) gets a new setting,
  **Handled feedback kept for** (days, default 365), purged by the existing scheduled job.
- **No JavaScript:** the dialog opens at `/feedback` as a normal page with the same form.
- **Phone:** the Send feedback entry is in the Menu sheet; the form is full-screen with the
  keyboard-safe bottom bar (072).

## Edge cases

- A message of only spaces is refused with a message beside the field.
- Over 4,000 characters is refused, not cut.
- The page path is stored as sent by the browser's current route; the server keeps only the path,
  at most 200 characters, and ignores anything that isn't one of the app's routes.
- A disabled user can't send (no session). A user held by two-factor or a password change (105,
  128) can't open the page until they complete the hold.
- Bulk handled/delete applies to the selected rows only, as the bulk review actions do (054).

## Documentation

- **Overview → Finding your way:** Send feedback, who receives it.
- **Admin** (`admin.tsx`): a new section **Feedback** (`admin#feedback`): the inbox, statuses,
  retention.
- **Privacy** (`privacy.tsx`): feedback is in the data download, is erased with the account, and
  the new retention setting.
- **Helpers:** in the dialog, "Who reads this?" → `admin#feedback`; on the retention field, one
  line.
- Both `topics.ts` get the new section.

## Acceptance criteria

- [ ] Any signed-in person sends feedback from the dialog (and the no-JavaScript page); input is
      validated, limits are enforced and the query string is never stored.
- [ ] Root's Admin › Feedback lists, searches, filters, pages, marks handled (bulk) and deletes;
      non-root gets not-found.
- [ ] The sidebar count of new feedback shows for root only.
- [ ] Marking handled and deleting are audited without message text.
- [ ] "Your data" includes the person's feedback; erase deletes it; handled feedback older than
      the retention is purged by the job.
- [ ] Everything is in messages (129) in three languages; phone sweep passes.
- [ ] Migration runs on all three database kinds.
- [ ] The Documentation and helpers above say what the feature does now.

## Open questions

- **Retention default** of 365 days for handled feedback: right, or shorter?
- **Should new feedback also appear as a count in the user's Home** for root ("3 new feedback")?
  It would belong in "Waiting for you" (124).
