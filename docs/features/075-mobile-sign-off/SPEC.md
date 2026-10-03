# 075 — Mobile sign-off

> Milestone: M10 · Depends on: 065–074 · Design: [MVP §8](../../MVP/MVP.md#8-web-application), [§15](../../MVP/MVP.md#15-decision-log) · Contracts: none new

## Goal

Close M10: check the app as a whole on real phones and tablets, tell people what to expect, and
make the mobile rules stick, so new features don't bring the problems back.

## Scope

**In:**
- **Guards that stay:**
  - The sweep's `expectedFailures` map is empty and removed. From now on any sideways scroll on
    any page, for any role, at 320–1024px fails CI.
  - The tap-target check turns from a report into a failure: no target under 24px anywhere, and
    none under 44px on a coarse pointer, except an allowlist with a reason for each entry (inline
    links in prose, for example).
  - The field scan (067) and the `title=` scan (068) stay.
  - The feature template's Acceptance criteria gets a line: "Works on a phone: the sweep passes
    for the new or changed pages, and any new flow has a `*.mobile.e2e.ts`."
  - `CLAUDE.md` gets one line under UI work pointing to the mobile rules.
- **A pass on real devices**, recorded in the knowledge note:
  - An iPhone (Safari) and an Android phone (Chrome), portrait and landscape.
  - An iPad (Safari) with and without a keyboard.
  - The flows: sign in, browse and read an item, copy an install command (over http on the LAN and
    over https), create and submit a draft, review and approve, bulk release, create a token, and
    the admin pages.
  - Found issues are fixed here when small. Larger ones become new features in the index.
- **Accessibility on phones:** VoiceOver (iOS) and TalkBack (Android) through the menu, a stacked
  table, a full-screen dialog and the bottom bars. 200% text size (iOS Dynamic Type through Safari's
  page zoom) doesn't break layouts.
- **Performance on a mid-range phone:** Lighthouse mobile on home, catalogue, an item page and the
  draft editor against a production build. Note the scores. Investigate anything with Largest
  Contentful Paint over 2.5s or Interaction to Next Paint over 200ms, and lazy-load what's
  desktop-only on phones (the React Flow bundle until "View as graph", for instance).
- **Documentation:** a section **"Using Ronne on a phone"** in Overview (`topics.ts`,
  `content.tsx`). It covers:
  - what works fully: reading, catalogue, install commands, review and decisions, bulk approve and
    release, tokens, admin;
  - what's simpler on a phone: the composer is a list there, and the graph opens read-only;
  - the Menu;
  - tap or hover for UTC times and the reasons behind disabled buttons;
  - unsaved changes kept on the device.
- **Decision log:** update the "Phones and tablets" row in MVP §15 with anything the device pass
  changed.

**Out** (and where it goes instead):
- Installing to the home screen (web app manifest): a later feature if the owner wants it (065's
  decisions).
- Offline use and native apps: not planned.

## Behaviour

Nothing new for people beyond the Documentation section. For contributors, CI fails when a page
stops working on a phone.

## Edge cases

- **A page added after M10 without a `pages.ts` entry:** 065's coverage test fails, which makes
  the author add it, and the sweep then checks it.

## Documentation

- **Overview › "Using Ronne on a phone"** (new section in `topics.ts` and `content.tsx`), as above.
- **Helpers:** none.

## Acceptance criteria

- [ ] `expectedFailures` is gone, and the sweep passes for every role on every project.
- [ ] The tap-target check fails CI on a new small target, and its allowlist gives a reason for
  each entry.
- [ ] The template and `CLAUDE.md` mention the mobile rules.
- [ ] The device pass and the accessibility pass are recorded in `docs/knowledge/mobile-layout.md`,
  with what was found and what was fixed.
- [ ] Lighthouse mobile results for the four pages are recorded, and anything over the thresholds
  is fixed or has a feature in the index.
- [ ] "Using Ronne on a phone" exists. The docs render tests check its links.
- [ ] MVP §15's "Phones and tablets" row matches what was built, and the index marks M10 done.

## Open questions

- None yet. This feature collects what the device pass finds.
