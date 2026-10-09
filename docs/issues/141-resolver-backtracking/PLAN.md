# #141 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The failing tests.** In `packages/core/src/resolve.test.ts`, add:
  - the issue's scenario, both install and update with a lock;
  - a conflict that needs two exclusions;
  - an unsolvable conflict, asserting today's code, message and details;
  - a registry with many versions that hits the limit;
  - a missing item that an older version would avoid, still reported (decision 4).

  The tests that need backtracking are `it.fails` for now, so the commit passes the pre-commit
  checks; task 2 makes them `it`. *Done when:* those fail on `main` with the conflict the spec
  describes, and every other test, old and new, passes.

- [x] **2. Backtracking.** [risky] In `resolve.ts`:
  - Wrap the loop in attempts, with an excluded set of `name@version`.
  - On a conflict, or on `no_matching_version` from a dependency's range, take the candidates
    (the chosen versions that added a losing range, never the request) in name order. Exclude
    each in turn, and resolve again.
  - Keep `MAX_STEPS` across attempts (each attempt takes a step, so it bounds them), plus a
    budget on range checks while versions are set aside.
  - When nothing works, throw the first try's error.
  - A locked version that's excluded falls back to the newest version below it in range.

  Task 1's `it.fails` become `it`, and the old test "doesn't search older versions to escape a
  conflict" turns around: the same registry now resolves to the older version.

  *Done when:* every test in `packages/core` passes, including task 1's, and the module comment
  and MVP-facing rule ("the highest version that fits") are updated in the code.

- [x] **3. The callers.** Check the CLI (`rmk install` and `update`), the MCP server and
  `POST /api/v1/resolve`:
  - they need no change;
  - an `rmk` command test and an API test cover the issue's scenario.

  Check that `dependencyIssues`' cycle walk in `registry-checks.ts` still matches the resolver for
  what Submit refuses.

  *Done when:* the CLI and web tests for install, update and resolve pass, with the new
  scenario.

- [x] **4. MVP and decision log.** In MVP §4.3, the resolver rule says it falls back to older
  versions in range when the newest conflict. In §15, the Resolver row says so, dated 2026-10-08,
  citing #141.
  *Done when:* both read as the code behaves.

- [ ] **5. Documentation.** If `rmk#installing` and `rmk#updating` on the website describe the
  version choice, update them in en, pt and fr, in a ronne-web branch that goes live with the
  release. *Done when:* the pages say what task 2 does, or the witness confirms they don't
  describe the rule.
