# 163 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §15's "Approval" row and §2's matrix say an override needs a reason, and
    `docs/features/README.md` lists 163 in M28.
  - *Done when:* both say what this spec says, and `pnpm witness:check` passes.

- [x] **2. The rule.** [risky]
  - `DECISIONS.override.requires` in `submissions/services/reviews.ts`.
  - The bulk approve service requires the message when any row is an override.
  - The matrix's comment in `permissions.ts`.
  - *Done when:* db tests cover a single override without and with a reason, a bulk selection with
    and without overrides, and the scan override unchanged.

- [x] **3. Screens.**
  - The decision dialog's required field and wording on root's own submission.
  - Approve many's required message with the count of overrides.
  - "No reason given" for older overrides on the review page and the Overview.
  - *Done when:* component tests cover both dialogs and the old-override line; the review e2e test
    approves its own submission as root with a reason.

- [x] **4. Messages.**
  - Every new key in `en`, `pt` and `fr`.
  - *Done when:* the parity and raw-text tests pass; the phone sweep passes on both dialogs.

- [ ] **5. Documentation.**
  - `review#decisions`, `review#approve-many`, `roles#permissions`; MVP §2's matrix.
  - *Done when:* the docs render tests and `pnpm docs:links` pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **The words land with the screens.** The parity test fails when a key is in English only, so
  task 3 added its messages in all three languages at once, and task 4 became their check and the
  phone sweep of both dialogs (`e2e/override-reason.mobile.e2e.ts`, one root per device project).
- **Task 2 grew** after its witnesses: the audit metadata limit rose to 32 KB (owner), a message
  with nothing visible counts as empty, and NUL is removed (PostgreSQL refused it). Those rules are
  `messageFrom`'s, so they hold for every review message, not only the override's reason.
