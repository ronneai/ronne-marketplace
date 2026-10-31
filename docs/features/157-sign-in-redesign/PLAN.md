# 157 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is ticked once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)); none has a pass yet.

## Tasks

- [ ] **1. `AuthShell`.** The reusable split layout, the brand panel and its background, the footer.
  *Done when:* `/sign-in` and `/sign-in/two-factor` render inside it and `sign-in.test.tsx` passes.

- [ ] **2. Sign-in tabs and the compact terminal guide.** `Tabs` with the account form and
  `CliAuthPanel` (`framed={false}`, `compact`).
  *Done when:* both tabs render and the terminal tab fits a 900px-tall window.

- [ ] **3. Provider marks.** `ProviderIcon` and the `--mark-*` tokens; `signInProviders` returns the
  preset.
  *Done when:* the Entra button shows the Microsoft mark; `design-rules.test.ts` passes.

- [ ] **4. `CodeInput` and the second step.** Six boxes, paste, autofill, one submit.
  *Done when:* checked in a browser, and `two-factor-step.test.tsx` passes.

- [ ] **5. Language menu.** `LanguageSwitch` on `Disclosure` (`compact`); `languages.e2e.ts` opens
  the menu first.
  *Done when:* `language-switch.test.tsx` passes and the menu switches the language.

- [ ] **6. Phone check and Documentation.** The layout on a phone; the website's pages checked and
  changed.
  *Done when:* the two acceptance criteria are ticked, and ronne-web's `account.tsx` has the
  changes in en, pt and fr.

- [ ] **7. Setup wizard on `AuthShell`.** `/setup` inside the shell, `wide`; `SetupPage` loses its
  own card, logo and language switch.
  *Done when:* `setup.test.tsx` passes and the wizard e2e projects pass.

## Notes

- The brand background is the owner's file (`brand/signing-bg.png`), converted to a 154 KB JPEG
  because the app serves images unoptimized (no `sharp`).
