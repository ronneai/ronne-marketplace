# #315 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The minimum is 22.14.** [risky] `MIN_NODE` is `22.14.0`; `node-version.test.ts` checks
  22.13.x is too old, 22.14.0 isn't, and the package's own `engines` matches. `engines` is
  `>=22.14` in the root and the four packages. `rmk-server --help`, the `step1Hint` message (en,
  pt, fr), `install.sh` and the release notes' line say 22.14. *Done when:*
  - `pnpm --filter @ronneai/marketplace test` and the web app's message tests pass;
  - on the official 22.13.1 build, the packed `rmk-server start` prints "Node.js 22.14.0 or later
    is needed; this is 22.13.1." and exits 1, with no crash;
  - on the official 22.14.0 build, the packed `rmk-server start` answers on its port.
- [ ] **2. Repository docs.** `README.md`, the four package READMEs, `CONTRIBUTING.md`,
  `docs/runbooks/install.md`, `docs/policies/dependencies.md` §2, MVP.md §5 and a §15 row,
  `CLAUDE.md`, and this issue's row in `docs/issues/README.md`. *Done when:* a search for `22.12`
  outside history (`docs/features`, `docs/issues`, witness records) and lockfiles finds nothing,
  and each says what the spec lists.
- [ ] **3. The website.** ronne-web, branch `bugfix/marketplace-315-node-22-14`: the pages and
  messages the spec's Documentation lists, in en, pt and fr. *Done when:* ronne-web's own checks
  pass on the branch, and a search for `22.12` in `www/src` and `www/messages` finds nothing.
- [ ] **4. The release.** The owner's: the next release ships it, the status below becomes "fixed
  in x.y.z", and the issue is closed by hand. *Done when:* released.

## Notes
