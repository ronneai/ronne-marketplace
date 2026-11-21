# 197 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15 gains an "Email changes" row: a person changes their own email with their password,
    two-factor and a code to the new address; the old address is told; root's change takes a reason
    and notifies both; provider-owned emails are refused. `docs/features/README.md` lists 197 in M32.
  - *Done when:* both say what this spec says, and `pnpm witness:check` passes.

- [ ] **2. The table.** [risky]
  - Migration: `email_changes` (spec's Data), on all three dialects.
  - *Done when:* the migration's db test passes on SQLite, PostgreSQL and MySQL.

- [ ] **3. The person's change.** [risky]
  - The identity service `requestEmailChange`: the password and two-factor check (as
    `turnOffTwoFactor` checks them), 109's limits, the address checks (106's ASCII rules, 191's block
    list and allowed domains), one open change per account, the code (190), the "taken" path with its
    own email and no working code.
  - `confirmEmailChange`: the code, the checks again, the change in one transaction (unique address,
    the exact-match rule for MySQL and MariaDB, other sessions ended, 194's flows and open codes
    ended, audited), then the `email_changed` notice to the old address and the confirmation to the
    new one (189's `sendSecurityNotice`, a new kind).
  - The refusals for SCIM-managed and company-provider accounts.
  - *Done when:* db tests cover a full change, each wrong step, the taken path (same result, no
    working code, its email queued), a race on the address, each mid-change edge case in the spec,
    both refusals, and the notices queued after the commit.

- [ ] **4. Root's change.** [risky]
  - `changeUserEmail` in `services/user-admin.ts`: `users.manage`, a reason, the same checks with
    "taken" said plainly, the SCIM refusal, not root's own row, both notices (or the audit saying they
    couldn't be sent), audited.
  - *Done when:* db tests cover the change, the reason required, each refusal, and the notices with
    and without working email.

- [ ] **5. The pages.**
  - `/account/email` in Account's navigation: the address, the change form, the code step with
    `CodeInput`, the provider refusal, the no-email message. Works without JavaScript.
  - *Change email* on the user page (123), in a dialog, with the reason.
  - Messages in all three languages; the emails' texts in `mail.json` (189).
  - *Done when:* component tests cover each state; the translation tests pass; an end-to-end test
    changes an email with a code read from the test mail transport and checks the old address's
    notice and the other session ended.

- [ ] **6. Data protection.**
  - Retention (102), erasure (103) and Your data (104) cover `email_changes`.
  - *Done when:* their db tests cover the new table.

- [ ] **7. Erasure rewrites every earlier address.** [risky]
  - `erase-user.ts` and `kysely-audit-rewrite.ts`: the addresses the account has had, read from its
    `user.email_changed` events; each rewritten to the pseudonym, the current one everywhere (as
    today), an earlier one only in events up to the change that moved it off the account; 103's
    progress kept per address so a crash resumes.
  - *Done when:* db tests on SQLite, PostgreSQL and MySQL (`pnpm test:db:postgres -- <files>`,
    `:mysql`) erase an account that changed its email twice and find no earlier address left in its
    `user.created`, `user.email_changed` and `auth.sign_in_failed` events. An earlier address now
    owned by another account stays in that account's later events. A rewrite stopped halfway
    resumes.

- [ ] **8. Documentation.**
  - ronne-web: the new `account#email` (`topics.ts` here and there), `admin#users`,
    `privacy#your-data` and `privacy#erase` (earlier addresses erased too), in all three languages.
  - Helpers: the one on Account › Email.
  - *Done when:* the docs render tests and `pnpm docs:links` pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
