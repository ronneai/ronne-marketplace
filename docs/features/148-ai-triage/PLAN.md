# 148 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "AI triage" row (advisory, consent, no tools); §12 Security considerations gets
    the untrusted-content rule.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. Tables and settings.** [risky]
  - `content_triages`, the instance settings, a `triage` domain with
    its repository.
  - *Done when:* db tests (SQLite, then the servers for these files) cover the cascade, the indexes,
    and settings read with broken values as defaults.

- [ ] **3. The prompt and the answer.** [risky]
  - Building the request: instructions, delimited file blocks with a random boundary, the 200 KiB
    text cap, the base version for proposals.
  - Parsing: the schema, the caps, cleaning.
  - *Done when:* unit tests cover a file containing the boundary pattern, binary files skipped,
    the cap with omitted files listed, a proposal's base, and malformed, oversized and extra-field
    answers.

- [ ] **4. Queue, job and limits.** [risky]
  - Queue on send (with the scan's transaction), the `triage` job under a lease, stuck runs retried
    once, consent and settings checked again when a run starts, the daily and author limits counted
    from the table.
  - *Done when:* db tests cover queueing per type and consent, `not allowed` after consent is turned
    off, `limit reached`, two runners sharing the limit, and a stuck run.

- [ ] **5. Who sees and who asks.** [risky]
  - Visibility as the revision's; Triage again for reviewers and root; Get suggestions for the
    draft's author, rate-limited; audit.
  - *Done when:* db tests cover author, reviewer, other workspace member, outsider of a private
    workspace (not found), root, and the audit rows without prompt or answer.

- [ ] **6. Settings tab.**
  - Admin › Settings › AI triage; consent is 147's switch.
  - *Done when:* component tests, and an e2e test turning triage on and seeing a private workspace without consent left out.

- [ ] **7. Results on the pages.**
  - The Triage tab and Overview card on the review page, the card on the submission page, the
    Suggestions panel in the draft editor, Copy and Ask the author; plain-text rendering.
  - *Done when:* component tests (including an answer with HTML and links rendered as text) and an
    e2e test with a fake provider on desktop and phone.

- [ ] **8. Documentation.** The topics, sections and helpers in the spec's Documentation section, in
  a ronne-web branch.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
