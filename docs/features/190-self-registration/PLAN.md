# 190 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md: §9.5 and §15's "Web sign-in" row say people can create their own account when root
    allows it. A new "Self-registration" row records the decisions in the spec.
  - CLAUDE.md's "Users are created only in the web app" stays true. Add "or by themselves, when root
    allows it".
  - `docs/features/README.md` lists 190 in M32.
  - *Done when:* the three say what this spec says, and `pnpm witness:check` and `pnpm docs:check`
    pass.

- [ ] **2. Migration and models.** [risky]
  - One migration: `pending_sign_ups`, `email_codes`, `challenges_used`, the four `user` columns,
    and the settings keys with their defaults (sign-up off, any domain, no approval, 15 minutes,
    challenge on).
  - The email-code model in the identity domain: generate, HMAC with the HKDF key, verify in
    constant time, the 5 tries, ending the previous code, the 60-second resend and the hourly cap.
  - *Done when:* the migration's db test passes on SQLite, PostgreSQL, MySQL and MariaDB
    (`pnpm test:db:up`, then the migration's file), and unit tests cover each code rule.

- [ ] **3. Bot protection.** [risky]
  - Pass the dependency policy's checklist for the `altcha` widget (licence of the whole tree, age,
    vulnerabilities, CSP). If it fails, write the Web Worker instead. Record the answer in Notes.
  - The server side with `node:crypto`: issue a challenge (signed salt, maximum, expiry), verify it,
    refuse a replay through `challenges_used`.
  - The honeypot and the signed fill-time stamp. The per-IP and per-address limits, through 109's
    database-backed limiter.
  - *Done when:* tests refuse a filled honeypot, a fast post, a wrong answer, an expired challenge,
    a replay and too many tries, and accept a real solve; the solve takes under 1.5 s on the e2e
    browser.

- [ ] **4. Settings panel.**
  - The Self-registration panel on the Authentication tab:
    - the switch, disabled with its reason without email (189) or with the policy *Root only*;
    - the domains and approval;
    - the code lifetime (5–60);
    - the challenge;
    - the terms link and version.
  - Audited with before and after.
  - *Done when:* component tests cover each field and the disabled reasons; an action db test
    covers saving, validating (a bad domain, a lifetime out of range, a non-HTTPS link) and the
    audit row.

- [ ] **5. Sign-up and code pages.** [risky]
  - `/sign-up` (404 while off), the link on the sign-in page, the form, the same answer for every
    address, the cookie-bound code page with CodeInput, resend and "Use another email".
  - The account write in one transaction, with the rules checked again.
  - The emails through 189's outbox.
  - Audit events.
  - *Done when:*
    - db tests cover: new address, existing address (same answer, different email, no working
      code), disallowed domain, closed while pending, two sign-ups racing, an account made
      meanwhile, a lookalike address;
    - a test measures the existing and new paths within the tolerance;
    - an e2e test signs up and signs in, reading the code from the test transport (189).

- [ ] **6. Approval.** [risky]
  - `approval_pending_at` refused by password sign-in, the token exchange and the device flow, and
    only after the password is right.
  - Notifications to roots (139).
  - The *Awaiting approval* filter, Approve and Decline on the user page and in the list's
    selection.
  - Emails. The 30-day decline in the retention job.
  - *Done when:* db tests cover each refusal (and that a wrong password says nothing of approval),
    approve, decline, a race between two roots, and the 30-day decline; component tests cover the
    filter and the buttons.

- [ ] **7. Data protection.** [risky]
  - The retention job purges pending sign-ups, codes and used challenges a day after they expire,
    and the sign-up audit emails with `ipDays`.
  - Erase (103) deletes pending rows and codes for the address and clears the terms columns.
  - Your data (104) lists `signed_up_at` and the terms acceptance.
  - *Done when:* `retention-purge.db.test.ts`, the erase and the user-data export db tests cover
    the new data.

- [ ] **8. Languages.**
  - Every new message in `auth`, `admin` and 189's `mail` namespaces, in all three languages.
  - The glossary in `docs/knowledge/i18n.md` if a new term appears ("sign up", "awaiting
    approval").
  - *Done when:* the translation tests and the raw-text lint pass.

- [ ] **9. Documentation.**
  - ronne-web: `account#signing-up`, `authentication#self-registration`, `privacy`, `security`,
    in three languages, in a branch that goes live with the release.
  - Here: the helpers and `topics.ts`.
  - *Done when:* the docs render tests, `pnpm docs:links` and the topics test pass, and each page
    says what the app does.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
