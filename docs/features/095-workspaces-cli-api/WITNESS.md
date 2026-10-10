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

## Task 2 — `rmk`

Witnessed: 2026-10-09 20:39 EDT, by a fresh agent (blind). Commit: 6d9c32e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | CLI tests pass | no | confirmed | `pnpm --filter @ronneai/rmk test` → 21 files, 241 passed; `pnpm --filter @ronneai/rmk typecheck` → clean |
| 2 | The MCP package stays green | no | confirmed | `pnpm --filter @ronneai/mcp test` → 4 files, 43 passed |
| 3 | `rmk workspaces` prints the WORKSPACE / VISIBILITY / YOUR ROLE table, `—` and `(ask: <registry>/workspaces/<name>/join)` only where you aren't a member; `--json` gives `workspaces[]` with `joinUrl` | no | confirmed | `workspaces.test.ts` asserts the spec's table and the JSON; mutations `role === null` → `true` and removing the 404 branch each fail a test; probe: a Unicode name pads and its address is percent-encoded |
| 4 | A new `rmk` against an older registry says "This registry doesn't have workspaces (it's older than 0.4.0)", exit 1, `no_workspaces` | no | partly | Probe against a 404 → exit 1, `no_workspaces`, but the message starts with the registry's URL, not "This registry" (SPEC.md:65, `workspaces.ts:33`); a 500 or 401 passes through unchanged |
| 5 | `rmk search --workspace <name>` sends `?workspace=`; two are a usage error | no | confirmed | Test plus probe: `"  ACME  "` → `workspace=ACME` (the server lowercases); `a&b=c` → `a%26b%3Dc`; two → exit 2; removing `params.set` or the `>1` check each fails a test |
| 6 | `rmk info` shows `workspace: <name>`, ` (private)` for private ones, no line for an older registry | no | confirmed | Test checks both; dropping `" (private)"` fails it; probe: no `workspace` → no line, exit 0 |
| 7 | Export's scope prompt is `workspace › @scope`, `global` first, then by workspace, numbered in that order | no | confirmed | Test: `1. global › @shared`, `2. acme › @acme-infra`, `3. tools › @tools`, "2" picks acme-infra; probe `byWorkspace`; an older registry keeps its order; dropping the sort or the label each fails a test |
| 8 | Export lists only scopes the user may use (091) | no | confirmed | Server filters, `items/services/scopes.ts:130` `workspacesWith(user, "submissions.create")`; `GET /scopes` returns `workspace` (`drafts-api.ts:73`) |
| 9 | On `not_a_member` (export), "Ask here: <registry>/workspaces/<ws>/join" follows the message | no | confirmed | Test asserts it on stderr; removing it in `api.ts` `messageOf` fails the test |
| 10 | `--json`'s error carries `joinUrl` | no | confirmed | Probe → `"joinUrl":"https://ronne.example/workspaces/acme/join"`; the test only checks the URL is somewhere in stdout |
| 11 | `rmk submit` puts "Ask here: …" under a `not_a_member` draft (preview, and refused at submit) | no | confirmed | Preview asserted in `submit.test.ts`; probes `--dry-run` and `--yes --json`; the refused-at-submit line (`submit.ts:268`) has no test |
| 12 | `POST /drafts/check` and `/drafts/submit` name each draft's `workspace` | no | confirmed | `drafts-api.ts:362` in `draftOf`, used by both; `vitest run --project db src/server/http/drafts-api.db.test.ts` → 30 passed, asserting `global` and `acme` |
| 13 | An older `rmk` keeps working against the new answers | no | confirmed | Scratch: HEAD's CLI files with the new fake (drafts carry `workspace`) → 20 files, 233 passed; the full check is task 4's `release:smoke` |
| 14 | Out of scope: rmk never asks to join, no workspace in `rmk.config.json` or `rmk.lock` | no | confirmed | grep `packages/cli/src`: the only workspace request is `GET /workspaces`; `project.ts` has none; no change under `docs/spec` |
| 15 | MVP §6's command table is updated | no | confirmed | `git diff docs/MVP/MVP.md` → `search … [--workspace <name>]`, `info`, a `rmk workspaces` row, export grouped by workspace |

**Overall:** not met: the older-registry message doesn't match the spec (row 4); no test catches dropping `joinUrl` from `--json`'s error, or the "Ask here" line for a draft refused at submit; a blank `--workspace` searches everything silently.

### Re-check

Witnessed: 2026-10-09 20:43 EDT, by a fresh agent (blind). Commit: 6d9c32e (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Against an older registry, `rmk workspaces` says "This registry doesn't have workspaces (it's older than 0.4.0)", exit 1, `no_workspaces` | no | confirmed | `workspaces.ts:29-37`; probe → exit 1 with that message, `--json` → `no_workspaces`; changing the code, message or exit code each fails "says when the registry is older than workspaces" |
| 2 | `--json`'s `not_a_member` error carries `joinUrl`, and a test fails if it's dropped | no | confirmed | `api.ts:126-128`; replacing it with plain `details` → "puts the join address in --json's error" fails |
| 3 | `rmk submit` puts "Ask here: …" under a draft refused at submit with `not_a_member`, and a test fails without it | no | confirmed | `submit.ts:246-248`, `:268`; deleting line 268 → the 095 submit test fails |
| 4 | A blank `--workspace` is a usage error | no | confirmed | `workspaces.ts:71-72`; probes `""`, `--workspace=`, `"\t"` → exit 2, no request; removing the check fails "narrows a search to one workspace, and refuses two" |
| 5 | CLI and MCP tests pass, rmk typecheck clean | no | confirmed | `pnpm --filter @ronneai/rmk test` → 21 files, 242 passed; `pnpm --filter @ronneai/mcp test` → 43 passed; `tsc --noEmit` exit 0 |

**Overall:** met: the older-registry message, `joinUrl` in `--json`, the "Ask here" line at submit and the blank `--workspace` error hold, each with a test that fails without it.
