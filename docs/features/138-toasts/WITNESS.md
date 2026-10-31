# 138 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-10-30, by a fresh agent (blind). Commit: 1905ece7. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 has a row for the toasts decision | no | partly | `grep -n -i toast docs/MVP/MVP.md` → row at line 1009 in "## 15. Decision log", but named "Action feedback", not "Toasts" as SPEC.md:3 says |
| 2 | The MVP row says what SPEC.md says | no | confirmed | MVP.md:1009 → placement, announcement, errors persist, Sonner unstyled behind a `components/ui` wrapper, inline notices stay; "bottom centre" is looser than the spec's "across the bottom" |
| 3 | README lists 138 in M21 with its dependencies | no | confirmed | `docs/features/README.md:391` → depends on 032, 065, 067, 129, same as SPEC.md:3 |
| 4 | The README row says what SPEC says | no | confirmed | README:391 → Sonner unstyled with fallback, placement, durations, live regions, `flashToast` cookie with a key, inline field errors and one-time secrets |
| 5 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check` → exit 0 |

**Overall:** not met: the MVP.md §15 row is named "Action feedback", not "Toasts".

### Re-check

Witnessed: 2026-10-30 22:40 EDT, by a fresh agent (blind, re-check of claim 1 and the wording). Commit: 1905ece7 plus the uncommitted diff of docs/MVP/MVP.md line 1009. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 has a "Toasts" row, and README lists 138 in M21 with its dependencies; both say what the SPEC says | no | confirmed | `grep -n Toasts docs/MVP/MVP.md` → line 1009 `\| Toasts \| … across the bottom above the bottom bars on a phone …`; README.md:391 lists 138 with `032, 065, 067, 129`; SPEC.md:3 refers to MVP §15 ("Toasts") |
| 2 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check` → no errors |

**Overall:** met: the §15 row is now "Toasts" with "across the bottom", and the README and witness check agree with the SPEC.
