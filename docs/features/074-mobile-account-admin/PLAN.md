# 074 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Sign-in, password, setup fields.** `autocomplete`, `inputmode`, "Forgot?" target, the
  setup database select's short labels.
  *Done when:* unit tests check the attributes.

- [ ] **2. Setup on phones.** Phone variants of the `wizard` and `wizard-nojs` projects; fix what
  they find, including polling when the page becomes visible again.
  *Done when:* both wizard projects pass on a phone.

- [ ] **3. Access tokens.** Stacked rows, wrapped token display, Revoke target and dialog.
  *Done when:* e2e creates, copies and revokes a token on a phone.

- [ ] **4. Admin.** Admin nav strip; Users and Scopes cards and dialogs; the audit log's Filters
  disclosure; Settings targets.
  *Done when:* `admin.mobile.e2e.ts` passes.

- [ ] **5. Every page.** Error and not-found pages, anything else the sweep still lists.
  *Done when:* the sweep's 074 entries are removed and it passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
