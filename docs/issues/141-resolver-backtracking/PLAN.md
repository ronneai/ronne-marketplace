# #141 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The failing tests.** In `packages/core/src/resolve.test.ts`, add:
  - the issue's scenario, both install and update with a lock;
  - a conflict that needs two exclusions;
  - an unsolvable conflict, asserting today's code, message and details;
  - a registry with many versions that hits the limit.

  *Done when:* the new tests fail on `main` for the reasons in the spec, and the existing ones
  pass.

- [ ] **2. Backtracking.** [risky] In `resolve.ts`:
  - Wrap the loop in attempts, with an excluded set of `name@version`.
  - On a conflict, or on `no_matching_version` from a dependency's range, take the candidates
    (the chosen versions that added a losing range, never the request) in name order. Exclude
    each in turn, and resolve again.
  - Keep `MAX_STEPS` across attempts, plus a limit on attempts.
  - When nothing works, throw the first try's error.
  - A locked version that's excluded falls back to the newest version below it in range.

  *Done when:* every test in `packages/core` passes, including task 1's, and the module comment
  and MVP-facing rule ("the highest version that fits") are updated in the code.

- [ ] **3. The callers.** Check the CLI (`rmk install` and `update`), the MCP server and
  `POST /api/v1/resolve`:
  - they need no change;
  - an `rmk` command test and an API test cover the issue's scenario.

  Check that `dependencyIssues`' cycle walk in `registry-checks.ts` still matches the resolver for
  what Submit refuses.

  *Done when:* the CLI and web tests for install, update and resolve pass, with the new
  scenario.

- [ ] **4. MVP and decision log.** In MVP §4.3, the resolver rule says it falls back to older
  versions in range when the newest conflict. Add a §15 entry dated 2026-10-08, citing #141.
  *Done when:* both read as the code behaves.

- [ ] **5. Documentation.** If `rmk#installing` and `rmk#updating` on the website describe the
  version choice, update them in en, pt and fr, in a ronne-web branch that goes live with the
  release. *Done when:* the pages say what task 2 does, or the witness confirms they don't
  describe the rule.
