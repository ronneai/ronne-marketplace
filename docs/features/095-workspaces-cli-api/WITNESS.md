# 095 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — API

Witnessed: 2026-10-09 20:32 EDT, by a fresh agent (blind). Commit: 889de6b (plus the uncommitted working tree). Machine: macOS 27.0.0, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The API tests pass, with a member, a non-member and root | no | confirmed | `pnpm --filter @ronneai/web exec vitest run src/server/http/` → 16 files, 128 passed; the new `describe("workspaces in the API (095)")` in `private-api.db.test.ts` uses the `member`, `outsider` (a non-member moderator) and `root` tokens; `vitest run src/server/domains/workspaces src/server/domains/items` → 156 passed |
| 2 | `GET /api/v1/workspaces` exists and needs a token | no | confirmed | `app/api/v1/workspaces/route.ts` → `getWorkspaces`; no token → 401 (test "needs a token"); a bogus token → 401 `token_invalid`, `no-store`; success `private, no-cache` |
| 3 | `{workspaces:[{name,description,visibility,global,role}]}`, `global` first then by name, public ones plus the caller's private ones | no | confirmed | Test expects `global, acme, tools` for the member; probe: outsider and a plain user → only `global`; a private workspace is never listed for a non-member |
| 4 | `role` is null where the caller isn't a member, `root` on every workspace for root | no | confirmed | `api-v1.ts` `role: user.role === "root" ? "root" : w.role`; test: `tools: null`, all `"root"` for root; dropping the root mapping in a scratch copy → 1 test failed |
| 5 | `GET /api/v1/me` adds `workspaces:[{name,role}]`, the caller's memberships | no | confirmed | Test: member → global and acme, outsider → global (moderator); probe: root → `[]` (no memberships); removing the field → 1 test failed |
| 6 | Search results, items and versions carry `workspace: {name, visibility}` | no | confirmed | `registry-json.ts` `workspaceOf` in `itemSummaryJson`, `itemJson`, `versionJson`; the test checks all three `{name:"acme",visibility:"private"}`; always "public" → 2 tests failed |
| 7 | `?workspace=` filters search, trimmed and lowercased | no | confirmed | `parseWorkspace` → `searchCatalogueAs`; test `%20ACME%20` finds `@acme-infra/deploy`; empty → no filter (probe); not passing the filter → 1 test failed |
| 8 | A private workspace and an unknown name answer a non-member alike, finding nothing | no | confirmed | Test compares the two bodies; probe: outsider and plain `?workspace=acme` → `200 {"items":[],"nextCursor":null}`; `%C3%80CME`, `a%0D%0Ab`, 40×`é` → 200, empty |
| 9 | More than 64 characters → `400 invalid_request` | no | confirmed | `NAME_MAX_LENGTH` 64 (`packages/core/src/names.ts:6`); unit test 64 ok, 65 fails; db test 65 → 400; limit 1000 → 2 tests failed |
| 10 | 093's visibility still holds | no | confirmed | Probe: unfiltered search → outsider and plain `[]`, member and root see `@acme-infra/deploy`; the 093 tests in the same file pass |
| 11 | An older `rmk` keeps working: new fields additive, `?workspace=` optional | no | confirmed | `git diff` of `registry-json.ts` and `api-v1.ts` only adds keys; `parseWorkspace(null)` → `null` (unit test) |
| 12 | MVP §11 updated | no | confirmed | `docs/MVP/MVP.md` §11: rows for `GET /me`, `GET /workspaces`, `GET /items?…&workspace=`, and the "Items carry their workspace" bullet |
| 13 | Typecheck and lint clean for the change | no | confirmed | `pnpm --filter @ronneai/web typecheck` → no errors; biome → 1 warning, `registry-api.ts:130` `useOptionalChain`, old code outside the diff |

**Overall:** met: `/workspaces`, `workspace` on items and versions, `me.workspaces` and `?workspace=` work and follow 093's visibility for a member, a non-member, a plain user and root; each behaviour has a test that fails when it's broken.
