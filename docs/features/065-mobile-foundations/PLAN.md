# 065 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The rules.** Add the mobile rules to 032's spec (Layout), and write
  `docs/knowledge/mobile-layout.md`.
  *Done when:* both read the same; the knowledge note links 032 and this spec.

- [x] **2. Viewport and theme colour.** `generateViewport` in `app/layout.tsx` (theme cookie →
  `themeColor`, `viewport-fit=cover`); the `theme-color` meta follows the toggle.
  *Done when:* a unit test covers both themes and the missing cookie; `theme.e2e.ts` checks the
  meta changes with the toggle.

- [x] **3. Safe areas and `dvh`.** The safe-area utilities in `globals.css`; the header and footer
  in `AppShell.tsx` use them; `min-h-screen` → `min-h-dvh` in `SignInPage.tsx`, `SetupPage.tsx`,
  `DatabaseUnavailable.tsx`.
  The draft editor's composer frame and the file viewer's box use `dvh` too.
  *Done when:* unit tests pass; `grep -rn "min-h-screen\|100vh" apps/web/src` finds nothing.

- [x] **4. Phone and tablet projects.** `phone`, `phone-webkit` and `tablet` in
  `playwright.config.ts`, matching `*.mobile.e2e.ts`; the desktop project ignores them; CI and
  `CLAUDE.md` install `chromium webkit`. WebKit is LGPL-2.1: dependency exception E-5 (owner,
  2026-10-02).
  *Done when:* a one-page `smoke.mobile.e2e.ts` (sign in, open home) passes in all three.

- [x] **5. The page list and seed.** `e2e/pages.ts`: every route with the roles that can open it
  and the URLs to open (the seeded skill with files and usage, the agent with dependencies, the
  item with two versions, every docs topic). The seed adds a member, a moderator and a root per
  phone and tablet project. The draft and the submission in review are made by the sweep itself
  (task 6) through the drafts API, so each project has its own.
  *Done when:* a test checks `pages.ts` covers every `page.tsx` under `app/` (by walking the
  folder), so a new page can't be forgotten.

- [x] **6. The sweep and the tap-target report.** `mobile-sweep.mobile.e2e.ts` and
  `touch-targets.ts`; record today's failures in `EXPECTED_FAILURES`, each with its fixing feature.
  *Done when:* the sweep passes with the map filled in, fails if an entry is removed before its
  fix, and the tap-target report is attached to the run.

- [ ] **7. A look on real engines.** Open sign-in, home and an item page in the iOS simulator
  (Xcode) and an Android emulator, and note what the automated projects miss in the knowledge note.
  *Done when:* the note has a "Seen on devices" section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **The theme colour needs no client code.** The toggle's server action sets the cookie and Next
  re-renders the route, `generateViewport` included, so the `theme-color` meta changes with
  `data-theme` (`theme.e2e.ts` checks both).
- **WebKit needed an exception.** Its WebCore and JavaScriptCore are LGPL-2.1, which the policy
  allows only as a recorded exception: E-5, test time only, like E-4. The CI job keeps its name,
  "End-to-end (Chromium)", because a required check is matched by name.
- **Each project signs in with its own users** (`e2e/mobile.ts` maps project → user), so the
  per-email sign-in limit doesn't span projects.
- **The first run found two things.** The main nav's count text widened every page for
  moderators and root (fixed here: `relative` on the nav; see the knowledge note), and the new item
  form's first sections are 5px too wide at 320px in Chromium only (listed for 072).
- **The sweep resizes a loaded page** (device width, 360, 320) instead of loading it three times;
  layouts here don't depend on the width at load, and it keeps the run to about 10s per project.
