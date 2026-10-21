# 124 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The notice's model and settings.** `notice-policy.ts` in `domains/settings/models`
  (message, link label and address, tone, shown, revision; validation: length, `https:` or `/`
  addresses only, no `javascript:`/`data:`), stored in `instance_settings`, `setNotice` and
  `notice` in the settings service, the `settings.notice` audit action (without the text).
  *Done when:* unit tests cover validation and the revision; `settings.db.test.ts` covers saving,
  hiding and showing again, and the audit event holds no message text.

- [x] **2. The Notice tab.** A tab in Admin › Settings (122): fields, preview, last changed by,
  helper; root only.
  *Done when:* component tests cover the form, errors beside fields and the preview; a permission
  test shows non-root gets not-found.

- [x] **3. Showing and dismissing.** The `Notice` shown under the header on every signed-in page
  (the (app) layout and the phone Menu), a dismiss form and the `ronne-notice` cookie holding the
  revision, text output as text.
  *Done when:* tests cover showing, dismissing, return after a change, HTML typed as text, and the
  no-JavaScript form.

- [x] **4. Home's layout.** `HomeView` split into sections with the empty-section rule, slots for
  getting started, favorites and pinned (rendering nothing for now), the new heading and
  description, search with type links.
  *Done when:* component tests cover each section present and absent, and the order.

- [x] **5. The empty instance.** The message for an instance with no released items, different for
  root and others, with links.
  *Done when:* component tests for both roles; the end-to-end test starts from a fresh instance.

- [x] **6. Messages and phone.** Every string in messages (129) in English, Portuguese and French;
  the scan covers `features/home` and the Notice code; phone sweep in each language.
  *Done when:* parity and scan tests pass; the end-to-end sweep passes on every project.

- [x] **7. End to end.** Root sets a Warning notice; a user sees it, dismisses it, root edits it
  and it returns; Home on a new instance and on a populated one.
  *Done when:* the end-to-end tests pass on every project.

- [ ] **8. Decision log and index.** MVP §15 row "Home and the instance notice"; the features index.
  *Done when:* the rows are in.

- [ ] **9. Documentation.** The sections and helpers in the spec, both `topics.ts`, in a ronne-web
  branch.
  *Done when:* the docs tests pass in ronne-web, and the helper link test passes here.

## Notes

Slots for 125 and 126 are built here so those features only fill them. Build after 129.
