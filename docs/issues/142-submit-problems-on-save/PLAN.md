# #142 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The service.** `saveDraftFiles` (`services/drafts.ts`) returns `submitIssues`:
  - `registryIssues` on the saved draft, plus `noChangeIssues` for a proposal;
  - it's shared with `uploaded()` through one helper;
  - a failure in the checks is caught and reported as a single warning, not thrown.

  *Done when:* the drafts db tests cover `^9.0.0`, a cycle, a clean draft and a failing registry
  read, on the four databases.

- [x] **2. The draft page's first load.** The page that opens the editor runs the same helper,
  and passes the issues in. *Done when:* a db or page test shows a blocked draft's issues
  without a save.

- [x] **3. The editor.**
  - `saveDraftAction` returns `submitIssues`.
  - `DraftEditor.tsx` keeps them from the last save, or the page load, and merges them with the
    live `validateDraft` issues for the badge, the list and the file tree, without duplicates.
  - While dirty, they're marked "as of your last save" in `IssuesPopover`.

  *Done when:* the component tests cover the merge, the marking and the clean case.

- [ ] **4. End to end.** A Playwright test saves a draft with `^9.0.0` and sees the error in the
  badge, then fixes the range, saves, and sees **No problems**. *Done when:*
  `pnpm test:e2e` passes on desktop and phone.

- [ ] **5. Documentation.** `items#canvas` and `review#checks` on the website (en, pt, fr), in a
  ronne-web branch that goes live with the release. *Done when:* the pages say what tasks 1–3
  do.
