# #147 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The command

Witnessed: 2026-10-09 00:11 EDT, by a fresh agent (blind). Commit: d86fbc4. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: runtime.ts, runtime.test.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `hostCommand(name, env)` exists in `server/runtime.ts` and is exported | yes | confirmed | `apps/web/src/server/runtime.ts:40` `export const hostCommand = (name: string, env: Env = process.env)` |
| 2 | npm → `rmk-server <name>` | yes | confirmed | `runtime.ts:43`; test asserts `"rmk-server reset-root-password"`; mutating it to `` `rmk-server` `` in a scratchpad copy → 2 failed / 4 passed |
| 3 | docker → `docker compose exec web pnpm run <name>` | yes | confirmed | `runtime.ts:42`; hardcoding `setup` instead of `${name}` in a scratchpad copy → the #147 test fails (1 failed / 5 passed) |
| 4 | node (a clone) → `pnpm run <name>` | yes | confirmed | `runtime.ts:44`; mutating the clone string in a scratchpad copy → 2 failed |
| 5 | An unknown or missing RONNE_RUNTIME counts as a clone | no | confirmed | `runtimeOf` at `runtime.ts:11-12` (anything other than docker or npm is `node`); the test covers `{}` and `RONNE_RUNTIME: "other"` → `pnpm run reset-root-password` |
| 6 | `runtime.test.ts` covers all three runtimes for `hostCommand` | yes | confirmed | `runtime.test.ts:43-54` asserts npm, docker, missing and unknown; `npx vitest run src/server/runtime.test.ts` → 6 passed |
| 7 | `setupCommand` becomes `hostCommand("setup")` | yes | confirmed | `runtime.ts:48` `setupCommand = (env…) => hostCommand("setup", env)` |
| 8 | `setupCommand`'s tests still pass, unchanged | yes | confirmed | `git diff HEAD -- runtime.test.ts` → only additions, no lines removed; the "names the setup command for each runtime" test passes (6/6) |
| 9 | `scriptCommand` is unchanged | no | confirmed | `git diff HEAD -- runtime.ts` shows `scriptCommand` only as a context line; `runtime.ts:32-33` still maps npm to `rmk-server`, otherwise `pnpm run` |
| 10 | The changed files lint and type-check | no | confirmed | `npx biome check` on both files → "Checked 2 files… No fixes applied"; `tsc --noEmit -p apps/web` → exit 0 |

**Overall:** met: `hostCommand` gives the right command for npm, Docker and a clone (an unknown or missing runtime counts as a clone), `setupCommand` now calls it, `scriptCommand` and the setup tests are unchanged, and mutation probes show the new test catches wrong output.
