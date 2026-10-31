# 139 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 7b92e5d2 plus the uncommitted working tree. Machine: macOS (Darwin).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §15 "Notifications" row says a bell with a count in a top bar over the content area, in-app only | no | confirmed | `git diff docs/MVP/MVP.md` → line 1010 changed from "a bell in the sidebar" |
| 2 | §14.5 says in-app is in and email and webhooks are out | no | confirmed | MVP.md:860 |
| 3 | MVP §2 says in-app notifications are in | no | partly | §2 has no wording; the matching line is the non-goals line 35, already consistent |
| 4 | README lists 139 in M21 with its dependencies | no | partly | README.md:392 had the right dependencies but said "in the sidebar and Menu" |
| 5 | No other doc puts the bell in the sidebar or Menu sheet | no | not met | README.md:392 |
| 6 | 139 SPEC Scope, Design and Decision 2 agree | no | confirmed | SPEC.md read in full |
| 7 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** not met: README.md:392 still said the bell is in the sidebar and Menu.

### Re-check

Witnessed: 2026-10-31, by a fresh agent (blind, re-check of claims 4 and 5, with 3). Commit: 7b92e5d2 plus the uncommitted working tree. Machine: macOS (Darwin).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | README's 139 row matches the spec and lists 007, 060, 102, 103, 104, 119, 129 | no | confirmed | README.md:392 → "a top bar over the content area (and in the phone header)" |
| 2 | No doc outside UI-Mocks-Materials puts 139's bell in the sidebar or Menu sheet | no | confirmed | grep of docs: only 140's "Update available" mark at the sidebar's foot, a separate thing |
| 3 | MVP.md:35, :860, :941 and the Notifications row agree with the spec (§2 itself has no wording; line 35 is the non-goals line) | no | confirmed | MVP.md read at those lines |
| 4 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** met: the README, MVP.md and the spec agree on the bell in a top bar and the phone header.
