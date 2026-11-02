# 166 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-01 23:29 EST, by a fresh agent (blind). Commit: 4e11d0b6 + working tree (`git diff`: docs/MVP/MVP.md, docs/features/README.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §10's `audit_log` row lists the five new columns | no | confirmed | `MVP.md:686` names all five, matching SPEC Scope's table |
| 2 | The row gives the spec's values for `via` and `outcome` | no | confirmed | `MVP.md:686`: web, api, scim, cli, system; success, failed, denied |
| 3 | Older rows: `via` null and `outcome` `success` | no | confirmed | `MVP.md:686`; SPEC Scope |
| 4 | `workspace_id` has no foreign key, with the spec's reason | no | confirmed | `MVP.md:686`; SPEC table note and Decision 2 |
| 5 | The user agent is cut to 256 and treated as personal data | no | confirmed | `MVP.md:686`; the code-point cut and control characters are left out, not contradicted |
| 6 | The row says where each field is filled, as the spec does | no | partly | "filled by `recordAudit` from the request: request_id, via, user_agent, workspace_id and outcome"; the spec has workspace_id passed by callers (Decision 1) and outcome from the catalogue |
| 7 | MVP §15 "Personal data": retention and erasure clear an audit event's user agent with its address | no | confirmed | `MVP.md:1010` |
| 8 | Nothing else in MVP.md contradicts the spec | no | confirmed | `grep -n -i "audit\|user_agent\|recordAudit\|request.id"`: `:663`, `:750`, `:767`, `:857`, `:860` fit |
| 9 | Nothing is presented as more settled than the spec | no | not met | "(owner, 2026-11-01)" covers "no foreign key" (Decision 2, Claude's); `:1010` carries Decision 3 unmarked; "since [166]" though only task 1 is done (162 kept "Planned in" until built) |
| 10 | `docs/features/README.md` lists 166 in M28 with the spec's dependencies | no | confirmed | `README.md:452`, row `:463`, deps "007, 060, 100, 102, 103, 104" |
| 11 | The README row's description says what the spec says | no | confirmed | `README.md:463` matches SPEC Scope |
| 12 | The README status is valid and current | no | confirmed | `in progress` (`README.md:35-36`) |
| 13 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** not met: columns, values, defaults, the no-foreign-key rule and the privacy clearing match, but the row says all five fields come from the request (row 6) and presents Claude's Decisions 2 and 3, and the unbuilt feature, as settled (row 9).

### Re-check (rows 6 and 9)

Witnessed: 2026-11-01 23:31 EST, by a fresh agent (blind). Commit: 4e11d0b6 + working tree (only docs/MVP/MVP.md and docs/features/README.md count; task 2's files ignored). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The row says where each field is filled, as the spec does | no | confirmed | `MVP.md:686`: request_id, via and user_agent from the request context; workspace_id passed by the services; outcome from the action catalogue. Matches SPEC Scope and Decision 1 |
| 9 | Nothing is presented as more settled than the spec | no | confirmed | `MVP.md:686` back to "planned in [166]"; "(owner, 2026-11-01)" covers only Decision 1; "Claude's, to confirm (166's Decisions 2 and 3)", as `MVP.md:993` does; `MVP.md:1010` "planned in 166 … Claude's, to confirm: 166's Decision 3". Rows 1–5 and 7 still hold; `pnpm witness:check` → 0 |

**Overall:** met: with the first pass's rows 1–5, 7, 8 and 10–13, every claim of task 1 is confirmed.
