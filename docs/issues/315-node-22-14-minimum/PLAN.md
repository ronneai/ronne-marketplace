# #315 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The minimum is 22.14.** [risky] `MIN_NODE` is `22.14.0` and `MIN_NODE_23` is `23.6.0`;
  `node-version.test.ts` checks 22.13.x and 23.0–23.5 are too old, 22.14.0 and 23.6.0 aren't, the
  message names the version to install, and the package's own `engines` matches. `engines` is
  `^22.14.0 || >=23.6.0` in the root and the four packages. `rmk-server --help`, the `step1Hint` message (en,
  pt, fr), `install.sh` and the release notes' line say 22.14. *Done when:*
  - `pnpm --filter @ronneai/marketplace test` and the web app's message tests pass;
  - on the official 22.13.1 build, the packed `rmk-server start` prints "Node.js 22.14.0 or later
    is needed; this is 22.13.1." and exits 1, with no crash;
  - the same on 23.5.0, with the 23 message;
  - on the official 22.14.0 and 23.6.0 builds, the packed `rmk-server start` answers on its port.
- [x] **2. Repository docs.** `README.md`, the four package READMEs, `CONTRIBUTING.md`,
  `docs/runbooks/install.md`, `docs/policies/dependencies.md` §2, MVP.md §5 and a §15 row,
  `CLAUDE.md`, and this issue's row in `docs/issues/README.md`. *Done when:* a search for `22.12`
  outside history (`docs/features`, `docs/issues`, witness records) and lockfiles finds it only in
  `node-version.ts`'s comment and test, which name it as a version that's refused, and each doc
  says what the spec lists.
- [x] **3. The website.** ronne-web, branch `bugfix/marketplace-315-node-22-14` (`bbf572c`, on
  the Next.js 16.4.6 upgrade `59b0b10`): the pages and
  messages the spec's Documentation lists, in en, pt and fr. *Done when:* ronne-web's own checks
  pass on the branch, and a search for `22.12` in `www/src` and `www/messages` finds nothing.
- [ ] **4. The release.** The owner's: the next release ships it, the status below becomes "fixed
  in x.y.z", and the issue is closed by hand. *Done when:* released.

## Notes

**Task 1 (2026-11-20).**
- Measured on official `darwin-arm64` builds, each checked against nodejs.org's `SHASUMS256.txt`,
  with the packed `@ronneai/core` and `@ronneai/marketplace` installed by that build's own npm:
  - 22.13.1 and 23.5.0 (N-API 9): npm warns `EBADENGINE`; `rmk-server setup --yes` exits 1 with
    the message, the 23 one naming 23.6.0.
  - 22.14.0 and 23.6.0 (N-API 10): no warning; CI's `server-probe.js` passes all 18 checks
    (SQLite setup, sign-in, revoke, rotate, backup, restore).
- The first version accepted every 23.x: the adversarial witness found 23.0–23.5 lack N-API 10 and
  crash like 22.13. `nodeTooOld` now refuses them, `engines` is `^22.14.0 || >=23.6.0`, and the
  message names 23.6.0 on 23 (SPEC Decisions 3).
- Without the check, 22.13 doesn't crash at `start` on an instance that isn't set up: it starts in
  setup mode and crashes when the setup loads the driver (the blind witness). The Report says so.
- `pnpm pack` in `packages/server` runs `prepack`, which refreshes the git-ignored `app/` and
  `THIRD_PARTY_NOTICES`; neither is tracked.

**Task 2 (2026-11-20).**
- MVP §15: the "Packages" row, which already named the minimum, now says 22.14.0 (23.6.0 on 23)
  and why, instead of a new row.
- Only the policy texts (`dependencies.md`, MVP §15) mention 23.6.0; the READMEs, the runbook and
  CONTRIBUTING say "22.14 or later" (SPEC Decisions 3).
- Feature 188's branch still says 22.12 in its own changed lines; they become 22.14 when it is
  rebased onto this fix (188 task 7).
