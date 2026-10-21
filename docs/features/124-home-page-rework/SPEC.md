# 124 — Home page rework and the instance notice

> Milestone: M18 · Depends on: 018, 119, 120, 122, 129 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (the web app only)

## Goal

Home is where everyone lands, and today it is a search box, "waiting for you" and two lists. It
becomes a page with a clear order and places for what the next features add (a getting-started
checklist, favorites, pinned items), and root gets a way to tell everyone something: an
**instance notice** (a maintenance window, "this is a demo", a policy change).

## Scope

**In:**
- **The page's order**, top to bottom, each section appearing only when it has something to show:

  | # | Section | From |
  |---|---|---|
  | 1 | Instance notice (above the page heading, on every page, see below) | this feature |
  | 2 | Heading, one line of description, and the search box | 018, reworded |
  | 3 | Getting started | 126 |
  | 4 | Waiting for you (drafts, changes requested, reviews) | 018 |
  | 5 | Your favorites | 125 |
  | 6 | Pinned: **Start here** (global) and, with a current workspace (120), **Pinned in <workspace>** | 125 |
  | 7 | Recently published | 018 |
  | 8 | Most used (once something was downloaded) | 018 |

  This feature builds the layout, the empty-section rule and sections 1, 2, 4, 7 and 8 on it;
  3, 5 and 6 are empty slots that render nothing until their features land.
- **A real first screen for a new instance.** When the catalogue has no released item yet, Home says
  so and points to what to do next, by role: root → "Create a scope and submit the first item"
  (links to the global workspace's page, where scopes are created since 115, and to New item); others → "Nothing is published yet. Submit an item or ask
  a moderator." This replaces two empty lists.
- **Search first.** The search box stays prominent; it also offers the catalogue's type filter as
  links ("Skills · Agents · Rules …", from the types that have released items) so a visitor can
  browse without typing.
- **The instance notice.** Root sets it in Admin › Settings, a new **Notice** tab (122's tabs):
  - **Message:** plain text, up to 500 characters, no HTML or Markdown.
  - **Link** (optional): a label (up to 60 characters) and an `https://` or relative address.
  - **Tone:** Information (teal, the single accent) or Warning (amber, for something that needs
    care, such as "the demo's data is reset on Friday").
  - **Shown:** on or off.
  - **Shown on every signed-in page,** under the header (and on the Menu sheet's phone layout),
    above the page, not floating. Each person can **dismiss** it; it comes back when root changes
    the message, link or tone (a revision number, kept in the dismiss cookie `ronne-notice`), so a
    new notice isn't missed by someone who closed the old one.
  - Root sees a **preview** while editing, and a line saying who changed it last.
  - The text is root's own words: it is **not translated** (129). Root can write it in any
    language.

**Out** (and where it goes instead):
- Pinned items, favorites and the checklist themselves (125, 126).
- Notices per workspace, scheduled start and end times, several notices at once: later, if asked.
- Showing the notice on the sign-in page (owner, 2026-10-20: no).
- Email or push notifications: out of scope for the MVP.

## Behaviour

- **Empty sections vanish.** A section without content renders nothing, not a heading with "None".
  "Waiting for you" appears only when a count is above zero; the lists keep their present limits.
- **The current workspace** (120) doesn't filter Home, as before, except that section 6 shows that
  workspace's pins when one is set.
- **Saving the notice** is an audited settings change (`settings.notice`, with the old and new tone
  and "shown", not the text) and raises the revision. Turning it off keeps the text, so it can be
  turned on again.
- **Validation:** an empty message can't be shown; a link needs its label and a valid address
  (`https:` or a path starting with `/`); anything else is refused with a message beside the field.
- **Without JavaScript** the notice shows, and the dismiss button is a form that sets the cookie
  and returns to the same page.
- **Phone:** the notice wraps, its dismiss button is a 44px target, and Home's sections stack
  (065, 071).

## Edge cases

- The notice text is output as text, never as HTML: `<b>` shows as typed.
- A long unbroken string wraps rather than stretching the page.
- Dismissed in one browser doesn't dismiss in another (the cookie is the memory); that is stated in
  the Documentation.
- Two roots saving at once: the last save wins, and each save raises the revision.
- An erased or disabled root as "last changed by" shows their pseudonym (103) or name as the audit
  log does.
- A notice with a link to an unknown relative path is allowed (the link is root's responsibility);
  `javascript:` and `data:` addresses are refused.

## Documentation

- **Overview → Finding your way:** Home's order, in a sentence each.
- **Admin** (`admin.tsx`): a new section **Notice** (`admin#notice`): what it is, the fields, that
  people can dismiss it and it returns when changed, that it isn't translated, and that it is
  shown to signed-in people only.
- **Helpers:** on the Notice tab, "Who sees this?" → `admin#notice`; on the Tone select, one line
  on when to use Warning.
- Both `topics.ts` get the new section.

## Acceptance criteria

- [ ] Home shows the sections in the table's order, hides the empty ones, and the empty-instance
      message differs for root and everyone else.
- [ ] Root can save, preview, hide and show the notice; invalid input is refused with messages.
- [ ] The notice shows on every signed-in page, can be dismissed with and without JavaScript, and
      returns after a change.
- [ ] The notice never renders HTML; `javascript:` links are refused.
- [ ] Saving is audited as `settings.notice` with no message text in the log, and the audit log's
      filter lists the action.
- [ ] Everything on Home and the Notice tab is in messages (129) in the three languages.
- [ ] Unit, database and end-to-end tests cover the above on desktop and phone; the sweep (075)
      still passes.
- [ ] The Documentation and helpers above say what the feature does now.

## Decisions

- **500 characters and one notice at a time** (owner, 2026-10-20).
