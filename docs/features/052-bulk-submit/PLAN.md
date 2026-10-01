# 052 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **0. Decisions.** The owner settles tokens that submit (every token) and dependents with their
  dependencies (013's rule stays), and the spec is updated to match before anything is built.
  *Done when:* the spec has no open question that changes what's built.

- [x] **1. Domain.** `checkMany` and `submitMany` in the `submissions` service, over 013's
  `allIssues` and `submitDraft`. Each draft gets its own transaction, and the result kinds are the
  spec's. The upload actor (token and address) is added to 013's audit metadata when there is one.
  Actions for a session and for a token.
  *Done when:* `bulk-submit.db.test.ts` covers ready and not ready in one batch, a draft taken
  between check and submit, someone else's id, a status that can't be submitted, resubmitting, and
  the audit, on every database.

- [x] **2. API.** `POST /api/v1/drafts/check` and `POST /api/v1/drafts/submit` in
  `server/http/drafts-api.ts` and their routes. They take `ids` or `all`, with the 100-id limit, the
  submit rate limit, and the error codes.
  *Done when:* the drafts API tests cover each row of the error table and each result.

- [x] **3. `rmk submit`.** It resolves names to drafts (051's rule, ambiguous names refused), ids
  and `--all`. It checks, shows the preview with the release order, asks, submits, reports, and
  exits with the specified codes. It supports `--dry-run`, `--yes` and `--json`.
  *Done when:* `submit.test.ts` covers names, ids, `--all`, an ambiguous name, nothing ready, some
  ready, `--dry-run`, no terminal without `--yes`, and the exit codes.

- [x] **4. MCP tools.** `check_drafts` (read-only) and `submit_drafts`, plus the server
  instructions.
  *Done when:* the MCP tests cover a check that sends nothing and a submit of a mixed batch.

- [x] **5. My submissions.** The Ready / n to fix marks from one `checkMany` on load, the
  checkboxes (disabled when not ready), Select all ready, Submit selected, and the dialog with its
  results. All of it uses the existing `components/ui` primitives and the design tokens.
  *Done when:* the component tests cover selection and the dialog, and an end-to-end test submits
  three drafts, one of them not ready.

- [ ] **6. Documentation.** The sections and helpers in the spec's Documentation section, MVP §11's
  endpoints, and the `rmk` README's command list. (§15's token decision is already recorded.)
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- `rmk submit` works out the release order from the check's issues: a not-ready draft whose
  `dependency_not_found` message names another draft in the same batch waits for that one. The
  message starts with the dependency's name (013's `DependencyNotFoundError`); if that wording
  changes, the order disappears, though the issue itself is still shown.
- The MCP tools reuse `planSubmit`, `sendSubmit` and `submitLines` from `@ronneai/rmk/lib`, as MVP
  §15's "MCP server and `rmk`" row asks: never `rmk`'s command layer.
- Submit selected's server action revalidates `/submissions`, so the page refreshes while the
  dialog is open, with fewer ready drafts (maybe none). The toolbar keeps rendering while its
  dialog is open, and the dialog lists what it snapshotted when it opened, not the live selection.
