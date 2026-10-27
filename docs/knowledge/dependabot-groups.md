# Dependabot groups and a failing member

`.github/dependabot.yml` groups every minor and patch npm update into one pull request
(`npm-minor-and-patch`, `patterns: ["*"]`). One member that fails CI blocks the other twelve, and
Dependabot may close and recreate the group, so rebase comments don't stick (#236 → #240 → #242 → #244
on 2026-10-26).

## What to do

- **Find which member fails before changing the config.** Re-run once, read the failing step, then
  test the PR's own lockfile in a scratch worktree (`pnpm install --frozen-lockfile`, build, the
  failing test).
- **A tool whose minor changes its output** (Biome 2.5 → 2.6 went from 46 to 419 diagnostics: it now
  formats Markdown and YAML and adds recommended rules) needs a change in the repo first. Open a normal
  chore PR that takes the tool (config, schema, narrow exceptions), as #241 did, then rebase the group.
- **Scope any exception narrowly** (one rule, one folder, one version) with the reason in a comment, and
  never switch off a security check to make a bump pass.
- **Ignore a version in `dependabot.yml` only after it fails on a clean lockfile** (see
  `duplicate-codemirror-packages.md`). An ignore entry holds a harmless update back.

## How to spot it

The group's title lists 13–14 updates and its checks fail while the same checks pass on `main`. The
failing step names one tool (lint) or one area (a UI test), not all of them.

## Why (root cause)

1. The group PR couldn't merge. `confirmed`.
2. One member changed behaviour (a linter minor, and a lockfile left with duplicates). `confirmed`.
3. Tools and runtime packages share a group, so any one of them blocks the rest. `confirmed`.

Found: 2026-10-26. Evidence: PRs #236, #240, #241, #242, #243, #244.
