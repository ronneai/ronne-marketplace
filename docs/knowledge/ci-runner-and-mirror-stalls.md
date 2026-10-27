# CI jobs that hang before the tests start

Two kinds of hang look like a failing check but aren't a code problem, and both end in a cancelled
job. On 2026-10-26 they cost one e2e shard 25 minutes four times and one bundle job 15 minutes.

## What to do

- **Cancelled in `playwright install --with-deps`** (an e2e shard, ~25 min): re-run the failed job. A
  normal install takes under a minute (22 of 26 today took 0.6 to 1.0 min).
- **A bundle job cancelled at ~15 min with 0 steps** (`macos-15`): the job never got a runner. Re-run
  the failed jobs; the same job takes under a minute when it starts.
- **Don't raise a job timeout** to cope with either: it only makes the hang longer.
- **Don't switch to another mirror or turn off apt's signature checks** to avoid the stall.
- The install step is guarded by `timeout-minutes` and a retry loop once that PR lands; until then
  these hangs are expected a few times a day.

## How to spot it

- Install stall: the job log ends in the middle of `apt-get`'s `Get:NN http://…ubuntu…` lines, then
  `The operation was canceled`. The tests never started. A package that normally downloads in under a
  second (`libflite1`, 13.5 MB) sits for minutes.
- No runner: in the jobs API the job has an empty `runner_name` and 0 steps, while its sibling jobs in
  the same run started within seconds.
- A real failure has a step marked `failure` and a test or command name. A hang has `cancelled`.

## Why (root cause)

1. The job ended at the 25-minute limit. `confirmed`.
2. It was stuck in apt downloading from Ubuntu's mirror on the `ubuntu-26.04` image. `confirmed`. Why the
   mirror stalls is outside our control.
3. The step has no timeout and no retry (`.github/workflows/e2e.yml`, the `playwright install` step),
   so a stall lasts until the job limit. `confirmed`.
4. We depend on an outside mirror at the start of every e2e run without a guard. `confirmed`.

For the runner case, why GitHub did not assign a `macos-15` runner is unknown, and the 15 minutes did
not come from our `timeout-minutes: 20`.

Found: 2026-10-26. Evidence: runs 40332622969, 40339277062, 40355047358, 40355894845 (installs) and
40355898042 (bundle).
