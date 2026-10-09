# Issues

Bugs reported on GitHub ([ronneai/ronne-marketplace/issues](https://github.com/ronneai/ronne-marketplace/issues))
that need more than a one-line fix get a folder here, worked like a feature in
[`docs/features`](../features/README.md):

- **One folder per issue:** `NNN-slug/`, where `NNN` is the GitHub issue number (no padding).
- **`SPEC.md`:** the report, then Goal, Scope, Behaviour, Edge cases, Documentation, Acceptance
  criteria, Decisions and Open questions. The header names the feature the fix belongs to.
- **`PLAN.md`:** the tasks in build order, each with *Done when:*, `[risky]` where it warrants an
  adversarial pass. Tick a task in the same change that completes it.
- **`WITNESS.md`:** the state-witness passes, as for features
  ([`docs/knowledge/state-witness.md`](../knowledge/state-witness.md)). `pnpm witness:check`
  checks every issue folder.
- **Commits and pull requests:** `[type] #NNN: Description`, such as
  `[bugfix] #141: Try older versions when the newest conflicts`.
- When the fix ships, set its status below to the release, such as `fixed in 0.3.3`, and close the
  GitHub issue.

| Issue | Title | Feature | Status |
|---|---|---|---|
| [141](./141-resolver-backtracking/SPEC.md) ([#141](https://github.com/ronneai/ronne-marketplace/issues/141)) | The resolver tries an older version when the newest one in range conflicts | 020 | open |
| [142](./142-submit-problems-on-save/SPEC.md) ([#142](https://github.com/ronneai/ronne-marketplace/issues/142)) | Saving shows the problems Submit would refuse | 013 | in progress (tasks 1–5 done; the docs in ronne-web `bugfix/marketplace-142-problems-on-save`; the release is the owner's) |
| [143](./143-dependency-menu-range/SPEC.md) ([#143](https://github.com/ronneai/ronne-marketplace/issues/143)) | The dependency menu shows the range it writes, and offers an exact pin | 089 | open |
| [144](./144-website-run-it-ports/SPEC.md) ([#144](https://github.com/ronneai/ronne-marketplace/issues/144)) | The website's "Run it" uses port 7650 and gives the `npx` start | 088 | in progress (tasks 1–3 done in ronne-web `bugfix/marketplace-144-run-it`; task 4, the release, is the owner's) |
| [147](./147-forgot-password-command/SPEC.md) ([#147](https://github.com/ronneai/ronne-marketplace/issues/147)) | The sign-in page names the reset command for how the instance was installed | 006 | open |
| [148](./148-setup-done-page/SPEC.md) ([#148](https://github.com/ronneai/ronne-marketplace/issues/148)) | The finished setup page stops saying the instance isn't set up | 036 | open |
