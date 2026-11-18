<!--
The title follows the commit format, checked by CI:
  [type] NNN: Description    a feature in docs/features
  [type] #NNN: Description   an issue in docs/issues
  [type]: Description        anything else
type is docs, feat, chore or bugfix. CONTRIBUTING.md has the rest.
Don't write "closes #N" or "fixes #N": issues are closed by hand when the fix is released.
-->

## What it does

<!-- What changes for people using Ronne or working on it, and why. -->

## Feature or issue

<!-- The folder in docs/features or docs/issues, such as docs/features/187-contributor-docs, and the tasks of its PLAN.md this pull request does. Leave the tasks unticked: the maintainer runs the state witness and ticks them before merging. -->

## Checks

<!-- The pre-commit hook runs lint, typecheck, test and build. Say what else you ran. -->

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass
- [ ] Database code: the tests I touched pass on the servers (`pnpm test:db:up`, then `pnpm test:db:postgres`, `:mysql`, `:mariadb`)
- [ ] Screen text: every new message is in English, Portuguese and French
- [ ] Dependencies: each new one follows docs/policies/dependencies.md

## Documentation

<!-- What the Documentation website should say after this change (the maintainer updates it for the release), or "None" and why. Changes to the in-app helpers go in this pull request. -->
