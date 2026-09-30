# 041 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. References.** The readers (038, 040) fill `references`: an agent's skills, and the MCP
  servers behind tool names in agents, skills and commands.
  *Done when:* unit tests cover each source, and a file with none returns none.

- [ ] **2. Findings.** In `packages/cli/src/export.ts`: each reference against the items found on
  disk, the state file, the current selection and the type table (`mayDependOn` in core), followed
  through dependencies of dependencies.
  *Done when:* tests cover every row of the spec's table, a shared dependency counted once, and a
  self-reference ignored.

- [ ] **3. Manifests and order.** `dependencies` written into the generated manifests with their
  ranges; the upload order; a failed dependency stopping its dependents.
  *Done when:* the manifests pass `checkPackage`, and a test with a fake registry failing the
  first `POST` shows nothing else sent.

- [ ] **4. The published-name check.** `GET /items/<scope>/<name>` for each dependency of the
  person's own; same name and type means "already in the registry".
  *Done when:* tests cover published with the same type, with another type, and not published.

- [ ] **5. The CLI.** The findings in the preview, the question, `--with-deps` and `--no-deps`,
  the usage error without a terminal, and the order in the result (from `submitIssues`).
  *Done when:* `cli.test.ts` covers each choice, each flag, and `--json`.

- [ ] **6. The MCP tools.** `dependencies` in `plan_export`, the answer without it, and the
  instructions.
  *Done when:* tests show no `planId` until it's given, and a plan that includes the dependencies.

- [ ] **7. End to end.** An agent with a skill: export both, then in the web app submit and
  release the skill, and submit the agent.
  *Done when:* `pnpm test:e2e` passes, including the refused Submit before the release.

- [ ] **8. Documentation.** The sections in the spec's Documentation section.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
