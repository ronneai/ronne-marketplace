# #148 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The finished page

Witnessed: 2026-10-09 00:33 EDT, by a fresh agent (blind). Commit: 1a20a70. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: SetupPage.tsx, SetupForm.tsx, setup-wizard.e2e.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `SetupPage` keeps whether the install finished, and the wizard reports the finish when the root step is done | yes | confirmed | `SetupPage.tsx` is `"use client"` with `useState(false)` and passes `onDone={() => setDone(true)}`. `SetupForm.tsx:162-165` calls `onDone?.()` right after `setDone({email})`, only when `name === "root" && outcome.email`, the condition that shows "Ronne AI Marketplace is set up" (`:233`); `installRootWith` always returns `email` on success (`install.ts:223-226`) |
| 2 | When finished, the sentence under the heading is gone in both forms ("isn't set up yet" and "didn't finish") | yes | confirmed | `SetupPage.tsx`: `{done ? null : <p>…</p>}`. Scratch e2e probe on an incomplete instance, then a finished install → `unfinished 0 notSetUp 0` after "is set up" |
| 3 | When finished, the "Anyone who can open this page" warning is gone | yes | confirmed | `SetupPage.tsx`: `{done ? null : <Notice kind="warn" …>}`. Same probe → `warning 0`; the heading, the done steps, "is set up" and **Sign in** stay |
| 4 | `setup.test.tsx` still shows both before the install | yes | confirmed | `vitest run src/features/setup` → 3 files, 19 passed; `setup.test.tsx:38,43`. Scratch mutation `useState(true)` → 2 tests fail |
| 5 | `setup-wizard.e2e.ts` sees both before **Install** and neither after "Ronne AI Marketplace is set up", on desktop | yes | confirmed | `playwright test --project wizard --project wizard-nojs` → 2 passed (`wizard` is Desktop Chrome). Scratch mutation removing `onDone?.()`, rebuilt → fails at `setup-wizard.e2e.ts:52` (expected 0, received 1) |
| 6 | Before the install and after a failed step, the page is as before (sentence and warning stay) | no | confirmed | Scratch probe: root step failed (mismatched passwords) → `notSetUp 1 warning 1`; after a reload (incomplete) → `unfinished 1 warning 1`; a second root failure kept both |
| 7 | A root step that fails and then succeeds on Retry keeps the warning until the success | no | confirmed | Same probe: warning visible after the failure; password fixed, **Retry** → "is set up", `warning 0`, `unfinished 0` |
| 8 | `already_set_up` keeps the page's text | no | confirmed | Two browser contexts: A finishes, B clicks Install → "Someone already set this instance up. Sign in.", the sentence and the warning, no "is set up"; the failure path never calls `onDone` (`SetupForm.tsx:167-174`) |
| 9 | Reloading `/setup` after the finish redirects as before, and the no-JavaScript path is unchanged | no | confirmed | Reload after success → `/sign-in`; `wizard-nojs` passed; `SingleForm` doesn't get `onDone`; `page.tsx` unchanged, props plain serialisable data |

**Overall:** met: the finished wizard page drops the sentence and the warning; both stay before the install, after failed steps until a successful Retry, and beside `already_set_up`. Breaking the fix fails the unit test and the e2e test.
