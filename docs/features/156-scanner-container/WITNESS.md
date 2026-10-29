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
