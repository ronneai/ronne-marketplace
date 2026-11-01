# The skip-CI words in commit messages

GitHub runs no `push` or `pull_request` workflow for a commit whose message contains `[skip ci]`,
`[ci skip]`, `[no ci]`, `[skip actions]` or `[actions skip]` **anywhere**, the body included, even
when the message only talks about them. On a pull request it's the head commit that counts: no
checks start, and the required ones wait forever. Pull request #281 described the Release
workflow's version bump ("pushed … with [skip ci]") in its commit body, and no CI ran.

- **Never write those words in a commit message**, except in the one commit meant to skip CI: the
  version bump the Release workflow pushes to `main` (`bump-version` in
  `.github/workflows/release.yml`). Say "the skip-CI marker" instead.
- PR titles and bodies don't count; only commit messages do.
- If it happened: reword the commit (`git commit --amend`, or a new commit on top whose message
  doesn't contain them) and push again.
