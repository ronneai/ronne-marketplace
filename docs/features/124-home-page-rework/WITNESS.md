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
