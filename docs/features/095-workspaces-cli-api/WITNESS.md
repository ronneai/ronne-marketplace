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

## Task 3 — MCP

Witnessed: 2026-10-09 20:47 EDT, by a fresh agent (blind). Commit: bde7afb (plus the uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MCP tests pass | no | confirmed | Scratch copy: `pnpm --filter @ronneai/rmk build`, then `pnpm --filter @ronneai/mcp test` → 5 files, 49 passed; `pnpm --filter @ronneai/mcp typecheck` clean |
| 2 | rmk stays green with the new `lib.ts` exports | no | confirmed | `pnpm --filter @ronneai/rmk test` → 21 files, 242 passed; build clean |
| 3 | `search_items` takes an optional `workspace` and sends `?workspace=` | no | confirmed | `server.ts` zod field, `read-tools.ts:64`; test `" acme "` → `workspace=acme`; removing `params.set` → 1 test fails |
| 4 | A blank `workspace` is refused | no | confirmed | `.trim().min(1).max(64)`; probes `"  "`, `"\r\n"` → -32602, no request; removing trim/min → 1 test fails |
| 5 | Hostile and edge values are handled safely | no | confirmed | `a&b=c` → `a%26b%3Dc`; `éé` encoded; 64 sent; 65 and a number refused |
| 6 | `search_items` results carry the workspace | no | confirmed | Items passed through to `structuredContent.items` (`read-tools.ts:74`); test checks `{name:"acme",visibility:"private"}` |
| 7 | `get_item` shows the workspace as `rmk info` does | no | confirmed | `read-tools.ts:89-93`; text identical to `rmk info`; disabling the line → 1 test fails |
| 8 | `list_workspaces` is read-only and returns what `rmk workspaces` prints, as data too | no | confirmed | `annotations: read`; text = `rmk workspaces`, data = `--json` with `joinUrl`; removing readOnly → 2 tests fail; empty list → header only, not an error |
| 9 | Against an older registry, `list_workspaces` reports `no_workspaces` | no | confirmed | Test: isError, `no_workspaces`, "older than 0.4.0" |
| 10 | Old clients and registries keep working | no | confirmed | Probe: items without `workspace` → `search_items` and `get_item` not errors, no workspace line; `workspace` optional |
| 11 | `plan_export` lists scopes by workspace | no | confirmed | `byWorkspace` + `scopeLabel`; test checks global › acme › tools; unsorted → 1 test fails |
| 12 | A `not_a_member` error carries `joinUrl` | no | confirmed | `export_items` test checks it; removing → 1 test fails; `guarded` path works by probe but no test covers it |
| 13 | MVP §7's read-tools line updated | no | confirmed | `docs/MVP/MVP.md:472` |
| 14 | "The MCP tools take and return the workspace" | no | confirmed | Rows 3 to 12 |

**Overall:** met: `search_items` takes and validates `workspace`, results and `get_item` carry it, `list_workspaces` matches `rmk workspaces`, export scopes are grouped by workspace, `not_a_member` carries `joinUrl`, old registries work. After the pass, the test the witness suggested for `guarded`'s `joinUrl` was added to `workspaces.test.ts` ("puts where to ask to join in any tool's not_a_member error"); replacing the `joinUrl` with `{}` in `server.ts` fails it (50 tests otherwise pass).

## Task 4 — Compatibility

Witnessed: 2026-10-09 20:53 EDT, by a fresh agent (blind). Commit: bacd856. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | An older `rmk` (the last release) passes `release:smoke` against the new server (acceptance criterion) | no | partly | `pnpm release:smoke` → exit 0, but `release-smoke.js:86` packs this branch's packages; it never runs the released `rmk` or any `rmk` against a server, so it can't check the criterion as worded; old-client compatibility is shown by rows 3–9 |
| 2 | `pnpm release:smoke` passes | no | confirmed | exit 0: 4 packages packed at 0.3.2, ✓ `rmk --version`, `--help`, `rmk-mcp` initialize, `rmk-server` 503 setup_required |
| 3 | Old `rmk search` works against the new server | no | confirmed | npm `@ronneai/rmk` 0.3.2 against the seeded instance (`next start`, this branch): plain user `search e2e` → 11 items incl. `@e2e-seeded/kit-rule`; member → 12 incl. `@e2e-vault-tools/vault-deploy` |
| 4 | Old `rmk install` works against the new server | no | confirmed | Plain user installs `@e2e-seeded/kit-rule` → `.claude/rules/kit-rule.md`, `rmk.lock` with sha256; member installs `vault-deploy` and `kit-rule` for claude-code,codex → skills, `AGENTS.md`, both in the lock |
| 5 | Visibility holds for the old client | no | confirmed | Plain user: `search vault --json` → `[]`; `install`/`info` of `vault-deploy` → "isn't a published item.", exit 1 |
| 6 | Old `rmk` doesn't show workspaces; new fields are ignored | no | confirmed | `search --json` carries `workspace`; text output unchanged; `info` exit 0 |
| 7 | `?workspace=` is optional | no | confirmed | Old `rmk` sends none; `search`, `info`, `install`, `outdated`, `update` succeed |
| 8 | Export's scope list is filtered by the server for an old `rmk` | no | confirmed | `GET /api/v1/scopes?limit=100`: plain → `e2e-seeded`; member → also `e2e-vault-tools`; old `rmk export --to @e2e-vault-tools --dry-run`: plain → "has no scope", member passes the scope check |
| 9 | Other old-client commands keep working | no | confirmed | `list --installed`, `outdated`, `update`, `whoami` → exit 0 |

**Overall:** not met: the old `rmk` 0.3.2 searches, installs, exports and updates against the new server and private items stay hidden, but `release:smoke` doesn't run the last release against a server, so the criterion isn't true as written (row 1).

### Re-check

Witnessed: 2026-10-09 20:53 EDT, by a fresh agent (blind). Commit: bacd856 (plus the uncommitted SPEC.md wording). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm release:smoke` passes, and the last released `rmk`, installed from npm, searches and installs against the new server | no | confirmed | `pnpm release:smoke` → exit 0, every check ✓ (packs this branch, as the criterion says); `oldrmk/package-lock.json` resolves `registry.npmjs.org/@ronneai/rmk/-/rmk-0.3.2.tgz`, `rmk --version` → 0.3.2; fresh run as remember@e2e.test: `search kit-rule` → `@e2e-seeded/kit-rule@1.0.0`, `install @e2e-seeded/kit-rule --target claude-code` → wrote `.claude/rules/kit-rule.md`, exit 0 |

**Overall:** met: `release:smoke` passes, and the released `rmk` 0.3.2 from npm searches and installs against this branch's server.

## Task 5 — Documentation

Witnessed: 2026-10-09 20:56 EDT, by a fresh agent (blind). Commit: c464872 (marketplace), with ronne-web's uncommitted changes on branch `marketplace-095-workspaces-cli`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The docs render tests and the other ronne-web checks pass | no | confirmed | In `www/`: `pnpm lint` clean; `pnpm typecheck` exit 0; `pnpm test` → 29 files, 138 passed (`docs.test.ts` covers every locale); `pnpm build` exit 0, docs pages prerendered |
| 2 | `rmk#installing` covers `rmk workspaces`, `--workspace` and `rmk info`; the example is what the CLI prints | no | confirmed | en/rmk.tsx `installing`; probe with the built `workspaceLines` printed the example's rows exactly; `registry-commands.ts:91-92`, `:120-122` |
| 3 | The older-registry sentence is true | no | confirmed | Probe: `fetchWorkspaces` on a 404 → "This registry doesn't have workspaces (it's older than 0.4.0).", `no_workspaces` |
| 4 | Workspaces don't change `rmk.config.json` or `rmk.lock` | no | confirmed | `git diff --stat main...c464872 -- packages/cli/src/config.ts packages/core/src docs/spec/cli-files.md` → empty |
| 5 | `rmk#mcp` names `list_workspaces`; the MCP tools table is right | no | confirmed | `server.ts:64-101`, `read-tools.ts:124-127`; `vitest run src/workspaces.test.ts` (mcp) → 7 passed |
| 6 | `export#scope` describes the scope list and the `not_a_member` join address | no | confirmed | Probe `byWorkspace` + `scopeLabel` matches the example; server filters scopes (`items/services/scopes.ts:130`); `api.ts:39-40`, `submit.ts`. Remark: for a scope outside your workspaces, `--to` may meet the scope check before any upload, not checked live |
| 7 | No topic or section id added or renamed | no | confirmed | `apps/web/src/components/help/` and ronne-web `topics.ts` unchanged |
| 8 | pt and fr say the same as en | no | confirmed | Diffs read side by side: same paragraphs, examples, rows |
| 9 | `docs/product-facts.md` is up to date | no | confirmed | A 095 row under "in the next release"; the "Specified, not built" 094–095 row removed |

**Overall:** met: the listed topics describe what the code at c464872 does, in all three languages; ronne-web's checks pass; no topic ids changed. Row 6's remark: `rmk export --to` checks the scope against the registry's list first (`export.ts`, `scope_not_found`), so the paragraph was corrected and re-checked below.

### Re-check

Witnessed: 2026-10-09 20:58 EDT, by a fresh agent (blind). Commit: c464872 (marketplace), with ronne-web's uncommitted changes on branch `marketplace-095-workspaces-cli`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | `export#scope`: only your workspaces' scopes, grouped, `global` first; a scope outside them isn't listed and `--to` with one says the registry has no such scope; a `not_a_member` upload refusal gets the join address; `rmk submit` too | no | confirmed | Server filter `items/services/scopes.ts:130-137`; `--to` check `export.ts:977-987` (`scope_not_found`); upload `drafts.ts:569` `requireMember` → 403 `not_a_member` with `details.workspace` (`http/errors.ts:72`), `api.ts:39-40,126-127` adds "Ask here" and `joinUrl`; `submit.ts:170,219-220,247-248,281`; pt and fr say the same; ronne-web `pnpm lint`, `typecheck`, `test` (138 passed), `build` → exit 0 |

**Overall:** met: the rewritten paragraph matches the code at c464872 in all three languages, and ronne-web's checks pass. Committed in ronne-web on `marketplace-095-workspaces-cli`.
