# Two copies of a CodeMirror package

The draft editor's `@` picker and its dependency search are built on CodeMirror. CodeMirror breaks
when two copies of the same package are loaded (`@codemirror/view`, `state`, `autocomplete`): the
pieces of one copy don't recognise the other's, so the dropdown never shows its options. A Dependabot
bump can leave exactly that behind. On 2026-10-26 it failed `dependency-picker.mobile.e2e.ts`
(phone-webkit and tablet, retries too) and, in the next group PR, three more picker tests.

## What to do

- **Before blaming the new version, count the copies.** `grep -E "^  '@codemirror/(view|state|autocomplete|language|commands)@" pnpm-lock.yaml | sort -u`
  should list one version of each. Two lines for the same package is the problem.
- **Fix it with `pnpm dedupe`** and commit the lockfile with the bump. Run it on the Dependabot
  branch (or in the same PR) and check the picker tests again.
- **Don't ignore a version in `.github/dependabot.yml` until the new version has failed on a
  deduplicated lockfile.** 6.20.4 of `@codemirror/autocomplete` was ignored (#243) on a wrong
  reading and passes with one copy of each package.
- **Don't test a version by pinning it and running `pnpm install`**: a non-frozen install re-resolves
  and quietly removes the duplicates, so the pin looks like the fix. Test the lockfile as the PR has it
  (`pnpm install --frozen-lockfile`).

## How to spot it

The picker tests are the only ones failing (`dependency-picker*.e2e.ts`, `any-dependency`,
`pending-dependencies`): `expect(locator).toBeVisible()` fails on a `role=option` row, with
"element(s) not found", on every project, retries included. Unit tests and the build pass. The
lockfile has two versions of one `@codemirror/*` package.

## Why (root cause)

1. The picker's options never appeared. `confirmed`: reproduced locally with the PR's own lockfile.
2. The lockfile held two copies of `@codemirror/view` (6.43.14 and 6.43.15). `confirmed`.
3. Dependabot raised the direct dependency in `apps/web/package.json`, while other packages in the family
   kept the older version they had resolved before, because it still satisfied their range.
   `confirmed` for the lockfile; the same shape explains the earlier PR with `autocomplete` 6.20.4.
4. Nothing in CI checks for duplicate copies, so the first signal was a UI test. `confirmed`.

Control: with one copy of each package, including `autocomplete` 6.20.4, the test passes.

Found: 2026-10-26. Evidence: PRs #240, #242, #244, #243; the guard test is listed under "Pending" in
the post-mortem of that day.
