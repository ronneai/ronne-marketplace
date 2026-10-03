# 064 — Remove the Scopes page

> Milestone: Across the app · Depends on: 010, 061 · Contracts: none new

## Goal

The read-only Scopes page (`/scopes`, every signed-in user, from 010) lists the scopes with their
descriptions. Today it adds nothing a person needs: the new-item form already lists every scope in
its picker, the catalogue shows each item's scope, and the Documentation explains what a scope is.
It takes a place in the main navigation for no value (owner's decision, 2026-10-02). This feature
removes the page and its nav entry. Root keeps managing scopes under Admin › Scopes.

## Scope

**In:**
- **`/scopes` goes:** the route (`app/(app)/scopes/page.tsx`) is deleted, so the URL answers 404
  like any unknown page.
- **The main navigation** loses Scopes. Everyone sees Home, Catalogue, Submissions, Reviews (to
  reviewers), Admin (to root) and Docs.
- **Links to `/scopes`** point somewhere useful instead:
  - The new-item form's "About scopes" link (step 1, "Where it lives") goes to the Documentation
    topic, `docsHref("scopes")`.
  - The Documentation's Scopes › "Who manages scopes" no longer links the page. It says root
    creates scopes under Admin, and the new-item form's scope picker lists them and shows the
    chosen one's description.
- **Revalidation:** creating or editing a scope revalidates `/admin/scopes` only.
- **The shared list code** (`features/scopes/list.ts`, `ScopesTable.tsx`) now serves only the admin
  page, so it moves into `features/admin-scopes` (the frontend is feature-first; shared code is
  for more than one feature). `SCOPES_LIST` goes; `ADMIN_SCOPES_LIST` and `scopesQueryOf` stay.

**Out** (and why):
- **Admin › Scopes** (`/admin/scopes`): unchanged. Root still creates scopes and edits their
  descriptions there, with the same table, sorts and search (061).
- **`GET /api/v1/scopes`**: unchanged. `rmk export` and the MCP server use it to pick a scope.
- **The server side** (`pageScopes`, `listScopes`, the repository): unchanged, since the admin
  page, the new-item form and the API use them.
- **A redirect from `/scopes`:** nothing outside the app links it (`rmk` and the MCP server only
  call the API), so a 404 is enough.

## Behaviour

- A signed-in user who opens `/scopes` gets the app's 404 page.
- The main navigation has no Scopes link, on desktop and on phone.
- Root opens Admin › Scopes as before; anyone else still gets a 404 there.
- The new-item form's "About scopes" opens `/docs/scopes`.

## Edge cases

- **Old bookmarks to `/scopes`** (or `/scopes?q=…`): 404, as above.
- **Someone with no `submissions.create` permission** never had another way to see the list of
  scopes. That's accepted: the list matters only when creating an item.

## Documentation

- **Scopes › "Who manages scopes"** (`features/docs/content.tsx`): drop the link to the Scopes
  page; say root creates them under Admin › Scopes, and the new-item form's scope picker lists
  them and shows the chosen one's description.
- **Topics** (`components/help/topics.ts`): no change; the Scopes topic stays, since it explains
  scopes, not the page.
- **Helpers** (`components/help/Help.tsx`): `scope` and `scope-name` don't mention the page; no
  change.

## Acceptance criteria

- [x] `/scopes` answers 404 for a signed-in user; `/admin/scopes` works for root as before.
- [x] The main navigation shows no Scopes link to anyone (`nav` tests updated).
- [x] Nothing in the app links to `/scopes`; "About scopes" opens the Documentation topic.
- [x] Creating or editing a scope revalidates only `/admin/scopes`.
- [x] `features/scopes` is gone; the admin page reads its list code from `features/admin-scopes`.
- [x] `scopes.e2e.ts` checks root's flow and the sort and search on `/admin/scopes`, and that
  `/scopes` is a 404 and not in the navigation.
- [x] The Documentation listed above says what the app does now.

## Open questions

- None.
