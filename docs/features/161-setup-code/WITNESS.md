# 161 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-01 14:29 EST, by a fresh agent (blind). Commit: 0ade3f61 + working-tree diff (MVP.md, 036 SPEC.md, features/README.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15's "Web setup" row says the web setup asks for a setup code, and no longer says it is open to the first visitor | no | confirmed | `git diff docs/MVP/MVP.md` → row at MVP.md:975 says "Every step asks for a one-time setup code (owner, 2026-11-01, 161; open to the first visitor from 036 until then)". The old "open to the first visitor (no setup code …)" clause and the "Planned in 161" sentence are gone |
| 2 | The "Web setup" row's details match the spec: 128 random bits, made at the first start, `setup-code` file in the data folder with mode 0600, logged at every start until set up, printed by the install script (`/setup#code=…`) and by `setup-code`, checked in constant time, rate-limited, deleted once root exists, and the terminal setup doesn't ask | no | confirmed | MVP.md:975 compared with SPEC.md's Scope "In" (the code, where it's shown, the guard, after setup, terminal setup). Every item matches. The rationale column adds the domain/internet reason, which matches SPEC Goal and Decision 1 |
| 3 | The "Setup command" row says the terminal setup doesn't ask for the code | no | confirmed | MVP.md:974 → "it doesn't ask for the setup code (161): whoever runs it is on the server". Matches SPEC Scope "The terminal setup" and Decision 4 |
| 4 | MVP §5 describes the setup code as current behaviour and no longer says "the first visitor owns the instance" | no | confirmed | MVP.md:422-431 → "The web setup asks for a one-time setup code that only the operator sees … can't be claimed by its first visitor; the terminal setup doesn't ask". The old "since the first visitor owns the instance" was removed |
| 5 | Nothing else in MVP.md contradicts the spec | no | partly | `grep -n -i -E "first visit\|setup code\|anyone can set\|exposing the port\|owns the instance\|claim" MVP.md` → the only remaining hits are §5's "the first visit opens the setup" (still true), :860 (M28 plan, consistent) and the Docker row (:976, "the web setup until set up", consistent). §12 has no setup text. One minor wording gap: §5 (:427-428) and the §15 row (:975) say the code is made "at its first start" and that the install script "opens `/setup#code=…`" with no condition. The spec says the script opens the browser only on "This computer" (with `--domain` it prints the address and the code), and an `incomplete` instance that is already installed gets its code at its *next* start |
| 6 | `docs/features/README.md` lists 161 in M28 with the spec's dependencies | no | confirmed | README.md:452 `### M28 — Governance foundations`, row at :458 → depends on "036, 003, 005, 080, 081, 082, 083, 100", the same as SPEC.md line 3. The description (one-time code, 0600, log, install script `/setup#code=…`, every step, rate-limited, `setup-code`, terminal doesn't ask, deleted once root exists) matches the spec. Status changed from `specified` to `in progress` |
| 7 | 036's spec records the reversal (the older decision) | no | confirmed | `git diff docs/features/036-web-setup/SPEC.md` → the Out list says "161 added it (owner, 2026-11-01)", and the Edge case "The first visitor owns the instance" is marked "reversed by 161 … 2026-11-01". Relative links `../161-setup-code/SPEC.md` resolve to the existing folder |
| 8 | The links between the docs resolve | no | confirmed | `ls docs/features/161-setup-code/` → PLAN.md, SPEC.md, WITNESS.md. MVP headings "## 5. Installation / bootstrap" and "## 15. Decision log" match the spec header's anchors `#5-installation--bootstrap` and `#15-decision-log` |
| 9 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check; echo $?` → exit 0. `git diff --check` → no whitespace errors |

**Overall:** not met: the decision is recorded and consistent in MVP §15, §5, the index and 036. Two small wording gaps in MVP.md remain (row 5): the install script opens the browser only on this computer, and the code is made at any start while not set up, not only the first.

### Re-check of row 5 (wording)

Witnessed: 2026-11-01 14:30 EST, by a fresh agent (blind). Commit: 0ade3f61 + working-tree diff (MVP.md, 036 SPEC.md, features/README.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | Nothing else in MVP.md contradicts the spec. The code is made at a start while the instance isn't set up, and the install script opens `/setup#code=…` only on this computer | no | confirmed | MVP.md:426-428 (§5) → "the server makes it when it starts and isn't set up, keeps it in the data folder and prints it in its log at every such start, and the install script prints it (and, on this computer, opens `/setup#code=…`)". MVP.md:975 ("Web setup") → "made when the server starts and isn't set up … by the install script (which, on this computer, opens `/setup#code=…`)". README.md:458 says the same. `grep -n -i -E "first start\|opens \`/setup#code" MVP.md README.md` → no "first start" left, and every "opens" now carries "on this computer". This matches SPEC.md's Scope |
| 9 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check; echo $?` → exit 0. `git diff --check` → exit 0 |

**Overall:** met: MVP §5, the §15 "Web setup" row and the index's 161 row now say what the spec says about when the code is made and when the install script opens the browser. Rows 1–4 and 6–8 were confirmed in the first pass.
