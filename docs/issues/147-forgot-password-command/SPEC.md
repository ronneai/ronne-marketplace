# #147 — The sign-in page names the reset command for how the instance was installed

> GitHub: [#147](https://github.com/ronneai/ronne-marketplace/issues/147) · Feature: [006](../../features/006-web-sign-in/SPEC.md) (with [082](../../features/082-server-npm-package/SPEC.md)'s runtime) · Reported on: 0.3.2

## Report

- On `@ronneai/marketplace` 0.3.2, started with `npx @ronneai/marketplace`, the sign-in page's
  **Forgot?** note tells a locked-out root to run `pnpm run reset-root-password`.
- That's the command for a clone. An npm install has no checkout to run `pnpm` in; its command is
  `rmk-server reset-root-password` (the README and the npm page say so). Docker's is
  `docker compose exec web pnpm run reset-root-password`.
- A root who followed the npm install and is the only root can't recover the account from what
  the page says.

The cause: `apps/web/src/features/sign-in/ForgotPassword.tsx` always shows
`pnpm run reset-root-password`. The server already knows how it was started (`runtimeOf` in
`apps/web/src/server/runtime.ts`, from `RONNE_RUNTIME`), but the sign-in page doesn't ask.

The website has the same gap: **Installing Ronne → Root accounts** (`install#root`) gives the clone
and Docker forms only.

## Goal

The **Forgot?** note names the one command that works for this instance, as typed in a terminal on
the machine that runs it.

## Scope

**In:**
- **One helper for a command typed outside the app**, `hostCommand(name, env)` in
  `server/runtime.ts`:
  - `npm` (the npm package, and the apt/dnf packages and the bundle, which all start through
    `rmk-server` and set `RONNE_RUNTIME=npm`): `rmk-server <name>`;
  - `docker`: `docker compose exec web pnpm run <name>`;
  - `node` (a clone): `pnpm run <name>`.

  `setupCommand` becomes `hostCommand("setup")`, so the two never drift. `scriptCommand` (the form
  for messages printed *inside* the runtime, such as the terminal setup's own errors) is unchanged.
- **The sign-in page** works the command out on the server and passes it, a plain string, down to
  `ForgotPassword`.
- **The note links to the Documentation**, `install#root`, for what the command does (several
  roots, `--email`, sessions and tokens).
- **The website**, `install#root` in en, pt and fr, gives the npm form beside the other two.

**Out:**
- **The other places that print `reset-root-password`**: `run-setup.ts` (a message from the
  terminal setup, already `scriptCommand`, which is right where it runs) and the README.
- **Email password resets.** The MVP sends no email (006).

## Behaviour

- **npm package:** "If you're the only root, run `rmk-server reset-root-password` where Ronne AI
  Marketplace is installed."
- **Docker:** "… run `docker compose exec web pnpm run reset-root-password` where …"
- **A clone:** "… run `pnpm run reset-root-password` where …", as today.
- After the sentence, a link, **Root accounts**, opens `install#root` on the website, as the
  inline helpers do.
- Still a native `<details>`, so it works without JavaScript.

## Edge cases

- **An unknown or missing `RONNE_RUNTIME`** is a clone (`runtimeOf`'s rule), so the note keeps
  today's text.
- **A long Docker command on a phone** wraps inside the note instead of widening the page.
- **A service install** (`rmk-server service install`) is the npm runtime: `rmk-server
  reset-root-password` already works on the service's data (082).

## Documentation

- **Installing Ronne → Root accounts** (`install#root`), on the website, in en, pt and fr: the
  forgotten-password paragraph names `rmk-server reset-root-password` for the npm package and the
  apt/dnf packages, beside the clone and Docker forms. In a ronne-web branch that goes live with
  the release.
- **Helpers:** none new. The **Forgot?** note itself is the inline help; it gains the link to
  `install#root` (`docsHref("install", "root")`).

## Acceptance criteria

- [ ] `hostCommand` returns the three forms, and `setupCommand` is built on it (unit tests).
- [ ] The sign-in page shows `rmk-server reset-root-password` for `RONNE_RUNTIME=npm`,
  `docker compose exec web pnpm run reset-root-password` for `docker`, and
  `pnpm run reset-root-password` otherwise (component tests), with the **Root accounts** link.
- [ ] The end-to-end sign-in test opens **Forgot?** and sees the clone's command and the link.
- [ ] The website's `install#root` gives all three forms, in English, Portuguese and French.

## Decisions

1. **The page names one command, not all three** (Claude). The server knows how it runs; a list
   would make every reader pick, and the Documentation already has the full picture.
2. **Docker's form is the one typed on the host** (Claude), as `setupCommand` already does: the
   person reading the note is outside the container.

## Open questions

None.
