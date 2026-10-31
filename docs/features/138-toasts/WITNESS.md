# 138 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-10-30, by a fresh agent (blind). Commit: 1905ece7. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 has a row for the toasts decision | no | partly | `grep -n -i toast docs/MVP/MVP.md` → row at line 1009 in "## 15. Decision log", but named "Action feedback", not "Toasts" as SPEC.md:3 says |
| 2 | The MVP row says what SPEC.md says | no | confirmed | MVP.md:1009 → placement, announcement, errors persist, Sonner unstyled behind a `components/ui` wrapper, inline notices stay; "bottom centre" is looser than the spec's "across the bottom" |
| 3 | README lists 138 in M21 with its dependencies | no | confirmed | `docs/features/README.md:391` → depends on 032, 065, 067, 129, same as SPEC.md:3 |
| 4 | The README row says what SPEC says | no | confirmed | README:391 → Sonner unstyled with fallback, placement, durations, live regions, `flashToast` cookie with a key, inline field errors and one-time secrets |
| 5 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check` → exit 0 |

**Overall:** not met: the MVP.md §15 row is named "Action feedback", not "Toasts".

### Re-check

Witnessed: 2026-10-30 22:40 EDT, by a fresh agent (blind, re-check of claim 1 and the wording). Commit: 1905ece7 plus the uncommitted diff of docs/MVP/MVP.md line 1009. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 has a "Toasts" row, and README lists 138 in M21 with its dependencies; both say what the SPEC says | no | confirmed | `grep -n Toasts docs/MVP/MVP.md` → line 1009 `\| Toasts \| … across the bottom above the bottom bars on a phone …`; README.md:391 lists 138 with `032, 065, 067, 129`; SPEC.md:3 refers to MVP §15 ("Toasts") |
| 2 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check` → no errors |

**Overall:** met: the §15 row is now "Toasts" with "across the bottom", and the README and witness check agree with the SPEC.

## Task 2 — Sonner checked, the toast region and `useToast`

Witnessed: 2026-10-30 22:55, by a fresh agent (blind). Commit: d150ec68 plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Sonner is the latest stable and passes the dependency checklist | no | confirmed | `npm view sonner` → 2.0.8, MIT, published 2026-08-09; no install scripts; `pnpm audit --audit-level high` → none high; `pnpm licenses:check` → 353 packages allowed |
| 2 | happy-dom (new dev dependency) is acceptable | no | confirmed | 21.0.4, latest, MIT, 10 days old, no install scripts; licence check passes |
| 3 | Every label Sonner shows can come from our messages | no | confirmed | `Toaster.tsx` `customAriaLabel={t("region")}`; `ToastCard` draws its own close button with `t("close")`; en, pt, fr `common.json` have `toast` keys |
| 4 | Sonner can sit above `--bottom-bar-height` | no | can't check here | `grep bottom-bar-height apps/web/src` → no match; `BottomBar` does not publish it yet |
| 5 | The region is in the root layout, so every page has it | no | confirmed | `layout.tsx` renders `<Toaster />` inside `NextIntlClientProvider` |
| 6 | ok and info last 5 s; warning and error stay until closed | no | confirmed | `TOAST_DURATION` 5000/5000/Infinity/Infinity; tests pass; `ok: 9000` mutation failed 5 tests |
| 7 | Pause on hover, focus and a hidden tab | no | confirmed | three tests pass; removing the `focusin` listener failed the focus test |
| 8 | At most three; the fourth pushes out the oldest that isn't an error | no | confirmed | test passes; limit `>= 99` mutation failed it |
| 9 | The same message twice is one toast, timer restarted | no | confirmed | test passes; random id mutation failed it |
| 10 | The close button is labelled and works | no | confirmed | test finds `aria-label="Close notification"`; click removes only that toast |
| 11 | status/alert roles and the OK:/INFO:/WARN:/ERR: prefixes | no | confirmed | test passes; warning role `status` mutation failed it |
| 12 | A test finds the `status` and `alert` regions while idle | no | not met | idle DOM has one empty polite `<section>` and no `role=alert`; Sonner has a single live region |
| 13 | No shadow | no | partly | Sonner's shadow rules sit under `data-styled=true`; no test or computed-style check |
| 14 | Reduced motion | no | partly | Sonner's own CSS turns transitions off under `prefers-reduced-motion`; no test (browser check left to the e2e task) |
| 15 | A lint rule allows `sonner` imports only in the wrapper | no | confirmed | `import { toast } from "sonner"` in another file → `biome lint` 1 error, "import is restricted" |
| 16 | Lint and typecheck pass | no | confirmed | `biome check` 0 errors on the touched files; `tsc --noEmit` clean |
| 17 | Unit tests with fake timers cover lifetimes, pauses, limit and repeat | no | confirmed | `vitest run toast.test.tsx` → 9 passed; five mutations each failed a test |

**Overall:** not met: row 12 (no idle `alert` region).

### Re-check

Witnessed: 2026-10-30 22:55, by a fresh agent (blind, re-check). Commit: d150ec68 plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | The always-present polite region is in the page while idle and the boxes carry `status` and `alert` (changed Done when, SPEC Decision 6) | no | confirmed | SPEC.md Accessibility bullets and Decision 6; `toast.test.tsx` idle test finds `section[aria-live=polite]` named "Notifications" and the roles test passes |
| 4 | A toast can sit above `--bottom-bar-height` | no | partly | `Toaster.tsx` offsets use `var(--bottom-bar-height, 0px)`; the test reads the style string only |
| 13 | No shadow | no | partly | `toast.test.tsx` asserts `data-styled="false"`; either `custom` or `unstyled` alone gives it |
| – | The test file passes; lint and typecheck pass | no | confirmed | 11 passed; `biome check` clean; typecheck no errors |

**Overall:** not met: rows 4 and 13 are partly.

### Re-check 2

Witnessed: 2026-10-30 22:55, by a fresh agent (re-check of rows 4 and 13, with mutations). Commit: d150ec68 plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | No shadow: Sonner's styling is off, and the test fails without that | no | confirmed | `vitest run toast.test.tsx` → 11 passed; `toastOptions={{}}` and `sonner.success` instead of `sonner.custom` together → the "unstyled" test fails; each alone still passes, as either is enough to switch Sonner's styling off |
| 4 | The offset reads `--bottom-bar-height` and a test sees it in the region's style (scoped by PLAN.md task 2: the box above a real bar is task 3) | no | confirmed | removing `var(--bottom-bar-height…)` from `ABOVE_BAR` → exactly that test fails; restored → 11 pass |

**Overall:** met: rows 4 and 13 are confirmed within the scope PLAN.md states; row 14 (reduced motion) rests on Sonner's own CSS and its browser check is task 3's and the e2e task's.

## Task 3 — Placement on phones and above the bottom bar

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 36f0984d plus the uncommitted work. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Desktop: bottom right, 16px from the edges, at most 24rem wide | no | confirmed | `playwright test e2e/toast.e2e.ts --project chromium` → 1 passed |
| 2 | Phone: across the bottom with a 16px gutter, above the bar with 12px of air | no | confirmed | `toast.mobile.e2e.ts` on phone and phone-webkit → 2 passed each |
| 3 | Tablet: in the corner, above the bar | no | confirmed | `toast.mobile.e2e.ts --project tablet` → 2 passed; `BottomBar.tsx` publishes the distance from the bar's top to the screen bottom |
| 4 | `BottomBar` sets `--bottom-bar-height` and the region reads it | no | confirmed | `BottomBar.tsx:57-70`; `Toaster.tsx:14` |
| 5 | The value goes back to 0 or is removed when the bar is hidden or unmounted | no | partly | code reads right; no test unmounts the bar |
| 6 | The safe-area term is in the offsets | no | partly | `env(safe-area-inset-bottom, 0px)` in `Toaster.tsx`; no test |
| 7 | The toast is on top over a modal dialog, above its buttons on a phone | no | confirmed | `toastIsOnTop` in the desktop and mobile tests; the toast is 12px above `[data-dialog-actions]` on a phone |
| 8 | The styleguide has a Toasts section with a bottom bar demo | no | confirmed | `ToastDemo.tsx`, `Styleguide.tsx`, `DialogDemo.tsx` |
| 9 | A test checks the box on desktop, phone, phone-webkit and tablet and fails if the toast overlaps the bar | no | partly | tests pass in all four projects; no mutation run |
| 10 | The mobile sweep passes | no | not met | `mobile-sweep.mobile.e2e.ts --project phone` → 11 passed, 1 failed (a 90 s timeout in `page.evaluate`) |

**Overall:** not met: row 10, and rows 5, 6 and 9 only read from the code.

### Re-check

Witnessed: 2026-10-31 09:05 EDT, by a fresh agent (blind, re-check). Commit: 36f0984d plus the uncommitted work. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | The mobile sweep passes, and no hang comes from the diff | no | confirmed | `playwright test e2e/mobile-sweep.mobile.e2e.ts --project phone` → 15 passed (50.5 s) with no sleep overlapping (`pmset -g log`); the earlier hangs overlapped the Mac's maintenance sleep (00:53 to 01:00) |
| 5 | The value goes back to 0 or is removed when the bar is hidden or unmounted | no | confirmed | `vitest run bottom-bar.test.tsx toast.test.tsx` → 13 passed; dropping `removeProperty` failed "is 0 while the bar is not shown, and gone when it is removed" |
| 6 | The safe-area term is in the offset and a test asserts it | no | confirmed | removing the term from `Toaster.tsx` failed "reads the bottom bar's height…"; restored, `cmp` identical |
| 9 | The e2e fails if the toast overlaps the bar | no | partly | unmutated phone and tablet pass; the mutation was not re-run in this pass |
| 3 | On a tablet the toast clears the bar and what is under it | no | partly | the passing tablet test; the mutation was not re-run |

**Overall:** not met: rows 9 and 3 rest on the implementer's own mutation result.

### Re-check 2

Witnessed: 2026-10-31, by a fresh agent (blind, rows 9 and 3, mutation done by the witness). Commit: 36f0984d plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | "a toast sits above the action bar" fails without the `--bottom-bar-height` term | no | confirmed | both `calc(var(--bottom-bar-height, 0px) + ` replaced by `calc(0px + `, `next build`: tablet failed (expected <= 870, received 1008), phone failed (expected <= 766, received 823); restored, `cmp` identical, rebuilt, both pass |
| 3 | The case "the app's bottom navigation sits under the bar" is exercised on the tablet | no | partly | the toast sat at the viewport bottom (1008) when mutated and the bar's top is 142 px above it; the bar's own bottom edge was not read |

**Overall:** not met: row 3 is partly confirmed.

### Re-check 3

Witnessed: 2026-10-31, by a fresh agent (blind, row 3 only). Commit: 36f0984d plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | On a tablet the toast clears the bar and what is under it | no | confirmed | `toast.mobile.e2e.ts:25-27` asserts, on the tablet project, more than 40 px between the bar's bottom and the screen edge; line 28 asserts the toast ends 12 px above the bar; `playwright test e2e/toast.mobile.e2e.ts --project tablet -g "action bar"` → 1 passed; `Toaster.tsx` identical to its backup |

**Overall:** met: rows 3, 5, 6, 9 and 10 are confirmed by Re-check, Re-check 2 and this pass; the box tests pass on desktop, phone, phone-webkit and tablet.

## Task 4 — Flash toasts after a redirect

Witnessed: 2026-10-31 09:30, by a fresh agent (blind). Commit: afb6b7cb plus the uncommitted work. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `flashToast` sets `ronne-toast` with path `/`, 30 s and SameSite=Lax, holding a key and never the text | no | confirmed | `flash-toast.ts` options; `flash-toast.test.ts` asserts them; the value does not contain "Draft deleted" |
| 2 | `FlashKey` is a typed list; unknown keys and unparseable cookies are ignored | no | confirmed | `flash.ts:20`; removing the key check failed 2 tests |
| 3 | Unit tests cover a good cookie, an unknown key and bad JSON | no | confirmed | `vitest run` of the task's test files → 21 passed |
| 4 | Unit tests cover an oversized value | no | partly | removing `value.length > FLASH_MAX_LENGTH` left all 21 tests passing: the fixture was already rejected by the 200-character parameter cap |
| 5 | Parameter validation is tested | no | confirmed | removing the type check failed 2 tests, the length cap 1, the name check 1 |
| 6 | Markup in a parameter is shown as text | no | partly | only `parseFlash` kept the string; no test rendered markup into the DOM |
| 7 | Read once and deleted; the toast shows once | no | confirmed | unit test: no `ronne-toast` after showing, a re-render gives one toast; e2e: cookie gone, a reload shows none |
| 8 | An e2e test redirects and sees the toast once | no | confirmed | `playwright test e2e/flash-toast.e2e.ts` → 2 passed; "OK:Draft deleted" |
| 9 | The e2e shows it in Portuguese for a person who chose it | no | confirmed | `ronne-locale=pt`, Portuguese UI, "OK:Rascunho excluído" |
| 10 | An edited cookie shows nothing | no | confirmed | e2e: unknown key, nested param, `<script>` text → 0 toasts, `window.__flash` undefined |
| 11 | Nothing sensitive is in the cookie | no | confirmed | both callers pass no parameters |
| 12 | The layout shows the flash only when ready; a failed page does not consume the cookie | no | partly | by reading; not run |

**Overall:** not met: rows 4 and 6 only half covered by tests.

### Re-check

Witnessed: 2026-10-31 09:20, by a fresh agent (blind re-check). Commit: afb6b7cb plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | A value over the size limit is ignored, even if every part of it is valid | no | confirmed | five valid 199-character parameters; removing the `FLASH_MAX_LENGTH` check failed "ignores a value over the size limit…" |
| 6 | A parameter is shown as text, never as markup | no | confirmed | `flash-toast-markup.test.tsx` with the real ICU formatter; `dangerouslySetInnerHTML` in `ToastCard` failed it |
| 12 | The layout shows the flash only when ready; a failed page keeps the cookie; JavaScript off | no | partly | by reading |

**Overall:** not met: row 12 only read from the code.

### Re-check 2

Witnessed: 2026-10-31, by a fresh agent (blind re-check). Commit: afb6b7cb plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12b | A failed page does not consume the cookie | no | partly | read from the code; no failed-page run |
| 12c-i | The real Set-Cookie carries `Max-Age=30`, `SameSite=Lax`, `Path=/` and the key, not the text | no | confirmed | `playwright test e2e/flash-toast.e2e.ts` → 3 passed; test 1 asserts the header |
| 12c-ii | With JavaScript off nothing shows, the page renders and the cookie stays | no | confirmed | test 3, `javaScriptEnabled: false` |

**Overall:** not met: 12b only read from the code.

### Re-check 3

Witnessed: 2026-10-31, by a fresh agent (blind re-check). Commit: afb6b7cb plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12b-i | A flash cookie for a page that fails to render is read and dropped by the next page that has the region, shown once, late | no | confirmed | `playwright test e2e/flash-toast.e2e.ts` → 4 passed; the 404 test expects status 404, one toast, the cookie gone, none on the next page |
| 12b-ii | The cookie expires after 30 seconds | no | confirmed | test 1 asserts `Max-Age=30` on the real header; `FLASH_MAX_AGE = 30` in `flash.ts:10`, used at `flash-toast.ts:29` |

**Overall:** met: rows 4, 6 and 12 are confirmed by the re-checks; the four Playwright tests pass.

### Adversarial

Witnessed: 2026-10-31 09:30, by a fresh agent (adversarial). Commit: afb6b7cb plus the uncommitted work. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The key must be on the typed list; Object.prototype names can't fool the check | no | confirmed | probe: `toString`, `__proto__`, an array as the key, and `constructor`, `toString`, `null` as the kind → null |
| 2 | Bad JSON, an array or null `p`, NaN, 1e999, deep nesting, a long id and an oversized value are ignored | no | confirmed | probe: null in each case; the 1024-character cap at `flash.ts:44` |
| 3 | Parameter names can't carry `__proto__` | no | confirmed | probe: `__proto__` → null; `constructor` accepted as an own property, prototype unchanged |
| 4 | Parameters are plain text: markup and ICU syntax in a value never become HTML or message syntax | no | confirmed | probe; `flash-toast-markup.test.tsx` passes; the only message has no placeholder |
| 5 | The unit tests catch the removal of each check | no | confirmed | removing the key check, the size cap and the name check failed 4 of 10 tests |
| 6 | 30 s, SameSite=Lax, path `/`, a key and no text | no | confirmed | the e2e reads the real `Set-Cookie`; each call gets a fresh `randomUUID` |
| 7 | Read once and deleted | no | confirmed | e2e: no `ronne-toast` after the toast; a reload shows none |
| 8 | The e2e redirects and sees the toast once, in Portuguese for a person who chose it | no | confirmed | "OK:Draft deleted", then "OK:Rascunho excluído" with `ronne-locale=pt` |
| 9 | A hostile cookie shows nothing and runs nothing | no | confirmed | three tampered cookies → 0 toasts, `window.__flash` undefined |
| 10 | The layout does not read the cookie when the app is not ready | no | confirmed | `layout.tsx:57` |
| 11 | Nothing sensitive is in the cookie | no | confirmed | both callers pass no parameters |
| 12 | Without JavaScript nothing breaks | no | confirmed | e2e test 3 |
| 13 | Two tabs: each shows a flash at most once, and a second tab shows nothing but the message | no | partly | reasoned from the code, not run |

**Overall:** met: all attempts to break the claims failed; row 13 was only reasoned.

### Adversarial re-check

Witnessed: 2026-10-31 09:45, by a fresh agent (adversarial re-check, row 13). Commit: afb6b7cb plus the uncommitted work. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | Each tab shows a flash at most once, and a second tab shows nothing but the message; across tabs the worst case is one duplicate | no | confirmed | a temporary two-tab spec (deleted afterwards, `git status` unchanged): (a) delete in tab A with both tabs open → A 1 toast, B 0, none after B reloads; (b) a valid cookie then `Promise.all([A.goto, B.goto])` → 1 toast in each, both "OK:Draft deleted" |

**Overall:** met: no tab showed a flash twice and the only text was "Draft deleted"; two tabs loading at the same moment while the cookie is still there each show it once.

## Task 5 — The sweep: confirmations become toasts

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 75bdeed1 plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The confirming `state.done` notices became toasts (two-factor off, member controls, user dialogs, user workspaces, token revoke, erase user, workspace dialogs, scope dialogs, move item, move scope, seven settings forms) | no | confirmed | `grep -rn "state.done" apps/web/src`: each site calls `useToastWhen(state, state.done, …)`; dialogs pass `onDone` and return null |
| 2 | The `state.done` sites still on screen are within the spec's Out list or a page/row state | no | partly | `ItemMovesTable.tsx:37` (an approved move) and `GettingStartedPanel` are not in `toasts.md` |
| 3 | save draft, submit, withdraw, approve, request changes, reject, release, deprecate, yank and settings saved say a toast | no | partly | all found except a single (non-bulk) release toast |
| 4 | Bulk approve and bulk release keep their summary and add a count toast and an error toast | no | confirmed | `BulkApprove.tsx`, `BulkRelease.tsx`: `approvedMany` / `notApprovedMany`, `releasedMany` / `notReleasedMany` |
| 5 | The one-time password and backup codes are not toasts | no | confirmed | `UserActionDialogs.tsx` keeps `OneTimePassword`; `SetupFlow.tsx` untouched |
| 6 | Errors of row and bulk actions without a form are error toasts | no | partly | only the two bulk-failure counts were error toasts |
| 7 | The Notice form without JavaScript still shows its result | no | confirmed | `NoticeForm.tsx`: `fresh = state !== initial`; the result is shown in place for the initial state |
| 8 | Messages exist in all three languages | no | confirmed | `messages/{en,fr,pt}/common.json` `done`; the `src/i18n` tests pass |
| 9 | Component tests expect the toast instead of the notice | no | partly | no test covers the toasts of submit, decisions, bulk, versions |
| 10 | Unit tests, lint and typecheck pass | no | confirmed | `vitest run src/features src/components/ui src/i18n` → 1772 passed; `tsc` clean |
| 11 | The e2e sample passes | no | confirmed | `scopes`, `user-admin`, `move-item` on chromium; `move-scope.mobile` on phone and tablet |
| 12 | `docs/knowledge/toasts.md` lists the rules | no | confirmed | the file exists with the table of when to use a toast, a notice or a dialog |

**Overall:** not met: rows 2, 3, 6 and 9 are partly.

### Re-check

Witnessed: 2026-10-31 10:25 EDT, by a fresh agent (blind re-check, rows 2, 3, 6, 9). Commit: 75bdeed1 plus the uncommitted work. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The `state.done` sites kept on screen are out of scope under SPEC "Out" | no | confirmed | `toasts.md` lists the move approval and "Cancelled." rows, the thank-you page, Getting started progress and the single release's result (version, tag, sha256) |
| 3 | A single release also says a toast | no | confirmed | `PublishDialog.tsx`: `toast.ok(said("released"))`; `review.e2e.ts` asserts it |
| 6 | Errors of row and bulk actions without a form are error toasts | no | partly | converted: item move approve, scope and item move cancel; still inline: cancel request, member role, a queue row's reject lookup, the favourite star, the feedback inbox bulk bar, Propose change |
| 9 | The new toasts have tests that fail without them | no | partly | e2e assertions exist; removing the item-move approve toast failed `done-toasts.test.tsx`; the token-revoked toast had no test |

**Overall:** not met: rows 6 and 9 are partly.

### Re-check 2

Witnessed: 2026-10-31 10:45 EDT, by a fresh agent (blind re-check, rows 6 and 9). Commit: 75bdeed1 plus the uncommitted work. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Errors of row and bulk actions without a form are error toasts | no | partly | cancel request, member role, row decision lookup and the star converted; `item-page/ProposeButton.tsx` still inline |
| 9 | Tests cover the new toasts, including token revoked as a flash | no | confirmed | `flashToast("tokenRevoked")`; removing it failed `account-tokens.test.tsx`; the revoke step of `access-tokens.e2e.ts` passed; the Released toast is covered by `review.e2e.ts:117` only, which the witness accepts |

**Overall:** not met: row 6 is partly.

### Re-check 3

Witnessed: 2026-10-31 10:55 EDT, by a fresh agent (blind re-check, row 6). Commit: 75bdeed1 plus the uncommitted work. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Errors of row and bulk actions without a form are error toasts, apart from the documented exceptions | no | partly | the Propose change exception is true (`ProposeRefusal` carries an Ask to join link and a Help) and is in `toasts.md:21`; `admin-feedback/InboxSelection.tsx` bulk bar still showed a failure and a notice inline |

**Overall:** not met: the feedback inbox bulk bar still inline.

### Re-check 4

Witnessed: 2026-10-31 11:05 EDT, by a fresh agent (blind re-check, row 6). Commit: 75bdeed1 plus the uncommitted work. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Errors and notices of row and bulk actions without a form are toasts, apart from the documented exceptions | no | confirmed | `InboxSelection.tsx:53-63` `toast.ok` / `toast.error`, the two `<p>` in `BulkBar` gone; `vitest run src/features/admin-feedback` → 12 passed; `playwright test e2e/feedback.e2e.ts --project=chromium` → 5 passed; a re-grep of `role="alert"`, `role="status"`, `setNotice(`, `FieldError`, `state.error` in client components found only documented exceptions, dialogs, results and live regions |

**Overall:** met: rows 2, 3, 6 and 9 are confirmed by the re-checks; rows 1, 4, 5, 7, 8 and 10 to 12 were confirmed by the first pass and the sites they name were not changed since. Full runs on the final build: chromium 166 passed, phone, phone-webkit and tablet 54 each.

## Task 6 — Messages

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 78e159dc. Machine: macOS (Darwin), Node as installed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The feature added keys to en, pt and fr, and all three have the same set | no | confirmed | `git diff d150ec68^..HEAD -- apps/web/messages` → only `common.json`, with the same blocks in each language: `toast` (region, close, four prefixes), `flash` (draftDeleted, tokenRevoked) and `done` (17 keys) |
| 2 | The ICU placeholders match across languages | no | confirmed | the only placeholders are the `{count, plural, …}` of the four `*Many` keys, with one and other in all three languages; `pnpm vitest run src/i18n` → 20 files, 378 tests passed (parity, raw-text, untranslated) |
| 3 | Every key the code uses exists | no | confirmed | `common.toast`, `common.flash` (`FLASH_KEYS` is `draftDeleted`, `tokenRevoked`) and `common.done` (17 keys used) all present |
| 4 | The added components have no raw on-screen text | no | confirmed | grep of `Toaster`, `ToastCard`, `FlashToastClient` found only CSS classes and `calc()` constants |
| 5 | The styleguide's ToastDemo is English only by decision | no | confirmed | SPEC 133 line 62: "The styleguide stays English and out of the rule (owner, 2026-10-27)" |
| 6 | The pt and fr wording follows the existing glossary | no | confirmed | Aprovado / Approuvé, Rejeitado / Rejeté, Lançado / Publié, Submetido / Soumis, Arquivado / Archivé, obsoleta / obsolète, retirada / retirée, Revogado / Révoqué, and the AVISO: / ERRO: and "ATTENTION :" / "ERREUR :" prefixes match existing messages |
| 7 | `pnpm i18n:review` shows the new keys | no | confirmed | wrote 15 namespaces, 3125 messages; `common.md` lists `toast.region`, `toast.close`, the four `toast.prefix.*`, `flash.draftDeleted`, `flash.tokenRevoked` in three columns |
| 8 | Lint passes on the touched message files | no | confirmed | `pnpm exec biome check apps/web/messages` → 45 files, no fixes applied |

**Overall:** met: the new keys exist in all three languages, the placeholders match, the code uses only keys that exist, and the parity and raw-text tests pass.
