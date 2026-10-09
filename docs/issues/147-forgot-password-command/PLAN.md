# #147 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The command.** `hostCommand(name, env)` in `apps/web/src/server/runtime.ts`;
  `setupCommand` returns `hostCommand("setup", env)`. *Done when:* `runtime.test.ts` covers the
  three runtimes for `hostCommand`, and `setupCommand`'s tests still pass unchanged.

- [x] **2. The note.** [risky] The sign-in route (`app/sign-in/page.tsx`) passes
  `hostCommand("reset-root-password")` through `SignInPage` and `SignInForm` to `ForgotPassword`,
  which shows it and links to `docsHref("install", "root")`. *Done when:* `sign-in.test.tsx` covers
  the three commands and the link, and `auth.e2e.ts` opens **Forgot?** and sees
  `pnpm run reset-root-password` and the link, on desktop and phone.

- [x] **3. Documentation.** `install#root` on the website (en, pt, fr), in a ronne-web branch that
  goes live with the release. *Done when:* the paragraph names the npm form beside the clone and
  Docker ones, in all three languages.

- [ ] **4. The popover** (owner, 2026-10-09). `ForgotPassword` renders the `<details>` until it
  hydrates, then **Forgot?** opens the note in the shared `Popover` (`placement="bottom-end"`).
  *Done when:* `auth.e2e.ts` opens the note as a dialog, closes it with Esc, and, with JavaScript
  off, opens the `<details>`; the phone test opens the popover and nothing scrolls sideways.
