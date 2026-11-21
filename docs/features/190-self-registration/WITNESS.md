# 190 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-21 17:16 EST, by a fresh agent (blind). Commit: 89d6e76e + working-tree diff (CLAUDE.md, docs/MVP/MVP.md, docs/features/README.md; WITNESS.md untracked). Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §9.5 says people can create their own account when root allows it | no | confirmed | MVP.md:647–652 against the spec's Scope |
| 2 | §15 "Web sign-in" says so | no | confirmed | MVP.md:992 |
| 3 | A "Self-registration" row records Decisions 1–15 | no | partly | Decision 10 (the code page bound to the browser) missing |
| 4 | Nothing claims more than the spec, or that 190 is built | no | partly | the Web sign-in addition and CLAUDE.md are in the present tense |
| 5 | No contradiction with other MVP rows | no | not met | MVP.md:88 "only created from the web app (by root)" |
| 6 | CLAUDE.md's line stays true, with the addition | no | confirmed | `git diff CLAUDE.md` |
| 7 | README lists 190 in M32 | no | confirmed | README.md:527, 532 |
| 8 | `pnpm witness:check` | no | confirmed | exit 0 |
| 9 | `pnpm docs:check` | no | confirmed | exit 0 |

**Overall:** not met (rows 3, 4, 5).

Fixes after the pass: MVP.md:88 says users are also created by themselves once 190 is built and root allows it; the "Self-registration" row records Decision 10; the §9.5 bullet, the "Web sign-in" addition and CLAUDE.md are in the future tense ("being built", "once 190 is built").

### Re-check 1

Witnessed: 2026-11-21 17:18 EST, by a fresh agent (blind, wording-only re-check). Commit: 89d6e76e + working-tree diff (CLAUDE.md, docs/MVP/MVP.md, docs/features/README.md). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md no longer says only root creates users without 190 | no | confirmed | MVP.md:88; greps for other such statements |
| 2 | The "Self-registration" row records Decisions 1–15, 10 included | no | confirmed | MVP.md:1034 against SPEC.md:270-309 |
| 3 | §9.5, "Web sign-in" and CLAUDE.md:126 don't say 190 is built | no | confirmed | "being built", "will", "once 190 is built" |
| 4 | `pnpm witness:check` and `pnpm docs:check` | no | confirmed | exit 0 each |

**Overall:** met. Remark: Decision 13's "the web asks, the API doesn't" is in the spec, not the row.
