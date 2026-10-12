# 120 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The current workspace

Witnessed: 2026-10-11 19:22 EDT, by a fresh agent (blind). Commit: 659b8eb9 (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The cookie is named `ronne-workspace` | yes | confirmed | `current-workspace.ts:8` `WORKSPACE_COOKIE = "ronne-workspace"`; route.test asserts `^ronne-workspace=global;` |
| 2 | `loadShell`'s `current` is the cookie's workspace only while the user is a member; a stale or foreign one, or a public non-member one, counts as none | yes | confirmed | `shell.ts:52` `currentFrom(cookie, workspaces)`, where `workspaces` keeps only rows with a `role`; `shell.test.ts` checks acme→acme, open (role null)→null, gone→null; mutating `currentFrom` to accept any cookie in a scratch copy → test fails |
| 3 | `viewedWorkspace`: `?workspace=` comes before the current workspace; with no parameter it uses the current one and asks for a redirect | yes | confirmed | `current-workspace.ts:44-52`; unit tests: `("other","acme")`→other, no redirect; `(undefined,"acme")`→acme, redirect true; `(undefined,null)`→no redirect |
| 4 | `?workspace=` empty or `all` means all workspaces | yes | confirmed | tests for `"all"`, `""` and `"  "`→null. Probe: `"ALL"` (upper case) is read as a workspace name; that's fine because the name check is exact |
| 5 | The route sets the cookie only for a workspace the user is a member of; `all` or empty clears it; anything else leaves it alone | yes | confirmed | `route.test.ts` (open with role null and secret → no Set-Cookie; all → Max-Age=0); my probe of the real `GET`: `set=open`→no cookie, `set=%20global%20`→sets global, no `set`→clears |
| 6 | The cookie's flags | yes | confirmed | probe: `ronne-workspace=global; Path=/; Max-Age=31536000; HttpOnly; SameSite=lax`. There is no `Secure` flag; the plan doesn't ask for one |
| 7 | The route goes back to a same-site path only (`safeNextPath`: no open redirect) | yes | not met | Probe of the real route `GET` (scratch vitest, mocked session): `?set=global&next=%2Fa%2F..%2F%2Fx%2F%2Fevil.test` → `303 Location: http://evil.test/`, and the cookie is set too. The `%2e%2e` form also redirects (`http://evil.test/path`). The tests try only `https://`, `//`, `/\`, `\t` and `javascript:` |
| 8 | Going back drops the old `?workspace=` (every copy) and keeps the rest of the query and the hash | yes | confirmed | probe `backTo("/catalogue?workspace=a&workspace=b&q=1#h")`→`/catalogue?q=1#h`; removing the `delete` in a scratch copy → test fails |
| 9 | The route needs a session (the proxy checks the cookie, the route checks the session) | no | confirmed | `proxy.ts:27` redirects any path that isn't public when there's no session cookie, and `isPublicPath` covers only `/sign-in` and `/setup`; `route.ts:19` calls `requireUser`; route.test "asks for a session first" |
| 10 | An outsider filtering by a private workspace sees nothing (093) | yes | confirmed | `npx vitest run --project db src/server/domains/items/actions/private-items.db.test.ts` → 5 passed (SQLite); `:160` `browseCatalogue(asOutsider,{workspace:"acme"})`→`[]` |
| 11 | Unit tests, lint and typecheck are green | yes | confirmed | `npx vitest run src/features/current-workspace "src/app/(app)/current-workspace" "src/app/(app)/shell.test.ts"` → 3 files, 22 passed; `biome check` on the 6 files → clean; `tsc --noEmit` → exit 0 |

**Overall:** not met: everything holds except the redirect, which can still leave the site when `next` is `/a/..//x//evil.test` (claim 7).

### Re-check — claim 7

Witnessed: 2026-10-11 19:23 EDT, by a fresh agent (blind). Commit: 659b8eb9 (+ uncommitted working tree, which now includes `route-guard.ts` and `route-guard.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The route goes back to a same-site path only (`safeNextPath`: no open redirect) | yes | confirmed | Scratch vitest probe of the real `GET` with 18 `next` values (`/a/..//x//evil.test`, `/%2e%2e//x//evil.test`, `/%2E%2E//…`, `/a/.%2e//…`, `/a/%2e.//…`, `/./x/..//…`, `/a/..///evil.test`, tab, CR and LF inside, `/a/b/../..//…`, `/a/..//x/..//evil.test`, ideographic space, `\u0000`, `/a/..%2f/…`, `/a/../%2F/…`, and a `#//evil` hash) → off-site: 0 of 18. Every location is `http://localhost:3000/…`; most are `/`, and `/%2F/evil.test` and `/%00//x//evil.test` stay as paths on this site. `route-guard.ts:42` now refuses a parsed pathname that starts with `//` |
| 7a | Sign-in's uses of `safeNextPath` are safe too | yes | confirmed | `features/sign-in/actions.ts:21` `redirect(safeNextPath(form next))` and `app/sign-in/page.tsx:23,27` `redirect(safeNextPath(params.next))` both use the fixed function; the probe shows `safeNextPath`→`/` for every dot-segment variant above. Before the fix, `safeNextPath("/a/..//evil.test")` returned `//evil.test`, so the sign-in action was an open redirect too |
| 7b | The new tests catch the bug | yes | confirmed | Scratch copy with `\|\| url.pathname.startsWith("//")` removed from `route-guard.ts`, running copies of the three test files → 3 failed (`safeNextPath › sends anything that could leave the site to /`, `backTo › never leaves the site`, `GET /current-workspace › never sends anyone off the site`); with the fix → 24 passed |
| 7c | Suites, lint and typecheck are green | yes | confirmed | `npx vitest run` on route-guard.test, current-workspace, the route, shell.test, `features/sign-in` and `app/sign-in` → 6 files, 44 passed; `biome check` → 21 files clean; `tsc --noEmit` → exit 0 |

**Overall:** met: the route and sign-in no longer leave the site for any dot-segment, encoded or control-character variant tried, and the new tests fail without the fix.

### Adversarial pass

Witnessed: 2026-10-11 19:27 EDT, by a fresh agent (adversarial). Commit: 659b8eb9 + working tree (including the `safeNextPath` dot-segment change to route-guard.ts/.test.ts that appeared mid-pass). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The cookie is `ronne-workspace`, and `loadShell`'s `current` is the cookie's value only while the user is a member (a stale, foreign or public-but-not-joined name counts as none) | yes | confirmed | `shell.ts:52` `currentFrom(jar.get(WORKSPACE_COOKIE)…, workspaces)` over the role-filtered list; probe `currentFrom` with `ACME`, ` acme`, `evil`, `""` → null. Mutation (accept any cookie) → 2 tests fail (shell.test, current-workspace.test) |
| 2 | `viewedWorkspace`: `?workspace=` first, then the current workspace with `redirect: true`; `all` or empty means none | yes | partly | Probe: `undefined`+acme → `{acme, redirect:true}`; `""`, `" "`, `all` → null. But `ALL` → workspace `"ALL"` (case-sensitive), and a real workspace named `all` can never be viewed (bug 1) |
| 3 | The route sets the cookie only to a workspace the user is a member of; anything else changes nothing | yes | partly | DB probe (scratch `witness-probe.db.test.ts`, SQLite): plain user `set=secret` (private, not in) / `open` (public, not joined) / `root` → `keep`; root (members `["root-2"]`) `set=global`/`secret` → `keep`; `set=GLOBAL`, `global%00` → no cookie. But a member of a workspace named `all` gets `clear` instead of `set` (bug 1). Mutation (set any) → 2 tests fail |
| 4 | `set=all` or empty clears the cookie | yes | confirmed | route.test "clears it for all" → `ronne-workspace=; … Max-Age=0`; `choiceOf(null/"")` → clear |
| 5 | Cookie flags: Path=/, HttpOnly, SameSite=Lax, one year | yes | confirmed | Probe Set-Cookie: `ronne-workspace=global; Path=/; Max-Age=31536000; HttpOnly; SameSite=lax`. Mutations httpOnly:false / sameSite:"none" → route test fails. No `Secure`, same as the theme cookie (`theme.ts:17`) |
| 6 | The route only goes back to a same-site path (`safeNextPath`), never to sign-in, without the old `?workspace=` | yes | confirmed | 20 hostile `next` values through `GET` (`%2F%09%2Fevil.test`, CR/LF, `/./`, `%2E%2E`, `/\\`, `%255C`, fullwidth `／／`, RTL override, `/@evil.test`, `javascript:`, a 20 000-char path, a `/current-workspace?…next=https://evil.test` chain, `/sign-in?next=/sign-in`): every Location had host `localhost:3000`. `/catalogue?workspace=x&a=1#h` → `/catalogue?a=1#h`. Mutation (`backTo` without `safeNextPath`) → 2 tests fail |
| 7 | The route requires a session | no | confirmed | `proxy.ts:29` redirects a request with no cookie to sign-in; `route.ts:20` `requireUser` first; route.test "asks for a session first" checks `myWorkspacesAs` isn't called |
| 8 | A private workspace you're not in filters to nothing, and the result can't be told apart from an unknown name | yes | confirmed | `vitest --project db private-items.db.test.ts` → 5 passed (line 160: outsider `{workspace:"acme"}` → `[]`). Scratch probe: the outsider's `browseCatalogue` for `acme` and for `zzz-none` gave identical JSON once the name was masked (`LEAKDIFF true`). The route answers both `keep` with the same redirect |
| 9 | Nothing in task 1 widens what anyone sees | no | confirmed | `viewedWorkspace` only returns a name that the page's own permission-checked query uses. The cookie is checked against memberships (`shell.ts:52`), and `set` against `myWorkspacesAs(user).filter(role)` (`route.ts:21`) |
| 10 | Unit tests cover the order, `all`, a stale or foreign cookie, the route's choices, its cookie flags and its redirect checks | yes | confirmed | `vitest run` on the 4 files → 31 passed; Biome clean. Mutations M1–M7 each failed at least one test |

**Overall:** not met: a workspace named `all` (creatable, and the personal workspace of `all@…`) can't be chosen or filtered to.

### Re-check — claims 2 and 3 (adversarial)

Witnessed: 2026-10-11 19:29 EDT, by a fresh agent (adversarial). Commit: 659b8eb9 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | `viewedWorkspace`: `?workspace=` first, then the current workspace with a redirect; only empty means none (`all` is a name); names trimmed and lowercased | yes | confirmed | `current-workspace.ts:15` `nameOf = trim().toLowerCase()`, `:52`. DB probe (SQLite; root created a public `all`, user u a member): `all`, `ALL`, ` All ` → workspace `all`; `""`, `" "`, `"\t"` → null; `GLOBAL` → `global`; `*`, `%`, `null`, `undefined`, `none`, `-`, `all\0` → stay names (find nothing). Kelvin sign `Kall` → `kall` (an ASCII alias, harmless). Mutations: no lowercase → 2 tests fail; no trim → 2 fail; `all` sentinel back in `viewedWorkspace` → 1 fails |
| 3 | The route sets only a member's workspace, including one named `all`, compared lowercased; empty or whitespace clears; anything else changes nothing | yes | confirmed | DB probe `choiceOf` over `myWorkspacesAs(user).filter(role)`: u (member of `all`): `all`/`ALL`/` All ` → `set all`. all@example.com and root (not members): `all` → `keep`. `GLOBAL` → `set global` for members, `keep` for root (members `["root-2"]`). `secret`/`open`/`root`/`all-2` → `keep`. Route probe: `set=` / `%20` / `%09` → cookie deleted; `%20Ana%20` → `ronne-workspace=ana; …HttpOnly; SameSite=lax`; `open`/`OPEN`/`all` (not a member) → no Set-Cookie. Mutation (`all` clears again) → 1 test fails |
| 11 | `safeNextPath` refuses paths that resolve to `//host` (dot-segments), and the route never leaves the site | no | confirmed | `route-guard.ts:42` adds `url.pathname.startsWith("//")`. Route probe with `/a/..//x//evil.test`, `/%2e%2e//x//evil.test`, `/.//x//evil.test`, `/a/../\t/x//evil.test`, `/a/b/../..//x//evil.test`, `/./..//x///evil.test`, `/../\x//evil.test`, CR/LF, a chained `/current-workspace?next=/a/..//x//evil.test`, a 20 000-char path → hosts seen: `['localhost:3000']` only. Removing the check → 3 tests fail (backTo, route, route-guard). At HEAD it was exploitable through this route: `backTo("/a/..//x//evil.test")` → `//evil.test` → `https://evil.test/` |

**Overall:** met: a workspace named `all` is chosen and filtered like any other, case and whitespace are normalised, only an empty value means all workspaces, and every hostile `next` stays on the site.

## Follow-up — after task 1's passes

The adversarial re-check's remark: `route.ts`'s comment still said `all` clears the choice. It now
says an empty or missing `set=` clears it (Show all). Comment only.

## Task 2 — The switcher

Witnessed: 2026-10-11 19:42 EDT, by a fresh agent (blind). Commit: 7a483ed7 plus the uncommitted working tree (11 files changed, and the new docs/knowledge/links-that-change-state.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The switcher lists All workspaces first, then the member's workspaces (personal first, then global, then by name), then Manage workspaces | yes | confirmed | `WorkspaceSwitcher.tsx:79-112` renders All, then `workspaces` in the order given, then Manage. The order comes from `access-requests.ts:454` (personal first; the repository list keeps global first, then by name), which this task didn't change. The unit test "offers All workspaces, then each…" checks the full href order. A scratch e2e probe (sidebar user, no JS) → rows `["All workspaces","sidebar personal","","global user","","Manage workspaces"]` |
| 2 | Only workspaces the user is a member of are listed | yes | confirmed | `shell.ts` keeps only `w.role` rows. Probe as root → only `root-2 personal`, no other workspaces |
| 3 | The current one is marked, and only it | yes | confirmed | `WorkspaceSwitcher.tsx:83,93` `aria-current="true"` plus a Check icon. Unit test "marks the current choice, and only it" (exactly one; `set=acme`; All when null). Probe, folded: `a[aria-current=true]` → `root-2` |
| 4 | Each choice is a plain `<a>` to `/current-workspace?set=<name or empty>&next=<this page with its query>` (task 1's route), so it isn't prefetched | yes | confirmed | `WorkspaceSwitcher.tsx:81,90` use `chooseHref(…, here)`, where `here` = path plus search params. Unit test expects `/current-workspace?set=acme&next=%2Fcatalogue%3Fq%3Dlint%26workspace%3Dacme`. Probe with JS: opened the list and waited 1.5 s without clicking → no `ronne-workspace` cookie |
| 5 | Choosing a workspace sets it and returns to the same page; All workspaces clears it | yes | confirmed | Probe with no JS: on `/workspaces?x=1`, clicked personal → URL `/workspaces?x=1`, cookie `ronne-workspace=sidebar` (HttpOnly, Lax), button "sidebar / Personal workspace". All workspaces from `/menu` → back on `/menu`, cookie gone. `sidebar.e2e.ts` (with JS) passes |
| 6 | Works without JavaScript | no | confirmed | `<details>` holding `<a>` links. The no-JS probe in #5 set and cleared the cookie. The `navigation.mobile.e2e.ts` no-JS test checks All workspaces and Manage workspaces are visible on /menu (it doesn't click a choice; my probe did) |
| 7 | Each row has an Open page link to `/workspaces/<name>` (encoded); Manage workspaces opens `/workspaces` | yes | confirmed | `WorkspaceSwitcher.tsx:100-108,111`. Unit tests check `/workspaces/a%20b` and `aria-label="Open acme's page"`. `sidebar.e2e.ts` clicks Open … page → `/workspaces/<name>`, and Manage workspaces → `/workspaces$` |
| 8 | The button shows the current workspace's name, with "Personal workspace" for yours, or All workspaces; a stale name shows All | yes | confirmed | `WorkspaceSwitcher.tsx:56-66`. Unit test "shows the current workspace…" covers null, acme, ana (Personal workspace) and the stale `gone` → All. In the probe the button showed "sidebar / Personal workspace" after choosing |
| 9 | Folded rail: the button is named by the current workspace | yes | confirmed | `WorkspaceSwitcher.tsx:51` `aria-label="Workspace: …"`. Unit test "is named by the current workspace when folded". Probe, folded after reload → `Workspace: root-2 (personal workspace)`, then after All → `Workspace: All workspaces` |
| 10 | The sidebar, the Menu sheet (below lg) and /menu all get `current` from `loadShell` | yes | confirmed | `layout.tsx`, `menu/page.tsx`, `AppShell.tsx`, `Sidebar.tsx:150`, `MobileMenu.tsx`, `MenuList.tsx:60` pass it through. A scratch vitest probe rendering AppShell (`current="acme"`, folded and unfolded) showed acme in both the aside and the dialog summaries; MenuList `current="ada"` → "ada / Personal workspace". At the time no repo unit test covered the pass-through (see the re-check) |
| 11 | Component tests cover the list, the marking, the links and the folded name (Done when) | yes | confirmed | `npx vitest run src/components/app-shell src/features/reviews` → 4 files, 88 passed. Read the tests: they assert hrefs, the single aria-current, and the folded aria-label |
| 12 | The end-to-end tests for the switcher pass on desktop, phone, phone-webkit and tablet | no | confirmed | `.next/BUILD_ID` mtime is after every changed source. `npx playwright test e2e/sidebar.e2e.ts e2e/navigation.mobile.e2e.ts` → 10 passed |
| 13 | Lint and types are clean on the changed files | no | confirmed | `npx biome check` on the changed folders → 62 files, no fixes. `npx tsc --noEmit -p apps/web` → no output |

**Overall:** met: the switcher lists, marks and links as specified, sets and clears the current workspace through task 1's route with and without JavaScript, and shows the current workspace in the sidebar, the folded rail, the Menu sheet and /menu.

### Re-check — test gaps

Witnessed: 2026-10-11 19:44 EDT, by a fresh agent (blind). Commit: 7a483ed7 plus the uncommitted working tree (now with the updated AppShell.test.tsx; task 3's work in `server/domains/submissions` is in progress and not covered here). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A unit test fails when the sidebar (open and folded) doesn't get `current` | no | confirmed | `AppShell.test.tsx:418` "gives the switcher the current workspace in the sidebar, the folded rail and the Menu (120)". Copied `src` to the scratchpad, removed `current={current}` from `Sidebar.tsx`'s `<WorkspaceSwitcher>`, ran vitest with a scratch config → that test failed, 1 failed / 34 passed. Restored → 35 passed |
| 2 | A unit test fails when the Menu sheet or /menu list doesn't get `current` | no | confirmed | Same copy, removed `current={current}` from `MenuList.tsx`'s `<WorkspaceSwitcher>` → the same test failed (1 failed / 34). Removed it instead from `AppShell.tsx`'s `<MobileMenu>` → the same test failed (1 failed / 34) |
| 3 | The sheet's `links()` reader now reads every link's text, All workspaces included | no | confirmed | `AppShell.test.tsx:436-446` strips the tags inside each `<a>…</a>`. The expected list starts `"All workspaces", "ada personal", "Manage workspaces", "Propose item", …` (`:470-474`). In the copy, renamed the All workspaces text in `WorkspaceSwitcher.tsx` → "lists the switcher, Propose item, …" failed, along with "marks the current choice" (2 failed / 33) |
| 4 | The suite passes on the real tree | no | confirmed | `npx vitest run src/components/app-shell` (repo) → 2 files, 39 passed. `diff -r` showed the scratch copy's `app-shell` files matched the repo |

**Overall:** met: both gaps are closed; each mutation makes the new tests fail, and the suite passes on the real tree.

## Task 3 — The filtered pages

Witnessed: 2026-10-11 20:04 EDT, by a fresh agent (blind). Commit: 5bf7455f plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A filtered page without `?workspace=` while a current workspace is set redirects to the same page with it, keeping its other parameters | no | confirmed | `shell.ts:70` redirects via `withWorkspace`; `shell.test.ts` → `REDIRECT /reviews?tab=waiting&workspace=acme`; Reviews probe with cookie `global` on `{tab:release,sort:name}` → `REDIRECT /reviews?tab=release&sort=name&workspace=global` |
| 2 | Catalogue shows only that workspace's items, through the same `?workspace=` parameter as its Filters select | yes | confirmed | `catalogue/page.tsx:20` passes `view.workspace` to `browseCatalogue`; `catalogue.test.tsx` "shows only it" → called with `workspace:"acme"`; `npx playwright test e2e/scopes.e2e.ts` (`exact: true` label) → 1 passed |
| 3 | Catalogue: picking a workspace in Filters changes only this view's URL; Show all clears both | no | confirmed | Filters is a GET form (only the URL changes, no cookie); Show all = `chooseHref(null, here)`: the route clears the cookie and `backTo` drops `?workspace=` (`current-workspace.ts:80`) |
| 4 | Catalogue's own controls still work with a current workspace set (the workspace chip, Clear all, Clear filters, See every item) | no | not met | Scratch probe rendering `CatalogueView` with `query.workspace:"acme"`, `keepAll:false`: "Remove the workspace filter", "Clear all", "Clear filters" and "See every item" all link to plain `/catalogue`, which `workspaceView` redirects back to `?workspace=acme`. Removing the filter does nothing |
| 5 | Reviews: every tab filtered by the workspace; tab links keep it | yes | confirmed | Reviews probe, tabs waiting/decided → `listQueue` gets `workspace:"global"`; tab links `/reviews?workspace=global`, `/reviews?tab=waiting&workspace=global`, … ; `queue.ts:140-149` matches nothing for a name the reviewer doesn't moderate |
| 6 | Reviews' Workspace select and the `queue-workspaces` helper are gone | yes | confirmed | Probe → `id="queue-workspace"` absent on every render; `grep -rn queue-workspaces apps/web/src` → no hits; `reviews.test.tsx` asserts no select and no "Why only these?" |
| 7 | Reviews in a workspace you don't review in: "You don't review submissions in acme · Show all" | yes | confirmed | Probe (moderator of global only), `?workspace=acme` → "You don't review submissions in acme·Show all"; `?workspace=GLOBAL` → "Showing global only" (lower-cased) |
| 8 | Component tests cover the Reviews page's filtering (Showing line, "don't review" message, workspace sent to the query) | yes | partly | `reviews.test.tsx:27` mocks `workspaceView` to `workspace:null` only; `grep "don't review\|Showing" reviews.test.tsx` → none. Only `queueQueryOf`, `listUrl` and `QueueTabs` are tested. Claims 5 and 7 hold only because of my probe |
| 9 | My submissions: only your submissions in that workspace, server-side and paged, in the list, its total and the status counts | yes | confirmed | `kysely-submission-repository.ts:123,303-306` filter on `workspaces.name`; the service lower-cases it; `my-submissions.db.test.ts` "filters by workspace…" covers list, upper case, total and counts. `vitest run --project db src/server/domains/submissions` → 26 files, 274 passed |
| 10 | The same on the database servers | yes | confirmed | `pnpm test:db:postgres -- src/server/domains/submissions/actions/my-submissions.db.test.ts` → 6 passed; `:mysql` → 6 passed; `:mariadb` → 6 passed |
| 11 | My submissions links (status, search form, chips, sort, paging) keep `?workspace=` | yes | confirmed | `submissionsList(view.fixed)` puts it in `list.fixed`; `listParams` and `HiddenListFields` start from `list.fixed` (`list-query.ts:101`, `DataTable.tsx:95`); `submissions.test.tsx` → `href="/submissions?workspace=acme&sort=name` |
| 12 | New item starts on the current workspace's first scope, and every scope stays choosable | yes | confirmed | `submissions/new/page.tsx:52` picks the first scope of `current`; `NewDraftForm` only sets the initial state; `submissions.test.tsx` → `checked="" value="acme/b"` |
| 13 | The "Showing <name> only · Show all" line with the "What does this filter?" → `workspaces#current` helper | yes | confirmed | `Showing.tsx`; `Help.tsx` `current-workspace` → `docsHref("workspaces","current")`; `topics.ts` adds `{ id: "current" }`; `catalogue.test.tsx` checks the Show all href and "What does this filter?"; unit suite (helper link test included) passes |
| 14 | A `?workspace=` you can't see filters to nothing with the same message as an unknown name ("No workspace acme you can see") | no | partly | Catalogue: "No workspace secret you can see", identical markup for private and unknown (test). Reviews: private and unknown both say "You don't review submissions in …" (probe), so nothing leaks. My submissions has no `why` (`submissions/page.tsx:100`): an unknown or private name shows "Showing zzz only", not the spec's message |
| 15 | Paging and sorting keep the parameter | yes | confirmed | Catalogue probe: sort links `/catalogue?workspace=acme&sort=name`, next page via `href({cursor})`; Reviews `listUrl` → `/reviews?tab=waiting&workspace=beta&q=fmt&sort=name` (test); explicit All kept as `workspace=` (tests) |
| 16 | Nothing else is filtered | no | confirmed | `grep -rln "workspaceView\|loadShell" src/app src/features src/components` → only the layout, `/menu`, catalogue, reviews, submissions and submissions/new |
| 17 | Sidebar counts are unchanged by it (a test) | yes | confirmed | `shell.test.ts` "leaves the sidebar's counts alone" → equal `navCounts` with and without the cookie, and `countNeedsReview` called with Headers only |
| 18 | Without JavaScript: Show all and the tabs are plain links, and the filters are GET forms | no | confirmed | Rendered markup: Show all is `<a href="/current-workspace?set=&next=…">`, tabs are `<a href>`, Catalogue and queue filters are GET forms |
| 19 | Unit suite, typecheck and lint pass | no | confirmed | `npx vitest run --project unit` → 125 files, 1258 passed; `pnpm --filter @ronneai/web typecheck` → no errors; `npx biome check apps/web/src apps/web/e2e` → 808 files checked, 9 warnings, 2 infos, no errors |

**Overall:** not met: the pages filter, keep the parameter and leave the counts alone, but the catalogue's own clear controls can't leave the current workspace (row 4), the Reviews page's filtering has no test (row 8), and My submissions doesn't use the spec's "No workspace … you can see" wording (row 14).

### Re-check — rows 4, 8 and 14

Witnessed: 2026-10-11 20:07 EDT, by a fresh agent (blind). Commit: 5bf7455f plus the uncommitted working tree (SPEC.md, shell.ts, testing.ts, catalogue.test.tsx and reviews.test.tsx changed). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Catalogue's own controls still work with a current workspace set (the workspace chip, Clear all, Clear filters, See every item) | no | partly | `shell.ts`: `keepAll = current !== null`. Probe `CatalogueView` (`workspace:"acme"`, `keepAll:true`) → chip ×, Clear all and Clear filters go to `/catalogue?workspace=`, but "See every item" is still `/catalogue` (`CatalogueView.tsx:323`, hard-coded `<Link href="/catalogue">`), which redirects back to `?workspace=acme`. Mutation (old `keepAll` rule) in scratch copies → `shell.test.ts` "with one: … keeps an explicit All" fails, and catalogue "lets its clear controls leave the current workspace" fails. That test renders a page with entries, so it never shows the empty state |
| 8 | Component tests cover the Reviews page's filtering (Showing line, "don't review" message, workspace sent to the query) | yes | confirmed | `reviews.test.tsx` now uses `fakeWorkspaceView`; `npx vitest run --project unit` → 125 files, 1261 passed, including "follows the current workspace (120)…" and "says when you don't review in the workspace shown (120)…". Mutation: page copy without `view.workspace` in `queueQueryOf` → "follows…" fails, while the unmutated control copy passes it. I couldn't run the "don't review" test from the scratchpad (the control copy fails too, a router invariant on the needs tab). It asserts the exact text `You don&#x27;t review submissions in <strong>acme</strong>`, so it would fail if the `why` were lost |
| 14 | A `?workspace=` you can't see filters to nothing and says the same as for an unknown name, per page as SPEC.md says | no | confirmed | `SPEC.md` "Never a security boundary" now gives each page's message: Catalogue "No workspace acme you can see", Reviews "You don't review submissions in acme", My submissions "Showing acme only" over an empty list. The code matches: catalogue test (private = unknown markup), Reviews probe (secret and zzz the same), `submissions/page.tsx` Showing with no `why` and the test "shows the table, not the first-time page, for a workspace with nothing of yours" |

**Overall:** not met: row 4 holds for the chip, Clear all and Clear filters, but "See every item" on the empty state still links to `/catalogue` and goes back to the current workspace.

### Re-check — row 4

Witnessed: 2026-10-11 20:08 EDT, by a fresh agent (blind). Commit: 5bf7455f plus the uncommitted working tree (`CatalogueView.tsx` and `catalogue.test.tsx` changed again). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Catalogue's own controls still work with a current workspace set (the workspace chip, Clear all, Clear filters, See every item) | no | confirmed | `CatalogueView.tsx:323` is now `<Link href={href({ q: "", ...none })}>`; `grep 'href="/catalogue"' CatalogueView.tsx` → no hits. Scratch probe of `CatalogueView` (`workspace:"acme"`, `keepAll:true`) → Clear filters, the chip ×, Clear all and See every item all go to `/catalogue?workspace=`. `npx vitest run --project unit` → 125 files, 1261 passed. Mutation: a scratch copy of `CatalogueView.tsx` with the hard-coded `<Link href="/catalogue">` put back, swapped in for the real one → "lets its clear controls leave the current workspace (an explicit All)" fails (`expected … not to contain 'href="/catalogue"'`), 1 failed / 17 passed. The same copy without the mutation → 18 passed |

**Overall:** met: every catalogue clear control, the empty state's See every item included, writes an explicit `?workspace=`, and the test catches the old link.

## Follow-up — after task 3's passes

The pre-commit hook's `item-names.test.js` (118: names are never split by hand outside core's
`names.ts`) caught New item's `scope.split("/")[0]`. It now uses core's `scopeRefFrom` for the
option's workspace; same behaviour, and `submissions.test.tsx`'s "starts New item on the current
workspace's first scope" still passes (31 tests), as does the guard (164).
