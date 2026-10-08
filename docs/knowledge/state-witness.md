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
4. Fix what it found and start a new pass (`### Re-check …` under the same task). A re-check may
   cover only the claims that failed; the checker reads the latest pass.
5. For a `[risky]` task, also start it with `mode: adversarial`. Its pass's `Witnessed:` line says
   `adversarial`.
6. Tick the task when the latest pass, and for a risky task the latest adversarial pass too, is met
   with every claim confirmed. Anything it couldn't check here (Windows, GitHub, a release) is
   `can't check here`, and the task stays unticked until a later pass confirms it.

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
