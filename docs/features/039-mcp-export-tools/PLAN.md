# 039 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. A store for any plan.** `planStore` in `packages/mcp/src/plan-tools.ts` becomes generic
  over what it keeps; the server creates one for installs and one for exports.
  *Done when:* `plan-tools.test.ts` passes unchanged.

- [x] **2. `list_local_items`.** In a new `packages/mcp/src/export-tools.ts`, over
  `discoverLocalItems` from `@ronneai/rmk/lib`.
  *Done when:* a test compares its answer with `rmk export --dry-run --json` for the same folder,
  with a skill of each origin.

- [x] **3. `plan_export`.** Over `planExport`; the answer without `to` (scopes, `needs`, no
  `planId`); the text of the plan.
  *Done when:* tests show no `planId` and no `POST` without a scope, a plan with one, and
  `scope_not_found` with the list.

- [x] **4. `export_items`.** Re-plan, compare fingerprints, `uploadExport`, the answer.
  *Done when:* tests cover the drafts created, and expired, used, stale and install plans refused,
  and a partial failure.

- [x] **5. Registration.** The three tools in `server.ts` with their annotations and input
  descriptions, and the instructions (ask for the scope, show the plan, never submit).
  *Done when:* `server.test.ts` lists eleven tools in order and expects `apply_plan` and
  `export_items` as the only ones that aren't read-only.

- [x] **6. Without a token, without a network.** The guards the other tools have.
  *Done when:* the existing "run `rmk login`" test covers the new tools, and `list_local_items`
  answers with the registry unreachable.

- [ ] **7. End to end.** In `apps/web/e2e/mcp.e2e.ts`, with the built `rmk-mcp`: list, plan
  without a scope, plan, export, open the draft.
  *Done when:* `pnpm test:e2e` passes.

- [ ] **8. Documentation.** `MCP_TOOLS` and the sections in the spec's Documentation section, the
  README's MCP section, and 027's spec where its sentences changed.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
