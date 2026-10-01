# 051 — Update your own drafts on export

> Milestone: M7 · Depends on: 037, 038, 039, 042 · Design: [MVP §4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§11](../../MVP/MVP.md#11-rest-api-sketch-apiv1) · Contracts: none new

## Goal

A person who exported an item, then kept working on it in their AI tool, exports it again and
**their existing draft is updated** instead of a second draft appearing next to it. Today every
export creates a new draft (037's and 042's open question), so drafts pile up, count against the
50-draft limit, and the person has to delete the old ones in the web app.

## Scope

**In:**
- `rmk export` and the MCP export tools (`plan_export`, `export_items`) look for a draft of the
  person's own of the same item, and **update it** by default: its files are replaced with the
  exported ones.
- The same for a draft sent back for changes (`changes_requested`): it's editable in the web
  editor, so it's editable from the harness.
- A submitted item (waiting for review) is **left alone**: nothing is uploaded for it, and the
  person is told to withdraw it in the web app first.
- `--new-draft` (`newDraft` in `plan_export`): a separate draft, as before 051.
- The **API**: `GET /api/v1/drafts?name=` lists the caller's open submissions of an item, and
  `PUT /api/v1/drafts/{id}` replaces a draft's files. Both by token, like 037's.
- The audit event for a draft updated this way.

**Out** (and where it goes instead):
- Updating a submission someone else wrote, or one past review (approved, rejected, withdrawn,
  published): not editable anywhere.
- Withdrawing, submitting or resubmitting from the harness: they stay in the web app (037).
- Merging the export with edits made in the web editor since: the export replaces the draft's
  files; the preview says so.
- Renaming a draft, changing its type, or moving a proposal to another base version: a different
  item or base is a different draft (see Behaviour).

## Behaviour

**Which draft.** For each item in the plan, `rmk` asks the registry for the person's open
submissions of that name (`GET /drafts?name=`) and picks the one that is **the same item**:

- the same type, and
- the same kind: both new items, or both proposals **from the same base version** (042).

Among those:

| What the person has | What export does |
|---|---|
| nothing that matches | a new draft, as before |
| a `draft` or `changes_requested` one | **updates it**; with several, the most recently changed |
| only `submitted` ones | refuses the item (`in_review`): *@team/x is in review: withdraw it in the web app to change it, or export with --new-draft for a separate draft.* |

`--new-draft` skips the lookup: every item becomes a new draft, as before 051.

**The preview** says, for an item it will update: **Updates your draft** with its link, status
and when it last changed, and that its files will be replaced, including any edits made in the
web editor since. The `--json` plan and `plan_export` carry it as `updates: { id, url, status,
updatedAt }`.

**The upload.** An item that updates a draft is sent with `PUT /drafts/{id}`; the others with
`POST /drafts`, as before. The result says **Updated** or **Created** for each, and the JSON
carries `updated: true` on updated ones. An update doesn't count towards the 50-draft limit.

**`GET /api/v1/drafts?name=@scope/name`** answers, never cached, the caller's own submissions of
that name whose status is `draft`, `changes_requested` or `submitted`, most recently changed first:

```json
{
  "drafts": [
    {
      "id": "01J…",
      "path": "/submissions/01J…",
      "url": "https://ronne.example/submissions/01J…",
      "name": "@team/secure-coding",
      "type": "skill",
      "status": "draft",
      "updatedAt": "2026-10-01T12:00:00.000Z",
      "proposal": null
    }
  ]
}
```

`proposal` is `{ "item", "baseVersion" }` for a change proposal. Since
[053](../053-export-descriptions/SPEC.md), each also has `description`: its `ronne.yaml`'s, or
null. Without `name`, it lists all of
the caller's open submissions. Nobody else's are ever listed. `400 invalid_name` for a name that
isn't `@scope/name`.

**`PUT /api/v1/drafts/{id}`** takes 037's body (`name`, `type`, `files`, and `base` for a
proposal) and replaces the draft's files with `files`: every file not among them is deleted. It
answers `200` with 037's response. In order: the token, the rate (shared with `POST`, 30 uploads in
10 minutes), the body's size (28 MiB), its shape, then:

| Status | Code | When |
|---|---|---|
| 404 | `draft_not_found` | no submission with that id is the caller's |
| 409 | `not_editable` | it's not a `draft` or `changes_requested` (`details.status`) |
| 409 | `draft_mismatch` | `name`, `type` or `base` isn't the draft's (`details.name`, `type`, `baseVersion`) |

and 037's checks of paths, content and size. The files, the draft's `updatedAt` and the audit
event are written in one transaction; a refused request changes nothing.

**Audit.** `submission.draft_updated`, with the draft as the target and `{ name, type, via:
"api", tokenId, tokenName, files, bytes, status }` (plus `proposal` and `baseVersion` for a
proposal), and the caller's address, as 037's `submission.draft_created`.

**An older registry** (before 051) answers the `GET` with `404` or `405`: `rmk` plans new drafts,
as before.

## Edge cases

- **Several matching drafts:** the most recently changed is updated; the others stay.
- **A draft and a submitted one:** the draft is updated; the submitted one is untouched.
- **The draft was submitted between the plan and the upload:** `409 not_editable`; the item fails
  like any refused upload, and nothing else changes.
- **A proposal draft with a different base** (the item was released since): no match, so a new
  proposal draft from the new base; the old one stays (rebase or delete it in the web app).
- **A new-item draft of a different type** with the same name: no match, a new draft.
- **A proposal draft sent back with unresolved rebase conflicts** (017): updated like any; the
  conflicts stay listed until the person resolves them in the web app.
- **Dependencies (041):** each item, dependency or not, finds its own draft the same way. A
  dependency that's in review is refused, and the items that use it still declare it.
- **Edits made in the web editor** since the last export are replaced: the preview says so, and
  `--new-draft` keeps them.

## Documentation

- **Exporting your own items → Exporting again** (`export#again`, a new section after "What
  arrives"): exporting again updates your draft (or one sent back for changes), the newest if
  there are several; a submitted one is left alone, withdraw it first; a proposal from another base
  or a draft of another type gets a new draft; the web editor's edits are replaced; `--new-draft`.
- **Exporting your own items → The preview** and **From inside your AI tool**: the preview says
  "Updates your draft"; the assistant's plan does too, and it can make a separate draft.
- **Exporting your own items → Options**: `--new-draft`.
- **Installing with rmk → Tokens and the API** (`rmk#tokens`): a token can also update your own
  drafts.
- Helpers: none new. The **My submissions** helper "Already wrote it in your AI tool?" says
  exporting again updates the draft.

## Acceptance criteria

- [x] `GET /api/v1/drafts` lists only the caller's draft, changes-requested and submitted
  submissions, filtered by `name`, newest change first, and refuses a request without a token.
- [x] `PUT /api/v1/drafts/{id}` replaces the files of the caller's draft or changes-requested
  submission and records `submission.draft_updated`; someone else's is `404`, a submitted one
  `409 not_editable`, another name, type or base `409 draft_mismatch`, and a refused request
  changes nothing.
- [x] `rmk export` of an item with a matching draft updates it, says so in the preview and the
  result, and doesn't count towards the draft limit; `--new-draft` makes a new one.
- [x] An item that's only in review is refused with `in_review`, and the rest of the plan goes on.
- [x] A proposal draft from another base, or a draft of another type, isn't matched.
- [x] `plan_export` shows the draft it will update, and `newDraft` makes a new one.
- [x] Against a registry without the `GET`, export plans new drafts as before.
- [x] The service and repository tests pass on SQLite, PostgreSQL, MySQL and MariaDB.
- [x] The Documentation listed above says what the feature does now.

## Open questions

1. **Changes requested.** Included, since the web editor edits it too and it's the loop "the
   reviewer asks, I fix it in my tool". The person still resubmits in the web app.
2. **Keeping web edits.** The export replaces the draft's files. A three-way merge like 042's
   (base: what was last exported) would keep them, but needs the last export's files; wait until
   people ask.
