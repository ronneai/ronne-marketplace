# 128 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The flag.** [risky] Migration `user.password_change_required_at` (nullable), the
  identity repository and model, `createUser` and `resetPassword` take `requireChange` (default
  true; false for one's own account and for SSO/SCIM paths), the audit metadata.
  *Done when:* `user-admin.db.test.ts` covers set on create and reset, unchecked, own reset, SSO
  and SCIM accounts never flagged; the migration guard test passes; run once on the other servers.

- [ ] **2. The hold.** [risky] A `passwordChangeHold` next to `twoFactorHold`, called by `holdPage`
  first (before two-factor), allowing only the change page, sign-out and the language switch; the
  redirect keeps `next` for `/device`; the guard test (`hold.test.ts`) covers every page.
  *Done when:* tests cover the redirect from several pages, the allowed pages, the order against
  two-factor, and the guard test fails on a page without the hold.

- [ ] **3. The API.** [risky] The bearer guard answers `403 password_change_required` for a flagged
  account's token, except `GET /api/v1/me`.
  *Done when:* API tests cover a flagged token on several endpoints and on `/me`.

- [ ] **4. Changing the password.** The explanation on the change page when held; refuses the
  temporary password; clears the flag; ends other sessions; returns to `next`; audits
  `user.password_changed` with `required: true`.
  *Done when:* action tests and a component test cover each; an end-to-end test signs in with a
  temporary password and changes it.

- [ ] **5. Root's controls.** The checkbox on Create user and Reset password; the user page's (123)
  "must change" row with set/clear.
  *Done when:* component tests cover the checkbox default, its absence on own account and the user
  page row.

- [ ] **6. Messages and phone.** Everything in messages (129) in three languages; scan; phone
  sweep.
  *Done when:* parity and scan pass; the sweep passes on every project.

- [ ] **7. End to end.** Root creates a user (checkbox on); the user signs in, is held, changes the
  password, lands on Home; the device flow after a change; with two-factor required the order is
  password then two-factor.
  *Done when:* the end-to-end tests pass on every project.

- [ ] **8. Decision log and index.** MVP §15 row "Password change at first sign-in".
  *Done when:* the row is in.

- [ ] **9. Documentation.** The sections and helpers in the spec, in a ronne-web branch.
  *Done when:* the docs tests pass in ronne-web, and the helper link test passes here.

## Notes

Independent of 124–127. It touches sign-in, so every task but the last two carries an adversarial
witness pass.
