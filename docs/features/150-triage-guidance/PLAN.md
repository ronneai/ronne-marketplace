# 150 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "AI triage" row gains guidance; the "Security scan" row says guidance is scanned.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. Tables.** [risky]
  - `triage_guidance`, the scan target for guidance (pick and record the shape), `content_triages.guidance`.
  - *Done when:* db tests (SQLite, then the servers for these files) cover the cascade from a
    workspace, the scan rows, and an existing `content_scans` row unchanged.

- [ ] **3. Guidance service and permissions.** [risky]
  - Create, edit, toggle, delete; root for the instance, admins and root for a workspace, members read;
    `used_text` kept until a new text passes; audit without the body.
  - *Done when:* db tests cover each role, an outsider of a private workspace (not found), and the
    audit rows.

- [ ] **4. Scanning guidance.** [risky]
  - The scan job takes guidance targets; the one-file package; the threshold check when a run starts;
    root's override.
  - *Done when:* tests cover waiting, failed, over and under the threshold, the override, an edit
    keeping the old text, and the scan off.

- [ ] **5. Guidance in runs.**
  - Selection by type and topic, order, the 32 KiB cap with cuts listed, the delimited blocks, titles
    stored on the run.
  - *Done when:* unit tests cover selection, the cap, and a guidance body that tries to change the
    answer's shape (the schema still holds).

- [ ] **6. Editors.**
  - The instance list in Settings › AI triage, the workspace's on its settings page, the scan card and
    findings, read-only for members.
  - *Done when:* component tests and an e2e test writing workspace guidance with the scan faked.

- [ ] **7. Documentation.** The sections and helpers in the spec's Documentation section, in a
  ronne-web branch.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
