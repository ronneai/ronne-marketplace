# 191 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §14.3 and §15: a "Who may create accounts" row with option C, and 106's decisions it
    extends.
  - `docs/features/README.md` lists 191 in M32.
  - *Done when:* both say what this spec says, and `pnpm witness:check` and `pnpm docs:check` pass.

- [x] **2. Migration.** [risky]
  - `creates_accounts`, `any_domain` and `needs_approval` on `identity_providers`, set from each
    provider's `domains`.
  - The `blocked_domains` and `account_rules_version` settings.
  - `user.created_via`, backfilled (sign-up, SCIM, the earliest provider link, else `unknown`), and
    written by setup, Create user, sign-up, SCIM and provider sign-ins (`insertUser` takes it).
    Shown on the user page (123) and in your data (104).
  - The domain model: normalise, validate, match exactly.
  - *Done when:*
    - the migration's db test shows existing providers keep their behaviour;
    - it passes on SQLite, PostgreSQL, MySQL and MariaDB (`pnpm test:db:up`, then the files);
    - unit tests cover the domain model;
    - db tests show each creation path writes `created_via` and the backfill's four cases.

- [x] **3. The rule in SSO sign-in.** [risky]
  - `planSsoSignIn`: the block list, the throwaway list with *Any domain* (`domain_throwaway`),
    `creating_off`, *Any domain*, `create_pending`.
  - `signInWithProvider`: the waiting account, with no groups; the approval message; the root
    notification.
  - *Test sign-in*'s new results.
  - *Done when:*
    - `sso-sign-in.test.ts` and `sso.db.test.ts` cover the spec's cases 1, 3, 4, 8, 10, 12 and 13;
    - the existing tests pass unchanged;
    - the adversarial pass finds no way to link or create past the block list.

- [x] **4. The rule in email sign-up.** [risky]
  - 190's request checks the block list first, with the domain's refusal.
  - The account write checks it again.
  - *Done when:* db tests cover a blocked domain at request time and one blocked while a code is
    pending.

- [x] **5. The panel and the provider form.**
  - The Who may create accounts panel: the block list with the stale check, the throwaway setting
    (moved from 190's panel), and the overview with its warnings.
  - The provider form's step 3: the new fields, link by email disabled with *Any domain*, approval
    only while email is set up (Decision 8).
  - Create user's warning for a blocked domain.
  - Audit events.
  - *Done when:* component tests cover the overview, the warnings and the form's rules, and action
    db tests cover saving, the stale check and the audit rows.

- [x] **6. Languages.**
  - Every new message in the `admin` namespace, in all three languages.
  - *Done when:* the translation tests and the raw-text lint pass.

- [x] **7. Documentation.**
  - ronne-web: `authentication#account-rules`, `authentication#providers` and the provider guides,
    in three languages, in a branch that goes live with the release.
  - Here: the helpers and `topics.ts`.
  - *Done when:* the docs render tests, `pnpm docs:links` and the topics test pass, and each page
    says what the app does.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 3:** the rule governs creating only (Decision 3). Linking an existing account by email
  keeps 106's check (the provider's listed domains), so a domain blocked later doesn't stop it, as
  case 8 has it; `planSsoSignIn` also refuses linking by email for a provider with *Any domain*,
  whatever its stored `link_by_email` says, so no stored row can trust a provider for every account.
- **Task 3:** a provider's waiting account is told "We'll email you" (190's words), and the approval
  and decline emails name the provider instead of a password. Those emails only leave while email
  is set up (189): the owner chose (2026-11-22, SPEC Decision 8) that **task 5** allows *New
  accounts wait for root's approval* on a provider only while email is set up, as 190 does for
  sign-up.
- **Task 3:** a `creates_accounts` never written (null: a row the migration hasn't reached, or one
  written outside the app) reads as 106's rule, creating while the provider lists domains.
