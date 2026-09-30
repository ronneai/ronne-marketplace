# 037 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The service.** `createDraftFromFiles` in `submissions/services/drafts.ts`: the checks
  `saveDraftFiles` runs on paths, content and limits, then the row and the files in one
  transaction, with no template. `createDraft` shares the insert. `countDrafts(authorId)` in the
  repository, and `DraftQuotaError`.
  *Done when:* a `*.db.test.ts` shows the draft and its files land together, a refused upload
  leaves nothing, and the 51st draft is refused, on all four database servers (`pnpm test:db:up`).

- [ ] **2. The audit event.** `submission.draft_created` in `AUDIT_ACTIONS`, recorded in the same
  transaction with `{ name, type, via, tokenId, tokenName, files, bytes }`; the audit page shows it.
  *Done when:* a test reads the event with the token's name, and one proves no key trips
  `isSecretKey`.

- [ ] **3. The token-user actions.** `createDraftFromFilesAs` (submissions) and `listScopesAs`
  (items), taking the token's user like `itemPageAs`.
  *Done when:* action tests create a draft and list scopes as a user, a moderator and root.

- [ ] **4. Body limits.** `readJsonObjectWithin(request, maxBytes)` in `server/http/read-json.ts`,
  counting streamed bytes; 1 MiB on `postToken` and `postResolve`.
  *Done when:* an oversized body gets `413 body_too_large` with and without `content-length`, and
  the existing API tests still pass.

- [ ] **5. Error mapping and the rate limit.** The submission errors in the spec's table in
  `server/http/errors.ts`; a per-user limiter from `LoginRateLimiter`.
  *Done when:* `errors.test.ts` covers every row, and the limiter test passes with a moved clock.

- [ ] **6. `GET /api/v1/scopes`.** The handler in `server/http/drafts-api.ts` and the route.
  *Done when:* tests in the style of `registry-api.db.test.ts` cover paging, search and `401`.

- [ ] **7. `POST /api/v1/drafts`.** The handler and the route: token, rate, body, shape, service,
  then `issues` and `submitIssues`.
  *Done when:* tests cover `201` with and without issues, each error row, `submitIssues` for a
  taken name and an unreleased dependency, and `url` with and without `PUBLIC_URL`.

- [ ] **8. End to end.** Playwright: upload with a token from `POST /auth/token`, then open the
  returned URL signed in as that user and see the files in the editor; another user gets a 404.
  *Done when:* `pnpm test:e2e` passes.

- [ ] **9. Documentation.** The token section and helper and the proxy note in the spec's
  Documentation section; MVP §11's table if anything changed while building.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
