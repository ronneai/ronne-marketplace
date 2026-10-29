# 151 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "AI triage" row gains reports.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. Table and job.** [risky]
  - `triage_reports`, the report job in batches, the once-a-day rule, the weekly run, six kept.
  - *Done when:* db tests (SQLite, then the servers for these files) cover batches, a failed batch,
    the daily refusal, the weekly schedule and the retention.

- [ ] **3. What a report sends.** [risky]
  - Item selection by workspace and consent, pairwise groups from the index, usage when kept, the
    answer's schema, unknown names dropped.
  - *Done when:* tests cover a private workspace without consent left out, root's report, a
    workspace's report naming only its own and public items, and an answer naming unsent items.

- [ ] **4. Who runs and reads.** [risky]
  - Admins, moderators and root for a workspace; root for the instance; audit.
  - *Done when:* db tests cover each role and an outsider (not found).

- [ ] **5. The pages.**
  - The workspace's Report tab, root's report page, the history, links and "Propose a change".
  - *Done when:* component tests and an e2e test with a fake provider on desktop and phone.

- [ ] **6. Documentation.** The sections and helper in the spec's Documentation section, in a
  ronne-web branch.
  *Done when:* the docs render tests pass, and the helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
