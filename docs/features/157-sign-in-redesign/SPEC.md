# 157 — Sign-in screens redesign

> Milestone: M27 · Depends on: 006, 022, 032, 105, 106, 129 · Design: the Stitch mocks `sigin-views` (owner, `docs/UI-Mocks-Materials`, git-ignored) · Contracts: none

## Goal

The pages before sign-in look like the product: a brand panel beside the form, the account sign-in
and the terminal (`rmk`) guide as two tabs, the second step as one box a digit, and one reusable
skeleton so the setup wizard and any later page sit on it.

## Scope

**In:**
- **`AuthShell`** (`components/auth-shell`): a brand panel on wide screens (hidden on phones), and on
  the right the language menu, the logo, the page, and a footer with the Documentation (new tab).
  The panel is always dark: the `code-bg` navy under the brand background (`signin-bg.jpg`, from the
  owner's brand folder, a static import so signed-out visitors can load it), a flat veil, the
  headline and two true highlights.
- **Sign-in** (`/sign-in`): two tabs, *Account sign in* and *Terminal (rmk)*. The terminal tab is
  the compact `CliAuthPanel`: the token and `--web` commands sit behind *Other ways to sign in*, and
  the workspace-name note is left out. Access tokens still shows the whole panel.
- **Provider buttons** carry the vendor's mark, by the provider's OIDC preset: Microsoft (Entra),
  Google, and a neutral key for the rest. The colours are `--mark-*` tokens.
- **Second step** (`/sign-in/two-factor`): in the same shell; the app's code is six boxes
  (`CodeInput`): a digit moves on, Backspace goes back, arrows move, a paste or an autofill spreads
  across the boxes, and the last digit submits once. Backup codes stay one text field.
- **Setup wizard** (`/setup`): in the same shell (`wide`); the form, its steps and the warning are
  unchanged, and the page no longer has a card of its own.
- **Language switch** is a menu (a native `<details>`, so it works without JavaScript) showing the
  language in use, so more languages need no room.

**Out:**
- The mock's invented content: the status line, "rmk v1.4.2", user counts, a company name.

## Behaviour

- Before JavaScript runs, `CodeInput` is a plain numeric field posting the same `code`, and the tabs
  show the account tab; the server actions are unchanged.
- After a refused code the boxes are emptied and the first one is focused.
- The panel image is decoration: no text, hidden from screen readers.

## Edge cases

- A provider whose preset has no mark gets the key icon; its button text is unchanged.
- A pasted code with spaces or dashes ("98 76 54") keeps only the digits.
- A fourth language adds a row to the language menu and changes nothing else.

## Documentation

None in the app's inline helpers: no helper is added or changed. The website's "Your account" topic
(`../ronne-web`, `www/src/content/docs/{en,pt,fr}/account.tsx`) is changed: *Signing in* says the page
has two tabs, the language menu and the Documentation link in a new tab; *Two-factor sign-in* says the
code is six boxes that send themselves; *Language* says menu where it said links. It goes live with
the release, in a ronne-web branch.

## Acceptance criteria

- [x] `/sign-in` and `/sign-in/two-factor` use `AuthShell`; the tabs, the compact terminal guide and
  the provider marks render (`sign-in.test.tsx`, `two-factor-step.test.tsx`).
- [x] The code boxes type, delete, move, paste and submit once, checked in a browser.
- [x] The language menu lists every locale and marks the one in use (`language-switch.test.tsx`).
- [x] Nothing invented stays from the mock; no raw colour outside tokens (`design-rules.test.ts`).
- [x] The phone layout is checked: sign-in (both tabs, the menu) at 375px, the setup wizard at 375px, and
  the phone and tablet e2e projects pass.
- [x] The website's Documentation pages for sign-in and two-factor are checked against the screens and
  changed (ronne-web `862ad9f`).
- [x] `/setup` uses `AuthShell`; the wizard e2e projects pass.
