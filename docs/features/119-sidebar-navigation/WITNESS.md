# 119 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The nav model

Witnessed: 2026-10-11 18:09 EDT, by a fresh agent (blind). Commit: 4f4ba0ee (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every link in `NAV` has a group and an icon, in the spec's groups (Discover / Governance & reviews / Tools) | yes | confirmed | `nav.ts:28-32` `NAV_GROUPS` in order. Probe over `NAV`: Home, Catalogue, Workspaces, Requests are in discover; Reviews, Submissions, Users, Audit log, Settings in governance; Documentation, CLI & tokens in tools. Each link has its own icon. Moving Audit log to `tools` in a scratch copy made 1 test fail |
| 2 | Admin is now three links (Users `/admin/users`, Audit log `/admin/audit`, Settings `/admin/settings`), shown to root only | yes | confirmed | `nav.ts` NAV entries with `users.view`. `AppShell.test.tsx:64` checks root's list; `:49` checks that a workspace's admin (`acme: "admin"`) gets no Admin pages |
| 3 | Docs became Documentation, the website, opening in a new tab | yes | confirmed | `nav.ts` has `{ href: DOCS_URL, label: "Documentation", external: true }`. `AppShell.test.tsx:92` asserts `https://www.ronne.ai/marketplace/docs` and `external` |
| 4 | CLI & tokens (`/account/tokens`) is shown to everyone, under Tools | yes | confirmed | `AppShell.test.tsx:29` (a member, and a user in no workspace); `:189` marks it current on `/account/tokens` |
| 5 | `PROPOSE` opens `/submissions/new`, only for those who can submit | yes | confirmed | `nav.ts` `PROPOSE` with `submissions.create`. `AppShell.test.tsx:137`: `canPropose` gives false for null and for a user in no workspace, true for a member and root. Removing the permission made 1 test fail; changing the href to `/submissions` made 1 test fail |
| 6 | `groupNav` keeps the groups in order and leaves out an empty group | yes | confirmed | `AppShell.test.tsx:121`: root gets 3 groups; a user in no workspace gets Discover and Tools only. Dropping the empty-group filter made 1 test fail |
| 7 | Unit tests cover the links per role: user, moderator, a workspace's admin, owner of a personal workspace only, root | no | confirmed | `AppShell.test.tsx:29,49,64,82`. Letting a personal workspace count for permissions made 4 tests fail. Probe: an owner of only a personal workspace, with counts of 2, gets Home, Catalogue, Workspaces, Documentation, CLI & tokens |
| 8 | Requests shows under Discover only while some wait, and only to those who answer requests; tests cover it | no | confirmed | `AppShell.test.tsx:99-118` covers no count, 0, 2, and someone who answers nowhere with a count of 3 (hidden). Removing `onlyWithCount` made 4 tests fail. Probe: root with a count of 1 gets Discover = [Home, Catalogue, Workspaces, Requests]; a count of -1 hides it |
| 9 | Current link rules hold and tests cover them: Catalogue on item pages, including a workspace's; Workspaces on a workspace's pages but not on Requests or its items; Home only on `/`; each Admin page on its own | no | partly | `AppShell.test.tsx:157-196`. Each of these mutations made tests fail: removing the Catalogue pattern (1), removing Workspaces' `not` list (1), matching Home by prefix (2). Gap: when Requests' `section` was changed to `/nowhere`, all 35 tests still passed, so Requests' own current link was untested. The code itself behaves correctly: a probe gives `isCurrent(Requests, "/workspaces/requests")` → true |
| 10 | The shell loads the switcher's workspaces: only those you're a member of, personal first, then global, then by name | yes | confirmed | `shell.ts` filters on `w.role`. The `shell.test.ts` case "lists only the workspaces they're a member of" fails (1 test) if the filter is mutated to `true`. The order comes from `access-requests.ts:455` (personal first, stable sort) over `kysely-workspace-repository.ts:579-583` (`is_global desc, name`) |
| 11 | The shell loads the fold cookie, and an unknown value means unfolded | yes | confirmed | `sidebar-cookie.ts` has `parseFolded = value === "folded"`. Covered by `shell.test.ts` (undefined, `folded`, `sideways`) and `AppShell.test.tsx:146` (`open`, `FOLDED`, `""`). Mutating it to `!== "open"` made 2 tests fail |
| 12 | Types and lint are clean | yes | confirmed | `npx tsc --noEmit -p apps/web` → exit 0. `npx biome check apps/web` → 819 files, no errors (9 warnings, 2 infos). `grep MainNav apps/web/src` → no matches |
| 13 | All 1221 web unit tests pass | yes | confirmed | `npx vitest run --project unit` in apps/web → 123 files, 1226 passed, 0 failed. The count is 1226 rather than 1221 at the time of this check. The full `npx vitest run` → 222 files, 2116 passed, 10 skipped |

**Overall:** not met: row 9's Requests current-link test was missing at this pass; everything else holds.

### Re-check — row 9

Witnessed: 2026-10-11 18:11 EDT, by a fresh agent (blind). Commit: 4f4ba0ee (plus the uncommitted working tree, with the new test). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | Current link rules hold and tests cover them, Requests' own current link included | no | confirmed | New test "marks Requests on its page, and nothing else there" at `AppShell.test.tsx:197-202`. `npx vitest run src/components/app-shell` → 36 passed. In a scratch copy, changing Requests' `section` to `/nowhere` made that test fail (1 failed, 35 passed). Removing `/workspaces/requests` from Workspaces' `not` list made 2 tests fail |

**Overall:** met: Requests' current link is now tested, and the test fails when the rule is broken.

## Task 2 — The sidebar

Witnessed: 2026-10-11 18:10 EDT, by a fresh agent (blind). Commit: 4f4ba0ee + working tree (uncommitted diff and untracked app-shell files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `MainNav` is gone | yes | confirmed | `test -e src/components/app-shell/MainNav.tsx` → gone; `grep -rn MainNav src e2e` → 0 hits |
| 2 | From `lg`, `AppShell` shows the sidebar and hides the header, with a content column centred and at most 1024px wide and the footer under it | yes | confirmed | `AppShell.tsx`: `<aside … hidden … lg:flex>`, header `lg:hidden` when signed in, `<main class="mx-auto … max-w-[1024px]">`, footer after it. Test "signed in: the sidebar from lg…" fails when I change max-w (scratch mutation → 1 failed). e2e `sidebar.e2e.ts`: banner hidden on desktop → passed |
| 3 | The sidebar holds the logo, the switcher, + Propose item (only for those who can submit) and the links in groups whose headings show | no | confirmed | `Sidebar.tsx` (header row, `WorkspaceSwitcher`, `PROPOSE` link, `groupNav(items)`). Tests "shows the groups' headings…" and "leaves out Propose item…" pass. Blanking `{group.label}` in a scratch copy → 1 failed |
| 4 | Counts show as `NavCount` ("N waiting" for screen readers) | no | confirmed | `NavCount.tsx:5` sr-only " waiting". Removing it in the scratch copy → 3 tests failed (AppShell.test and reviews.test "the nav count") |
| 5 | The current link is marked from the live path | no | confirmed | `Sidebar.tsx` `aria-current={isCurrent(item, path)…}` using `usePathname`. Removing it in scratch → 1 failed. e2e: Workspaces has `aria-current=page` on a workspace page → passed |
| 6 | The switcher shows the personal workspace or "Workspaces", lists them in the given order, each opening `/workspaces/<name>` (encoded), then All workspaces | no | confirmed | WorkspaceSwitcher tests (3) pass. Reversing the list in scratch → 1 failed; a wrong href → 3 failed. Order comes from `access-requests.ts:454-455` (personal first, then global, then by name) via `shell.ts:42` |
| 7 | Folding gives a 64px rail (`w-16`) whose icons all have accessible names and tooltips; the fold button has `aria-expanded`/`aria-controls`; the rail uses `BrandMark` | yes | confirmed | `Sidebar.tsx` `aria-label`/`title` on every link when folded, `BrandMark size={28}`. Test "folded, names every icon…" checks 8 names plus `aria-label="Ronne"`. Removing the folded `aria-label` → 1 failed; removing `aria-controls` → 1 failed. e2e: rail width ≤ 65px → passed |
| 8 | A dot shows on a folded link where a count waits | no | partly | Code is right (`Sidebar.tsx`: `{count ? <span aria-hidden … size-2 rounded-full bg-accent/> : null}`), and the folded name "Reviews (3 waiting)" is tested. But the test titled "…puts a dot where a count waits" never checks the dot: removing the dot span in scratch → 85/85 still pass |
| 9 | The fold cookie keeps the state, and the next page renders folded; an unknown value means unfolded | yes | confirmed | `sidebar-cookie.ts` `parseFolded = v === "folded"`; `shell.ts:26` reads it; test "the fold cookie" passes. e2e: fold, reload, navigate → still folded → passed |
| 10 | The person's menu at the foot: name (not email), root's role badge only, Account and Sign out, appearance switch, version | yes | confirmed | Tests "puts the person…" and "gives plain users no role badge" pass. `ShellUser.role` is `"root" \| "user"` (`nav.ts:14`), so `role !== "user"` means root only. e2e `theme.e2e.ts` "the sidebar's theme switch sticks, and the account menu closes" → passed |
| 11 | The switcher and the person's menu are native `<details>` through `DismissibleDetails` | no | confirmed | `WorkspaceSwitcher.tsx` and `Sidebar.tsx` both wrap in `DismissibleDetails`. Not covered by a unit test (swapping it for a plain `<details>` in scratch → 85/85 pass), but e2e checks the switcher closes after navigating (`not.toHaveAttribute("open")`) → passed |
| 12 | Long workspace and person names are cut with an ellipsis, the full text in `title` | no | confirmed | `WorkspaceSwitcher.tsx` `title={w.name}` plus `truncate`; `Sidebar.tsx` summary `title={user.name}` plus `truncate`. Code read only: removing either `title` in scratch → tests still pass (not a Done-when item) |
| 13 | Signed out: a header with the logo and appearance switch, and no sidebar | no | partly | Test "signed out: …no sidebar" checks the brand, `name="theme"`, no `<aside>`/`<details>` → passes, and the code (`user ? "lg:hidden" : ""`) keeps the header at `lg`. But changing the header to always `lg:hidden` in scratch → 85/85 pass, so no test shows the signed-out header is visible on desktop |
| 14 | Unit and e2e tests, lint and types pass | yes | confirmed | `npx vitest run src/components/app-shell src/features/reviews` → 4 files, 85 passed; `npx playwright test e2e/sidebar.e2e.ts e2e/theme.e2e.ts --project chromium` → 2 passed (`.next` BUILD_ID 18:02:50, newer than every changed source); `biome check` → 44 files clean; `tsc --noEmit` → exit 0 |

**Overall:** not met: everything holds in the code and the e2e tests, but the *Done when*'s component tests don't cover the folded rail's dot (row 8) or that the signed-out header stays visible from `lg` (row 13).

### Re-check — rows 8 and 13

Witnessed: 2026-10-11 18:11 EDT, by a fresh agent (blind). Commit: 4f4ba0ee + working tree (`AppShell.test.tsx` changed at 18:10; no other app-shell source changed since the first pass). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | A dot shows on a folded link where a count waits, and on no other link | no | confirmed | `AppShell.test.tsx:340-344` asserts the dot is inside the Reviews link and that there is exactly 1 dot. Scratch mutations: dot removed → 1 failed of 87; dot on every link (`true ? …`) → 1 failed |
| 13 | Signed out: the header (logo, appearance switch) stays visible from `lg`, with no sidebar | no | confirmed | `AppShell.test.tsx:375` checks the `<header>` class has no `lg:hidden`. Scratch mutation making the header always `lg:hidden` → 1 failed of 87 |
| 12 | Long names keep their full text in `title` | no | confirmed | New test "puts each full name in a title" (`AppShell.test.tsx:241-242, 305`). Scratch: removing the switcher's `title={w.name}` → 1 failed; removing the person summary's `title={user.name}` → 1 failed |
| 11 | The switcher and the person's menu use `DismissibleDetails` | no | confirmed | Unchanged from the first pass: the code uses it, and e2e checks the switcher closes after navigating. A unit test still doesn't tell it from a plain `<details>` (that swap → 87/87 pass), so the e2e is the only check |
| 14 | Unit tests, lint and types still pass | yes | confirmed | `npx vitest run src/components/app-shell src/features/reviews` → 4 files, 87 passed; `biome check apps/web/src/components/app-shell` → 13 files clean; `tsc --noEmit` → exit 0 |

**Overall:** met: the folded rail's dot and the signed-out header are now covered by component tests that fail when the behaviour is broken; every claim of Task 2 is confirmed.

### Re-check — row 2 (content width)

Witnessed: 2026-10-11 18:21 EDT, by a fresh agent (blind). Commit: 4f4ba0ee + working tree (`AppShell.tsx` changed 18:20:46, `.next` BUILD_ID 18:20:59). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | From `lg`, the sidebar sits beside content that fills the width, 24px from each edge (`sm:px-6`), with no maximum or centring, and the footer under it | yes | confirmed | `AppShell.tsx:90` `<main className="w-full flex-1 px-4 py-8 sm:px-6">`; the footer follows it in the same column. `AppShell.test.tsx:384-385` checks `w-full flex-1 … sm:px-6` and no `max-w`/`mx-auto`. `npx vitest run src/components/app-shell src/features/reviews` → 87 passed. Scratch mutations (1 failed of 37 for each): bringing back `mx-auto … max-w-[1024px]`, `max-w-[1024px]` alone, `mx-auto` alone, dropping `sm:px-6`. On the fresh build, `npx playwright test e2e/sidebar.e2e.ts e2e/theme.e2e.ts --project chromium` → 2 passed; `biome check` (app-shell) clean; `tsc --noEmit` exit 0 |
| 2a | SPEC.md and PLAN.md say the same | yes | confirmed | `SPEC.md:48` "The content fills the width beside the sidebar, 24px from each edge, with no maximum"; `PLAN.md:19` "the content beside it, filling the width (no cap), from `lg`" |

**Overall:** met: the content column has no cap and fills the width beside the sidebar with 24px padding, and a test fails if the 1024px cap or the centring comes back.

## Task 3 — Phones and tablets

Witnessed: 2026-10-11 18:13 EDT, by a fresh agent (blind). Commit: 4f4ba0ee + working tree (uncommitted diff and untracked 119 files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `MenuList` renders the workspace switcher, then + Propose item (for those who can submit), then the links in their groups | yes | confirmed | `MenuList.tsx:58-71` (WorkspaceSwitcher, then `propose ? <Link href={PROPOSE.href}>`), `:73-104` (`groupNav(items)` with group headings, icons, counts, `aria-current`) |
| 2 | After the groups come the person, Account, the appearance switch and Sign out | no | confirmed | `MenuList.tsx:106-129`; unit test "lists the switcher, Propose item, the groups, then the account…" expects the link order `All workspaces, Propose item, Home, Catalogue, Workspaces, Submissions, Documentation, CLI & tokens, Account` plus Appearance and Sign out |
| 3 | The sheet (`MobileMenu`) and `/menu` both pass in the workspaces and `propose` | yes | confirmed | `MobileMenu.tsx:118-127`; `AppShell.tsx:72-77`; `(app)/menu/page.tsx:16-26` (`workspaces` from `loadShell`, `propose={canPropose(user)}`); `shell.ts:42-49` loads `myWorkspacesAs(user)` |
| 4 | The Menu button shows the Reviews count | no | confirmed | `MobileMenu.tsx:79-85` (`counts["/reviews"]` → `NavCount`); unit test matches `Menu<span…>3<span class="sr-only"> waiting` and no count at 0 |
| 5 | The component tests pass and cover the claim | no | confirmed | `cd apps/web && npx vitest run src/components/app-shell "src/app/(app)"` → 6 files, 51 passed. Mutation: a scratch copy of MenuList with no switcher and `propose` forced false, swapped in by a scratch Vitest config → "lists the switcher, Propose item, the groups…" fails (`expected … to contain 'href="/workspaces/ada"'`), 1 failed, 32 passed |
| 6 | The e2e tests are updated for the new links | no | confirmed | `git diff apps/web/e2e/navigation.mobile.e2e.ts`: Docs→Documentation, Access tokens→CLI & tokens, Admin→Users/Audit log, plus checks for Propose item and the switcher's `summary`; audit, auth, help, theme and user-admin e2e files also changed |
| 7 | The e2e tests cover folding across a reload and the switcher | no | confirmed | `e2e/sidebar.e2e.ts:26-57`: fold, `page.reload()`, still folded on the next page; switcher lists the personal workspace first, opens `/workspaces/<name>`, All workspaces opens `/workspaces`. Runs on the chromium project only, since the sidebar exists only from `lg`. In the sheet the e2e only checked that the switcher's `summary` is visible (closed in the re-check below) |
| 8 | The full e2e suite passes on desktop, phone (Chromium and WebKit) and tablet | yes | confirmed | Build is current: `find src -newer .next/BUILD_ID` → none. `cd apps/web && npx playwright test` → 138 passed (3.8m), exit 0. Includes `[chromium] sidebar.e2e.ts` and `navigation.mobile.e2e.ts` (3 tests) on phone, phone-webkit and tablet |
| 9 | The switcher inside the sheet works on phone, WebKit and tablet | no | confirmed | Scratch Playwright spec run with the repo config on phone, phone-webkit and tablet, 3/3 passed. Sheet lists `["<user>\npersonal","global\nuser","All workspaces"]`. Choosing the first item opens `/workspaces/<user>` and closes the sheet. Propose item's href is `/submissions/new` |
| 10 | `/menu` without JavaScript holds the switcher and Propose item, and the switcher works | yes | confirmed | Same scratch spec with `javaScriptEnabled: false` → 3/3 passed. Propose item is present, the switcher lists the same three, and All workspaces opens `/workspaces` |
| 11 | No sideways scroll on phone and tablet | yes | confirmed | `mobile-sweep.mobile.e2e.ts` "no page scrolls sideways" passed on phone, phone-webkit and tablet; it sweeps `/menu` (`e2e/pages.ts:78`). Probe: document `scrollWidth` equals `innerWidth` with the sheet open (412/412, 393/393, 768/768) and on `/menu` without JavaScript |

**Overall:** met: MenuList shows the switcher, Propose item and the groups in the sheet and on `/menu`, the component tests pass and catch the change, and the full e2e suite passes on chromium, phone, phone-webkit and tablet.

### Re-check — switcher coverage

Witnessed: 2026-10-11 18:31 EDT, by a fresh agent (blind). Commit: 4f4ba0ee + working tree (updated `apps/web/e2e/navigation.mobile.e2e.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The first mobile test opens the switcher in the sheet, chooses the personal workspace, lands on `/workspaces/<name>` and the sheet closes | yes | confirmed | `navigation.mobile.e2e.ts:68-76`: `summary` click, link filtered by "personal", href matches `^/workspaces/[^/]+$`, `toHaveURL`, `sheet` hidden |
| 2 | The no-JavaScript `/menu` test checks Propose item's href and opens the switcher to All workspaces | yes | confirmed | `navigation.mobile.e2e.ts:129-135`: `toHaveAttribute("href", "/submissions/new")`, `summary` click, All workspaces visible |
| 3 | The updated tests pass on phone, phone-webkit and tablet | yes | confirmed | `npx playwright test e2e/navigation.mobile.e2e.ts --project phone --project phone-webkit --project tablet` → 9 passed |
| 4 | The switcher step fails when choosing the personal workspace doesn't open its page | no | confirmed | Scratch copy of the test with a Playwright route that aborts `/workspaces/<name>` (`MUT=nojump`) → test 1 fails on all three projects at the new `toHaveURL(new RegExp(href$))` (repo line 74), e.g. expected `/workspaces/phone-moderator$`, received `chrome-error://chromewebdata/`; the other 6 tests pass. A rebuild with a source mutation wasn't safe in the shared scratchpad, so this is a runtime mutation |
| 5 | The `/menu` check fails without Propose item | no | confirmed | `MUT=nopropose`: the `/menu` GET response is rewritten to drop every `<a href="/submissions/new">` → the no-JavaScript test fails on all three projects at the new Propose item `toHaveAttribute` (repo line 130, "element(s) not found"); the other 6 tests pass |
| 6 | The `/menu` check fails without All workspaces | no | confirmed | `MUT=noall`: the `/menu` response is rewritten to drop the All workspaces links → fails on all three projects at the new `toBeVisible` (repo line 135); the other 6 tests pass. Before the rewrite was made global, the harness only removed the hidden sidebar's copy and every test passed. I confirmed the rewrite took effect with a logged `body.includes` → false |
| 7 | The full e2e suite still passes with the updated file | no | confirmed | `npx playwright test` → first run 137 passed, 1 failed (`[chromium] rmk-fallback.e2e.ts:17`, outside this task, passed on its own straight after); second full run → 138 passed (3.3m). Build is current: `find src -newer .next/BUILD_ID` → 0 files |

**Overall:** met: the new switcher and Propose item checks in the sheet and on `/menu` run on phone, phone-webkit and tablet, and each fails when its behaviour is broken.

## Task 4 — Decision log

Witnessed: 2026-10-11 18:13 EDT, by a fresh agent (blind). Commit: 4f4ba0ee (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §15's Design system row says the navigation is a left sidebar from `lg` | yes | confirmed | `git diff docs/MVP/MVP.md` → only line 935 changes. It adds "The navigation is a left sidebar from `lg` …"; code agrees: `Sidebar.tsx:121` `hidden … lg:flex` |
| 2 | The row names the groups Discover, Governance & reviews and Tools | no | confirmed | `MVP.md:935` "(Discover, Governance & reviews, Tools; …)"; code agrees: `nav.ts:29-31` has the same three labels |
| 3 | The row records "jump, don't filter" for the workspace switcher | no | confirmed | `MVP.md:935` "a workspace switcher that opens a workspace rather than filtering"; SPEC:107 "Jump, don't filter"; code agrees: `WorkspaceSwitcher.tsx:56` links to `/workspaces/<name>`, comment at :14 says "there is no current workspace" |
| 4 | The row says the sidebar folds into an icon rail | no | confirmed | `MVP.md:935` "folds into an icon rail"; code agrees: `Sidebar.tsx:34` says folded it's "a 64px rail of icons", `:121` `w-16` when folded |
| 5 | The row says the Menu sheet is used below `lg` | no | confirmed | `MVP.md:935` "and the Menu sheet below"; code agrees: `AppShell.tsx:60` header is `lg:hidden` for signed-in users and holds `MobileMenu` (`:72`) |
| 6 | The row credits feature 119 (owner, dated) | yes | confirmed | `MVP.md:935` "(owner, 2026-10-11, [119](../features/119-sidebar-navigation/SPEC.md))" |
| 7 | The row's 119 link resolves | no | confirmed | `ls ../features/119-sidebar-navigation/SPEC.md` run from `docs/MVP` → file exists; the 032 link in the same row also resolves |
| 8 | Nothing else in MVP.md describes a header navigation as current | no | confirmed | `grep -n -i -E "header\|top bar\|navbar\|main nav\|MainNav\|navigation"` → only HTTP headers / `headersHelper` (266, 464, 465, 671, 958) and row 935. The old "switched by a header toggle" is now "switched by a toggle", which fits the code (`ThemeToggle` in the sidebar and mobile header, `AppShell.tsx:53,78,82`). `grep -i "menu\|sheet\|sidebar"` → only 916's "Admin menu" and "counted in the nav", which don't describe a header |
| 9 | Besides updating the row, a §15 decision-log entry was added saying the sidebar replaces the top nav (owner, 2026-10-11) | yes | partly | `git diff --stat docs/MVP/MVP.md` → `1 insertion(+), 1 deletion(-)`, only row 935 rewritten. §15 (`MVP.md:893`) is one table, and no new row was added. The decision is recorded in the Design system row (owner, 2026-10-11, 119), but nothing there says the sidebar *replaces* the header/top nav; it only describes the sidebar |

**Overall:** not met: the Design system row records the sidebar decision and meets the Done when (rows 1–8). The plan's claim of a separate §15 entry saying the sidebar replaces the top nav doesn't hold (row 9).

### Re-check — row 9

Witnessed: 2026-10-11 18:15 EDT, by a fresh agent (blind). Commit: 4f4ba0ee (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | The §15 decision records that the sidebar replaces the header/top nav (owner, 2026-10-11); in this table the Design system row is the decision-log entry | yes | confirmed | `grep -n "^\| Design system" docs/MVP/MVP.md` → 935: "The navigation, in a header strip until then, is a left sidebar from `lg` (…) (owner, 2026-10-11, [119](../features/119-sidebar-navigation/SPEC.md))". §15 (`MVP.md:893`) is one table, and this row is its entry; `git diff --stat` → still only this one line changed |
| 1–8 | Rows 1–8 still hold: sidebar from `lg`, the three groups, a switcher that jumps rather than filters, an icon rail, the Menu sheet below `lg`, the 119 credit, a link that resolves, no header nav described as current elsewhere | no | confirmed | Row 935 keeps every phrase from the first pass. `ls ../features/119-sidebar-navigation/SPEC.md` from `docs/MVP` → exists. Code agrees: `nav.ts:29-31` has the three group labels, `Sidebar.tsx:121` has `lg:flex` and `w-16` when folded, `WorkspaceSwitcher.tsx:56` links to `/workspaces/<name>`, `AppShell.tsx:60,72` shows the `lg:hidden` header with `MobileMenu`. `grep -i "header\|navbar\|sidebar\|sheet"` → beyond 935, only HTTP-header lines (266, 464, 465, 671, 958) |

**Overall:** met: the Design system row, which is the §15 entry, now says the navigation was a header strip and is a left sidebar from `lg`, credited to 119 (owner, 2026-10-11); rows 1–8 are unchanged.

## Task 5 — Documentation

Witnessed: 2026-10-11 18:14 EDT, by a fresh agent (blind). Commit: 4f4ba0ee (marketplace) + working tree; ronne-web a9da2ee + working tree (branch docs/119-sidebar-navigation). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The work is in a ronne-web branch | yes | confirmed | `git -C ronne-web branch --show-current` → `docs/119-sidebar-navigation`; 9 files changed under `www/src/content/docs/{en,pt,fr}` (uncommitted) |
| 2 | The docs tests pass in ronne-web | yes | confirmed | `npx vitest run src/content/docs` → 1 file, 5 passed. `docs.test.ts` checks that each topic, section, title and body exists in every locale; it doesn't render the words |
| 3 | Biome is clean on the docs | no | confirmed | `npx biome check src/content/docs` → "Checked 62 files … No fixes applied." |
| 4 | Overview → Finding your way covers the sidebar, its groups, the switcher, Propose item, folding, and the Menu below a laptop's width (EN, PT, FR) | yes | confirmed | `{en,pt,fr}/overview.tsx` diff names the three groups, the switcher, Propose item, the foot, the fold button and the phone/tablet Menu. This matches `nav.ts` NAV, `Sidebar.tsx` (the foot holds the name with Account and Sign out, the appearance switch and the version; the fold button sits by the logo; folded items have title tooltips), `sidebar-cookie.ts` (a cookie kept for 1 year), `MenuList.tsx` and `AppShell.tsx:60` (`lg:hidden` header) |
| 5 | Workspaces: Workspaces is in the sidebar, and the switcher opens your workspaces (EN, PT, FR) | yes | confirmed | `{en,pt,fr}/workspaces.tsx`: "in the top menu" and "in the menu" become "in the sidebar" (4 places in each locale), and switcher sentences are added. This matches `WorkspaceSwitcher.tsx` (links to `/workspaces/<name>`, then All workspaces) |
| 6 | Administration says Users, Audit log and Settings are in the sidebar for root | no | not met | `admin.tsx` was not touched in any locale; `en/admin.tsx:16,80` still read "Admin › Users …" and "Admin › Audit log …", and PT and FR are the same |
| 7 | Every page (EN, PT, FR) that says "the top menu", "your menu" or "Admin" for the link is reworded | no | partly | The "top menu" and "your menu" wording is gone. "Admin" was still used as the way in, in `{en,pt,fr}/workspaces.tsx`, `roles.tsx`, `usage.tsx`, `plugins.tsx`, `install.tsx` and `admin.tsx`, although the app has no Admin link (`nav.ts`; `AdminNav.tsx:22` uses "Admin" only as an aria-label) |
| 8 | No topic or section is added or renamed, so neither topics.ts changes | no | confirmed | `git -C ronne-web diff --name-only \| grep -c topics` → 0; the marketplace `apps/web/src/components/help/` has no diff; the section-set test passes |
| 9 | No helper's words change | no | confirmed | `git diff --stat -- apps/web/src/components/help/` in the marketplace → no changes |
| 10 | The rmk topic's token location follows the app (CLI & tokens in the sidebar) | yes | confirmed | `{en,pt,fr}/rmk.tsx`: "Access tokens (CLI & tokens, in the sidebar)"; `nav.ts` lists `/account/tokens` as "CLI & tokens" under Tools |
| 11 | The PT and FR wording was proofread | yes | confirmed | I read every PT and FR hunk in the diff against EN. The meaning is the same, and only UI labels are left in English (Discover, Propose item, CLI & tokens, Users…), as elsewhere in those files. This is a reader's check, not a native speaker's |

**Overall:** not met: Overview, Workspaces and rmk match the app, but the Administration topic isn't updated, and "Admin › …" is still written as the link on about 8 pages in each locale.

### Re-check — rows 6 and 7

Witnessed: 2026-10-11 18:19 EDT, by a fresh agent (blind). Commit: 4f4ba0ee (marketplace) + working tree; ronne-web a9da2ee + working tree (branch docs/119-sidebar-navigation, 24 files changed). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The docs tests pass in ronne-web | yes | confirmed | `npx vitest run src/content/docs` → 1 file, 5 passed |
| 3 | Biome is clean on the docs | no | confirmed | `npx biome check src/content/docs` → "Checked 62 files … No fixes applied." |
| 6 | Administration says Users, Audit log and Settings are in the sidebar for root | yes | confirmed | `git diff {en,pt,fr}/admin.tsx`: each summary adds "Users, Audit log and Settings are root's links in the sidebar, under Governance & reviews" (PT and FR alike), and the sections open "Users lists…" and "Audit log records…". This matches `nav.ts`: the three `/admin/*` links are in group `governance`, with permission `users.view` (root) |
| 7 | Every page (EN, PT, FR) that says "the top menu", "your menu" or "Admin" for the link is reworded | yes | confirmed | `grep -rnE "top menu\|your menu\|in the menu\|menu du haut\|votre menu\|dans le menu\|menu de cima\|seu menu\|no menu\|Admin ›" src/content/docs \| wc -l` → 0. `grep -rn Admin` leaves only "Administration"/"Administração" (topic titles and DocLink text). roles, install, usage and plugins now say Users, Settings, and Settings › Plugin feeds (`features/admin-settings/PluginFeedsPanel.tsx` exists). workspaces says "Users, Audit log and Settings are root's" and "old addresses under `/admin`", and `next.config.ts:32-42` does redirect `/admin/workspaces[/:name]` and `/admin/scopes` to `/workspaces` |

**Overall:** met: Administration now names root's sidebar links, no page uses the top menu, your menu or Admin as the link any more, and the docs tests and Biome still pass.

## Follow-up — after task 5's re-check

The re-check's one remark ("manage it from its page": "it" had no clear noun) was fixed afterwards in
`{en,pt,fr}/workspaces.tsx`: a workspace's admins manage their workspace from its page, and its old
address under `/admin` opens that page (`next.config.ts` redirects `/admin/workspaces/:name` to
`/workspaces/:name`). Wording only; the docs tests and Biome pass.
