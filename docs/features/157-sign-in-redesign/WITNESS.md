# 157 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — AuthShell

Witnessed: 2026-10-30 20:40 EDT, by a fresh agent (blind). Commit: f4cd002e. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `/sign-in` renders inside AuthShell | no | confirmed | `SignInPage.tsx:101` wraps it in `<AuthShell>`; Playwright on :3000 showed the brand panel, language menu, logo and footer |
| 2 | `/sign-in/two-factor` renders inside AuthShell | no | confirmed | `app/sign-in/two-factor/page.tsx` wraps it in `<AuthShell>`; not loaded in a browser in this pass (see task 4's re-check) |
| 3 | `sign-in.test.tsx` passes | no | confirmed | `vitest run src/features/sign-in/sign-in.test.tsx src/app/sign-in src/components/cli-auth` → 3 files, 26 passed |
| 4 | The brand panel shows on wide screens and hides on phones | no | confirmed | Playwright: `aside` visible at 1440x900, not at 375x800; `hidden … lg:flex` |
| 5 | Right column: language menu, logo, page, footer with Documentation in a new tab | no | confirmed | Documentation link `target=_blank`, `rel=noopener noreferrer`, href `https://www.ronne.ai/en/marketplace/docs` |
| 6 | Panel is `code-bg` navy under `signin-bg.jpg` (static import) with a flat veil | no | confirmed | `AuthShell.tsx` imports `./signin-bg.jpg`, `bg-code-bg`, `bg-code-bg/40` veil; the image URL under `/_next/static/media/` returned 200 `image/jpeg` |
| 7 | The image is decoration: no text, `aria-hidden` | no | confirmed | Image and veil divs have `aria-hidden="true"`, no text |
| 8 | Headline and two true highlights, nothing invented from the mock | no | confirmed | `common.json` `authShell`: no status line, "rmk v1.4.2", user counts or company name |

**Overall:** met.

## Task 2 — Sign-in tabs and the compact terminal guide

Witnessed: 2026-10-30 20:40 EDT, by a fresh agent (blind). Commit: f4cd002e. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both tabs render: 'Account sign in' and 'Terminal (rmk)' | no | confirmed | Playwright `getByRole("tab")` → both names; `auth.json:40-41` |
| 2 | The terminal tab is the compact CliAuthPanel: token and `--web` commands behind 'Other ways to sign in', workspace note left out | no | confirmed | `SignInPage.tsx:105` passes `compact`; `CliAuthPanel.tsx` puts them in `<details>` and skips `globalHint`; no text matching /workspace/ |
| 3 | Access tokens still shows the whole panel | no | confirmed | `TokensPage.tsx:100` renders `<CliAuthPanel linkToTokens={false} registry={registry} />`, `compact` off |
| 4 | The terminal tab fits a 900px-tall window | no | partly | At 1440x900 and 1280x900 `scrollHeight` was 909 against `innerHeight` 900: 9px of scroll |
| 5 | No horizontal overflow at 375px | no | confirmed | `scrollWidth` 375 at 375x800; panel hidden |

**Overall:** not met: claim 4 overflowed by 9px; the shell's padding is trimmed in 131bf12b.

### Re-check, Task 2

Witnessed: 2026-10-30 21:10 EDT, by a fresh agent (blind re-check, only the claims that weren't confirmed). Commit: 131bf12b. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | With Terminal (rmk) selected, `/sign-in` fits a 900px-tall window at 1440x900 and 1280x900 | no | confirmed | Playwright against :3000 → `scrollHeight` 900, `innerHeight` 900 at both sizes; width equals the viewport |

**Overall:** met.

## Task 3 — Provider marks

Witnessed: 2026-10-30 20:33 EDT, by a fresh agent (blind). Commit: f4cd002e. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Entra button shows the Microsoft mark | no | confirmed | `ProviderIcon.tsx` four squares `--mark-ms-*` for `entra`; `sign-in.test.tsx:162` asserts `fill-(--mark-ms-red)` |
| 2 | Google gets its own mark | no | confirmed | four paths `--mark-g-*`; the test asserts `fill-(--mark-g-red)` |
| 3 | Any other preset gets the neutral key; the button text is unchanged | no | confirmed | `KeyRound` fallback; test asserts `lucide-key-round`; "Continue with Acme SSO" test still passes |
| 4 | The colours are `--mark-*` tokens in both themes | no | confirmed | `tokens.css:65-73` and `:153-161`, 8 tokens each; the icons use only `fill-(--mark-*)` |
| 5 | `signInProviders` returns the preset | no | confirmed | `password-policy.ts:42-45` selects `id, name, preset`; `.db.test.ts:144` passed on SQLite |
| 6 | `design-rules.test.ts` passes | no | confirmed | `vitest run src/design-rules.test.ts src/features/sign-in/sign-in.test.tsx src/server/domains/identity/actions/password-policy.db.test.ts` → 3 files, 33 passed |

**Overall:** met.

## Task 4 — CodeInput and the second step

Witnessed: 2026-10-30 20:45 EDT, by a fresh agent (blind). Commit: f4cd002e. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `two-factor-step.test.tsx` passes | no | confirmed | `vitest run src/features/sign-in/two-factor-step.test.tsx` → 13 passed |
| 2 | `/sign-in/two-factor` renders in the AuthShell | no | partly | `page.tsx:28` wraps it; the e2e reaches the page; the unit test renders only a bare `AuthShell`; not seen in a browser |
| 3 | The code is six boxes and the first is focused | no | confirmed | Browser probe: six `input[id^="code-"]`, `code-0` focused |
| 4 | A digit moves on | no | confirmed | Typed "123" → `1|2|3|||`, focus on `code-3` |
| 5 | Backspace goes back | no | confirmed | Backspace on empty `code-3` → focus `code-2`, previous box cleared |
| 6 | Arrows move | no | confirmed | ArrowLeft `code-2`→`code-1`; ArrowRight twice → `code-3` |
| 7 | A paste of "98 76 54" keeps the digits and submits once | no | confirmed | One POST, `_1_code` = `987654` |
| 8 | Autofill into the first box spreads and submits once | no | confirmed | `fill("12-34 56")` → one POST, `123456`; a correct TOTP signed in |
| 9 | After a refused code the boxes empty and the first is focused | no | confirmed | After `wrong_code`: six empty boxes, focus `code-0` |
| 10 | Backup codes stay one text field | no | confirmed | `two-factor-step.test.tsx:147` (`maxLength="32"`); the e2e backup path passes |
| 11 | Before JavaScript runs it is a plain numeric field posting `code` | no | partly | SSR test shows `id="code" name="code" inputMode="numeric"`; not posted from a browser with JavaScript off |
| 12 | `two-factor.e2e.ts` passes on chromium | no | confirmed | `playwright test e2e/two-factor.e2e.ts --project chromium` → 1 passed |
| 13 | `two-factor.mobile.e2e.ts` passes | no | can't check here | Only chromium was run |

**Overall:** not met: claims 2, 11 and 13 were not fully checked.

### Re-check, Task 4

Witnessed: 2026-10-30 21:10 EDT, by a fresh agent (blind re-check, only the claims that weren't confirmed). Commit: 131bf12b. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `/sign-in/two-factor` renders inside AuthShell in a browser | no | confirmed | Signed-in two-factor user: at 1280x800 brand panel, logo, language menu; at 375x800 panel hidden |
| 2 | With JavaScript off the plain numeric field posts `code` | no | confirmed | `javaScriptEnabled:false`: one visible input `name=code inputmode=numeric`; POST has `code` and `method=totp`; then signed in |
| 3 | `two-factor.mobile` and `device.mobile` pass on phone, phone-webkit and tablet | no | confirmed | `playwright test e2e/two-factor.mobile.e2e.ts e2e/device.mobile.e2e.ts --project <p>` → 2 passed on each |
| 4 | `device.e2e.ts` passes on chromium | no | confirmed | chromium run → ✓ (22s), 13 tests passed |

**Overall:** met.

## Task 5 — Language menu

Witnessed: 2026-10-30 20:45 EDT, by a fresh agent (blind). Commit: f4cd002e. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `language-switch.test.tsx` passes | no | confirmed | `vitest run src/i18n/language-switch.test.tsx src/features/setup` → 5 files, 32 passed |
| 2 | The switch is a native `<details>` menu, so it works without JavaScript | no | confirmed | `LanguageSwitch.tsx` renders `Disclosure compact`; each language is a plain `<a href="/language?set=…&next=…">` |
| 3 | It shows the language in use and lists every locale, marking the current one | no | confirmed | Live :3000 at 375px: summary "English", links English, Português, Français, check on English |
| 4 | The menu switches the language | no | partly | `e2e/languages.e2e.ts` read but not run in this pass |
| 5 | `Disclosure` has a `compact` prop | no | confirmed | `Disclosure.tsx:19,28,72`, `w-48 p-1` |

**Overall:** not met: claim 4 needed the e2e run.

### Re-check, Task 5

Witnessed: 2026-10-30 21:10 EDT, by a fresh agent (blind re-check, only the claims that weren't confirmed). Commit: 131bf12b. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The menu switches the language | no | confirmed | `playwright test e2e/languages.e2e.ts --project chromium` → 12 passed, including the pick-before-sign-in, saved-language and no-JavaScript tests |

**Overall:** met.

## Task 6 — Phone check and Documentation

Witnessed: 2026-10-30 20:45 EDT, by a fresh agent (blind). Commit: f4cd002e. Machine: macOS (Darwin 27), Node v24. ronne-web `862ad9f`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `/sign-in` at 375px has no horizontal overflow (both tabs, menu open) | no | confirmed | Playwright against :3000: `scrollWidth` = 375 in all four states |
| 2 | `/sign-in/two-factor` and `/setup` at 375px | no | can't check here | No two-factor user, and `/setup` redirects on the configured instance |
| 3 | ronne-web `account.tsx` changed in en, pt and fr | no | confirmed | `git diff main..docs/157-sign-in-screens` → 3 files, +49 −11 |
| 4 | The statements match the app: tab names, Documentation, menu | no | confirmed | `messages/{en,pt,fr}/auth.json:40-41`, `common.json:123` |
| 5 | The statements match the app: six boxes, sixth digit sends, paste, reset, backup one field | no | confirmed | `CodeInput.tsx`, `TwoFactorStep.tsx` |
| 6 | "Backspace goes back" | no | partly | It goes back only from an empty box; the docs said it without the condition |
| 7 | pt and fr match en and the app's wording | no | not met | pt: "os menu" and "ele definem" |

**Overall:** not met: claims 2, 6 and 7; ronne-web `a95f223` fixes the wording.

### Re-check, Task 6

Witnessed: 2026-10-30 21:10 EDT, by a fresh agent (blind re-check, only the claims that weren't confirmed). Commit: 131bf12b. Machine: macOS (Darwin 27), Node v24. ronne-web `a95f223`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `/sign-in` has no overflow at 375px, both tabs | no | confirmed | `scrollWidth` 375 of 375 on both tabs |
| 2 | `/sign-in/two-factor` has no overflow at 375px | no | confirmed | Probe in the phone project: `scrollWidth` 375, `innerWidth` 375; screenshot shows six boxes, Verify, backup link and footer inside the screen |
| 3 | The setup wizard has no overflow at 375px | no | confirmed | `wizard` project, `/` → `/setup`: `scrollWidth` 375 of 375 |
| 4 | The `account.tsx` text matches `CodeInput.tsx` | no | confirmed | six boxes, auto-advance, Backspace in an empty box goes back, paste fills, sixth digit submits, reset and refocus all match |
| 5 | pt and fr grammar | no | confirmed | pt: "o menu de idioma", "numa caixa vazia volta", "ele define o cookie"; fr: "le menu de langue", "il définit le témoin" |

**Overall:** met.

## Task 7 — Setup wizard on AuthShell

Witnessed: 2026-10-30 20:45 EDT, by a fresh agent (blind). Commit: f4cd002e. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `src/features/setup` tests pass | no | confirmed | `vitest run src/i18n/language-switch.test.tsx src/features/setup` → 5 files, 32 passed |
| 2 | `/setup` uses `AuthShell wide` and the page has no card of its own | no | confirmed | `git show f4cd002e`: `page.tsx` wraps `<SetupPage>` in `<AuthShell wide>`; `SetupPage.tsx` drops `Panel`, `BrandLogo`, `<main>` and `languageSwitch` |
| 3 | The e2e specs don't rely on the removed markup | no | confirmed | `setup-wizard*.e2e.ts` and `setup-nojs.e2e.ts` select `form[data-setup=wizard]`, `li[data-step]`, inputs, headings and buttons only |
| 4 | The `wizard` and `wizard-nojs` e2e projects pass | no | can't check here | No e2e run allowed in this pass |
| 5 | The wizard at 375px | no | can't check here | No unconfigured instance |

**Overall:** not met: claims 4 and 5 needed an e2e run.

### Re-check, Task 7

Witnessed: 2026-10-30 21:10 EDT, by a fresh agent (blind re-check, only the claims that weren't confirmed). Commit: 131bf12b. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `playwright test --project wizard --project wizard-nojs` passes | no | confirmed | 4 passed (pt and fr language tests, the wizard setup, the no-JavaScript setup) |
| 2 | `vitest run src/features/setup` passes | no | confirmed | 4 files, 28 passed |

**Overall:** met.

