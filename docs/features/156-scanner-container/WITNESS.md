# 156 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-10-29 15:08 EDT, by a fresh agent (blind). Commit: fa0d5f91 (plus the uncommitted diff and the untracked `docs/features/156-scanner-container/`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Spec, plan and witness record exist | no | confirmed | `ls` |
| 2 | The 156 row in M20 matches the spec | no | confirmed | `README.md:377`; depends on 135, 136, 137, 005, 081 |
| 3 | MVP §15 says 156 is planned | no | confirmed | `git diff` |
| 4 | 135's open question closed | no | confirmed | struck through, answered |
| 5 | The policy's SkillSpector row | no | confirmed | `dependencies.md:116` |
| 6 | E-11 and the class still hold, as decision 2 says | no | partly | they still said Ronne never *installs* it |
| 7 | `pnpm witness:check` | no | confirmed | exit 0 |
| 8 | Today's command scanner described right | no | confirmed | `command-scanner.ts` lines read |
| 9 | "Busy is retried like a timeout" true today | no | not met | a timeout fails for good (`scans.ts`, `finish`) |
| 10 | The wrapper keeps working with the service entrypoint | no | partly | it relies on the `skillspector` entrypoint; no task changed it |
| 11 | Host port 7660 free of Ronne's | no | partly | inside the installer's fallback 7650–7661 and the runbook's suggestion |
| 12 | The image's pins | no | confirmed | `Dockerfile` |
| 13 | Today's compose and installer described right | no | confirmed | `compose.yaml`, `install.sh` |
| 14 | Dependencies exist; decisions don't contradict 135, 136, 147 | no | confirmed | README; 135 d3; 136 d1, d3; 147 |
| 15 | `[risky]` where the rule says | no | partly | task 4 (installer, no-network guarantee) unmarked |

**Overall:** not met. Fixed since:
- A busy scan goes back to the queue, counted against `MAX_SCAN_ATTEMPTS`; every other error fails the scan, as today.
- Task 2 changes `skillspector-sandbox` (and the note's `docker run` lines) to pass `--entrypoint skillspector`.
- E-11 and the class reworded: SkillSpector is installed on the operator's server, by the operator or by the image Ronne's compose builds there; nothing of it is distributed by Ronne.
- The host port is 7670, outside 7650–7661.
- Task 4 is `[risky]`.
- From the witness's questions:
  - the addresses are written by the installer with the profiles (empty otherwise), so an install without the scanner never shows it unreachable;
  - `scanner-semantic` is on its own `scan-egress` network, not the default one, so it can't reach the databases or `web`;
  - an existing install gets the question by rerunning the installer, which keeps the profile for later upgrades.

### Re-check

Witnessed: 2026-10-29 15:11 EDT, by a fresh agent (blind, re-check). Commit: fa0d5f91 (plus the uncommitted diff to `MVP.md`, 135's `SPEC.md`, `features/README.md`, `dependencies.md`, and the untracked `docs/features/156-scanner-container/`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The policy's class, row and E-11 | yes | confirmed | `git diff dependencies.md` |
| 2 | MVP §15 | no | confirmed | `git diff MVP.md` |
| 3 | 135's question closed; the M20 row | no | confirmed | read |
| 4 | `pnpm witness:check` | no | confirmed | exit 0 |
| 5 | The busy requeue against today's queue | yes | partly | `runQueuedScans` takes the oldest queued scan again at once, in the same run; replicas share the scan lease, so "a second replica" isn't the cause |
| 6 | The wrapper with the new image | yes | confirmed | `--entrypoint` in task 2; `--user` overrides the image's user |
| 7 | Port 7670 | yes | confirmed | outside 7650–7661 |
| 8 | `install.sh` can run again on an install | yes | confirmed | keeps version and settings |
| 9 | The networks | yes | not met | `scanner-semantic` and `web` share `scan`, so it can reach `web`; `web` must keep `default` |
| 10 | `[risky]` | yes | confirmed | tasks 2, 3, 4 |
| 11 | Addresses only with the profiles | yes | confirmed | spec and README agree |

**Overall:** not met: rows 5 and 9 (wording). Fixed since:
- `scanner-semantic` can reach Ronne (on `scan`) and the provider, never the databases or the proxy; task 4 checks it can't reach a database and that `web` still answers the proxy.
- `web` stays on the default network.
- A busy scan goes back to the queue and the run stops, so it's tried on the next run.
- The busy cause is another instance sharing the service, or a scan it's still finishing after Ronne gave up on it.

### Re-check

Witnessed: 2026-10-29 15:15 EDT, by a fresh agent (blind, scoped re-check: networks and busy wording). Commit: fa0d5f91 plus the uncommitted diff and the untracked `docs/features/156-scanner-container/`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `scanner` on `scan` only, described the same everywhere | no | partly | "no network at all" in five places beside "on `scan`"; `scanner-semantic` on `scan` too |
| 2 | `scanner-semantic` never reaches the databases or the proxy | no | partly | the proxy's ports are published, so it's reachable as from the internet |
| 3 | `web` joins `scan`, stays on default | no | confirmed | `compose.yaml`; `HOSTNAME=0.0.0.0` |
| 4 | The design fits today's compose | no | partly | with `web` on `scan`, a scanner can open `web:3000` past the proxy and, with `TRUST_PROXY=true`, set any client address |
| 5 | Busy requeue, `MAX_SCAN_ATTEMPTS` | no | confirmed | `scans.ts`, `takeNext`, `recoverStuck` |
| 6 | The run stops on busy | no | confirmed | new work for task 3 |
| 7 | Busy only from another instance or an abandoned scan | no | partly | a replica that lost the 15-minute lease mid-scan is a third case |
| 8 | Spec, plan, README, MVP agree on busy | no | confirmed | read |
| 9 | `pnpm witness:check` | no | confirmed | exit 0 |

**Overall:** not met. Fixed since, with the owner's decision on row 4 (2026-10-29: a scanner must never reach Ronne past the proxy):
- Ronne never shares a network with a scanner: `web` stays on the default network alone; the proxy joins `scan` (with `scanner`) and `scan-semantic` (with `scanner-semantic`), and reaches them on internal ports `:8081` and `:8082`, never published. The addresses are `http://proxy:8081` and `http://proxy:8082`. A scanner reaches Ronne only through Caddy's public route, at its real address (decision 6).
- "No network at all" became "no outbound network" in the spec, the plan, the README row and the MVP row; `scanner` reaches only the proxy.
- `scanner-semantic` can reach the proxy's public ports as any internet client can; it never shares a network with `web` or the databases.
- Busy includes a replica that lost the lease during a long scan.

### Re-check

Witnessed: 2026-10-29 15:21 EDT, by a fresh agent (blind, scoped re-check: the proxy design). Commit: fa0d5f91 plus the uncommitted diff to `MVP.md`, 135's `SPEC.md`, `features/README.md` and `dependencies.md`, and the untracked `docs/features/156-scanner-container/`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `web` alone on default; no scanner opens `web:3000` | no | confirmed | probe with the planned topology: `bad address 'web:3000'` |
| 2 | `scanner` reaches only the proxy, never `scanner-semantic` | no | not met | Caddy's `:8082` answers on every network it joins: `scanner` reached `scanner-semantic`, and through it the internet |
| 3 | A scanner can't fake its address | no | partly | true by default; with `RONNE_TRUSTED_PROXIES=private_ranges` a forged `X-Forwarded-For` reached `web` |
| 4 | An unresolvable upstream doesn't stop Caddy | no | confirmed | Caddy started; the request got 502 |
| 5 | No default limit cuts a long scan or a large body | no | confirmed | Caddy docs: no response timeout; `max_size` opt-in, only on the public site |
| 6 | The internal ports aren't published | no | confirmed | `ports:` lists 80, 443 |
| 7 | The four docs agree; "no network at all" gone | no | confirmed | grep |
| 8 | Busy includes a lost lease | no | confirmed | read |
| 9 | `pnpm witness:check` | no | confirmed | exit 0 |

**Overall:** not met: rows 2, 3. Fixed since:
- The scanner ports serve only requests with the scan key (`RONNE_SCAN_KEY`). The installer generates it and gives it to `web` and the proxy; Ronne sends it as a header, and Caddy strips it before forwarding. So no scanner can call the other, and task 4 checks it.
- Decision 6 holds while `RONNE_TRUSTED_PROXIES` names the real front proxy; the spec says so, and task 6 adds it to the runbook (which suggests `private_ranges` for case 4).
- `httpSkillScanner` maps the proxy's 502 and 504 to unreachable, and tells busy apart from another 503 by the service's JSON body.
- The scanner ports don't copy the public 28 MiB cap.
- The decisions are numbered in order; the README row names both addresses and the key.

### Re-check

Witnessed: 2026-10-29 15:27 EDT, by a fresh agent (blind, scoped re-check: the scan key and the proxy design). Commit: fa0d5f91 plus the uncommitted diff to `MVP.md`, 135's `SPEC.md`, `features/README.md` and `dependencies.md`, and the untracked `docs/features/156-scanner-container/`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Caddy can require a header equal to an environment value | no | confirmed | docs; probe: only the right key passed |
| 2 | Caddy strips the key before forwarding | no | confirmed | probe: `key=[]` upstream |
| 3 | With an empty or unset key the ports still refuse | no | not met | `{env.*}` let an empty header through; `{$…}` stopped Caddy starting |
| 4 | `scanner`'s only path is the proxy's public port | no | confirmed | probe (Docker Desktop) |
| 5 | `scanner-semantic` reaches the internet, not `web`, `scanner` or `:8081` without the key | no | confirmed | probe |
| 6 | No faked address unless trusted proxies cover the scanners | no | confirmed | probe both ways |
| 7 | Today's files and the tasks that change them | no | partly | `compose.yaml:34`, `README.md:98`, `install.md:114`, `install.md:127` recommend `private_ranges`; no task lists them |
| 8 | Spec, plan, README, MVP agree | no | confirmed | two loose lines (the Goal; busy's body) |
| 9 | 135, the policy | no | confirmed | `git diff` |
| 10 | `pnpm witness:check` | no | confirmed | exit 0 |

**Overall:** not met: rows 3, 7. Fixed since:
- The scanner ports fail closed. With no key set, every request gets a worded 403 (an `expression` matcher on `{env.RONNE_SCAN_KEY} == ""`) and the proxy still starts; a wrong key gets its own worded 403, which Ronne shows as such, not as unreachable.
- The key is 32 random bytes in hex, so no `*`.
- The implementer's probe (`caddy:2.11.6`): with no key every request got 403 (none, empty, wrong, `*`, `abc*`); with a key, all of those got 403 and only the right key got 200, with `key=[]` upstream.
- The trusted-proxies lines (`install.md` twice, the `compose.yaml` comment, the root `README.md`) are now in the spec's Documentation section and in tasks 4 and 6.
- The Goal line says "through the proxy"; busy's body is named the same in the spec and the plan.

### Re-check

Witnessed: 2026-10-29 15:33 EDT, by a fresh agent (blind, scoped re-check: fail-closed scanner ports, the key format, trusted proxies, wording). Commit: fa0d5f91 plus the uncommitted diff to `MVP.md`, 135's `SPEC.md`, `features/README.md` and `dependencies.md`, and the untracked `docs/features/156-scanner-container/`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No key: the proxy starts, every request a worded 403 | no | confirmed | probe on `caddy:2.11.6`, unset and empty: `{"error": "not set up"} [403]` |
| 2 | A wrong key: its own worded 403 | no | confirmed | none, empty, `*`, prefixes, upper case, key plus `x`: `{"error": "scan key"} [403]` |
| 3 | The right key passes, stripped | no | confirmed | `key=[] [200]` |
| 4 | 32 random bytes in hex | no | confirmed | spec, plan |
| 5 | Spec and plan agree on failing closed and the wrong-key wording | no | confirmed | read |
| 6 | The trusted-proxies lines in the Documentation section and tasks 4, 6 | no | confirmed | the four lines exist today |
| 7 | The Goal says "through the proxy" | no | confirmed | read |
| 8 | Busy's body named the same | no | confirmed | read |
| 9 | README and MVP rows agree | no | confirmed | `git diff` |
| 10 | `pnpm witness:check` | no | confirmed | exit 0 |

**Overall:** met. Remarks: the header sent twice (a wrong value then the right one) passes, harmless since the key must be known and both copies are stripped; the MVP row now names the scan key too.

## Task 2 — The scan service and its image

Witnessed: 2026-10-29 15:32 EDT, by a fresh agent (blind). Commit: 835a9b54 + working tree (diff to Dockerfile, skillspector-sandbox, skill-scanner.md; untracked scan-service.py, test_scan_service.py). Machine: macOS 27.0.1, Node v24.0.0, Docker Desktop.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Builds from the folder alone, git `ADD` at the pin | no | confirmed | build log; `SkillSpector v2.13.2` |
| 2 | Non-root, the service as entrypoint, `skillspector` kept, no `git` | no | confirmed | `docker image inspect`; `id` |
| 3 | Standard library only; tests pass in the image | no | confirmed | 15 OK |
| 4 | The tests catch what they claim | no | confirmed | four mutations fail |
| 5 | `/health`; a real scan `parseSkillScan` accepts | no | confirmed | internal network; score 100, CRITICAL |
| 6 | Busy 503 | no | confirmed | two real scans |
| 7 | An oversized body refused | no | confirmed | 413 before reading |
| 8 | A timeout refused, the group killed | no | confirmed | 504 at 30 s; nothing left |
| 9 | Path rules as `command-scanner.ts` | no | partly | `A/x`+`a/y`, `Ａ.md`+`a.md` and a 419-UTF-16-unit path accepted |
| 10 | The environment allowlist | no | confirmed | matches `scannerEnvironment` |
| 11 | Folder removed; 4 MiB cap | no | confirmed | tests; `/tmp` empty |
| 12 | A key in no log | no | confirmed | `grep -c` 0 |
| 13 | The wrapper still scans | no | confirmed | `--entrypoint skillspector`; exit 1 |
| 14 | The note matches the Dockerfile | no | confirmed | read |

**Overall:** not met: row 9.

Witnessed: 2026-10-29 15:32 EDT, by a fresh agent (adversarial). Commit: 835a9b54 + working tree (diff to Dockerfile, skillspector-sandbox, skill-scanner.md; untracked scan-service.py, test_scan_service.py). Machine: macOS 27.0.1, Docker Desktop, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass in the image | no | partly | under a noexec `/tmp` 8 error (the stand-in can't run); a 1-in-12 flake |
| 2 | A real scan `parseSkillScan` accepts | no | confirmed | score 100 |
| 3 | Busy 503 | no | confirmed | 20 at once: 18 × 503 |
| 4 | No client or scan holds the lock for good | no | not met | a slow client (lock taken before the body) and a child ignoring SIGTERM or escaping its group kept it at 503 |
| 5 | An oversized body refused | no | confirmed | many `Content-Length` cases |
| 6 | Timeout 504, the whole group killed | no | partly | a scanner exiting 0 on SIGTERM came back as finished |
| 7 | Output cap | no | confirmed | mutation fails |
| 8 | Bad paths refused | no | partly | folder and NFKC clashes accepted; lone surrogates dropped the connection |
| 9 | Malformed requests answered 400 | no | partly | deep JSON (`RecursionError`) and a bad request line dropped the connection |
| 10 | The environment allowlist | no | confirmed | mutation fails |
| 11 | Folder removed after every outcome | no | not met | a deep lock left the folder (the `onexc` callback called `os.open` again) |
| 12 | Nothing logged; errors reveal nothing | no | partly | the request path logged raw (escape codes); tracebacks |
| 13 | Scanner failures answered | no | not met | a missing binary dropped the connection |
| 14 | Non-root; only `/tmp` writable under compose's flags | no | confirmed | `Read-only file system` |
| 15 | The pin by git `ADD`; no `git` | no | confirmed | build log |
| 16 | The wrapper still scans | no | confirmed | and hangs without `--entrypoint` |

**Overall:** not met. Fixed since, on both passes:
- The body is read, within a 60-second socket timeout, before the scan lock is taken, so a slow client holds no scan.
- The output is read with `select` against the deadline, never trusting the scanner:
  - once the scanner exits, its group gets SIGKILL and the pipe two seconds;
  - a timeout is a flag set when the deadline passes, so a scanner exiting 0 on SIGTERM is still a timeout.
- The folder is removed by first letting the owner back into every folder, top down. Stale `ronne-scan-` folders, which a process that escaped its group can leave, are swept as `command-scanner.ts` does.
- The path rules are Ronne's exactly:
  - `caseClash` at every prefix (NFKC, lower, upper, lower);
  - a path that is a file and a folder;
  - 255 UTF-16 units;
  - lone surrogates refused.
- Every error is answered: a missing or non-runnable scanner (`not found`, `not runnable`), deep JSON, a broken request line, and anything unexpected (500 `internal`, logged by type only).
- The log writes only the request line, with control characters replaced.
- Tests: 20 now, each fix covered. Their header says the tests need an executable `/tmp` (the service itself runs with a noexec one). They passed eight times in a row locally and four times in the image.
- Task 4 adds `init: true`, so the service isn't PID 1 and orphans are reaped.

### Re-check

Witnessed: 2026-10-29 16:08 EDT, by a fresh agent (blind, re-check). Commit: 835a9b54 + working tree (diff to Dockerfile, skillspector-sandbox, skill-scanner.md; untracked scan-service.py, test_scan_service.py). Machine: macOS 27.0.1, Node v24.0.0, Docker Desktop.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Builds; non-root; entrypoint; no `git` | no | confirmed | inspect |
| 2 | 20 tests pass, no flake | yes | confirmed | 5 runs in the image |
| 3 | A real scan `parseSkillScan` accepts | no | confirmed | score 100 |
| 4 | Busy 503 | no | confirmed | two real scans |
| 5 | Body before the lock | yes | confirmed | mutation fails |
| 6 | Oversized body | no | confirmed | 413 |
| 7 | Timeout, group killed, trap-term | yes | confirmed | 504 at 32 s; mutation fails |
| 8 | SIGKILL on exit, 2 s for the pipe | yes | partly | the SIGKILL has no test |
| 9 | Ronne's path rules | yes | partly | the file-and-folder check has no test of its own (the write refuses it too) |
| 10 | Folder removal and the sweep | yes | partly | the sweep has no test |
| 11 | Every error answered | yes | partly | `not runnable` and `internal` have no test |
| 12 | Nothing logged | yes | confirmed | mutation fails |
| 13 | No spurious busy | no | not met | a refusal is answered before the lock is released: 6 of 2000 under load got 503 |
| 14 | Environment; cap | no | confirmed | tests |
| 15 | The wrapper | no | confirmed | exit 1 |
| 16 | The note | no | confirmed | read |

**Overall:** not met: row 13.

### Re-check

Witnessed: 2026-10-29 16:15 EDT, by a fresh agent (adversarial). Commit: 835a9b54 + working tree (diff to Dockerfile, skillspector-sandbox, skill-scanner.md; untracked scan-service.py, test_scan_service.py). Machine: macOS 27.0.1, Node v24.0.0, Docker Desktop, image `w156t2r-adv` built from the folder alone.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass, no flake | yes | confirmed | 3 + 3 runs |
| 2 | Each test fails without its behaviour | yes | partly | missed: the group SIGKILL, the sweep, EOF before the exit, the query strip |
| 3 | A real scan | no | confirmed | score 100 |
| 4 | Busy; a slow client holds no scan | yes | confirmed | mutation fails |
| 5 | The whole request within the timeout | yes | partly | the limit is per read: a client sending a byte every 1.5 s stays |
| 6 | Slow clients can't exhaust memory or threads | no | not met | 16 × 39 MB OOM-killed a 512 MB container; 58 idle connections starved a 64-process limit |
| 7 | Oversized body | no | confirmed | mutation fails |
| 8 | Timeout and trap-term | yes | confirmed | mutation fails |
| 9 | Outcomes reported as they were | yes | partly | a scan finishing 0.5 s before the deadline came back as a timeout |
| 10 | `collect` doesn't spin | yes | not met | EOF before the exit spun a core for the 2 s settle |
| 11 | An early close is waited for | no | confirmed | untested |
| 12 | A child in or out of the group doesn't hold it | yes | confirmed | the kill itself untested |
| 13 | The folder removed | yes | confirmed | depth 20000 |
| 14 | The sweep is safe | yes | confirmed | untested |
| 15 | Path rules exactly Ronne's | yes | partly | a lone surrogate refused where Ronne accepts it; Unicode 15 against Node's 16 |
| 16 | Every error answered | yes | partly | http.server's errors in HTML, echoing the request line |
| 17 | The log only the request line | yes | partly | any path logged; a client leaving early printed a traceback with its address |
| 18 | A key in no log | no | confirmed | `grep -c` 0 |
| 19 | The wrapper | no | confirmed | and hangs without `--entrypoint` |

**Overall:** not met. Fixed since, on both passes:
- `collect` stops at once when the output has ended and the scanner has exited, and a deadline passed after the exit is no timeout (a normal scan answered in a fraction of a second, tested).
- At most four connections at once; a fifth gets a 503 straight away (tested).
- A whole-request deadline (a watchdog closes a connection still reading after 60 s), tested with a trickling client.
- The lock is released before any answer goes out (200 refusals in a row, never 503, tested).
- The log names only the route (`/scan`, `/health` or `other`); the server's errors log their type only, never a traceback or an address. http.server's own errors answer JSON, without echoing the request.
- New tests:
  - a child that ignores SIGTERM is really killed (it stops touching its file);
  - a scanner that closes its output early and exits later keeps its exit code;
  - the sweep removes a stale folder and keeps a fresh one and a symbolic link, with its target;
  - `not runnable`;
  - `internal`.
- The lone surrogate is a deliberate difference, now in SPEC.md's edge cases (Ronne's stored paths are UTF-8, so they never hold one); the knowledge note says it and the Unicode version gap.
- 28 tests: three runs on the host, three in the image under CPU load; the real scan still gives score 100 and 14 findings.

### Re-check

Witnessed: 2026-10-29 16:20 EDT, by a fresh agent (blind, re-check). Commit: 835a9b54 + working tree (diff to Dockerfile, skillspector-sandbox, skill-scanner.md; untracked scan-service.py, test_scan_service.py). Machine: macOS 27.0.1, Node v24.0.0, Docker Desktop (10 CPUs), image `w156t2s-blind` built from `scripts/skill-scanner` alone.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass in the image, under load | yes | confirmed | 28 OK 3/3, 4/4 under load, 2/2 at `--cpus 0.5` |
| 2 | A real scan `parseSkillScan` accepts | no | confirmed | CRITICAL |
| 3 | Busy, oversized, timeout, bad path refused | no | confirmed | 503, 413, 504 at 30.2 s, 12 × 400 |
| 4 | A key in no log | no | confirmed | `grep -c` 0, raw requests too |
| 5 | The wrapper | no | confirmed | exit 1 |
| 6 | `collect` stops at once | yes | confirmed | mutation fails |
| 7 | Four connections, a fifth 503 | yes | confirmed | mutation fails |
| 8 | The watchdog | yes | confirmed | mutation fails |
| 9 | Lock released before the answer | yes | partly | the reorder alone is caught by no test (the window is microseconds) |
| 10 | The log names only the route | yes | confirmed | mutation fails |
| 11 | Errors logged by type only | yes | partly | holds; no test |
| 12 | http.server's errors as JSON, no echo | yes | partly | holds; no test of the body or the echo |
| 13 | A child in the group killed | yes | confirmed | mutation fails |
| 14 | An early close keeps its exit code | yes | confirmed | mutation fails |
| 15 | The sweep | yes | confirmed | mutation fails; the `islink` check untested |
| 16 | `not runnable`, `internal` | yes | confirmed | mutations fail |
| 17 | The lone surrogate documented | yes | confirmed | SPEC, note |

**Overall:** not met: rows 9, 11, 12 (test gaps). Remark: zombies without an init (task 4's `init: true`).

### Re-check

Witnessed: 2026-10-29 16:20 EDT, by a fresh agent (adversarial, re-check). Commit: 835a9b54 + working tree (diff to Dockerfile, skillspector-sandbox, skill-scanner.md; untracked scan-service.py e23ad964…, test_scan_service.py 645976328…). Machine: macOS 27.0.1, Node v24.0.0, Docker Desktop.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass, no flake | no | partly | `test_a_child_left_in_the_group_is_killed` failed 1 of 3 at `--cpus 0.25` (the child killed before its first touch) |
| 2 | Each new test fails without its behaviour | no | partly | not caught: http.server's `send_error`, a traceback in `handle_error`, no wait in the EOF branch, the sweep's `islink` |
| 3 | A real scan | no | confirmed | score 100 |
| 4 | A fifth connection 503 at once | no | confirmed | test; mutation |
| 5 | The cap's semaphore never leaks | no | not met | a handler thread that fails to start (a pids limit) never gives its slot back; after four, everything is 503 |
| 6 | Four ~40 MB connections under 1 GB | no | confirmed | peak 461 MB, no OOM |
| 7 | The watchdog | no | confirmed | 504 scans not cut |
| 8 | Outcomes as they were | no | confirmed | probes |
| 9 | No CPU spin | no | confirmed | cpu 0.01 s |
| 10 | Lock before the answer | no | confirmed | mutation caught here |
| 11 | The log names only the route | no | partly | up to 10 characters of a client's method logged |
| 12 | `send_error` JSON; `handle_error` type only | no | confirmed | raw probes; untested |
| 13 | A key in no log | no | confirmed | `grep -c` 0 |
| 14 | The sweep | no | confirmed | test |

**Overall:** not met: row 5 (a slot leak), with rows 1, 2, 11. Two re-checks of this risky task have run: the owner decides what follows.

The owner chose one more round (2026-10-29). Fixed since:
- A handler thread that fails to start gives its connection slot back (tested by making one thread fail to start for each of five connections, then scanning).
- The log names the method only as `GET`, `POST` or `other`.
- The child-killed test's stand-in waits for its child's first beat before exiting, so the test can't race it.
- New tests:
  - http.server's errors answer JSON, with an `HTTP/1.x 4xx` status line and nothing from the request echoed;
  - a client that leaves while its scan runs leaves no traceback or address in the log;
  - waiting for a scanner that closed its output early spends no CPU;
  - neither the sweep nor the removal follows a link out of the folder (the link's target keeps its mode);
  - the lock is free while a slow answer is still going out.
- Each of the seven fixes, undone one at a time, fails a test (run by the implementer).
- 32 tests: three runs on the host; four in the image with another container keeping eight processes busy, two at one CPU and two at a quarter of one.

### Re-check

Witnessed: 2026-10-29 16:54 EDT, by a fresh agent (blind). Commit: 835a9b54 + working-tree diff (untracked `scan-service.py`, `test_scan_service.py`). Machine: macOS 27.0.1, Node v24.0.0, Docker 29.9.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The tests pass in the image | no | partly | 10 of 11 runs OK; one at `--cpus 0.5` under host load: `test_a_normal_scan_is_answered_at_once` 0.806 s against 0.8 |
| 2 | A real scan `parseSkillScan` accepts | no | confirmed | CRITICAL |
| 3 | Busy | no | confirmed | 503 |
| 4 | Oversized | no | confirmed | 413 |
| 5 | Timeout | no | confirmed | 504 at 30 s; nothing left |
| 6 | Bad path | no | confirmed | 400 |
| 7 | A key in no log | no | confirmed | `grep -c` 0, many raw requests |
| 8–15 | This round's fixes | yes | confirmed | eight mutations, each fails its test |
| 16 | The wrapper | no | confirmed | rc 1 |

**Overall:** not met: row 1 (a timing margin).

### Re-check

Witnessed: 2026-10-29 16:55 EDT, by a fresh agent (adversarial, re-check). Commit: 835a9b54 + working tree (diff to Dockerfile, skillspector-sandbox, skill-scanner.md; untracked scan-service.py 5536ed3b0bc0…, test_scan_service.py ad4f8c498fa6…). Machine: macOS 27.0.1, Node v24.0.0, Docker Desktop (10 CPUs), image `w156t2t-adv` built from `scripts/skill-scanner` alone.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No flake, under load and at `--cpus 0.25` | no | confirmed | 9/9 OK |
| 2 | Each new test fails when its fix is undone | no | confirmed | nine mutations |
| 3 | The slot given back | no | confirmed | at a real pids limit too |
| 4 | The log | no | confirmed | 19 raw requests |
| 5 | JSON errors, no echo | no | confirmed | 400–505 |
| 6 | Four connections bound the memory under 1 GB | no | not met | one ~40 MB body of nested empty lists OOM-killed the container: `json.loads` built ~21 M lists before any check |
| 7 | Nothing outside its folders followed or removed | no | confirmed | mutations; no leftovers |

**Overall:** not met: row 6. Fixed since:
- The body's `[` and `{` are counted before parsing, and more than a real request can hold (one object per file, the brackets a path may contain, the request's own) is refused as too large. Tested with a nested-list body, and a request whose paths hold brackets still passes.
- The implementer's run in the image under `--memory 1g` with that exact ~40 MB bomb answered 413; the container kept running, not OOM-killed, and `/health` answered 200.
- The timing test sets the settle to 3 s and asks for under 2, so load can't fail it and a scan that waited for the settle still would.
- The `Server` header has no trailing space.
- 33 tests pass.

### Re-check

Witnessed: 2026-10-29 17:15 EDT, by a fresh agent (blind). Commit: 835a9b54 + working-tree diff (incl. untracked scan-service.py, test_scan_service.py). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Brackets counted before parsing | no | confirmed | `read_request` |
| 2 | A ~40 MB bomb under 1 GB: 413, still running | no | confirmed | 15 MiB; without the check 1023 MiB |
| 3 | Brackets in paths still scan | no | confirmed | 1000 bracket-heavy paths → 200 |
| 4 | The bomb's test guards the check | no | not met | its 1001 entries hit `MAX_FILES` too, so it passes without the check |
| 5 | The timing test doesn't flake | no | confirmed | 9 runs under load |
| 6 | It fails when the settle is always waited for | no | confirmed | mutation |
| 7 | No trailing space | no | confirmed | raw header |
| 8 | The suite in the image | no | confirmed | 33 OK |

**Overall:** not met: row 4.

### Re-check

Witnessed: 2026-10-29 17:17 EDT, by a fresh agent (adversarial). Commit: 835a9b54 + uncommitted diff (incl. untracked `scan-service.py`, `test_scan_service.py`). Machine: macOS 27.0.1, Docker 29.9.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A bracket body refused before `json.loads` | no | confirmed | four at once: 413, peak 168 MB; without the guard OOM-killed |
| 2 | No other JSON under the limit passes 1 GB with four connections | no | confirmed | worst found 882 MB (unique short keys), no OOM; one body parsed at a time |
| 3 | No request Ronne could send is refused | no | confirmed | the bracket maximum accepted |
| 4 | A test shows the guard is needed | no | not met | the suite passes with the guard removed |
| 5 | The timing change can't hide a spin | no | confirmed | mutation fails |

**Overall:** not met: row 4. Fixed since:
- The bomb test now sends one entry with 300,000 nested lists, so only the bracket count can refuse it. With the guard removed, it fails (run by the implementer).
- `BODY_LIMIT` is down from 40 to 32 MiB, which widens the margin under 1 GB. Ronne sends at most 20 MB of files, about 27 MB in base64.
- 33 tests pass on the host and in the image; the real scan gives score 100 and 14 findings.

### Re-check

Witnessed: 2026-10-29 17:19 EDT, by a fresh agent (blind, re-check). Commit: 835a9b54 + working-tree diff (incl. untracked `scan-service.py`, `test_scan_service.py`). Machine: macOS 27.0.1, Node v24.0.0, Python 3.14.6.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The bomb test fails without the bracket check, passes with it | no | confirmed | mutation → `(400, …) != (413, …)` |
| 2 | 32 MiB admits Ronne's largest request | no | confirmed | 500 files, 20 MiB, 255-unit paths: 28.35 MB and 28.10 MB, both 200 over HTTP |
| 3 | The suite passes | no | confirmed | 33 OK |

**Overall:** met.

### Re-check

Witnessed: 2026-10-29 17:24 EDT, by a fresh agent (adversarial, re-check). Commit: 835a9b54 + uncommitted diff (incl. untracked `scan-service.py`, `test_scan_service.py`). Machine: macOS 27.0.1, Node v24.0.0, host Python 3.14.6.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only the bomb test and `BODY_LIMIT` changed | no | confirmed | `diff` against the last snapshot |
| 2 | The bomb test fails without the check | yes | confirmed | mutations |
| 3 | It depends on the check, not on recursion limits | no | confirmed | 413 only from the check; 400 otherwise, even at a huge recursion limit |
| 4 | 32 MiB refuses nothing Ronne can send | no | confirmed | worst case 27.11 MiB measured, 200 |
| 5 | The bracket cap refuses nothing Ronne can send | no | confirmed | at most 128,003 for 500 files |
| 6 | Memory per connection lower | yes | confirmed | four × 32 MiB |

**Overall:** met. Remarks: the bomb is 17% over the cap (it would fail loudly, not silently, if the limits grew); the comment's "27 MB" now reads "20 MiB … about 28 MB".

## Task 3

Witnessed: 2026-10-29 17:50 EDT, by a fresh agent (blind). Commit: d23daa7a + working-tree diff (25 modified, 3 untracked). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Stand-in server tests cover ready, unreachable, busy, timeout, the cap, a bad report, the semantic route | no | confirmed | 141 pass; one mutation per rule fails a test |
| 2 | Busy told from another 503 | no | confirmed | HTML 503 → unreachable; but the status isn't checked |
| 3 | Unreachable: no answer, drop, 502, 504, redirect | no | confirmed | tests |
| 4 | The scan key in a header | no | confirmed | mutation fails |
| 5 | The proxy's 403 worded as such | no | partly | needs the proxy's JSON body (task 4) |
| 6 | Bad addresses refused | no | partly | parsed out, but a command beside it runs silently, and the tab doesn't say |
| 7 | An address wins over a command | no | confirmed | mutations |
| 8 | Static to one address, semantic to the other | no | confirmed | Host header; no key on a static scan |
| 9 | Busy requeued, counted, run stops | no | confirmed | four databases, mutations |
| 10 | The tab's states from a short `/health` | no | confirmed | no test of its timeout |
| 11 | A real scan through the image | no | confirmed | 14 findings; busy and bad paths real |
| 12 | The command path's tests | no | confirmed | pass |
| 13 | Messages in en, pt, fr | no | confirmed | parity tests |
| 14 | Types and lint | no | confirmed | clean |

**Overall:** not met: rows 5 and 6.

### Adversarial pass

Witnessed: 2026-10-29 17:36 EDT, by a fresh agent (adversarial). Commit: d23daa7a + working-tree diff. Machine: macOS (Darwin 27), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Never longer than the timeout plus grace | no | not met | headers then a stall or a drip: no result at 90 s (POST with `redirect: "error"` ignores the abort once the body started) |
| 2 | The answer capped | no | confirmed | endless chunked; mutation |
| 3 | Every service error a fixed `ScanError` | no | not met | `{"error":"constructor"}` reads Object.prototype; the job fails and the scan stays running |
| 4 | Non-JSON 200s, redirects, bad exits | no | confirmed | probes |
| 5 | Busy only the 503 | no | partly | matched by body alone |
| 6 | Provider variables only to the semantic address | no | confirmed | code and mutation |
| 7 | The key header | no | confirmed | mutation |
| 8 | Bad addresses refused, tab says so | no | not met | silent; the command beside it runs |
| 9 | Busy requeue | no | confirmed | mutations |
| 10 | Address wins, everywhere | no | confirmed | mutations |
| 11 | Saving keeps root's command choice | no | partly | code right, no test |
| 12 | `/health` root-only, can't hang the page | no | partly | no test of the order; any JSON is "ready"; version uncapped |
| 13 | Messages | no | confirmed | grep |
| 14 | Tests pass | no | confirmed | 141 and 36 |

**Overall:** not met: rows 1, 3, 8. Fixed since:
- One deadline of Ronne's own covers the whole request, the body included. Each read is raced with it, `redirect` is `manual` (a 3xx is no answer), and the reader is cancelled. Tests cover a hang, a stall after headers, a drip, and a fetch that ignores its abort signal, for scans and for `/health`.
- Service errors come from a `Map`: `constructor`, `__proto__` and the rest are "refused".
- Busy counts only on a 503, and the scan key only on a 403. Anything else is "refused".
- A static address that's set but isn't a plain http(s) one (credentials, a path, a query, even an empty `?` or `#`) means no scanner: the command beside it doesn't run. The tab says which address is wrong, a bad semantic address, and a semantic one set with no static one, in en, pt and fr. The SPEC edge case now says this. A bad command was never refused at start-up either.
- `/health` is ready only for `{"scanner": "skillspector"}`, with the version kept only if it's at most 32 version characters.
- New tests for saving the form while a service is set (it keeps root's command choice) and for `/health` being asked only after the permission check.
- The implementer undid each of these fixes in turn, and each makes a test fail.
- The whole web suite passes (two unrelated timing tests timed out at a load average of 166 and pass alone), lint and types are clean, and a real scan through the image gives 14 findings.
- Row 5's JSON body is task 4's to give; the 403 is read by status and body together.

### Re-check

Witnessed: 2026-10-29 18:13 EDT, by a fresh agent (blind). Commit: d23daa7a + working-tree diff (25 modified, 3 untracked). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | One deadline over the whole request, body included | no | confirmed | mutations; a drip and a hang give unreachable at the deadline |
| 2 | A redirect is no answer | no | confirmed | 307 to a second server: never hit |
| 3 | Service errors from a Map | no | confirmed | `constructor`, `__proto__`, `toString` → refused |
| 4 | Busy only on a 503, the key only on a 403 | no | confirmed | probes and mutations |
| 5–7 | Unreachable pages; `/health` shape, version, 3 s | no | confirmed | probes |
| 8–10 | Invalid address → no scanner; problems; messages | no | confirmed | mutations; i18n tests |
| 11 | The proxy's 403 body | no | can't check here | the proxy is task 4's; a bare 403 would read as unreachable |
| 12–14 | Keep root's command; `/health` after permission; a real scan | no | confirmed | 14 findings |

**Overall:** not met: row 11 waits for task 4. Test gaps: the race around `fetcher`, the 3xx branch, the 3 s constant.

### Re-check

Witnessed: 2026-10-29 18:17 EDT, by a fresh agent (adversarial). Commit: d23daa7a (plus the uncommitted diff and the three untracked files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Task tests pass on SQLite, PostgreSQL 15, MySQL 8.4 | no | confirmed | 149 unit, 91 db |
| 2 | Stall, drip, slow headers stop at the deadline, no timer left | no | confirmed | `unreachable` at 1005–1011 ms; the socket closes |
| 3 | A body ending at the deadline: whole or unreachable | no | confirmed | no unhandled rejection |
| 4 | A 3xx never followed or read | no | confirmed | including through the job |
| 5 | Map; busy 503; key 403 | no | confirmed | real image: three at once → ok, busy, busy |
| 6 | Hostile reports never throw | no | confirmed | 1e6-deep nests |
| 7 | `/health` shape, version, timeout | no | confirmed | mutations |
| 8 | Addresses | no | confirmed | IPv6, whitespace, odd forms |
| 9 | Each fix fails a test when undone | no | partly | M2 (race around `fetcher`), M11 (3xx), M13 (`clearTimeout`) still pass |
| 10 | No scan stays running; lease released | no | confirmed | three databases |
| 11–12 | Real image; messages | no | confirmed | 14 findings through the image; 12 message tests pass |

**Overall:** not met: row 9. Fixed since:
- Tests for a fetch that never settles and ignores its signal, a 3xx whose body looks like the service's (and one whose body never ends), a timer left open after a scan, and the health timeout being 3000 ms.
- The implementer undid each in turn (M2, M11, M13, and the constant at 30000), and each makes a test fail. 29 tests pass.
- Task 4's *Done when* now holds the proxy's 403 JSON bodies, which row 11 of the blind pass waited for.

### Re-check

Witnessed: 2026-10-29 18:30 local, by a fresh agent (blind, re-check). Commit: d23daa7a plus the uncommitted diff and untracked files. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A fetch that never settles and ignores its signal ends as unreachable | no | confirmed | 29/29 pass; without the race around `fetcher` only that test fails |
| 2 | A 3xx is no answer whatever its body says; an endless one returns in under 1 s | no | confirmed | without the 3xx check only that test fails |
| 3 | No timer left after an answered scan | no | confirmed | without `clearTimeout` only that test fails |
| 4 | The health timeout is 3000 ms | no | confirmed | at 30000 only that test fails |
| 5 | The timer test restores the globals it patches | no | confirmed | `finally` block; no cross-test effects |
| 6 | Not flaky | no | confirmed | 5 plain runs and 3 under 8 busy loops: 29/29 each |
| 7 | Types clean, repository untouched | no | confirmed | `tsc` no output; `git status` md5 unchanged |

**Overall:** met.

### Re-check

Witnessed: 2026-10-29 18:35 local, by a fresh agent (adversarial). Commit: d23daa7a plus the staged task-3 diff. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The test for headers that never come fails without the race around `fetcher` | no | confirmed | race removed → fails at 5010 ms |
| 2 | The test for a fetch that ignores its signal fails without the race in `readAnswer` | no | confirmed | fails at 5006 ms |
| 3 | The 3xx test fails without the branch, and if the body is read | no | confirmed | `if (false)` → fails; reading the body → endless case fails |
| 4 | The timer test fails without `clearTimeout`, and with `unref` instead | no | confirmed | both fail |
| 5 | The 3xx handling cancels the body | no | partly | removing `body.cancel()` passes all 29: no test observes it |
| 6 | Every status 300–399 is a redirect | no | partly | `=== 302 \|\| === 307` passes all 29 |
| 7 | The health timeout is 3000 ms by default, in the tab's call | no | partly | `timeoutMs = 60000`, or 60000 from `scannerServices`, passes all 29 |
| 8 | Not flaky | no | confirmed | 8 runs, 4 under load: 29/29 |
| 9 | Nothing else wrong in `call`, `readAnswer`, `serviceHealth`, `scannerServices` | no | confirmed | read; 302 tests, 36 db tests, `tsc` clean |

**Overall:** not met: rows 5, 6 and 7, all weak tests, no bug in the code. Fixed since:
- The 3xx test runs statuses 300, 301, 302, 303, 305, 307, 308 and 399 with a service-looking body, and checks 299 and 400 are answers. A redirect whose stream records a `cancel` must see it called.
- A test reads the longest timer a call sets with no timeout argument, for `serviceHealth` and for `scannerServices`, and expects 3000.
- The implementer ran five weaker variants (302/307 only, 301–398, no cancel, 60000 default, 60000 from `scannerServices`): each fails a test. 29 tests pass.

### Re-check

Witnessed: 2026-10-29 19:07 local, by a fresh agent (adversarial). Commit: d23daa7a plus the staged task-3 work. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The 3xx test fails when the 3xx check is wrong | no | confirmed | `status === 302 \|\| status === 307`, `> 300 && < 399` and `>= 300 && < 400 && !== 308` each → 1 failed, 28 passed |
| 2 | It fails when the redirect body isn't cancelled, or is cancelled on the wrong object | no | confirmed | no `cancel()` → fails; `response.clone().body` cancelled → fails |
| 3 | The default-deadline test fails on a wrong default | no | confirmed | `timeoutMs = 60000`, `scannerServices` passing 60000 and `HEALTH_TIMEOUT_MS = 5000` each → fails |
| 4 | A deadline under 3000 for the semantic service is not caught (known, harmless: "three seconds at most" holds) | no | confirmed | 3000 for the static and 1000 for the semantic service → 29 of 29 pass, as the witness showed. Its report called the row "partly"; recorded here as the claim it evidenced, with the owner's acceptance of test-strength findings (2026-10-29) |
| 5 | The tests are not flaky | no | confirmed | 8 runs, 4 under 8 busy loops: 29/29 |
| 6 | The timer-recording test restores `globalThis.setTimeout` | no | confirmed | `finally`; nothing later affected |
| 7 | Scoped suites and typecheck are green | no | confirmed | 14 files, 302 tests; `tsc` no output |

**Overall:** met. No bugs found.

## Task 4

Witnessed: 2026-10-29 23:50 UTC, by a fresh agent (blind). Commit: 7784173b plus the uncommitted diff of compose.yaml, compose.build.yaml, scripts/install/install.sh and scripts/install/test-install.sh, and the untracked scripts/skill-scanner/scanner.compose.yaml. Machine: macOS (Darwin 27.0.0), Docker Desktop, Node 24 (host); the web container's own Node ran the Ronne-side probes.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The proxy's refusals for the scan key are JSON 403 on `/scan` and `/health` of :8081 and :8082 | no | confirmed | no key, empty, wrong and `*` → `403 {"error": "scan key"}`; right key → 200; proxy with no key → `{"error": "not set up"}` |
| 2 | The same refusals hold from the scanners' own networks | no | confirmed | 20 requests per network, all 403 |
| 3 | With the key unset or containing `*`, the proxy starts and refuses everything | no | confirmed | "Up 3 seconds" each time |
| 4 | Ronne's `web` reaches both scanners through the proxy, and a scan works with no `.env` editing | no | confirmed | `/health` 200 on both with the key, 403 without; a POST `/scan` → 200 score 42. No Caddy upload-cap probe succeeded |
| 5 | `scanner` can't open a connection outside, or to `web` or `scanner-semantic` | no | confirmed | name resolution fails; 1.1.1.1:443 unreachable |
| 6 | `scanner-semantic` can't reach `web` or a database, but has internet | no | confirmed | `web` and `scanner` don't resolve; 1.1.1.1:443 connects |
| 7 | Scanner services are read-only, non-root, no capabilities, limited, healthy, no published ports | no | confirmed | `docker inspect`: user 10001, ro, cap_drop ALL, 1 GiB, 256 pids, healthy |
| 8 | The scan key never reaches a scanner | no | confirmed | an echo server saw no key header; the scanner's env has none |
| 9 | `compose.yaml` with no profile still starts web and proxy, and `config` is valid | no | confirmed | only proxy and web, both Up; public site 307 |
| 10 | The scanner builds from this checkout and from the git URL | no | partly | built from both, but the daemon wrote no log, so the fetch isn't shown; GitHub's URL waits for the merge |
| 11 | `pnpm test:install` passes and catches mutations | no | confirmed | all passed; 5 mutations each fail named tests |
| 12 | `--scanner no/yes/semantic` and the `--yes` rerun write the right `.env` | no | confirmed | `test-install.sh` |
| 13 | A person's own profiles and scanner address survive | no | confirmed | tests and mutations |
| 14 | The question's defaults | no | confirmed | driven in a pty under dash |
| 15 | The `RONNE_TRUSTED_PROXIES` comment | no | confirmed | case 4 of compose.yaml |
| 16 | The host compose file works on 127.0.0.1:7670 | no | confirmed | healthy; `/health` and a scan answered |

**Overall:** not met: row 10 (the fetch from the git daemon isn't shown) and row 4 (the upload cap isn't shown).

### Adversarial pass

Witnessed: 2026-10-29 23:40 local, by a fresh agent (adversarial). Commit: 7784173b plus the uncommitted task-4 diff. Machine: macOS (Darwin 27.0.0, Docker Desktop).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `scanner` can't reach anything but the proxy's :80, :8081 and :8082 | no | confirmed | `web`, databases, the other scanner and the host don't resolve; external and metadata addresses unreachable; one /16 route, no default |
| 2 | `scanner-semantic` can't reach `web` or a database, and has egress | no | confirmed | it also reaches host services through `host.docker.internal` on Docker Desktop (not in the spec) |
| 3 | The ports need the scan key | no | confirmed | no, empty, wrong, prefix, `*`, placeholder text and comma-list keys all 403 |
| 4 | Repeated or smuggled key headers don't let a non-holder in | no | confirmed | no bypass |
| 5 | Caddy strips the key before the scanner | no | confirmed | an echo server saw no key; a forged X-Forwarded-For became the proxy's address |
| 6 | Fails closed with no key or a `*` | no | confirmed | proxy running, 0 restarts |
| 7 | Odd keys don't inject | no | confirmed | spaces, quotes, braces, `\|`; the key is never in Caddy's config |
| 8 | A scanner can't reach Ronne past the proxy or spoof its address | no | confirmed | X-Forwarded-For replaced; the admin API is refused |
| 9 | Method and URI tricks | no | confirmed | the gate holds |
| 10 | Resource limits hold, the public site keeps working | no | confirmed | 100 MB body (no cap, as designed), 1500 half-open connections |
| 11 | `RONNE_DOMAIN`, `RONNE_TLS`, `RONNE_TRUSTED_PROXIES` leave :8081 plain HTTP with the gate | no | confirmed | with a domain, internal TLS and a trusted proxy set, :8081 answered 200 over HTTP; TLS on it failed |
| 12 | `docker compose config` valid; the key's visibility is documented | no | partly | the key shows in `docker inspect` and `config` of web and proxy; nothing said so |
| 13 | The scanner builds from the git context | no | confirmed | a missing ref fails loudly |
| 14 | `pnpm test:install` passes | no | confirmed | `dash` and `bash` both print all passed |
| 15 | The installer tests catch undone rules | no | confirmed | 13 mutations; the interactive questions, the no-openssl fallback and quoted or CRLF values are untested |
| 16 | The installer flows | no | confirmed | dash and bash, and a pty |
| 17 | A scanner image is rebuilt when the install upgrades | no | not met | the tag is fixed, so `up -d` keeps the old image |
| 18 | The person's own values survive odd `.env` input | no | partly | quoted values and CRLF don't: `COMPOSE_PROFILES="postgres,scanner",scanner` breaks Compose |

**Overall:** not met: rows 12, 17 and 18. Fixed since:
- The image is tagged with the ref (`ronne-skillspector:${RONNE_SCANNER_REF:-main}`), so an upgrade builds the new scanner; a copy of the script that isn't a release passes `--build`. A test fails if the tag is fixed again.
- `env_get` drops a trailing carriage return and the quotes around a value, as Compose does; a test writes the scanner into a quoted, CRLF `.env` and reads the result back.
- `env_set` writes its temporary file private from the start (`umask 077`, put back after), and a test sees mode 600 on the file before it is moved.
- The compose file's comments say the key is readable by anyone who can run `docker inspect`, that it must be hex, and that `scanner-semantic` reaches host services on Docker Desktop.
- The implementer undid each of these in turn (no quote strip, no CR strip, no umask, umask not put back, a fixed tag): each fails a test.
- Row 10 of the blind pass: a git server run with `--verbose` logged two `upload-pack` requests during `docker compose build --no-cache scanner` from `git://…#v0.0.2:scripts/skill-scanner`, and the image `ronne-skillspector:v0.0.2` was built.
- Row 4: a 20 MiB and a 30 MiB body through :8081 got 200 from the service; the public site's 28 MiB cap refused the 30 MiB body.

### Re-check

Witnessed: 2026-10-29 20:35 -03, by a fresh agent (blind, scoped to the fixes). Commit: 7784173b plus the uncommitted task-4 diff. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `test-install.sh` passes under dash and bash | no | confirmed | both end `all passed` |
| 2 | `env_get` drops a trailing CR, and a test fails without it | no | confirmed | `tr -d '\r'` removed → FAIL env_get drops a trailing carriage return |
| 3 | `env_get` drops double and single quotes, and a test fails without it | no | confirmed | quote `sed` removed → three FAILs |
| 4 | `env_set` creates its temporary file private | no | confirmed | `umask 077` removed → mode 644, FAIL |
| 5 | `env_set` restores the umask | no | confirmed | restore removed → umask 0077, FAIL |
| 6 | The image is tagged with the ref, and a test guards it | no | confirmed | `config`: `:main`, `:v9.9.9` on all three services; hard-coded tag → FAIL |
| 7 | install.sh passes `--build` when the script isn't a release and the scanner is on | no | partly | the code is right but no test covers it: removing `&& ! is_release` left the suite green |
| 8 | A quoted CRLF `.env` goes through the installer and gives an `.env` Compose accepts | no | confirmed | `cat -vt`: no quotes, no `^M`; `docker compose config` rc 0 |
| 9 | A new ref builds a new image; the same ref reuses it | no | confirmed | own git daemon, three tags: same ref `CACHED`, new ref builds, tag absent builds |
| 10 | compose.yaml comments on key visibility, hex and host.docker.internal | no | confirmed | present |

**Overall:** not met: row 7.

### Re-check

Witnessed: 2026-10-29, by a fresh agent (adversarial). Commit: 7784173b plus the uncommitted task-4 diff. Machine: macOS (Darwin), Docker Compose v5.6.0, dash and bash 3.2.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `env_get` reads a value the way Compose does | no | confirmed | 18 cases under dash and bash; a CR in the middle of a value is dropped and a key name with regex characters also matches, neither reachable with the installer's fixed names |
| 2 | `env_set` and `write_scanner` never leave a line Compose rejects | no | confirmed | quoted CRLF `.env` → `COMPOSE_PROFILES=postgres,scanner,scanner-semantic`; `docker compose config` accepts it |
| 3 | The temporary file is mode 600 and the umask is put back | no | confirmed | `.env` is `-rw-------`; umask 0022 afterwards; without the line the test fails |
| 4 | The image tag follows `RONNE_SCANNER_REF`, and a non-release copy passes `--build` | no | confirmed | `config` gives `:v1.2.3`; `--dry-run` builds only the scanner |
| 5 | A bad `RONNE_SCANNER_REF` fails clearly | no | partly | `feature/x` passes `config`, then fails at build with "invalid reference format"; nothing says a branch name with `/` can't be a tag |
| 6 | No regression in the isolation and the key gate | no | confirmed | config check only |

**Overall:** not met: row 5. Also found: an inline `# comment` after `COMPOSE_PROFILES=scanner` made the installer read the scanner as off; two mirrors at one ref share a tag; the earlier version's image stays on disk. Fixed since:
- compose.yaml says the ref must be a valid image tag (a release tag or `main`, not a branch with `/`), that the previous image stays until removed (and how), and that mirrors at one ref share a tag.
- `env_get` drops a trailing ` # comment` on an unquoted value, and keeps a `#` inside quotes or with no space before it.
- Tests for `--build`: a non-release run with the scanner passes it; with `--scanner no` it doesn't; a release (the script with a version baked in) doesn't, and pins `RONNE_SCANNER_REF=v0.3.0`. Tests for the three comment cases.
- The implementer undid seven rules (no `! is_release`, always `--build`, no scanner check, comment not stripped, comment stripped in quotes, `#` with no space stripped, release ref not pinned): each fails a test.

### Re-check

Witnessed: 2026-10-29, by a fresh agent (blind re-check). Commit: 7784173b plus the uncommitted task-4 diff. Machine: macOS (Darwin 27.0.0), shell tests only.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `dash` and `bash scripts/install/test-install.sh` pass | no | confirmed | both print `all passed`; two dash runs in a row both pass |
| 2 | The new section passes on its own | no | confirmed | copied with the header and fakes: 53 ok under dash and bash |
| 3 | Non-release with the scanner passes `--build`; `--scanner no` and a release don't | no | confirmed | three mutations each fail a test |
| 4 | A release pins `RONNE_SCANNER_REF=v<version>` | no | confirmed | pin replaced by `main` fails 2 tests |
| 5 | `env_get` drops a trailing comment and keeps `#` inside quotes or with no space before it | no | confirmed | three mutations fail 3, 1 and 1 tests |
| 6 | `FAKE_LOG` doesn't leak | no | confirmed | exported at the build tests, unset after |
| 7 | The compose.yaml comment on the ref is accurate | no | partly | `config` accepts `feature/x`; that Docker rejects a `/` in a tag is shown by reading, not a build |
| 8 | The profiled config is valid | no | confirmed | `config -q` rc 0 |

**Overall:** met.

### Re-check

Witnessed: 2026-10-29, by a fresh agent (adversarial, blind). Commit: 7784173b plus uncommitted task-4 work. Machine: macOS (Darwin 27.0.0), shells: dash and bash 3.2.57.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `env_get` drops a trailing ` # comment` on an unquoted value, tabs included | no | confirmed | dash and bash 3.2 identical: `a # c`→`a`, `a<TAB># c`→`a`, `a # c<CR>`→`a` |
| 2 | A `#` with no space before it, or inside quotes, is kept | no | confirmed | `#x`, `p#ss`, `http://x/#f`, `"a # b"` kept |
| 3 | A quoted value followed by a comment | no | partly | `"a" # c` and `'a' # c` come back with the quotes and comment; Compose reads `a` |
| 4 | What `env_set` writes back after `env_get` dropped a comment | no | confirmed | no database password goes through `env_get`; the scan key is rewritten only at exactly 64 hex |
| 5 | `--build` for a non-release script with the scanner on, not for `--scanner no` or a release | no | confirmed | a `--yes` rerun takes SCANNER from `.env` and the rule still applies |
| 6 | A release pins the ref; a non-release writes `main` | no | confirmed | the release test seds `@RONNE_VERSION@` into a copy and can't pass for the wrong reason |
| 7 | The new tests pass and fail without their rules | no | confirmed | eight mutations each fail ≥1 test |
| 8 | The repository is unchanged by this pass | no | confirmed | `git status --short` same before and after |

**Overall:** not met: row 3. Fixed since:
- `env_get` now reads a quoted value as Compose does: it ends at the closing quote, and only whitespace and a comment may follow (`COMPOSE_PROFILES="scanner" # x` → `scanner`). A quote of the other kind inside, a `#` inside the quotes, an empty quoted value and an opening quote with no closing one are covered.
- Tests for each, and `scanner_now` on `COMPOSE_PROFILES="scanner" # x` says yes.
- The implementer undid six rules (no closing-quote rule, a comment after the quote kept, anything accepted after the quote, no whitespace trim, an unquoted comment kept, the wrong first character): each fails a test under dash and bash.

### Re-check

Witnessed: 2026-10-29, by a fresh agent (adversarial, blind). Commit: 7784173b plus the uncommitted task-4 diff. Machine: macOS (Darwin), dash and bash 3.2.57.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A quoted value ends at its closing quote; only whitespace and a comment may follow | no | confirmed | `"a"#c`, `"a"<tab>#c`, `'a'#`, `"a" # "b"` and `"a"   ` all → a, as `docker compose config` reads them |
| 2 | The fallback strips two outer quotes, else keeps the value | no | confirmed | `"a"b"`→`a"b`, `"a" "b"`→`a" "b`, `""`→empty, `"`→`"`, `""""`→`""`; the invalid ones are .env errors in Compose |
| 3 | `*`, `?`, `[` in the value are safe; dash and bash 3.2 agree | no | confirmed | 29 cases, `diff` identical |
| 4 | An unquoted value loses a trailing ` # comment` and keeps `=` and `#` with no space before it | no | confirmed | same as Compose |
| 5 | Callers are unaffected by an empty line for a missing key | no | confirmed | all 17 uses are inside `$(...)` or filtered |
| 6 | The earlier tests still exercise their intent, and the new ones fail when each rule is removed | no | partly | three mutations survived: a tab after the closing quote, a quote inside the comment, the single-quote fallback; behaviour is right |

**Overall:** not met: row 6. Fixed since:
- Four tests: a tab between the closing quote and the comment, a quote inside the comment (`"a" # "b"`), single quotes with one inside (`'a'b'`), and only whitespace after the closing quote.
- The implementer undid the three surviving rules (the after-quote strip to spaces only, the greedy first quote, no single-quote fallback): each fails a test under dash and bash.
- Not reachable from what the installer writes: a backslash escape such as `V="a\"b"` is read by Compose as `a"b` and by the installer as `a\"b`.

### Re-check

Witnessed: 2026-10-29, by a fresh agent (adversarial). Commit: 7784173b plus uncommitted task-4 work. Machine: macOS (Darwin), shell tests only.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The four new tests pass under dash and bash 3.2 and leave no state behind | no | confirmed | both "all passed"; `DIR=$keep_dir` follows the block |
| 2 | `T="a"<tab># c` fails if the after-quote strip uses `' *'` | no | confirmed | FAIL T and FAIL X in both shells; `[ ]*` fails the same two |
| 3 | `U="a" # "b"` fails if `%%` becomes `%` | no | confirmed | FAIL U (got `a" # "b`) |
| 4 | `W='a'b'` fails without the single-quote fallback | no | confirmed | FAIL W (got `'a'b'`) |
| 5 | `X="a"<tab>  ` fails without the `""` case | no | confirmed | only FAIL X; dropping both `""` and `"#"*` → 8 fails |
| 6 | The tests catch a rule that handles only `"` and never `'` | no | confirmed | entry pattern `\"*)` → 4 fails |

**Overall:** met. No bugs found.

### Re-check

Witnessed: 2026-10-29, by a fresh agent (blind). Commit: 7784173b plus uncommitted task-4 work. Machine: macOS (Darwin 27.0.0), Docker Compose.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A ref with a "/" fails to build | no | confirmed | `RONNE_SCANNER_REF=feature/x … build scanner` → `invalid tag "ronne-skillspector:feature/x": invalid reference format` |
| 2 | Two versions sit side by side and the first stays after the second is built | no | confirmed | `v9.9.1` then `v9.9.2` built in turn → `docker image ls` showed both |
| 3 | `docker image rm ronne-skillspector:v9.9.1` removes the old image | no | confirmed | `Untagged: ronne-skillspector:v9.9.1`, then `Deleted: sha256:6a32…` |
| 4 | Installs fetching from different mirrors at one ref share that tag (the comment's claim) | no | confirmed | v9.9.1 built again from a different context → one tag, now pointing at `6a32f9d9de56` instead of `889af5b3d4aa`. The witness had expected the first image to be left untagged; Docker removed it (not in `docker image ls -a --no-trunc`, not dangling). The comment says only that they share the tag, which holds |

**Overall:** met. The witness's own overall line was "not met" because of that expectation, which the comment doesn't make; the comment's three statements and the build error hold.

## Task 5

Witnessed: 2026-10-29 21:00–21:50 America/Sao_Paulo, by a fresh agent (blind). Commit: e5c89d65 plus the uncommitted diff and the untracked `.github/actions/build-image/scanner-probe.sh`. Machine: macOS (Darwin 27.0.0), Node 24 (not used by the probe), Docker Desktop. shellcheck is not installed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `ci-scope.js` puts `scripts/skill-scanner/` in the `image` suite | no | confirmed | the diff adds `/^scripts\/skill-scanner\//` |
| 2 | A change there runs the image suite and nothing else | no | confirmed | `npx vitest run` in repo-tools: 20 files, 181 tests pass; the image test expects `{...none, image:true}` for the scanner's files |
| 3 | image.yml, nightly.yml and release.yml all run the probe | no | confirmed | `action.yml` adds the step; `image.yml:76` and `release.yml:185` use the action; `nightly.yml` calls image.yml |
| 4 | The probe parses and passes locally | no | confirmed | `scanner-probe.sh ronne-web:ci` → exit 0, every `OK:` line; no `ronne-ci*` containers or networks left |
| 5 | The key gate: no, empty, wrong and `*` keys get 403 JSON on both ports; the right key 200 | no | confirmed | mutations (wrong key answered 200; `:8082` without the gate) each fail the probe |
| 6 | Isolation | no | confirmed | `scanner` on `default`, `scanner-semantic` on `default`, and `scan` made non-internal each fail the probe |
| 7 | A fixture scan goes through the proxy, authenticated | no | confirmed | scored 100, exit 1; without the key header → "fixture scan answered 403" |
| 8 | Fail-closed with no key or a `*` | no | confirmed | three mutations fail the probe |
| 9 | The probe checks the scanners publish no host port | no | partly | a `ports:` entry on `scanner` still passed: a port on an internal-only network isn't bound, so the running containers don't show it |
| 10 | The proxy strips the scan key before forwarding | no | partly | removing `header_up -X-Ronne-Scan-Key` still passed: nothing checks what the scanner receives |
| 11 | Trivy runs on the scanner image as advice only | no | confirmed | `--exit-code 0 … \|\| true` |
| 12 | Dependabot has a docker entry for `/scripts/skill-scanner` holding python and uv to digests | no | confirmed | parsed; ignore list has both for major and minor |
| 13 | The docs describe the new pull and run; uv comes from ghcr.io | no | confirmed | `Dockerfile:8` is ghcr.io; lines 10 and 16 are Docker Hub's Python |
| 14 | No Docker Hub pull beyond the job's own plus the Python base | no | confirmed | `config --images`: caddy, the built scanner, the local web image |

**Overall:** not met: rows 9 and 10. Fixed since:
- The probe reads the compose config for `ports` on both scanners (a published port on an internal network wouldn't show in a running container), and the running containers too.
- The probe stops each scanner in turn, puts a stand-in on its network that answers with the headers it received, and sends a request with the key through :8081 and :8082: the scanner must not see `x-ronne-scan-key`, and must see another header.
- The implementer undid the rules: the static key strip, the semantic key strip, and a `ports:` entry on `scanner` each fail the probe. The whole probe passes again locally.

### Re-check

Witnessed: 2026-10-29 afternoon, by a fresh agent (blind, re-check). Commit: e5c89d65 plus the uncommitted task-5 work. Machine: macOS (Darwin 27.0.0), Node 24 (not used by the probe).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The probe passes locally | no | confirmed | `scanner-probe.sh ronne-web:ci` → exit 0 in 56 s, every `OK:` line; no `ronne-ci*` container or network left |
| 2 | The scanners publish no port, checked in the config and in the running containers | no | confirmed | `ports: ["127.0.0.1:7699:8080"]` on `scanner` → "FAILED: ['scanner'] publish ports in the config"; the same on `scanner-semantic` |
| 3 | The proxy strips `X-Ronne-Scan-Key` on :8081 | no | confirmed | first `header_up -X-Ronne-Scan-Key` removed → exit 1 at "the proxy reaches the stand-in for scanner" |
| 4 | The proxy strips it on :8082 | no | confirmed | second one removed → exit 1 at the stand-in for scanner-semantic |
| 5 | The cleanup trap removes the stand-in when a step fails | no | confirmed | `kill -TERM` mid-step → exit 143, no `ronne-ci*` container or network left |
| 6 | A weaker variant is caught | no | partly | the check looked only for the header's name: a `header_up` that copies the key's value into another header would pass |

**Overall:** not met: row 6. Fixed since: the stand-in's check also requires that the scan key's value appears in none of the header values it received. The implementer's mutation (`header_up X-Other {http.request.header.X-Ronne-Scan-Key}` kept beside the strip) fails the probe at the stand-in step, and the whole probe still passes.

### Re-check

Witnessed: 2026-10-29 23:01 EDT, by a fresh agent (blind). Commit: e5c89d65 plus the uncommitted `.github/actions/build-image/scanner-probe.sh` (the working tree's diff). Machine: macOS (Darwin 27), Docker; the probe uses no host Node.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The probe passes locally with the new value check | no | confirmed | port 7650 free first; `scanner-probe.sh ronne-web:ci` → every step OK in 54 s; the "scan failed: ZeroDivisionError" line is the scanner unit tests' own logging |
| 2 | `header_up X-Other {http.request.header.X-Ronne-Scan-Key}` kept beside the strip on :8081 fails the probe | no | confirmed | "AssertionError: the value of the scan key reached the scanner" at the stand-in for scanner |
| 3 | The same on :8082 fails the probe | no | confirmed | the scanner stand-in passes, then the scanner-semantic one fails the same way |
| 4 | The key in an Authorization header (`Bearer …`) fails the probe | no | confirmed | "the value of the scan key reached the scanner" |
| 5 | The strip removed fails the probe | no | confirmed | "the scanner was sent the scan key" |
| 6 | `bash -n` passes, and the python snippet in the single-quoted `-c` has no apostrophe | no | confirmed | exit 0; 0 apostrophes counted between the quotes |
| 7 | Nothing is left behind | no | confirmed | no `ronne-ci` container or network after the real run and all four mutation runs |

**Overall:** met. No bugs found.

## Task 6

Witnessed: 2026-10-29 23:20 EDT, by a fresh agent (blind). Commit: 16d999a7 plus the uncommitted diff; ronne-web 6893327. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The installer's question, the `--scanner` flag and "run the install command again" are as documented | no | confirmed | `install.sh` asks both questions on every run unless `--yes` or `--scanner` is given |
| 2 | The by-hand `.env` lines are enough | no | confirmed | `docker compose config` in a scratch dir builds both scanners at `#v0.4.0:scripts/skill-scanner` and gives `web` both URLs |
| 3 | Compose builds the scanner before it starts anything | no | confirmed | `up -d --dry-run`: "Image scanner Built" before any "Network … Creating" |
| 4 | The old image stays; the tag carries the version; about 500 MB | no | confirmed | several `ronne-skillspector:*` tags side by side at 445 MB |
| 5 | Needs GitHub and PyPI | no | confirmed | the git context and the Dockerfile |
| 6 | The proxy takes only requests carrying the key, refuses with none, strips it, publishes nothing | no | confirmed | `compose.yaml` scan-gate and no `ports:` |
| 7 | The container descriptions | no | confirmed | the networks and limits in `config` (runtime isolation not tested here) |
| 8 | The 32 MiB figure and the "refused the request" remedy | no | confirmed | `BODY_LIMIT`; the log writes only the method and route |
| 9 | Busy: next run, a minute later, failed after a second try | no | confirmed | `MAX_SCAN_ATTEMPTS = 2`, `SCAN_EVERY_MS = 60 * 1000` |
| 10 | The four errors and remedies match the app | no | partly | the app's messages said "scanner service", the website "scanner container" |
| 11 | An address that isn't plain http(s) is used for nothing and the tab says which | no | confirmed | `parseServiceUrl`, `serviceConfigOf` |
| 12 | The tab shows "The scanner container: ready, SkillSpector 2.13.2" | no | confirmed | `admin.json` command.service |
| 13 | The host install | no | confirmed | `scanner.compose.yaml` |
| 14 | Trusted proxies: name the web server's address everywhere | no | partly | README line 106 still justified the 127.0.0.1 binding with "private ranges trusted" |
| 15 | The runbook's paragraph and table rows | no | confirmed | match `install.sh` and `compose.yaml` |
| 16 | The helpers exist in en, pt and fr, link to real sections, and the app's topics match the website's | no | confirmed | `docs-links` 8 passed; help, i18n and scan tests 430 passed |
| 17 | The new "When a scan fails" bullets exist in en, pt and fr | no | not met | 9 list items in en, 5 in pt and fr: the four bullets were English only, and no test counts them |
| 18 | pt and fr carry the `container` section's meaning | no | confirmed | read paragraph by paragraph |
| 19 | ronne-web checks pass | no | confirmed | 187 tests, lint, typecheck |
| 20 | The product-facts row is accurate and labelled | no | confirmed | "in the next release", cites the spec and the code |
| 21 | SPEC.md's first-start text and Documentation section describe the shipped behaviour | no | confirmed | except the pt/fr bullets (row 17) |

**Overall:** not met: row 17, with rows 10 and 14 partly met. Fixed since:
- The four bullets are in pt and fr (9 list items in each language), and ronne-web's docs test now counts list items per section against English for every topic, naming the section and both counts. With the French "refused the request" bullet removed, it fails with `security-scan#troubleshooting: 8 against 9`.
- The app's error messages (admin and author, in the three languages) now say "scanner container", as the tab and the website do.
- README's sentence about the 127.0.0.1 binding no longer mentions trusting private ranges.

### Re-check

Witnessed: 2026-10-29 23:15 local, by a fresh agent (blind re-check). Commit: 16d999a7 plus the uncommitted task-6 diff; ronne-web e7b9367. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The `troubleshooting` section has the same number of list items in en, pt and fr, and the four new bullets mean the same | no | confirmed | 9, 9, 9; each bullet read against the English: the commands, the 32 MiB, "next run, a minute later, a second try", hex-only key |
| 2 | The new docs test passes, fails when an item is removed from fr or pt, and has no false alarm in any other topic | no | confirmed | 11 passed; removing the first item from fr, then pt → only its own test fails; the full website suite 189 tests |
| 3 | The app's four new failure reasons say "scanner container" / "contêiner do verificador" / "conteneur de l'analyseur" and agree with the website | no | confirmed | parsed admin.json and author.json |
| 4 | The README's binding sentence no longer mentions trusting private ranges; the trusted-proxies advice is consistent everywhere | no | confirmed | README, runbook, compose.yaml and the Install topic in the three languages |
| 5 | The suites and checks are green | no | confirmed | 430 app tests in 26 files; website lint, typecheck and tests |

**Overall:** met. No bugs found. (The one lint note it saw, an unnecessary fragment in the new website test, is removed; the test is back to `docs.test.ts`.)

## Task 7

Witnessed: 2026-10-29 23:55 EDT, by a fresh agent (blind). Commit: 4918e46b plus the uncommitted task-7 diff and the untracked `ScannerAddress.tsx`. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The fields save through `saveSkillScanPolicy` → `setSkillScanSetup`; a form without them keeps the addresses | no | confirmed | `actions.ts` passes `undefined` for a missing field; `typedService` keeps the stored value |
| 2 | Only plain http(s) addresses are accepted | no | confirmed | real `checkScanService`: `ftp://`, credentials, a path, a query and text all → `not a url`; overlong or control characters throw `InvalidScanServiceUrlError` |
| 3 | `/health` is asked first without the key; the real service is accepted as itself, not gated | no | confirmed | real image on 127.0.0.1:17770 → `{"ok":true,"gated":false,"version":"2.13.2"}`; key sent in the first probe → 3 tests fail |
| 4 | A closed port is unreachable, another HTTP server is not the scanner, a redirect is no answer | no | confirmed | port 17769 → `unreachable`; a python server → `not the scanner`; `redirect: "manual"` |
| 5 | The key goes only to a proxy that refused without it and is ready with it | no | confirmed | real Caddy proxy: right key → ok, gated true; wrong or no key → `scan key refused`; :8082 and :80 → `not the scanner`; three mutations fail 1, 2 and 2 tests |
| 6 | The stored gated flag decides whether the scan key reaches the address at scan time | no | confirmed | `key: fromEnv \|\| urlGated === "1" ? scanKey : null`, and the same for the semantic key; mutations fail unit and db tests |
| 7 | The environment's addresses win, root's are ignored and can't be overwritten, and the tab shows them as set on the server | no | confirmed | `fromEnv`, `serviceFixed`, `ScannerAddress` returns null; three mutations each fail a test |
| 8 | Clearing works; an unchanged address isn't re-checked; a semantic address with no static one is refused | no | confirmed | `wanted === was`; `ScanServiceSemanticAloneError`; two mutations fail |
| 9 | The job, `scanTypesNow`, the review page and the tab read the stored address through one setup | no | confirmed | `storedScanSetup` is passed to `scanSetup` or `scannerSet` in each |
| 10 | The errors are worded in en, pt and fr | no | confirmed | five new keys in each `errors.json`; parity tests pass |
| 11 | The audit entry carries the host only | no | partly | `summary()` adds `serviceHost` and `semanticServiceHost`; removing the semantic one fails no test |
| 12 | The tab shows both fields, and the semantic hint says the LLM provider's key is sent to that address | no | confirmed | `semanticHint` and the tab tests |
| 13 | The tests pass, types and lint are clean | no | confirmed | 824 unit tests; 99 db tests on SQLite; `tsc` clean; lint 0 errors |
| 14 | The tests cover the rules | no | confirmed | nine mutations fail a test, except the semantic host in the audit (row 11) |
| 15 | The database tests pass on the four servers | no | can't check here | SQLite only; outside the brief |
| 16 | The website text, the spec and the runbook say it | no | can't check here | only the in-app messages and help were read |

**Overall:** not met: row 11 partly, rows 15 and 16 not checked. A second finding: the unchanged check compares the typed text with the stored `URL.href`, so the address without its trailing slash is re-checked, and fails if the scanner is down.

### Adversarial pass

Witnessed: 2026-10-29 23:55 EDT, by a fresh agent (adversarial). Commit: 4918e46b plus the uncommitted diff and the untracked `ScannerAddress.tsx`. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The scan key reaches only an address that showed it is the proxy | no | confirmed | a plain-service stand-in saw no key; first probe sending the key fails 3 tests |
| 2 | The key per address comes from the stored gated flag, and always for environment addresses; the health call and the scans follow the same rule | no | confirmed | the only places that send `X-Ronne-Scan-Key` are `http-scanner.ts:195` and `:224`; two mutations fail tests |
| 3 | The gated flag is recomputed on every change, so it can't go stale | no | confirmed | `typedService` rechecks a changed address, clears a cleared one, keeps an unchanged one |
| 4 | Redirects are never followed, in the check or in scans | no | confirmed | a 302 to a real service → `unreachable`; `follow` fails 2 tests |
| 5 | The check's limits: 3 s over the body, a size cap, slow drips | no | confirmed | a dripping body → `unreachable` after 3003 ms; 1 MiB chunks → `not the scanner` in 30 ms; at most about 12 s per save |
| 6 | The errors are fixed texts; the audit carries hosts only | no | confirmed | `errors.ts`, `summary()` |
| 7 | Only root can call it, and the permission is checked before any request goes out | no | confirmed | `requirePermission` is the first statement; CSRF with a live server not run |
| 8 | A form without the fields keeps the addresses; empty ones clear them | no | confirmed | `form.has(...)`; mutations fail |
| 9 | A stored address that isn't valid sets the service, no command runs | no | confirmed | `serviceSet` in `commandOf`; a mutation fails 3 tests |
| 10 | The tests, types and lint pass | no | confirmed | 806 unit tests, 77 db tests, `tsc` clean, lint 0 errors |
| 11 | Every guard rule has a failing test | no | confirmed | 13 mutations, none survived |
| 12 | The risk is stated everywhere it should be | no | partly | the static field's hint and the runbook don't say every submission's files go to the typed address; the website says "the key goes only to the proxy", which overstates |

**Overall:** not met: row 12. Also found: a server that imitates the proxy's refusal and then the service's answer gets the scan key (inherent to decision 7); an operator's command in the environment was overridden by root's web address; the check is a port probe; DNS is resolved again on every scan. Fixed since:
- An address or a command in the environment now fixes the scanner: root's addresses are ignored and their fields hidden, like every other setting the environment sets. Tests: unit, screen and database.
- The unchanged check compares the normalised address, so a trailing slash is no change. A database test also asserts the semantic host in the audit entry, which fails if it is removed.
- The static field's hint, the runbook and the website say every submission's files go to the typed address; the website says the key goes "only to an address that answers like the proxy" and that the check stops a typo, not a server made to look like the scanner (en, pt, fr).
- The spec's decision 7 lists the limits the check cannot remove (a mimicking server gets the key; DNS is resolved again on each scan; the save probes ports; the environment wins).

### Re-check

Witnessed: 2026-10-29 23:58 EDT, by a fresh agent (blind re-check). Commit: 4918e46b plus the uncommitted task-7 diff and the untracked `ScannerAddress.tsx`; ronne-web a8d397b. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The audit entry carries the semantic address's host, and a test pins it | no | confirmed | `skill-scan-setup.db.test.ts:421`; deleting the `semanticServiceHost` line fails it |
| 2 | The same address with or without a trailing slash is not a change | no | confirmed | comparing the raw text instead fails the test |
| 3 | An address or a command in the environment fixes the scanner; root's addresses are ignored and their fields hidden | no | confirmed | dropping the command term fails 2 tests; a tab test shows no `serviceUrl` field |
| 4 | The static field's hint says every submission's files go to the address, in en, pt and fr | no | confirmed | removing the en sentence fails a test |
| 5 | The website text says the same in en, pt and fr and matches the code | no | confirmed | read in three languages against `serviceConfigOf` and `http-scanner.ts` |
| 6 | The website's docs tests pass, including the list-item counting test | no | confirmed | 189 passed; removing the pt Scanner address item fails the test |
| 7 | The spec, the plan, the MVP row and the runbook match the behaviour | no | confirmed | the MVP row said "addresses" without "or a command"; fixed since |
| 8 | App unit tests | no | confirmed | 41 files, 827 tests |
| 9 | SQLite database tests | no | confirmed | 5 files, 101 tests |
| 10 | The same four database test files on PostgreSQL, MySQL and MariaDB | no | confirmed | 80 tests passed on each |
| 11 | `tsc` and lint | no | confirmed | no output; no errors |

**Overall:** met. No bugs found.

### Re-check

Witnessed: 2026-10-29 23:59 EDT, by a fresh agent (adversarial re-check). Commit: 4918e46b plus the uncommitted diff and the untracked `ScannerAddress.tsx`. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | An address or a command in the environment fixes the scanner; the stored scan key is never sent to root's gated address | no | confirmed | stored gated address plus an environment command and key → `from: "environment"`, `service: null`, no scanner is built |
| 2 | A form post with the address fields while the environment fixes the scanner can't store or check an address | no | confirmed | `serviceFixed = false` fails 2 db tests |
| 3 | Only a semantic address in the environment fixes the scanner, shows the problem, and ignores root's address | no | confirmed | `["environment", false, ["semanticAlone"], null]` |
| 4 | An invalid environment command still fixes the scanner, and root can't get around it | no | confirmed | `command: '["/x"'` plus a stored address → `from: "environment"`, `set: false` |
| 5 | `RONNE_SKILL_SCANNERS` (the list) doesn't fix the address | no | confirmed | `fromEnv` reads `config.command` only |
| 6 | The unchanged compare uses the normalised href, so a different address can't skip the check | no | confirmed | `HTTP://A:7670`, `/.`, `/%2e`, `/x/..` → the same href; `a.` stays distinct; userinfo, `?`, `#` and a path are refused |
| 7 | Each rule fails a test when undone | no | confirmed | ten mutations in the scratch copy, none survived |
| 8 | The tab never shows fields while the environment fixes the scanner, or the reverse | no | confirmed | `serviceFrom` null or "settings" shows them |
| 9 | i18n and the hint in en, pt and fr | no | confirmed | 812 tests |
| 10 | Typecheck and lint | no | confirmed | no output; no errors |
| 11 | The website text in ronne-web a8d397b | no | can't check here | not read |

**Overall:** met for the code. Row 11 unchecked (the next pass covers it). Also noted, not blocking: removing the environment's command brings root's stored addresses back with their old gated flags, so the runbook says to recheck them after changing `RONNE_SCAN_KEY`.

### Re-check

Witnessed: 2026-10-30 00:05 local, by a fresh agent (adversarial). Commit: 4918e46b plus the uncommitted task-7 diff; ronne-web a8d397b. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The `settings` bullet is accurate and doesn't overstate | no | confirmed | against `checkScanService` and `probeHealth`; the mimic caveat matches the function's own comment |
| 2 | The `connect` paragraph is accurate | no | confirmed | the environment's address wins; a malformed address is used for nothing and no command runs |
| 3 | The `container` host-install paragraph is accurate | no | confirmed | names the three ways to supply the address; no overclaim |
| 4 | The troubleshooting bullets are accurate | no | partly | the four bullets read are right, but nothing covers an address refused on save |
| 5 | The product-facts row is accurate | no | confirmed | matches the code |
| 6 | pt and fr say the same as en | no | confirmed | all three read |
| 7 | No outdated sentence from before the address could be typed in the web | no | confirmed | "can't be typed in the web" is about commands, which still can't be |
| 8 | The website tests pass | no | confirmed | 189 passed |

**Overall:** not met: row 4. Fixed since: a troubleshooting item, in en, pt and fr (ten items in each language, counted by the docs test), for an address refused on save: the field says why; it must be a plain http(s) address with no user name, path or query; no answer means the scanner isn't running or the address or port is wrong; not the scan service means something else answered; the proxy refused the scan key means the operator checks `RONNE_SCAN_KEY` and recreates the proxy.

### Re-check

Witnessed: 2026-10-30 00:20 local, by a fresh agent (adversarial, blind). Commit: 4918e46b plus the uncommitted task-7 diff; ronne-web 6aeecbc. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The new troubleshooting item names the right causes and remedies for the four `ServiceProblem` reasons | no | confirmed | `security-scan.tsx` en:627-632 against `errors.json` 159-162: plain http(s) with no user name, path or query; no answer; something else answered; the proxy refused the key, with `RONNE_SCAN_KEY` and recreating the proxy |
| 2 | The pt and fr wording is faithful and uses the terms of the rest of those files | no | confirmed | pt 654-660 and fr 699-707 match `errors.json` in pt and fr |
| 3 | The refusal of a semantic address with no scanner address is in the item | no | partly | it was not; the item said the field says why |
| 4 | The item count is the same in the three languages | no | confirmed | 10 in en, pt and fr |
| 5 | The website's tests, lint and typecheck pass | no | confirmed | 189 tests; lint and `tsc` clean |

**Overall:** not met: row 3. Fixed since: the item adds, in en, pt and fr, that the semantic scanner's address also needs the scanner's address set first.

### Re-check

Witnessed: 2026-10-30 00:30 local, by a fresh agent (adversarial). Commit: 4918e46b plus the uncommitted task-7 diff; ronne-web e8e5076. Machine: macOS (Darwin).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The English item covers the four `ServiceProblem` reasons and the fifth (a semantic address needs the scanner's first) | no | confirmed | `security-scan.tsx` 627-633 against `skill-scan-setup.ts:242`; it covers clearing the static address while a semantic one is stored |
| 2 | pt says the same, with consistent terms | no | confirmed | pt 654-661 has all five |
| 3 | fr says the same, with consistent terms | no | not met | fr 699-708 stopped after the proxy clause: the fifth sentence was missing |
| 4 | The item count is 10 in the three languages | no | confirmed | 10, 10, 10 |
| 5 | The website's tests, lint and typecheck pass | no | confirmed | no failure; lint and `tsc` clean |

**Overall:** not met: row 3. Fixed since: the French item has the sentence (my edit script had failed on the French wording and the amended commit lacked it). The website HEAD is now 1277808; en, pt and fr each carry the sentence, the docs test counts 10 items in each, and 189 tests pass.

### Re-check

Witnessed: 2026-10-30 00:40 local, by a fresh agent (adversarial). Commit: 4918e46b plus the uncommitted task-7 diff; ronne-web 12778086bc0a8278f73c8159038964147c9c5e1e. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The troubleshooting item covers the four `ServiceProblem` refusals in en, pt and fr | no | confirmed | en:627-633, pt:654-661, fr:699-708 against the kinds in `http-scanner.ts` |
| 2 | The same item covers the fifth, a semantic address needs the scanner's first, in all three languages | no | confirmed | en:632-633, pt:660-661, fr:707-708; wording matches `ScanServiceSemanticAloneError` in `errors.json` |
| 3 | The item count is 10 in each language | no | confirmed | 10, 10, 10 |
| 4 | Tests, lint and typecheck pass in `ronne-web/www` | no | confirmed | no failures; lint and `tsc` clean |

**Overall:** met. No bugs found.
