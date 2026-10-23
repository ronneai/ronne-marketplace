# #222 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. `rmk-server` on Windows.** [risky] `SUPPORTED_PLATFORMS` and `package.json`'s `os` gain
  `win32`; the refusal names the three systems. `dataDir` gets back 0.3.2's Windows folder, and
  `--help` lists it. `run.ts` prints the Windows note after "Data folder: …" and opens the browser
  with `cmd /c start`. `serviceTarget` refuses `win32` with the Windows line. *Done when:*
  `platform.test.ts`, `paths.test.ts` and the service tests cover each row of the spec's
  Behaviour that runs without Windows, and `pnpm --filter @ronneai/marketplace test` passes.
- [ ] **2. Windows in CI.** `server-checks.yml`'s install matrix runs on `windows-latest` (Node 22
  and 24); `server-probe.js` gets back its Windows branches and checks the `service` refusal
  there; the Refuses Windows job goes; `release.yml`'s comments and notes follow. *Done when:* the
  pull request's Install and run jobs pass on Windows (a run on GitHub; the owner pushes).
- [x] **3. Repository docs.** `install.md`, `backup.md`, `release.md`, `README.md`,
  `packages/server/README.md`, MVP §15 (Easy install), the features index (121's row), 121's SPEC
  header, and this issue's row in `docs/issues/README.md`. *Done when:* none of them says the
  server refuses Windows, each says what the spec's Documentation lists.
- [x] **4. The website.** ronne-web, branch `bugfix/marketplace-222-windows`: the `install`
  page's Windows section in en, pt and fr, and `operations` and `backups` checked. *Done when:*
  ronne-web's own checks pass on the branch and the three languages say the same.
- [ ] **5. The release.** The owner's: the next release ships it, the issue's status becomes
  "fixed in x.y.z", and the issue is closed by hand. *Done when:* released.

## Notes

- **Task 4:** ronne-web branch `bugfix/marketplace-222-windows` (9699b32, d81a8cb), made in a
  worktree so the owner's uncommitted work in `../ronne-web` stays as it was. pt and fr were written
  without ronne-web's `translator` agent (not available in this session); worth a proofread.
