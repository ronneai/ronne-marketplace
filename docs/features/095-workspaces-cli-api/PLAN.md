# 095 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. API.** `GET /api/v1/workspaces`; `workspace` on item and search responses and `me`;
  `?workspace=`; MVP §11 updated.
  *Done when:* API tests pass with a member, a non-member and root.

- [x] **2. `rmk`.** `workspaces`, `search --workspace`, `info`, export's grouped scope prompt, the
  join address on `not_a_member`, and the older-registry message.
  *Done when:* CLI tests pass.

- [x] **3. MCP.** `search_items` with `workspace`, `list_workspaces`.
  *Done when:* MCP tests pass.

- [x] **4. Compatibility.** The last released `rmk` against the new server.
  *Done when:* `pnpm release:smoke` passes, plus a manual run of the old `rmk search` and `install`.

- [x] **5. Documentation.** The topics in the spec.
  *Done when:* the docs render tests pass in ronne-web.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
