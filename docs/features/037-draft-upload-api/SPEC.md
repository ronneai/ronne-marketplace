# 037 — Draft upload API

> Milestone: M7 · Depends on: 007, 009, 010, 012, 013, 019 · Design: [MVP §11](../../MVP/MVP.md#11-rest-api-sketch-apiv1), [§4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md)

## Goal

`rmk` and the registry MCP server can hand the registry an item a person wrote on their own
machine, and it arrives as a **draft** owned by that person, who reviews and submits it in the web
app. This is the server side of M7: the two endpoints 038 and 039 call. It is the first write
through `/api/v1`, so it also sets the limits that come with that.

## Scope

**In:**
- `GET /api/v1/scopes`: the scopes a draft can be created in, so the client can ask the person
  which one.
- `POST /api/v1/drafts`: creates a draft of a **new item** with its files, in one step.
- The audit event for a draft created this way.
- Limits for a write by token: the request body's size, the number of drafts, and a rate limit.
- API error codes for the submission errors these endpoints can raise.

**Out** (and where it goes instead):
- Reading local files and building the manifest → 038 (`rmk export`) and 040 (more types).
- Submitting, withdrawing, reviewing and releasing through the API: they stay in the web app. A
  draft reaches nobody until its author submits it there.
- Editing or replacing a draft through the API, and listing drafts: the web editor (012). "Replace
  my draft" can come with 042.
- A draft that targets an existing item (a change proposal) → 042.
- Token scopes (read-only versus write): every token may create drafts (owner decision,
  2026-09-30). 009's note stays open for writes that reach other people.

## Behaviour

**Who.** Both endpoints need a bearer token (009's guard, 019's errors) and act as the token's
user. Creating a draft needs `submissions.create`, which every role has (MVP §2), in any scope
that exists (010).

**`GET /api/v1/scopes?q=&limit=&cursor=`** answers `{ scopes: [{ name, description }], nextCursor }`,
ordered by name, with 019's pagination. `q` filters by name, as the scopes page does. It is a thin
adapter over the `items` domain's `listScopes`, which every signed-in role may already call.

**`POST /api/v1/drafts`** takes JSON:

```json
{
  "name": "@team/secure-coding",
  "type": "skill",
  "files": [
    { "path": "ronne.yaml", "encoding": "utf8", "content": "…" },
    { "path": "SKILL.md", "encoding": "utf8", "content": "…" },
    { "path": "scripts/check.sh", "encoding": "utf8", "content": "…", "executable": true },
    { "path": "logo.png", "encoding": "base64", "content": "…" }
  ]
}
```

The files have the shape the editor's save already uses (012): text as `utf8`, anything else as
`base64`. `ronne.yaml` must be among them. The draft, its files and the audit event are written in
one transaction; a refused request leaves nothing behind. No starter template is written: the
files are the draft.

It answers `201`, never cached:

```json
{
  "id": "01J…",
  "path": "/submissions/01J…",
  "url": "https://ronne.example/submissions/01J…",
  "name": "@team/secure-coding",
  "type": "skill",
  "status": "draft",
  "files": 4,
  "bytes": 18234,
  "issues": [],
  "submitIssues": []
}
```

- `url` is the instance's public address plus `path`, or `null` when the instance has no
  `PUBLIC_URL`; the client then uses its registry address.
- `issues` are the checks a save runs (011's schema and package checks, 012). **A draft with
  errors is still created**, as in the editor: a draft is work in progress, and the person fixes it
  in the web app.
- `submitIssues` are what Submit would refuse right now (013's registry checks): the name is taken,
  a dependency isn't released yet. They're advice for the client to pass on; nothing is reserved
  and nothing is submitted.

**Name and type.** The request's `name` and `type` decide the draft's, as in the web's "New draft"
form. When `ronne.yaml` says otherwise, the draft is created and `issues` carries `name_mismatch`
or `type_mismatch`, exactly as the editor shows for an imported `.zip` (012).

**Checks before anything is written**, each with its own error:

| Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | the body isn't a JSON object of this shape |
| 400 | `invalid_name` / `invalid_type` | the name isn't a valid `@scope/name`, or the type isn't an item type |
| 400 | `invalid_path` | a path breaks 011's rules, or appears twice |
| 400 | `invalid_content` | `base64` content that isn't base64 |
| 400 | `manifest_required` | no `ronne.yaml` among the files |
| 404 | `scope_not_found` | the scope doesn't exist |
| 409 | `draft_limit` | the person already has 50 drafts |
| 413 | `body_too_large` | the body is over 28 MiB |
| 413 | `file_too_large` / `draft_too_large` | a file over 1 MiB; more than 500 files or 20 MiB (`details.limit`) |
| 429 | `rate_limited` | more than 30 uploads in 10 minutes, with `retry-after` |

`details` names what was refused: `path` for `invalid_path`, `invalid_content` and
`file_too_large`; `scope` for `scope_not_found`; `limit` for every limit, with `of` (`files` or
`bytes`) for `draft_too_large`; `retryAfterSeconds` for `rate_limited`.

Token errors, `forbidden` and `setup_required` are 019's.

**Limits.** Until now a token could only read, and `/api/v1` had no limit on a request's size (the
proxy that caps bodies skips `api/`).
- **Body size.** The handler checks the token first, then reads at most 28 MiB (a full 20 MiB draft
  as base64, the limit server actions already have, 012), counting bytes as they arrive, so a
  request without `content-length` is cut too. The existing `POST /auth/token` and `POST /resolve`
  get a 1 MiB limit the same way.
- **Draft count.** At most **50 drafts** (status `draft`) per author through this endpoint; the
  51st answers `draft_limit` and says to submit or delete some. The web editor has no such limit
  and keeps none.
- **Rate.** At most **30 uploads per 10 minutes** per user, in memory, with the limiter sign-in
  uses (006).

**Audit.** `submission.draft_created`, with the draft as the target and
`{ name, type, via: "api", tokenId, tokenName, files, bytes }`, plus the caller's address. It
answers "which token did this?" if one leaks. Drafts made in the web app stay unaudited (012): a
session is the person. **The audit log is read by root, so root sees the names of drafts created
through the API**, though not their content; a draft is otherwise private to its author.

**For the features that build on this.** The service is `createDraftFromFiles` in the
`submissions` domain, next to `createDraft` (which keeps the template, for the web form); both
share the insert. The API reaches it through `createDraftFromFilesAs`, which takes the token's user
instead of the session, the way the `items` domain's `…As` actions do (019). The handlers live in
`server/http/drafts-api.ts`; `registry-api.ts` stays the read API.

## Edge cases

- **The same item uploaded twice:** two drafts with the same name. Drafts don't reserve names
  (012), and the second `submitIssues` doesn't mention the first. The client warns (038); see Open
  questions.
- **The name is already published, or proposed in an open submission:** the draft is created, and
  `submitIssues` says Submit will refuse it. The person renames it in the editor, or proposes a
  change on the item's page instead.
- **A `ronne.yaml` that doesn't parse:** created, with the parse error in `issues`.
- **A `version` in `ronne.yaml`:** ignored in drafts, as everywhere (manifest spec §1).
- **Files under `.ronne/`:** stored like any draft file; the packer leaves them out (011).
- **Paths that differ only by case:** an issue (`path_case_clash`), not a refusal, as in the editor.
- **A reverse proxy in front of the instance with a smaller body limit** (nginx's default is
  1 MB): it answers before Ronne does, without our error shape. The Documentation says which limit
  to raise, and `rmk` says so when it gets a bare `413` (038).
- **A disabled user's token, or a revoked one:** 009's `401`s; nothing is created.

## Documentation

- **Installing with rmk → Tokens** (`rmk#tokens`): a token reads the registry as you, **and can
  create drafts in your name**; a draft is private and nothing is submitted without you, in the web
  app. The limits (50 drafts, 30 uploads in 10 minutes). Each upload is written to the audit log
  with the token's name and the draft's name, which root can read (the Documentation has no audit
  topic, so it's said here).
- **The `token` helper** (Access tokens page): the same first sentence, short.
- **Installing Ronne → With Docker** (`install#docker`), for whoever runs the instance: a reverse
  proxy in front of Ronne needs its request body limit at 28 MB for uploads.
- The export topic itself comes with 038, the first feature people can use this through.

## Acceptance criteria

- [x] `GET /api/v1/scopes` lists scopes with search and pagination, for every role, and refuses a request without a token.
- [x] `POST /api/v1/drafts` creates the draft and its files in one transaction, with no template files, owned by the token's user, and answers its `path`, `url`, `issues` and `submitIssues`; the author opens it in the web editor.
- [x] A draft with validation errors is created and the errors are in `issues`; a draft whose name is taken or whose dependency isn't released says so in `submitIssues`.
- [x] Every row of the error table is returned for its case, and a refused request leaves no draft, no files and no audit event.
- [x] A body over the limit is refused with or without `content-length`; `POST /auth/token` and `POST /resolve` refuse bodies over 1 MiB.
- [x] The 51st draft and the 31st upload in 10 minutes are refused with their codes.
- [x] `submission.draft_created` is recorded with the token's id and name, and no secret-looking key.
- [x] The service and repository tests pass on SQLite, PostgreSQL, MySQL and MariaDB.
- [x] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

1. **The same item uploaded twice makes two drafts.** Recommended for now: leave it, and have the
   client warn when the person already has a draft of that name (which needs the response, or a
   small read endpoint, to say so; decide when building 038). "Replace my draft" belongs with 042.
2. **The limits' values:** 50 drafts and 30 uploads per 10 minutes are guesses at "far more than a
   person needs, far less than a script gone wrong". Root-configurable limits wait for instance
   settings (MVP §12).
3. **Root sees the names of drafts created through the API** in the audit log. Recommended: accept
   it, since the owner asked for the audit (2026-09-30), and say it in the Documentation. The
   alternative is to record only the draft's id.
4. **Token scopes.** Every token may create drafts (owner, 2026-09-30). If a later feature lets a
   token do something other people see (submit, release), that is the moment for read-only tokens.
