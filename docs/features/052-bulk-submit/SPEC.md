# 052 — Submit drafts in bulk

> Milestone: M7 · Depends on: 013, 014, 037, 038, 039, 051 · Design: [MVP §4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§11](../../MVP/MVP.md#11-rest-api-sketch-apiv1), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: none new

## Goal

Since 038, a person can export dozens of local items as drafts in one go, but each one is still
submitted on its own, from its editor page. This feature lets them submit **one, several or all**
of their drafts at once: from `rmk`, from inside their AI tool, and from **My submissions** in the
web app. Only drafts with nothing left to fix are submitted. The others say what's missing, and
nothing about them changes.

## Scope

**In:**
- **A check and a submit for many drafts** in the `submissions` domain. They are 013's
  `checkSubmission` and `submitDraft` run for each draft. Each draft is decided on its own, so one
  that isn't ready doesn't stop the others.
- **`rmk submit`**: by item name, by draft id, or `--all`; it checks first, shows what will and
  won't be submitted, and asks; `--dry-run`, `--yes`, `--json`.
- **The API**: `POST /api/v1/drafts/check` and `POST /api/v1/drafts/submit`, by token, for the
  caller's own drafts.
- **The MCP server**: `check_drafts` (read-only) and `submit_drafts` (asks the person through the
  tool's approval), the same two steps as export.
- **My submissions** (web): a checkbox on each draft and each submission sent back for changes, a
  **Ready** or **n to fix** mark on each, **Select all ready**, and **Submit selected (n)** with a
  confirmation that lists them.
- Resubmitting: a submission sent back for changes (014) is sent again the same way, as
  **Resubmit** does in the editor.

**Out** (and where it goes instead):
- **Submitting a draft whose dependency is only a draft or in review.** 013's rule stays (owner,
  2026-10-01): a dependency must be released first, so a dependent is "not ready" until then, with
  013's message, and `rmk` shows the order. Submitting a dependent with its dependencies:
  [056](../056-pending-dependencies/SPEC.md).
- **Withdrawing, deleting or editing in bulk:** later, if people ask.
- **Fixing what's missing** from `rmk` or the list. That happens in the editor, or by exporting
  again (051); [053](../053-export-descriptions/SPEC.md) closes the most common gap, a missing
  description.
- **Reviewing in bulk** (approving many at once): [054](../054-bulk-approve/SPEC.md) adds approving; 014's review was one submission at a time, on
  purpose.

## Behaviour

**Ready.** A draft (or a submission sent back for changes) is **ready** when submitting it now
would pass. That means 013's `allIssues` has no error: the manifest and files are valid, the
name is free, every dependency is released, and a proposal changes something and has no open
rebase conflict. Warnings don't stop it, as in the submit dialog. Nothing else counts as "pending
information": the checks are the ones Submit already runs, so the list, `rmk` and the editor
always agree.

**One at a time, inside.** Submitting many runs 013's `submitDraft` for each draft, in the order
given, **each in its own transaction**. The checks run again inside it, with the scope locked, so a
draft that stopped being ready since the check (someone else took the name) is refused there and
reported. The others still go through. Each is audited as today
(`submission.submitted` or `submission.resubmitted`) and gets its revision and conversation entry.
There's no "all or nothing": a batch where some aren't ready submits the ready ones, and says
which weren't and why. `rmk --all-or-nothing` is an open question.

**Results.** For each draft, one of:

| Result | When |
|---|---|
| `submitted` / `resubmitted` | it was sent for review; with its revision |
| `not_ready` | it has errors; `issues` lists them, as the submit dialog does |
| `not_found` | no draft with that id is the caller's (someone else's looks the same) |
| `not_submittable` | its status can't be submitted (already in review, approved, withdrawn…), with `status` |

**`rmk submit`**

```
rmk submit @team/reviewer @team/deploy-check   # by item name
rmk submit 01J… 01J…                           # by draft id
rmk submit --all                               # every draft and every one sent back for changes
rmk submit --all --dry-run                     # what would go, and what's missing
```

- A **name** means the caller's open draft of that item: the one export would update (051's rule,
  the most recently changed `draft` or `changes_requested`). With more than one of the same name,
  `rmk` names them and asks for an id.
- It checks first (`POST /drafts/check`), then shows **Ready to submit (n)** with each name, type
  and link, and **Not ready (m)** with each one's issues, for example *description: required* or
  *@team/github isn't released yet: release it first*. It also shows the release order when
  dependencies are what's missing (041's `releaseOrder`).
- It asks **Submit n drafts for review? [y/N]**. Nothing is sent unless the answer is yes, or
  `--yes` was given. Without a terminal it needs `--yes`, as export does. `--dry-run` only checks.
- Then it submits the ready ones (`POST /drafts/submit`) and reports each result.
- **Exit code:** `0` when everything asked for was submitted, `1` when any wasn't (not ready,
  refused at submit, not found), `2` for usage errors. `--json` answers
  `{ submitted: [...], notSubmitted: [...] }`.
- With nothing ready, it says so, lists what's missing, and exits `1` without asking.

**API.** Both endpoints need a bearer token and act as its user, like 037's.

`POST /api/v1/drafts/check` takes `{ "ids": ["01J…", …] }` or `{ "all": true }` and answers, never
cached:

```json
{
  "drafts": [
    {
      "id": "01J…", "path": "/submissions/01J…", "url": "https://…/submissions/01J…",
      "name": "@team/reviewer", "type": "agent", "status": "draft",
      "ready": false,
      "issues": [{ "severity": "error", "code": "schema", "message": "description is required." }]
    }
  ]
}
```

`all` means the caller's `draft` and `changes_requested` submissions. `POST /api/v1/drafts/submit`
takes the same body (`all` included) and answers `200` with `{ "results": [{ "id", "name",
"result", "status", "revision"?, "issues"? }] }`. One `not_ready` doesn't make the request fail.

| Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | neither `ids` nor `all`, or `ids` empty, not strings, or repeated |
| 413 | `too_many` | more than 100 ids (`details.limit`) |
| 429 | `rate_limited` | more than 10 submit requests in 10 minutes (check isn't limited beyond 019's) |

With `all` and more than 100 open drafts, the first 100 (newest change first) are taken and
`details.more` says how many were left; `rmk` runs again for the rest. A person can have at most
50 drafts made by token (037), but the web editor has no limit.

**Audit.** Each submit is 013's event, with `via: "api"`, `tokenId` and `tokenName` added when it
came by token, as 037 does for drafts. A token can now make something **other people see**: the
review queue. That was the moment 009 and 037 named for token scopes, and the owner decided
(2026-10-01) that **every token may submit**, without scopes: it's audited, rate-limited, and `rmk`
and the MCP tool always ask the person first.

**MCP server.** `check_drafts` (`items`: names or ids, or `all`) answers the same as `rmk submit
--dry-run`, as text and structured content. `submit_drafts` (the same input) submits the ready
ones and answers the results. It isn't read-only, so the AI tool asks the person before it runs.
The server's instructions say to show the check first and submit only what the person agreed to.

**My submissions (web).**
- Each `draft` and `changes_requested` row gets a checkbox, and a mark next to its status:
  **Ready**, or **n to fix**, which links to the editor. A row that isn't ready can't be selected:
  its checkbox is disabled, with "Fix n issues first" as its label.
- Above the table: **Select all ready (n)** and **Submit selected (n)**, shown only when at least
  one row is ready. Selection survives the status filter but not a reload.
- **Submit selected** opens a dialog listing the selected drafts, saying they go to reviewers
  and can be withdrawn until approved. It has **Submit n drafts** and **Cancel**. The server action
  submits them (the domain's submit-many, as a session). The dialog then shows each result, and the
  list refreshes. Ones refused at submit (they stopped being ready) say why, with a link to the
  editor.
- The marks come from the check run when the page loads: one `checkMany` for the person's open
  drafts, at most 100 (the rest show no mark and a note to open them).

## Edge cases

- **A draft and its dependency, both drafts:** the dependency can be submitted, but the dependent
  isn't ready until the dependency is **released**. `rmk` lists the order. Submitting both at once
  isn't possible yet (Out).
- **The same name twice in one batch** (two drafts of one item): the second is refused at submit
  with 013's "name is taken by an open submission". The check can't tell in advance, because both
  are free until one is submitted. Its note says so.
- **A draft deleted, edited or submitted elsewhere** between check and submit: `not_found`, a fresh
  `not_ready`, or `not_submittable`, each reported. Nothing else changes.
- **A stale proposal** (a newer version is out): ready if it has no errors, as today. The result
  carries 017's stale note.
- **More than 100 open drafts:** `--all` and the web list handle the newest 100 per run, as above.
- **Someone else's id:** `not_found`, never their status.
- **The instance isn't set up, or the token is revoked:** 019's errors, nothing submitted.

## Documentation

- **Submitting and review → Statuses / The checks at submit** (`review#checks`): what "ready"
  means, which is the same checks the submit dialog runs; submitting several from My submissions
  or `rmk submit`; each is submitted on its own, and ready ones go even when others aren't.
- **Submitting and review**, a new section **Submitting many at once** (`review#many`): the web
  selection, `rmk submit` with names, ids, `--all`, `--dry-run`, `--yes`, the exit codes; the order
  when dependencies are drafts.
- **Exporting your own items → What arrives, and what to do next** (`export#next`): after an
  export, `rmk submit --all --dry-run` shows what's ready.
- **From inside your AI tool** (`export#mcp` and `mcp`): `check_drafts` and `submit_drafts`.
- **Installing with rmk → Tokens and the API** (`rmk#tokens`): a token can also submit your
  drafts, which reviewers then see; it's audited with the token's name.
- **Helpers:** on My submissions, next to **Submit selected**: "Submit several at once?", linking
  to `review#many`, and "What blocks submitting?", linking to `review#checks`. (One of each for the
  list, rather than a helper on every row's **n to fix** mark.)

## Acceptance criteria

- [x] The domain checks and submits many drafts, each in its own transaction, reporting
  `submitted`, `resubmitted`, `not_ready` (with issues), `not_found` and `not_submittable`. A draft
  that isn't ready doesn't stop the others, and each submit is audited as 013's.
- [x] `POST /api/v1/drafts/check` and `/submit` take `ids` or `all`, act only on the caller's
  drafts, return the error table's codes, and audit the token.
- [x] `rmk submit` by name, id and `--all` checks first, shows ready and not ready with reasons,
  asks, submits only the ready ones, and exits `0` or `1` as specified; `--dry-run` sends nothing.
- [x] A dependent of an unreleased draft is not ready, and `rmk` shows the release order.
- [x] `check_drafts` sends nothing; `submit_drafts` submits only the ready ones and says which
  weren't.
- [x] My submissions marks each open draft Ready or n to fix, lets only ready ones be selected,
  submits the selection after the confirmation, and shows each result.
- [x] The service and repository tests pass on SQLite, PostgreSQL, MySQL and MariaDB, and an
  end-to-end test submits three drafts from the list, one of them not ready.
- [x] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Tokens that submit** (owner, 2026-10-01): every token may submit its user's drafts, without
   token scopes. MVP §15's "Access tokens" row and 009's note say so.
2. **A dependent with its dependencies** (owner, 2026-10-01): 013's rule stays; a dependency is
   released before its dependent is ready. `rmk` and the check show the order. Changed by
   [056](../056-pending-dependencies/SPEC.md) (owner, 2026-10-01).

## Open questions

1. **All or nothing.** Recommended: no; each ready draft goes on its own, which suits "submit what's
   ready". If people want it, `--all-or-nothing` can check first and refuse when any isn't ready.
2. **The limits** (100 per request, 10 submit requests in 10 minutes) are guesses in 037's spirit:
   far more than a person needs, far less than a script gone wrong.
