# 124 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — The notice's model and settings

Witnessed: 2026-10-21 10:15 local, by a fresh agent (blind). Commit: f53da9c3 plus uncommitted changes (`notice-policy.ts` and its test, the settings service, action, errors and database test, `audit-event.ts`, `admin-audit/summary.ts`). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `notice-policy.ts` holds message, link (label and address), tone, shown and revision | no | confirmed | `notice-policy.ts`: the `Notice` type, the two tones, the hidden default at revision 0. |
| 2 | The message is plain text up to 500 characters, counted in characters, with no line breaks | no | partly | Control characters and 501 characters are refused; 500 emoji pass. U+2028 and U+2029 passed, because the check used `\p{Cc}` only. `<b>` is stored as typed (the screen must output text). |
| 3 | The label is up to 60 characters; a link needs both parts | no | confirmed | Unit tests: 60 passes, 61 is `too_long`; a label alone and an address alone give `link_incomplete`. |
| 4 | Only `https://` or a single-`/` address; `javascript:` and `data:` refused | no | confirmed | Probe and unit tests refuse `HTTPS://`, `//host`, `/\host`, tabs, NBSP, spaces and `javascript:`. Not holes: `https://user:pw@host`, a bidi override in an address and `/..//x` were accepted. |
| 5 | Tone is information or warning only | no | confirmed | `danger` and `undefined` refused, unit and database tests. |
| 6 | An empty message can be saved hidden, never shown | no | confirmed | Unit and database tests. |
| 7 | The revision rises on message, link or tone, not on shown | no | confirmed | Database test: 1 after the first save, hide and show keep 1, three content changes end at 4. |
| 8 | Stored in `instance_settings`; `setNotice` and `notice` exist; hiding keeps the text; an unchanged save does nothing | no | confirmed | Database tests; a hand-edited value reads as hidden. |
| 9 | Audited as `settings.notice` with the old and new tone and shown, not the text | no | confirmed | The audit metadata is exactly `{from, to, revision}`; `JSON.stringify` of the events lacks the typed text. |
| 10 | Only root saves; a refusal changes nothing | no | confirmed | `ForbiddenError` for a user and for nobody; revision 0 and no audit event after refusals. |
| 11 | Last save wins | no | partly | One transaction reads and writes; no test saves twice at once. |
| 12 | Unit and database tests and typecheck pass | no | confirmed | 67 tests passed (settings and admin-audit); database project 20 passed; typecheck clean. |
| 13 | The same on PostgreSQL, MySQL and MariaDB | no | can't check here | The servers were not started. |

**Overall:** not met (rows 2 and 11 partly, row 13 unchecked). Fixed: the message and label also refuse U+2028, U+2029 and the bidi overrides (emoji joiners stay allowed); addresses also refuse invisible format characters and a name or password in an `https://` address. HTML in the message stays as typed on purpose, a test pins it, and task 3 must render text only. Last save wins rests on the one transaction; the SQLite test database has one connection, so there is no concurrency test.

### Re-check (rows 2, 4, 11)

Witnessed: 2026-10-21 10:17 local, by a fresh agent (blind re-check). Commit: f53da9c3 plus uncommitted changes. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | No line breaks, bidi overrides or line separators in the message and label | no | confirmed | The probe refused U+2028, U+2029, U+202E and U+2066 in the message and U+202E in the label; a ZWJ family emoji and 500 emoji passed; the HTML test passes. |
| 4 | Only `https://` or a single-`/` address | no | confirmed | Refused: `https://user:pw@a.com`, `https://user@a.com`, `https://:pw@a.com`, a bidi override or U+200B in an address. Allowed: `https://a.com/ok`, `/ok`. |
| 11 | Last save wins | no | confirmed | `setNotice` reads and writes inside one `repo.transaction`; holds on the code, with no concurrency test. |

**Overall:** met for these rows.

### Re-check (row 13)

Witnessed: 2026-10-21 10:18 local, by a fresh agent (blind re-check). Commit: f53da9c3 plus uncommitted changes. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | The settings database tests also pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:postgres`, `:mysql` and `:mariadb` with `-- src/server/domains/settings` → 1 file, 20 tests passed on each. |

**Overall:** met. Every claim of task 1 is confirmed.

### Re-check (owner changes: links written inline in the message)

Witnessed: 2026-10-21 11:36 EDT, by a fresh agent (blind re-check). Commit: 273ce18c plus uncommitted changes. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The notice is message, tone, shown and revision; the separate link fields are replaced by inline `[words](address)`; an old stored `link` is ignored | no | confirmed | `notice-policy.ts`; a stored value with the old `link` reads back as the message only. |
| 2 | The message is plain text up to 500 characters, in characters, with no line breaks or bidi overrides | no | confirmed | 500 emoji and a ZWJ emoji pass; 501, a line break, U+2028 and U+202E are refused; 72 copies of `[a](/b)` (504 characters) are refused. |
| 3 | A link's words are 1 to 60 characters | no | confirmed | 60 passes; 61 and `[](/a)` give `link_label`. |
| 4 | An address is `https://` (no credentials, no spaces) or a single-`/` path; `javascript:` and `data:` are never a link | no | confirmed | A probe refuses or leaves as text `javascript:` in any case, `data:`, `vbscript:`, `http://`, `//evil.com`, a backslash path, credentials, spaces, U+200B, U+202E, NUL, tabs and newlines. |
| 5 | At most 3 links; anything else with brackets stays as typed | no | confirmed | 4 links give `too_many_links`; drawn, only 3 become links; `[a](https://a.com/(x))` and `[a [b](/x)` draw as text and one link. |
| 6 | A stored message is re-checked when drawn, and the pattern is not slow | no | confirmed | A stored 180,000-character value draws only 3 links; a 500-character worst case takes 0.00 ms, 100,000 `[` 0.32 ms. |
| 7 | The revision rises on message or tone, not on shown; audit, root only and the three servers | no | confirmed | `settings.db.test.ts` → 20 passed on SQLite, PostgreSQL, MySQL and MariaDB. |
| 8 | Unit and database tests and typecheck pass | no | confirmed | 101 notice and settings tests; unit project 2522 passed; typecheck 7/7. |

**Overall:** met. Observations: `https:///x` parses to host `x` and is accepted (harmless); a hand-edited stored message over 500 characters is drawn in full (only reachable by editing the database, and fast).

## Task 2 — The Notice tab

Witnessed: 2026-10-21 10:40 local, by a fresh agent (blind). Commit: 2bb650ed plus uncommitted changes (the `notice` folders in `features/admin-settings` and `features/notice`, the tab, the page, `messages/*/admin.json`, the helpers, `biome.json`, the settings repository's `nameOf`). Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A Notice tab in Admin › Settings, selected by `?tab=notice`, with the form and no other panel | no | confirmed | `tabs.ts`, `page.tsx` and the test "is the last tab of Settings…" pass. |
| 2 | Root only; anyone else gets not-found and nothing is read first | no | confirmed | The guard in `page.tsx` runs before the tab is read; the tests "is a 404 for anyone but root" and the 404-on-every-tab loop pass. |
| 3 | Message, link label and address, tone, shown, Save, and a counter in characters | no | confirmed | `NoticeForm.tsx`; the tests "starts empty and hidden" and "counts characters" pass; 228 tests passed over the touched areas. |
| 4 | Errors beside their field, the field marked, what was typed kept | no | confirmed | The test "puts each refusal beside its field…" passes; `noticeErrorCode` is checked for all seven refusals in three languages. |
| 5 | A preview from the typed values, with its empty and hidden states; text output only | no | confirmed | A message `<b>bold</b><img src=x onerror=alert(1)>` renders as `&lt;b&gt;…` with no `<img`. |
| 6 | "Last changed by <name> · time" or "Not set yet."; the name works on every database | no | confirmed | The test finds "Last changed by Root" and the `dateTime`; `pnpm test:db:postgres`, `:mysql`, `:mariadb` with `-- src/server/domains/settings` → 20 passed each; SQLite 20 passed. |
| 7 | Helpers "Who sees this?" and the Warning line, and the `admin#notice` section in `topics.ts` | no | confirmed | `Help.tsx` and `topics.ts`; both questions are in the rendered tab. The first helper's answer describes what task 3 delivers; it is checked there. |
| 8 | Everything on the tab is in messages in English, Portuguese and French | no | confirmed | `admin.json` in three languages, parity tests, the leak test, the `biome.json` override lists the new folders. |
| 9 | The Portuguese and French texts are sensible and follow the glossary | no | confirmed | Both files read; terms consistent. |
| 10 | Typecheck and lint are clean | no | not met | `pnpm lint` failed on the import order in `page.tsx`. |

**Overall:** not met (row 10). Fixed: `biome check --write` on `page.tsx`.

### Re-check (rows 6 and 10)

Witnessed: 2026-10-21 10:50 local, by a fresh agent (blind re-check). Commit: 2bb650ed plus uncommitted changes. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The last-changed-by name works on all three servers | no | confirmed | `pnpm test:db:postgres`, `:mysql`, `:mariadb` → 1 file, 20 passed each. |
| 10 | Typecheck and lint are clean | no | confirmed | `pnpm lint` exit 0, 44 warnings (none in the touched files); `pnpm typecheck` 7/7. |

**Overall:** met. Every claim of task 2 is confirmed.

### Re-check (owner changes: links written inline in the message)

Witnessed: 2026-10-21 11:36 EDT, by a fresh agent (blind re-check). Commit: 273ce18c plus uncommitted changes. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Notice tab is root only and selected by `?tab=notice` | no | confirmed | Unit tests; the end-to-end test "only root has the tab" gets a 404 for the member. |
| 2 | The form has the message, tone, shown, Save and a counter, and no separate link fields | no | confirmed | The end-to-end form fills only Message, Tone and Show the notice; `NoticeForm.tsx` has no link inputs. |
| 3 | Errors appear beside the field, the field is marked, and what was typed is kept | no | confirmed | Six codes mapped from the model; the end-to-end test shows the address message beside the field with `aria-invalid="true"` and nothing saved. |
| 4 | The preview is drawn from what is typed, as text, with the inline link inside the sentence | no | confirmed | The end-to-end test finds the region "Preview" holding the link while editing. |
| 5 | "Last changed by", the helpers and everything in messages in three languages | no | confirmed | "Last changed by Notice Root" is found; the parity tests pass. |
| 6 | Typecheck and lint are clean | no | confirmed | Typecheck 7/7; `pnpm lint` 44 warnings, none in these files. |

**Overall:** met.

## Task 3 — Showing and dismissing

Witnessed: 2026-10-21 10:45 local, by a fresh agent (blind). Commit: e8cc2b8c plus uncommitted changes (`AppShell.tsx`, `(app)/layout.tsx`, `shell.json` in three languages, the new files in `features/notice/`). Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The notice shows under the header and above the page on every signed-in page, in normal flow | no | confirmed | `AppShell.tsx` adds the slot between `</header>` and `<main>`; the layout test checks the order header, notice, `<main`, page; `vitest run src/features/notice` → 16 passed. |
| 2 | Coverage: the Menu page is inside the layout; sign-in and the other public routes are outside | no | confirmed | By reading: `ls src/app` → `(app)`, `sign-in`, `setup`, `api`, `language`; `(app)/menu/page.tsx` is inside. No test renders `/menu` or the sign-in page. |
| 3 | Hidden when not shown, empty, or dismissed at this revision | no | confirmed | `visible-notice.ts` and its tests; the layout test covers hidden and dismissed with the page still drawn. |
| 4 | It returns after a change: a higher revision, or a garbage cookie | no | confirmed | `isDismissed` needs `dismissed >= revision`; cookie "3" with revision 4 and cookie "abc" both show it; `parseRevision` refuses ten digits, signs, decimals, exponents, spaces and non-text. |
| 5 | Dismissing keeps the revision in `ronne-notice`; a forged number can't hide a later notice | no | confirmed | The action parses `^\d{1,9}$`, sets nothing otherwise, and keeps `Math.min(revision, current)`; "999999" gives "3". Cookie: path `/`, a year, lax, httpOnly. |
| 6 | Dismiss is a form posting the revision | no | confirmed | The markup only: `DismissibleNotice.tsx`; the test finds the form, the hidden `revision` and the button. The real no-JavaScript post can't be run here: task 7's end-to-end test covers it. |
| 7 | The action is wrapped by `serverAction` | no | confirmed | `actions.ts` uses `serverAction(…, { whileHeld: true })`; the guard test `server-action.test.ts` passed. |
| 8 | The text is output as text; a tag typed is shown as typed | no | confirmed | The test with `<b>`, `<script>` and `<i>` expects `&lt;…` and no raw tags. A `javascript:` address can't get here: the model refuses it when saving and when reading back (task 1). |
| 9 | A long unbroken string wraps; the dismiss button is 44px on a phone | no | confirmed | By reading: `[overflow-wrap:anywhere]`, `min-w-0`, `flex-col sm:flex-row`; `Button` has `pointer-coarse:h-11`. No layout was rendered. |
| 10 | Dismissing in one browser doesn't dismiss in another | no | confirmed | By reading: the only state is the cookie; nothing is stored per person. |
| 11 | "Dismiss" exists in three languages | no | confirmed | `shell.json`: Dismiss, Dispensar, Fermer; rendered in the test; parity tests pass. |
| 12 | Lint and typecheck are clean | no | confirmed | `biome check` on the touched folders; `pnpm lint` exit 0; typecheck clean. |

**Overall:** met. Limits: the real no-JavaScript post, the 44px layout and the Menu and sign-in coverage rest on reading, and the end-to-end tests of task 7 cover them. The test replaces `serverAction` with a pass-through, so the wrapping is proven by the guard test.

### Re-check (owner changes: dismiss icon inside the box, links inline, information in blue)

Witnessed: 2026-10-21 11:36 EDT, by a fresh agent (blind re-check). Commit: 273ce18c plus uncommitted changes. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The notice is under the header on every signed-in page, not on public pages | no | confirmed | The end-to-end tests check `/`, `/catalogue` and `/account/password`; the sign-in page has none; on a phone it sits above the h1. |
| 2 | Hidden when not shown, empty or dismissed at that revision; it returns after a change | no | confirmed | End-to-end tests 3 and 4 and the unit tests. |
| 3 | Dismiss is a form that works without JavaScript | no | confirmed | The end-to-end test posts the form with JavaScript off: the URL stays, the banner is gone, also after a reload. |
| 4 | Dismiss is an icon inside the alert box, named "Dismiss", with a 44px tap area and a focus style | no | confirmed | `DismissibleNotice.tsx`; the desktop test clicks it by name inside the banner; the phone test's `smallTargets` filtered to "Dismiss" is empty on phone, phone-webkit and tablet. |
| 5 | Text is output as text; `javascript:` can't become a link | no | confirmed | `NoticeBanner.tsx` draws spans, `Link` and `<a rel="noopener noreferrer">` only; `<b>` is shown as typed in the end-to-end test. |
| 6 | A long unbroken string wraps | no | confirmed | The phone test with a 240-character word finds no overflow, in English and Portuguese. |
| 7 | A forged cookie can't hide a later notice; another browser is not affected | no | confirmed | `Math.min` in the action and `isDismissed` unchanged; the other browser still sees it. |
| 8 | "Dismiss" in three languages; information is light blue | no | confirmed | The Portuguese test clicks "Dispensar"; `Notice` maps information to the blue style (checked by tests and tokens, not by eye). |

**Overall:** met.

## Task 4 — Home's layout

Witnessed: 2026-10-21 10:50 EDT, by a fresh agent (blind). Commit: 7bf684d9 plus uncommitted changes (`features/home/`, the home page, `messages/*/home.json`, `namespaces.ts`, `biome.json`, `homeLists` and its database test). Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The order is search, getting started, waiting for you, favorites, pinned, recent, most used, and a test covers it | no | confirmed | `HomeView.tsx`; `vitest run src/features/home …` → 90 passed. A mutation in a scratch copy (favorites and pinned moved below most used) made the order test fail. |
| 2 | A section without content is absent, with no heading and no "None" | no | confirmed | Waiting, most used and the type links are conditional; the zero-counts test finds no heading, "SLOT" or "None", and recent stays. |
| 3 | Waiting for you shows only lines above zero, each with its link and the right plural | no | confirmed | Tests for 1 review only (no "draft") and for 2, 1 and 3. |
| 4 | The three slots draw what they are given and nothing when omitted or null | no | confirmed | `?? null`; the order test fills them; the absent test passes null and undefined. |
| 5 | The search box stays and offers a link only for types that have released items, in the catalogue's order | no | confirmed | The test finds `type=skill` and `type=rule`, no `type=agent`; an empty registry keeps the form and has no `?type=`. |
| 6 | `homeLists` returns `types`, the same on every database | no | confirmed | `vitest --project db catalogue.db.test.ts` on SQLite, and `pnpm test:db:postgres`, `:mysql`, `:mariadb` → 15 passed each; the new test gives `[]` when empty and `["skill","rule"]` after releases. |
| 7 | The heading and description come from messages | no | confirmed | `page.tsx` uses `getTranslations("home")`; three `home.json` files; `namespaces.ts` registers `home`. |
| 8 | Everything on Home is in messages in three languages; the empty-registry message is moved into messages | no | confirmed | The folders are in the `biome.json` override; `pnpm lint` → 44 warnings (unchanged), no errors; the pt and fr tests check labels and that no English leaks; the empty message passes in all three. |
| 9 | The pt and fr texts follow the glossary, the plural forms and the Canadian French typography | no | confirmed | Terms match `i18n.md`; a space only before the colon in fr; the plural assertions pass. |
| 10 | Typecheck, tests and lint are clean | no | confirmed | `pnpm typecheck` 7/7; lint 44 warnings, none in these files. |
| 11 | The witness left the repository unchanged | no | confirmed | `git status --short` listed only the task's files. |

**Overall:** met. Edge cases tried: all counts zero, an empty registry with no types, slots given as null or undefined. The item cards are still English (a later sweep, accepted).

## Task 5 — The empty instance

Witnessed: 2026-10-21 11:00 local, by a fresh agent (blind). Commit: 09d0ccd1 plus uncommitted changes (`HomeView.tsx`, the page and its tests, `home.json` in three languages, `setup-wizard.e2e.ts`, `SPEC.md`, the glossary row in `i18n.md`). Machine: macOS (Darwin 27), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | With nothing released, a non-root person sees "Nothing is published yet." and "Submit an item or ask a moderator.", a link to New item and no scope link | no | confirmed | `HomeView.tsx`; `page.test.tsx` loops over user and moderator; `vitest run "src/app/(app)/page.test.tsx" src/features/home` → 15 passed. |
| 2 | Root sees "Create a scope" (to the global workspace's page) and "Submit the first item", not the moderator text | no | confirmed | `page.tsx` passes `isRoot` from `loadShell()`; the page test asserts both hrefs and labels; the view test runs the root case in three languages. |
| 3 | Root with a released item sees the lists, not the empty panel | no | confirmed | The page test "shows root the lists…"; the condition is `lists.recent.length === 0`. |
| 4 | Component tests exist for both roles | no | confirmed | `page.test.tsx` (page level) and `home.test.tsx` (view level, three languages). |
| 5 | The end-to-end test starts from a fresh instance and reaches a really empty Home | no | partly | By reading only in the first pass. |
| 6 | Every word is a message in three languages with the same keys | no | confirmed | `empty.*` in all three files; lint 44 warnings, no errors. |
| 7 | The Portuguese and French texts follow the glossary and the Canadian typography | no | confirmed | "escopo", "portée", a space before the colon in French only; the glossary row was added. |
| 8 | Typecheck passes | no | confirmed | `pnpm typecheck` exit 0. |

**Overall:** not met (row 5 only by reading). The spec's root line was corrected: Admin › Scopes went in 115, so it links to the global workspace's page.

### Re-check (row 5)

Witnessed: 2026-10-21 11:05 local, by a fresh agent (blind re-check). Commit: 09d0ccd1 plus uncommitted changes. Machine: macOS, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | The end-to-end test starts from a fresh instance and reaches a really empty Home | no | confirmed | `pnpm --filter @ronneai/web exec playwright test --project=wizard` → 1 passed: the blank instance, the setup, the sign-in, then the heading, the root text, the "Submit the first item" href and "Create a scope" leading to `/workspaces/global`. |

**Overall:** met. Every claim of task 5 is confirmed.

## Task 6 — Messages and phone

Witnessed: 2026-10-21 11:10 local, by a fresh agent (blind). Commit: 40235ae9 plus uncommitted changes (`e2e/pages.ts`, `src/app/pages-coverage.test.ts`). Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every user-visible string in the Notice code, the Home code and the notice slot is a message | no | confirmed | Read `features/notice`, `features/admin-settings/notice`, `features/home`, the home page, the layout and `AppShell.tsx`: every label, aria-label and hint is `t(...)`; the banner's `title` is root's own text. Three `biome-ignore lint/plugin` (an HTML tag name, the product name, GitHub's name) are justified. |
| 2 | The `biome.json` overrides cover those folders, and the rule fires there | no | confirmed | The globs list `features/notice`, `features/home`, the page, `features/admin-settings/notice` and the layout; a throwaway file linted with the five plugins in a scratch config gave 3 errors (raw text, `title`, `aria-label`). The globs matching rests on reading `biome.json` and the clean `pnpm lint`. |
| 3 | Parity and scan tests pass; the keys exist in three languages | no | confirmed | `vitest run src/i18n src/app/pages-coverage.test.ts src/features/notice src/features/home src/features/admin-settings/notice` → 12 files, 125 passed; `admin.json`, `home.json` and `shell.json` `notice` keys are identical across en, pt and fr. |
| 4 | The Portuguese and French read correctly, follow the glossary and the Canadian typography | no | confirmed | Terms match `i18n.md`; a space before a colon only; plurals read correctly. |
| 5 | The phone sweep passes on every project in three languages with the Notice tab added | no | confirmed | `playwright test mobile-sweep` → 45 passed across phone, phone-webkit and tablet; `/admin/settings` is pinned in `pages-coverage.test.ts`. |
| 6 | Typecheck and lint are clean | no | confirmed | Typecheck ok; `pnpm lint` 44 warnings, no errors. |

**Overall:** met. Remark: the other Settings tabs are still English, so listing `/admin/settings` in `MIGRATED_ROUTES` is right only for the sweep's overflow and language checks, as the code comment says.

## Task 7 — End to end

Witnessed: 2026-10-21 11:36 EDT, by a fresh agent (blind). Commit: 273ce18c plus uncommitted changes (`notice.e2e.ts`, `notice.mobile.e2e.ts`, `home.e2e.ts`, the new end-to-end users). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The end-to-end tests pass on every project | no | confirmed | `playwright test notice` → 10 passed: 7 on chromium, one each on phone, phone-webkit and tablet. |
| 2 | Root sets a Warning notice and a member sees it on every page, as text, with an inline link | no | confirmed | `WARN:` on `/`, `/catalogue` and `/account/password`; `<b>not bold</b>` shown as typed; the link has its `href`; the sign-in page shows nothing. |
| 3 | The member dismisses it; it stays gone in that browser and not in another | no | confirmed | Click on the icon by name inside the box; gone on `/` and `/catalogue`; a second context of the same person still sees it. |
| 4 | Root edits it and it returns in the browser that dismissed it | no | confirmed | The same browser sees `INFO:` and the old text is gone. |
| 5 | Dismiss works without JavaScript | no | confirmed | A context with JavaScript off posts the form; the URL stays `/catalogue`, the banner is gone, also after a reload. |
| 6 | Hiding keeps the text and removes it for everyone; only root has the tab; a bad link is refused beside the field | no | confirmed | Text kept and Show unchecked; a fresh member context sees nothing; the member gets a 404; `aria-invalid` is true and nothing is saved. |
| 7 | The tests hide the notice again at the end | no | confirmed | `afterAll` on desktop and `finally` on phones; each phone project has its own root. |
| 8 | The phone and tablet test covers a long notice, the dismiss icon and the language | no | confirmed | No overflow with a 240-character word; the notice is above the h1; `smallTargets` filtered to "Dismiss" is empty; in Portuguese the icon is "Dispensar". |
| 9 | Home on a new instance | no | confirmed | `setup-wizard.e2e.ts` (task 5): the heading, the root text and both links. |
| 10 | Home on a populated instance | no | partly | No end-to-end test of its own at first. |
| 11 | The tests fail if the feature breaks | no | partly | By reading only at first. |

**Overall:** not met (rows 10 and 11). Fixed: `home.e2e.ts` added; the implementer ran a mutation (`isDismissed` returning true for any cookie), rebuilt, and the test "comes back in the browser that dismissed the old one" failed while the dismissal test passed; the file was restored.

### Re-check (rows 10 and 11)

Witnessed: 2026-10-21 11:45 EDT, by a fresh agent (blind re-check). Commit: 273ce18c plus uncommitted changes. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | Home on a populated instance has an end-to-end test | no | confirmed | `playwright test home.e2e notice` → 11 passed; `home.e2e.ts` checks the heading, no empty message, search then type links then Recently published by position, the Skill link to `/catalogue?type=skill`, no `type=bundle` link, and the search going to the catalogue. |
| 11 | The notice tests fail if the revision rule breaks | no | confirmed | The mutation run was the implementer's; the witness confirmed `notice-cookie.ts` is unmodified (`git diff` empty) and that the failed assertion (test 4) is exactly the revision rule, with test 3 covering the dismissal itself. |

**Overall:** met. Every claim of task 7 is confirmed.

## Task 8 — Decision log and index

Witnessed: 2026-10-21 12:00 EDT, by a fresh agent (blind). Commit: 301e9395 plus uncommitted changes (`docs/MVP/MVP.md`, `docs/features/README.md`, `PLAN.md`). Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §15 has a new row "Home and the instance notice" right after "Languages" | no | confirmed | `git diff docs/MVP/MVP.md` → one added line, after the Languages row and before Personal data. |
| 2 | Home's section order and the empty-section rule match the row | no | confirmed | `HomeView.tsx`: search, the type links (only with types), getting started, waiting (only if non-empty), favorites, pinned, recent, most used (only if non-empty). |
| 3 | Empty instance: root to the global workspace's page and New item; others to submit or ask a moderator | no | confirmed | `HomeView.tsx` links; the wording is in `empty.others`. |
| 4 | The limits: 500 characters, one line, up to 3 inline links, words 1 to 60 characters, `https://` or a single-`/` path, no HTML | no | confirmed | `notice-policy.ts` constants, the control-character check, `isNoticeHref` and the link pattern. |
| 5 | Information is light blue, Warning amber | no | confirmed | `Notice.tsx` and `tokens.css` (`--info` and its dark values). |
| 6 | Stored as `instance_settings.notice`, audited as `settings.notice` without the text | no | confirmed | `setNotice` records only tone, shown and revision; the action is in `audit-event.ts`. |
| 7 | The revision rises on message or tone, not on show or hide | no | confirmed | `settings.ts`: `revision = contentChanged ? from.revision + 1 : from.revision`. |
| 8 | Shown on every signed-in page, not on the sign-in page | no | confirmed | `visibleNotice` is called only in the `(app)` layout. |
| 9 | Dismissed with a ✕ icon inside the box, per browser, in `ronne-notice` as the revision | no | confirmed | `notice-cookie.ts`; the `action` slot inside `Notice.tsx`. |
| 10 | It is root's own text and is not translated | no | confirmed | The model's header comment; the banner reads the stored message. |
| 11 | The table still renders and no other row changed | no | confirmed | One line added, none removed; five columns, as its neighbours. |
| 12 | The features index row 124 reflects inline links and the icon, status `in progress` | no | confirmed | `git diff docs/features/README.md`: only that row changed. |
| 13 | `pnpm witness:check` passes | no | confirmed | It failed only for the missing pass of this task; with this block added, `pnpm witness:check` passes (run by the implementer on pasting). |

**Overall:** met. The index status becomes `done` after task 9.

## Task 9 — Documentation

Witnessed: 2026-10-21 11:50 EDT, by a fresh agent (blind). Commit: 0e027a84 (app) and the ronne-web branch `docs/marketplace-home-notice` at 6b44212, not pushed. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The ronne-web branch changes only the Overview and Administration pages in three languages, `topics.ts` and the product facts | no | confirmed | `git diff --stat origin/main` → those 8 files, 208 insertions and 4 deletions. |
| 2 | The `admin` sections in both `topics.ts` are `users, settings, notice, audit`, and `notice` exists in en, pt and fr | no | confirmed | The ronne-web diff and the app's `topics.ts`; the docs tests check this. |
| 3 | The English Notice section is true of the app: placement and access, fields and limits, tones, show and hide, preview and "Last changed by", dismissal, translation, audit | no | partly | All matched the code except one sentence: "Anything else between brackets stays plain text" was misleading, since a malformed link is refused on save. |
| 4 | The English Overview paragraph on Home is true (order, empty sections, empty instance) | no | confirmed | `HomeView.tsx` and `home.json`. One softer sentence, "first page after you sign in", was reworded. |
| 5 | The Portuguese and French pages say the same and use the app's labels and the glossary and typography | no | confirmed | Labels match `messages/{pt,fr}` exactly; a space before a colon only in French. |
| 6 | The helpers "Who sees this?" and the Warning line exist, link to `admin#notice` and are on the Notice tab; their answers are true | no | partly | Present and linked; the `notice` answer said "message, link or tone" though links are inline now. |
| 7 | The ronne-web tests, lint and typecheck pass; the app's helper link test passes | no | confirmed | `pnpm test` → 30 files, 173 tests; lint and typecheck clean; `vitest run src/components/help` → 10 passed. |

**Overall:** not met (rows 3 and 6, wording). Fixed: the website sentence now says a link with an address that isn't allowed, or more than 3 links, is refused when you save (three languages); the helper says "message or tone"; the Overview says Home is the page that opens by default after sign-in.

### Re-check (rows 3 and 6)

Witnessed: 2026-10-21 12:10 EDT, by a fresh agent (blind re-check). Commit: 00ec98a (the ronne-web clone) plus the app repo's uncommitted helper change. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The Message bullet says a link with a disallowed address, or more than 3 links, is refused on save, and says nothing false | no | confirmed | `noticeFrom` gives `link_address` and `too_many_links`; `see [note] now`, `a [x] (y) b` and `a [a](b` give no link match and are never refused. The bullet doesn't mention the label refusals: an omission, not a falsehood. |
| 6 | The helper answer is true | no | confirmed | `Help.tsx` says "message or tone"; `vitest run src/components/help` → 10 passed. |
| 4 | Home is the page that opens by default after sign-in | no | confirmed | `safeNextPath` returns `/` unless the sign-in carried a same-site `next` (`route-guard.ts`), read by the implementer to settle the witness's open point. |

**Overall:** met. Every claim of task 9 is confirmed.
