# 051 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Service.** In the `submissions` domain: `listOpenDrafts` (the actor's own `draft`,
  `changes_requested` and `submitted` submissions, by item name, newest change first) and
  `replaceDraftFromFiles` (037's checks, then in one transaction: own and editable, the same name,
  type and base, replace every file, `updatedAt`, `submission.draft_updated`), with the new errors
  `DraftMismatchError` and the `not_editable` mapping. Actions `listOpenDraftsAs` and
  `replaceDraftFromFilesAs`.
  *Done when:* `drafts.db.test.ts` covers listing, replacing, someone else's, a submitted one, a
  mismatch, and that a refused replace changes nothing, on every database.

- [x] **2. API.** `GET /api/v1/drafts?name=` and `PUT /api/v1/drafts/{id}` in
  `server/http/drafts-api.ts` and the routes; the shared rate limit and body limit; the error
  codes.
  *Done when:* the drafts API tests cover each status and code in the spec's table.

- [x] **3. `rmk export`.** The client's `put`; the plan looks up each item's drafts (tolerating an
  older registry), picks the match, refuses `in_review`, and carries `updates`; the upload uses
  `PUT` for those and says Updated; `--new-draft`; the preview.
  *Done when:* `export.test.ts` covers update, several drafts, in review, another base or type,
  `--new-draft`, and an older registry.

- [x] **4. MCP export tools.** `plan_export`'s `newDraft` and its plan text; `export_items`'
  result says Updated.
  *Done when:* the MCP export tests cover an update and `newDraft`.

- [x] **5. Documentation.** The sections in the spec's Documentation section, MVP §11's endpoints
  and a §15 entry, and 037's and 042's open questions pointing here.
  *Done when:* the docs render tests pass, and every new link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- The fake registry in `packages/cli/src/testing.ts` answers 051's endpoints only with `open`;
  without it, it's a registry older than 051, which is what the tests before 051 keep using.
- A test that sorts drafts by `updatedAt` gives the replace a later clock: some databases keep
  timestamps to the second.
