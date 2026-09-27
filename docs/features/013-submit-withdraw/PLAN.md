# 013 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Status transitions.** The status list, the allowed moves (with the owner's withdraw
  decision), and the domain errors.
  *Done when:* a table test covers every allowed and refused move.

- [ ] **2. Registry checks.** The `RegistryLookup` interface, the name check against open
  submissions, the dependency checks (exists, allowed type, range matches a published non-yanked
  version, no cycles), and the M2 lookup that finds no published items.
  *Done when:* unit tests with a fake lookup cover each failure and a passing graph, and a database
  test covers the open-submission name check.

- [ ] **3. Submit and withdraw services.** Submit (011's checks on saved files, then the registry
  checks, then the status change and audit event in one transaction), withdraw, read access for
  `submissions.view_submitted`, and the editor refusing non-drafts.
  *Done when:* database tests cover submit, refused submits, the concurrent-name case, withdraw from
  each allowed state, the audit events, and who can see what.

- [ ] **4. Pages.** Submit with its confirmation and check results, the read-only view, withdraw,
  and the status filters on My submissions.
  *Done when:* render and action tests pass, and the Playwright test in the acceptance criteria passes.

## Notes
