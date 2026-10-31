# 138 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §15 has the "Toasts" row, and `docs/features/README.md` lists 138 in M21 with its
    dependencies.
  - *Done when:* both say what this spec says, and `pnpm witness:check` passes.

- [x] **2. Sonner checked, the toast region and `useToast`.**
  - Sonner's latest stable version through the [dependency policy](../../policies/dependencies.md)
    checklist (licence, release age, no known vulnerabilities, no install scripts).
  - Before building on it, check that every label it shows can come from our messages and that it
    can sit above `--bottom-bar-height` on a phone (here: Sonner takes the offset as CSS and a test
    reads it in the region's style; the box above a real bar is task 3's Playwright check). If not, stop and take decision 4's fallback (our
    own component behind the same wrapper), saying so in the spec.
  - `Toaster` in unstyled mode in the root layout, `useToast()` with `ok`, `info`, `warning` and
    `error`; timers, pause on hover, focus and a hidden tab; at most three; the same message
    restarts its timer; the close button. A lint rule allows `sonner` imports only in the wrapper.
  - Tones from `tones.ts`, the mono prefix, no shadow; reduced motion.
  - *Done when:* unit tests with fake timers (`docs/knowledge/fake-timers.md`) cover each kind's
    lifetime, the pauses, the limit and the repeat; a test finds the always-present polite region while idle and the
    `status` and `alert` roles on the boxes (SPEC changed: Sonner has one live region); lint and typecheck pass.

- [x] **3. Placement on phones and above the bottom bar.**
  - Bottom right from `sm`; across the bottom below it with the gutter and the safe area;
    `BottomBar` sets `--bottom-bar-height`, the region reads it.
  - The styleguide's Toasts section, with a bottom bar demo.
  - *Done when:* a Playwright test on the styleguide checks the region's box on desktop, phone,
    phone-webkit and tablet (inside the viewport, not over the bar), and the mobile sweep passes.

- [ ] **4. Flash toasts after a redirect.** [risky]
  - `flashToast(key, params)` on the server, `FlashToast` on the page: the `FlashKey` list, the
    cookie's size and lifetime, read once and deleted, parameters as text.
  - *Done when:* unit tests cover a good cookie, an unknown key, bad JSON, an oversized value and
    markup in a parameter (shown as text); an e2e test saves something that redirects and sees the
    toast once, in Portuguese for a person who chose it.

- [ ] **5. The sweep: confirmations become toasts.**
  - Each `state.done` notice that only confirms an action, in the order of `grep -rn "state.done"`;
    the redirecting actions that said nothing get a flash toast where the owner's list asks
    (save draft, submit, withdraw, approve, request changes, reject, release, deprecate, yank,
    settings saved).
  - Errors of row and bulk actions without a form become error toasts; form errors, one-time
    secrets and the bulk release summary stay.
  - *Done when:* the component tests of each changed feature expect the toast instead of the notice,
    the e2e suites pass on every project, and `docs/knowledge/toasts.md` lists the rules.

- [ ] **6. Messages.**
  - Every new key in `en`, `pt` and `fr` (the region's name, the prefixes, close, each flash key).
  - *Done when:* the parity and raw-text tests pass, and `pnpm i18n:review` shows the new keys.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- Task 2: the unit tests run in happy-dom (`happy-dom` 21.0.4, MIT, a new dev dependency; the file
  says `// @vitest-environment happy-dom`) because Sonner's timers live in React effects. Move the
  clock in steps with React flushed between them (`tick` in `toast.test.tsx`): Sonner's removal
  after 200ms starts from an effect, which `act` runs only at its end.
- Task 3: a modal `<dialog>` was not passed by a popover (it stayed under the dialog, and the page is inert
  anyway), so the region moves into the open dialog (`Toaster`). The styleguide page has each theme's
  sample twice: tests that click its buttons take `.first()`. A user's sign-ins are limited to 5 a
  minute: the toast tests sign in root of each project once or twice.
