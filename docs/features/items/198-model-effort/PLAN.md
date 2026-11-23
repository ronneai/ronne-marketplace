# 198 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §3.3 gets a paragraph on the model and effort per tool, and §15 a "Model and effort" row
    with the owner's four decisions.
  - `docs/features/README.md` lists 198 in M33.
  - Check the vendor table in the spec again against the current docs, and update it and its date.
  - *Done when:* MVP.md and the index say what this spec says, and `pnpm witness:check` and
    `pnpm docs:check` pass.

- [ ] **2. The manifest.**
  - `ronne.schema.json`:
    - a `modelHint` definition (`tier`, `effort`) on `skill`, `agent` and `command`;
    - `agent.model` accepts either the string or the block, but not both with the other key.
  - `docs/spec/manifest.md`: the block, the pins, and the `SKILL.md` keys read as Claude Code pins.
  - `examples/items/`: the sample skill and agent get a `model` block, and the golden inputs follow.
  - The package checks reject an effort outside the tool's values in a pin.
  - *Done when:* the schema tests and `examples.test.ts` pass, there are tests for both forms of
    `agent.model` and for the conflict, and the existing items still validate.

- [ ] **3. Resolution in core.**
  - `packages/core/src/render/model.ts`:
    - `resolveModel(item, tool, policy)`, with the spec's steps 1–4 and their warnings;
    - the built-in policy (today's `MODELS` moves here);
    - `ModelPolicy` and the local-config types.
  - The render context carries `policy` (optional, built-in when absent).
  - *Done when:* `model.test.ts` covers every step, `inherit`, a pin off the list, the local map,
    `pins: false`, a local value off the list, and an item with no block; `pnpm --filter
    @ronneai/core test` passes.

- [ ] **4. The renderers.**
  - **Claude Code:** `model` and `effort` on agents, commands and `.claude/skills/<n>/SKILL.md`,
    through `skill-frontmatter.ts`, without changing the authored file.
  - **Codex:** `model` and `model_reasoning_effort` on agents, and the warnings for skills and
    commands.
  - **Cursor:** `model: <id>[effort=…]` on agents, effort with no model skipped with a warning,
    and the warnings for skills and commands.
  - **`.agents/skills/`:** `agentsSkillEntry` drops `model` and `effort` too.
  - `invalid_override` accepts `effort`.
  - *Done when:*
    - every existing golden file is unchanged;
    - new golden cases cover the spec's two Behaviour examples for all three tools;
    - the renderer tests cover each warning and the edge cases 2, 3, 7 and 8.

- [ ] **5. The instance setting.**
  - `models/model-policy.ts` in the settings domain:
    - parse and validate (tier values on the list, efforts per tool);
    - the default is the built-in policy.
  - The repository reads and writes `model_policy` with a version.
  - The service saves with the stale check and the audit event `settings.model_policy_changed`
    (before and after).
  - *Done when:* unit tests cover the model, and `*.db.test.ts` cover saving, the stale check,
    reset and the audit row on SQLite, PostgreSQL, MySQL and MariaDB (`pnpm test:db:up`, then
    those files).

- [ ] **6. The Models tab.**
  - `features/admin-settings/models/`: one panel per tool with:
    - the allowed list;
    - the tier map;
    - the tier efforts;
    - Reset to Ronne's values.
  - It's registered in `tabs.ts`, root only, and has the help link.
  - Every message in the `admin` namespace, in all three languages.
  - *Done when:* component tests cover editing, the refusal of a tier value off the list, reset and
    the stale error, and the translation tests and the raw-text lint pass.

- [ ] **7. The API and `rmk`.**
  - `GET /api/v1/model-policy`, a thin route over the settings action.
  - `rmk install` and `rmk update`:
    - fetch the policy once per run (a 404 means the built-in policy);
    - pass `rmk.config.json`'s `models`;
    - record `modelHash` in `.rmk/state.json`;
    - re-render on `rmk update` when the hash changes.
  - `--no-models`.
  - `docs/spec/cli-files.md`: `models` and `modelHash`.
  - *Done when:*
    - the route's tests cover auth and the response shape;
    - the CLI tests cover the 404 fallback, the local map, `pins: false`, `--no-models` and the
      re-render on a changed map;
    - `pnpm test:runtime` passes.

- [ ] **8. Feeds.**
  - The plugin feeds and marketplaces render with the instance's policy (076, 077, 078).
  - *Done when:* the feed tests show an agent with a tier getting the instance's model, and a feed
    built before any policy is saved is unchanged.

- [ ] **9. The editor, the item page and review.**
  - The editor's Model section for skills, agents and commands:
    - tier;
    - effort;
    - a pin per tool from its allowed list.
  - The notice when `SKILL.md` has `model` or `effort`.
  - Submitting refuses `model_not_allowed`.
  - The support matrix (026) shows the resolved model and effort per tool.
  - Review shows the same beside the diff.
  - All messages in three languages.
  - *Done when:*
    - component tests cover the section and the notice;
    - an action db test covers `model_not_allowed`, from `ronne.yaml` and from `SKILL.md`;
    - an e2e test opens an item page and sees the model row.

- [ ] **10. End to end.**
  - An e2e scenario:
    - root saves a tier map;
    - a developer runs `rmk install` into a temporary project for all three tools;
    - the installed `.claude/agents/<n>.md`, `.codex/agents/<n>.toml` and `.cursor/agents/<n>.md`
      carry the expected model and effort;
    - root changes the map, and `rmk update` rewrites them.
  - *Done when:* the scenario passes locally and in CI.

- [ ] **11. Documentation.**
  - ronne-web: `items#model`, `settings#models`, `rmk#models`, and the model line in the
    `claude-code`, `codex` and `cursor` topics, in three languages, in a branch that goes live with
    the release.
  - Here: the helpers and `topics.ts`.
  - *Done when:* the docs render tests, `pnpm docs:links` and the topics test pass, and each page
    says what the app does.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
