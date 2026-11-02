# 162 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §15's "Access tokens" row says root sets the longest lifetime and recovery revokes
    tokens, and `docs/features/README.md` lists 162 in M28.
  - *Done when:* both say what this spec says, and `pnpm witness:check` passes.

- [x] **2. The policy.** [risky]
  - `settings/models/token-policy.ts`: the two caps, validated (the reviewers' cap the same or
    shorter), read with defaults.
  - `setTokenPolicy` under `settings.manage`, audited `settings.token_policy`.
  - *Done when:* unit tests cover validation and defaults; db tests cover the setter, the audit row
    and a non-root refused.

- [x] **3. Enforcement.** [risky]
  - `createToken` reads the person's cap: the reviewers' one when `coveredBy("reviewers", …)`.
  - The exchange and the device flow (`createWithFreeName`) give 90 days or the cap.
  - `token_lifetime_too_long` in the API's errors.
  - *Done when:* db tests cover web, exchange and device flow for a plain user and a moderator under
    each cap, and the refusal.

- [x] **4. Shorten.** [risky]
  - Count the active tokens past each owner's cap; `shortenTokens` sets the earlier expiry in
    batches of 500, in a transaction; audited `access_token.shortened`.
  - *Done when:* db tests cover the count, a mix of owners and caps, already-shorter tokens left
    alone, revoked and expired ones ignored, and the audit row; run on PostgreSQL and MySQL too
    (`pnpm test:db:postgres -- <file>`, `:mysql`).

- [x] **5. Recovery revokes tokens.** [risky]
  - `changePassword` with `revokeTokens` (the default true) revokes in the same transaction and
    records `tokensRevoked`.
  - `resetTwoFactor` (service and `reset-two-factor`) revokes tokens.
  - *Done when:* db tests cover both boxes, the two-factor reset from the web and the terminal, and
    that a revoked token gets 401 at once (`require-token.db.test.ts`).

- [x] **6. Screens.**
  - The Access tokens panel on the Authentication tab.
  - The Create token dialog offering only allowed lifetimes.
  - The token list on `/admin/users/<id>` with Revoke (ask first).
  - The password form's box.
  - *Done when:* component tests cover each, including the dialog under a 30-day cap; an e2e test
    sets a cap, shortens, and sees a person's token list.

- [x] **7. Messages.**
  - Every new key in `en`, `pt` and `fr`.
  - *Done when:* the parity and raw-text tests pass; the phone sweep passes on the panel and the
    user page.

- [x] **8. Documentation and the threat model.**
  - `rmk#tokens`, `authentication#tokens` (new, `topics.ts` in both repositories),
    `account#signing-in`, `admin#users`, the incident runbook, the helper.
  - The threat model's §4.2 and §5.
  - *Done when:* the docs render tests and `pnpm docs:links` pass, and the helper lands on a real
    section.

- [x] **9. Access tokens in the Account tabs.**
  - Owner, 2026-11-01, while 162 was being built: the tokens page becomes a tab of Account
    (Password, Two-factor sign-in, Access tokens, Language), at the same address
    (`/account/tokens`), under the Account header; the sidebar's CLI & tokens still leads there.
  - *Done when:* the tabs test lists it, the page renders the Account header and tabs with its own
    Access tokens heading and Create token, its title reads "Access tokens · Account", the e2e
    tests that use the page pass, and the phone sweep passes on it.

- [x] **10. No CLI & tokens in the sidebar.**
  - Owner, 2026-11-01, after task 9: the sidebar's Tools group (and the Menu on a phone) no longer
    lists CLI & tokens; Account's Access tokens tab is the way there. Getting started's button that
    opened it is named for the tab.
  - *Done when:* the navigation tests and the phone navigation test no longer find it, the Getting
    started button reads "Open Access tokens" and still leads to `/account/tokens`, nothing in the
    app or its Documentation still names the CLI & tokens page, and the e2e tests that used it
    pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Only `none` means no limit** (task 2). `tokenCapFrom` refuses `""` and null: a form field
  left out (`FormData.get` gives null) must never become the loosest policy, so the panel (task 6)
  sends `none` explicitly. The same reader takes stored values, so an empty or hand-edited one
  reads as the default.
- **Two saves at the same moment can record a stale `from`** on PostgreSQL and MySQL (the
  adversarial pass of task 2 saw it with three concurrent `setTokenPolicy` calls): the setter reads
  the old values in its transaction without a lock. The final setting is one of the saves; only the
  audit row's `from` can be wrong. Every settings setter (`setUsageMinimum`, `setRetention`,
  `setTwoFactorPolicy`, …) reads the same way, so it is a follow-up for all of them, not this
  feature.
- **Root's Reset two-factor dialog** (task 6): its body (`admin.json` `twoFactorBody`) says it
  signs the person out everywhere; since task 5 it revokes their access tokens too, so the words
  should say so.
