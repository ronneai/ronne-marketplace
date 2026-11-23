# M10 — Mobile friendly

> [All milestones](README.md) · [Features index](../README.md)

Every page works on a phone and a tablet (owner, 2026-10-02): reading and finding items, writing
and submitting drafts, reviewing and releasing, tokens and admin. The rules (widths from 360px, no
sideways page scroll, 44px touch targets and 16px fields on a coarse pointer, nothing only on
hover) are set by 065 and kept in [032's spec](../web-ui/032-design-system/SPEC.md). A phone sweep in the
end-to-end tests checks every page for every role. Build order follows the dependencies: 065,
then 067, then the rest.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [065](../web-ui/065-mobile-foundations/SPEC.md) | Mobile foundations and phone tests: the mobile rules, viewport and theme colour, safe areas, `dvh`; Playwright `phone` (Pixel 7), `phone-webkit` (iPhone 15) and `tablet` projects; a sweep of every page per role that fails on sideways scroll; a tap-target report | 032, 006 | done |
| [066](../web-ui/066-mobile-navigation/SPEC.md) | Navigation on phones: a Menu side sheet below `lg` (links with counts, account, appearance, sign out; `/menu` without JavaScript); the account menu closes on an outside click; a shared `ScrollStrip` for tab strips (active tab in view, edge fades) | 065, 067, 032, 033 | done |
| [067](../web-ui/067-touch-primitives/SPEC.md) | Touch-ready primitives: 16px fields on a coarse pointer (no iOS zoom), 44px tap areas, full-screen dialogs below `sm` with fixed title and footer, a side sheet, `BottomBar`, wrapping copy commands, copy that works over plain http | 065, 032 | done |
| [068](../web-ui/068-no-hover-only/SPEC.md) | Nothing behind hover: disabled buttons' reasons, UTC times, full hashes, truncated text and badge explanations reachable by tap and keyboard; a scan that fails on new `title=` | 065, 067, 049, 050 | specified |
| [069](../web-ui/069-mobile-data-tables/SPEC.md) | Tables on phones: `DataTable` rows stack into cards below `sm` (primary heading, meta line, labelled lines, actions), the main column never starves from `sm` up, a Sort select; versions, tokens and bulk lists too | 065, 067, 068, 060, 061, 062, 063 | specified |
| [070](../web-ui/070-mobile-files-diffs/SPEC.md) | Files, code and diffs on phones: the file tree behind a Files bar, no nested scroll, the tree sticky below the header from `md`, compact diffs, wrapping paths | 065, 067, 068, 044, 014 | specified |
| [071](../web-ui/071-mobile-catalogue-item/SPEC.md) | Catalogue, item page and Documentation on phones: the Filters panel and Sort menu checked on a phone, wrapping install commands and risk flags, the dependency canvas as a list plus "View as graph" on phones and without a scroll trap on touch and trackpads, "On this page" in long topics | 066, 067, 068, 069, 070, 018, 044, 045, 047 | specified |
| [072](../web-ui/072-mobile-authoring/SPEC.md) | Writing items on a phone: Create draft and Save/Submit in a bottom bar, Form view first, stacking form and dependency rows, the composer as a list with Add (graph read-only), a local recovery copy of unsaved changes | 067, 068, 070, 071, 012, 031, 052, 057 | specified |
| [073](../web-ui/073-mobile-review-release/SPEC.md) | Reviewing and releasing on a phone: a bottom decision bar, comments and decision dialogs with the keyboard open, bulk approve and bulk release with their settings collapsed so the list has room | 067, 068, 069, 070, 014, 015, 054, 055, 058 | specified |
| [074](../web-ui/074-mobile-account-admin/SPEC.md) | Account, Admin, sign-in and setup on phones: autocomplete and input modes, the setup wizard on a phone, whole tokens, Users and Scopes as cards, the audit log's Filters disclosure | 066, 067, 068, 069, 006, 008, 009, 036, 046, 060 | specified |
| [075](../web-ui/075-mobile-sign-off/SPEC.md) | Mobile sign-off: the sweep and tap-target checks become permanent CI failures, a pass on real iPhone, Android and iPad, screen readers and text size, Lighthouse mobile, "Using Ronne on a phone" in the Documentation, the decision log | 065–074 | specified |
