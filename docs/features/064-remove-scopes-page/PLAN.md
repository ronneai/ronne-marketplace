# 064 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Remove the page and its links.** Delete `app/(app)/scopes/page.tsx`; drop Scopes from
  `components/app-shell/nav.ts`; point the new-item form's "About scopes" at `docsHref("scopes")`;
  stop revalidating `/scopes` in `features/admin-scopes/actions.ts`. Move `list.ts` and
  `ScopesTable.tsx` from `features/scopes` into `features/admin-scopes`, keep only
  `ADMIN_SCOPES_LIST`, and delete `features/scopes`.
  *Done when:* the nav, admin-scopes and submissions unit tests pass, updated for the new links
  and paths (`admin-scopes.test.tsx` checks the table's links on `/admin/scopes`), and
  `grep -rn '"/scopes' apps/web/src` finds only the API and the Documentation's link (task 3).

- [ ] **2. End-to-end.** `scopes.e2e.ts`: root creates a scope and sorts and searches it on
  `/admin/scopes`; another user sees no Scopes link, gets a 404 on `/scopes` and on
  `/admin/scopes`.
  *Done when:* `pnpm test:e2e` passes.

- [ ] **3. Documentation.** Scopes › "Who manages scopes" in `features/docs/content.tsx`.
  *Done when:* the docs render tests pass, and the index marks 064 `done`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
