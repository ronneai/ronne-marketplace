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
- The install step in `e2e.yml` runs `apt-get update`, `apt-get install` and the browser download as
  three parts, each with 3 tries cut at 1, 4 and 5 minutes (#311). A stalled apt then costs at most 15
  minutes, and the step fails with a warning per try (`apt-get install: try 2 of 3 failed or timed out
  after 240 s`): re-run it. Each try logs how long it took, so a slow install shows even when it passes.
  The macOS no-runner case has no guard.
- **Don't wrap a command that uses `sudo` inside in `timeout`**, and don't go back to
  `playwright install --with-deps` under `timeout`: the timeout can't stop it (below). Put the timeout
  inside: `sudo timeout … apt-get …`.

## How to spot it

- A guard that doesn't fire: no `try N of 3` warning before `The operation was canceled`, and the
  clean-up lists `Terminate orphan process: … (timeout)` and `… (pnpm)`. Or an install that passes but
  took 14 to 22 minutes, with one warning printed only when it ended.
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

## Why the first guard didn't work (2026-11-18)

The retry loop added on 2026-10-26 (`timeout 300 pnpm … exec playwright install --with-deps`) never ended
a try. On 2026-11-18 six e2e halves ran the full 25 minutes, and since 2026-10-26 six installs had run
14 to 22 minutes and still passed, unnoticed. Five whys, each step reproduced:

1. The job hit its 25-minute limit in the install step. `confirmed` (jobs API).
2. `timeout 300` never ended a try: `apt-get` kept downloading past 5 minutes, and no warning was
   printed until the try ended by itself. `confirmed` (job logs).
3. Playwright's `--with-deps` runs `sudo -- sh -c "apt-get …"`, and Ubuntu's sudo (`Defaults use_pty`)
   runs it outside the process group `timeout` signals, so `apt-get` survives the timeout. `confirmed`.
4. pnpm waits for that `apt-get`, so `timeout` waits for pnpm until the stall ends by itself.
   `confirmed` (observed; pnpm's code not read).
5. The guard was added without being tried against a stall, and nothing watched how long a passing
   step took. `confirmed`.

**The reproduction**, to check a change to this step: a fresh `ubuntu:26.04` container, a user with
passwordless sudo, Node, pnpm 12 and `@playwright/test`, and apt pointed at a proxy that accepts and never
answers (`Acquire::http::Proxy` in `/etc/apt/apt.conf.d/`), standing in for the stalled mirror. Then
time each chain with a short `timeout` and count `apt-get` processes afterwards:

| Chain | Took | `apt-get` left running |
|---|---|---|
| `timeout` → pnpm → Playwright → `sudo` → `apt-get` (the old step) | the whole stall (241 s, the same as `apt-get` alone) | no |
| `timeout` → node → `sudo` → `apt-get` | the timeout | **yes** |
| `timeout` → pnpm → node → `apt-get`, as root | the timeout | no |
| `timeout --kill-after` → pnpm → … → `sudo` → `apt-get` | the timeout + kill-after | **yes**, holding apt's lock |
| `sudo timeout` → `apt-get` (the new step) | the timeout | no |

Don't turn off sudo's `use_pty` to make the outer timeout work: it's a hardening. Put the timeout
inside sudo instead.
