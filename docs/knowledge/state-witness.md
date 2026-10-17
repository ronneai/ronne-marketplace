# The state witness

Before a feature task is ticked, an agent that didn't do the work checks it against the real state:
the files, and commands it runs itself (owner, 2026-10-04, from feature 082). Its record goes in the
feature's `WITNESS.md`, in the same commit as the task. A task is ticked only when its latest pass
is met with every claim confirmed. `pnpm witness:check` enforces the record (below); the pre-commit
hook runs it on every commit, documentation only included, and so does CI.

The agent is [`.claude/agents/state-witness.md`](../../.claude/agents/state-witness.md), so every
pass gets the same instructions, whoever starts it.

## Why it works this way

Changed on 2026-10-06 after a review of the STATEWITNESS paper (Chen et al., *Decoding Hidden
Deception in Reasoning LLMs*, [arXiv:2606.17478](https://arxiv.org/abs/2606.17478)) and of the
first 55 passes (082–097: 376 claims, 24 partly, 5 not met, 11 re-checks after fixes). The paper
reads a model's activations, which we can't, but four of its findings carry over:

- **The implementer's story anchors the checker.** A monitor reading the model's reasoning did no
  better than one reading only the answer (0.809 → 0.789 AUROC on one model). So the witness
  starts **blind**: the task's *Done when*, the spec lines and where to look, never the notes. Only
  after its own verdicts does it read the notes and mark which claims they made.
- **"Said it was done" is its own failure.** The paper's reports separate "not done, claimed done"
  from "not done, reported". The *In the notes?* column does that: a `partly` or `not met` with
  `yes` is a claim the implementer got wrong.
- **Two different checkers miss less than one.** Combining two monitors that fail differently, and
  failing on either, raised recall at 1% false positives from 0.430 to 0.562. A task marked
  `[risky]` gets a second, **adversarial** pass, told only to break the claims.
- **A checker can sound sure on weak evidence.** Every claim needs evidence (a command and what it
  showed, or `file:line`), and every pass names the commit it checked, so it can be repeated.
  Once a milestone, a planted bug tests the witness itself (below).

## Running a pass

1. Finish the task's work, with the checks green. Commit nothing yet.
2. Start the `state-witness` agent with: the feature and task number, the task's *Done when*, the
   spec lines it covers, where to look, and the commit or working tree to check
   (`git rev-parse --short HEAD`; uncommitted work counts as that commit plus the diff).
   **Don't** pass PLAN.md's notes, the conversation or your summary of the work.
3. It answers with a pass in the format below. Paste it into `WITNESS.md`. Then give it the notes'
   claims for the task, and it fills *In the notes?*.
4. Fix what it found, **rerun the witness's own probes** (it leaves them in the scratchpad) to see
   the fix hold, then start a new pass (`### Re-check …` under the same task). A re-check covers
   only the claims that weren't `confirmed` and the claims the diff since the last pass touches;
   say which in the request, with the diff. The checker reads the latest pass.
5. For a `[risky]` task, also start it with `mode: adversarial`. Its pass's `Witnessed:` line says
   `adversarial`.
6. Tick the task when the latest pass, and for a risky task the latest adversarial pass too, is met
   with every claim confirmed. Anything it couldn't check here (Windows, GitHub, a release) is
   `can't check here`, and the task stays unticked until a later pass confirms it.

**Keeping passes short** (owner, 2026-10-16, after an adversarial re-check of one row took 48
minutes, sweeping a clock jump through 360 points with a fresh test run each). The aim is the same
findings in less time:

- **Budgets.** A first blind pass about 15 minutes, a first adversarial pass about 25, a re-check
  about 10. The request says the budget. What's left unchecked when it runs out is
  `can't check here` with what remains, never silently skipped; the witness may run over only to
  follow a live lead to a bug.
- **Only the tests that matter.** The task's own test files, on SQLite and on the database servers
  when it touches database code. The full web suite and the end-to-end run already happen on every
  commit (the pre-commit hook) and in CI: a witness reruns them only when the task changes shared
  code (a shared component, the logger, the database layer, the auth setup).
- **Sample, don't sweep.** Each claim still gets a real attempt to break it, and a mutation that
  shows its test fails without the fix. A sweep (a clock jump, a range of inputs, many concurrent
  calls) samples the range or bisects towards a failure instead of trying every point.
- **Reuse.** A re-check reuses the scratch copy, the probes and the harnesses of the pass before
  (copying over only the changed files) instead of building them again.
- **Severity.** Security and correctness findings get a full adversarial re-check of their rows. A
  finding about a test (a flake, a missing mutation) or about wording gets a short, scoped one.
- **Two rounds, then the owner.** If a risky task's adversarial pass is still not met after two
  re-checks, the owner decides: another round, or the remaining finding moves to a follow-up task or
  issue (with its own *Done when*), so this task's claims can be met.

**Two witnesses at once share the scratchpad** (106, 2026-10-16): a blind and an adversarial pass
run side by side, and both once backed files up to `scratchpad/bak`; one's restore failed, and its
mutations sat in the repository while the other ran. Each pass keeps its backups and probes in a
folder named for itself (`scratchpad/<feature>-t<task>-<blind|adv>/`), checks after every restore
that the file is byte-identical to its backup (`cmp`), and checks untracked files too
(`git status`, not only `git diff`). A pass whose runs overlapped another's mutation reruns them.
Separate folders aren't enough when both mutate the same repository file at the same time (it
happened again an hour later): **mutations go in a scratch copy of the repository** (rsync without
`.git` and `node_modules`, with the `node_modules` folders symlinked), never in the repository
itself, so a pass running alongside always reads the real code. In the copy, `pnpm test:db:*` and
`pnpm exec` refuse to run (pnpm tries to install into the symlinked `node_modules`,
`ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH`); run Vitest directly from the copy's `apps/web`:
`TEST_DATABASE_URL=<url from scripts/test-db.mjs> node <repo>/node_modules/vitest/vitest.mjs run
--project db <path>`.

**Which tasks are risky:** sign-in, sessions, tokens and roles; migrations; deleting or anonymising
data; anything that runs on a user's machine or with root; security checks. The spec's author marks
them with `[risky]` on the task's first line in PLAN.md.

## The record

````markdown
## Task 2 — The check at submit

Witnessed: 2026-10-07 14:02 EDT, by a fresh agent (blind). Commit: 3f9c2e1. Machine: macOS 27, Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Another author's draft no longer counts | yes | confirmed | `pnpm --filter @ronneai/web test checks` → 41 passed; `checks.ts:88` |
| 2 | The same on MySQL | no | can't check here | No MySQL server running here |

**Overall:** not met: claim 2 waits for `pnpm test:db:mysql`.
````

- One `## Task N — …` section per task (or `## Tasks 3 and 4 — …`). Other `##` headings are allowed
  for follow-ups and aren't tied to a task.
- Each pass starts with `Witnessed:` and must name `Commit: <sha>`; `adversarial` in that line marks
  an adversarial pass.
- The table has exactly these columns. *In the notes?* is `yes` or `no`. The verdict is one of
  `confirmed`, `partly`, `not met`, `can't check here`; a remark goes in the evidence.
- Evidence is never empty.
- `**Overall:**` starts with `met` or `not met`.

The checker covers features from 087 on, except 088, 089, 096 and 097, which were witnessed in the
first format and keep it, and every issue folder in `docs/issues`. Its rules are in
`packages/repo-tools/src/witness.js`.

## Testing the witness

Once a milestone, on a finished task: revert one fix the witness had found (or plant a small bug the
*Done when* should catch), in a scratch branch, and start a blind pass. It should find it. Note
the result under `## Witness calibration` in that feature's `WITNESS.md`, with the commit. A miss
means the agent's instructions need a change; change `.claude/agents/state-witness.md` in the same
pull request.
