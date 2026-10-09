# #148 — The finished setup page stops saying the instance isn't set up

> GitHub: [#148](https://github.com/ronneai/ronne-marketplace/issues/148) · Feature: [036](../../features/036-web-setup/SPEC.md) · Reported on: 0.3.2

## Report

- On `@ronneai/marketplace` 0.3.2, after **Install** succeeds on `/setup`, the page shows the three
  steps done, "Ronne AI Marketplace is set up" and a **Sign in** button.
- The same page still says "This instance isn't set up yet. It needs a database, …", and still
  warns "Anyone who can open this page can set the instance up. Finish it now, before the address
  is shared."
- An operator who just finished is told the instance is still open to whoever reaches the page.

The cause: in `apps/web/src/features/setup/SetupPage.tsx` the sentence under the heading and the
warning are rendered by the server page, outside the wizard, so they don't know the install
finished. Only the wizard (`SetupForm.tsx`, with JavaScript) shows the finished state; without
JavaScript, a finished install already goes straight to sign-in (`installAll` redirects to
`/sign-in?…&setup=done`).

## Goal

Once the install has finished, the setup page says only that it's done, and how to sign in.

## Scope

**In:**
- **The wizard reports the finish.** `SetupPage` keeps whether the install finished, and the
  wizard tells it when the root step is done (the moment it shows "Ronne AI Marketplace is set
  up").
- **What the finished page drops:** the sentence under the heading (either form: "isn't set up
  yet" or "didn't finish"), and the "Anyone who can open this page" warning.

**Out:**
- **The no-JavaScript path.** It already lands on sign-in with "Ronne AI Marketplace is set up".
- **The page before or during the install, or after a failed step.** It keeps the sentence and
  the warning: the instance is still open then.

## Behaviour

- **Before the install, during it, and after a failed step:** as today.
- **When the root step is done:** the heading, the three done steps, any notices, "Ronne AI
  Marketplace is set up" and **Sign in**. No sentence under the heading, no warning.
- **Reloading `/setup` afterwards** redirects, as today (the instance is set up).

## Edge cases

- **A root step that fails, then succeeds on Retry:** the warning stays until the success.
- **`already_set_up`** (someone else finished first): not a finish of this wizard, so the page
  keeps its text beside that error, which already links to sign-in.

## Documentation

None. The website's **The setup** (`install#setup`) describes the page before the install and its
warning, which don't change; nothing there describes the finished page. No helper changes.

## Acceptance criteria

- [ ] After a successful install in the wizard, neither "isn't set up yet" nor "Anyone who can
  open this page" is on the page; "Ronne AI Marketplace is set up" and **Sign in** are.
- [ ] Before the install, both are shown, as today (component test).
- [ ] `setup-wizard.e2e.ts` checks both states.

## Decisions

1. **Drop the sentence rather than reword it** (Claude). The finished notice under the steps
   already says the instance is set up; a second line saying the same adds nothing.

## Open questions

None.
