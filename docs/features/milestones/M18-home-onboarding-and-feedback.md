# M18 — Home, onboarding and feedback

> [All milestones](README.md) · [Features index](../README.md)

Everyone lands on Home, so it gets an order, an instance notice root can set, shelves of pinned items
(root's for the instance, a workspace admin's for the workspace) and each person's favorites, and a
getting-started checklist; people can send feedback to the instance's administrators, and accounts
root creates ask for a new password at first sign-in (owner, 2026-10-20). Written for any instance,
a demo being one use. Build order: 129 first (M19), so these are written with messages from the
start; then 124 → 125 → 126; 127 and 128 are independent of those.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [124](../catalogue/124-home-page-rework/SPEC.md) | Home page rework and the instance notice: the page's order with empty sections hidden, a first screen for an empty instance, type links beside the search, and a notice root sets in Admin › Settings (one message with links written inline, tone, dismissible with an icon, returns when changed) | 018, 119, 120, 122, 129 | done |
| [125](../catalogue/125-pins-and-favorites/SPEC.md) | Pinned items and favorites: root pins for the instance (Start here), a workspace's admins pin for the workspace, anyone keeps private favorites (a star, Home shelf, catalogue filter); visibility checked at read, audited pins, in the data download and erased with the account | 018, 090, 091, 093, 120, 124, 129 | done (the Documentation in ronne-web `docs/marketplace-pins-favorites`) |
| [126](../web-ui/126-getting-started/SPEC.md) | Getting started checklist on Home: create a token, connect `rmk`, install a first item, start a draft; ticks itself from existing data, can be hidden and brought back | 009, 107, 124, 129 | done |
| [127](../feedback/127-send-feedback/SPEC.md) | Send feedback to this instance's administrators from the sidebar, and Admin › Feedback for root (server data table, handled, bulk, count, retention, erased with the account) | 060, 007, 103, 104, 119, 129 | done (the Documentation in ronne-web `docs/marketplace-feedback`) |
| [128](../identity/128-change-password-first-sign-in/SPEC.md) | Change the password at first sign-in: root can require it when creating a user or resetting a password; a hold on every page and the API until it's changed | 006, 008, 105, 129 | done |
