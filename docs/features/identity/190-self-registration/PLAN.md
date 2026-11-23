# 190 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md: §9.5 and §15's "Web sign-in" row say people can create their own account when root
    allows it. A new "Self-registration" row records the decisions in the spec.
  - CLAUDE.md's "Users are created only in the web app" stays true. Add "or by themselves, when root
    allows it".
  - `docs/features/README.md` lists 190 in M32.
  - *Done when:* the three say what this spec says, and `pnpm witness:check` and `pnpm docs:check`
    pass.

- [x] **2. Migration and models.** [risky]
  - One migration: `pending_sign_ups`, `email_codes`, `challenges_used`, `terms_acceptances` and the
    two `user` columns. The settings keys with their defaults (sign-up off, any domain, no
    approval, throwaway domains blocked, 15 minutes, challenge on) in a settings model that reads
    an absent key as its default (see Notes).
  - The email-code model in the identity domain: generate, HMAC with the HKDF key, verify in
    constant time, the 5 tries, ending the previous code, the 60-second resend and the hourly cap.
  - *Done when:* the migration's db test passes on SQLite, PostgreSQL, MySQL and MariaDB
    (`pnpm test:db:up`, then the migration's file), and unit tests cover each code rule.

- [x] **3. Bot protection.** [risky]
  - Pass the dependency policy's checklist for the `altcha` widget (licence of the whole tree, age,
    vulnerabilities, CSP). If it fails, write the Web Worker instead. Record the answer in Notes.
  - The server side with `node:crypto`: issue a challenge (signed salt, maximum, expiry), verify it,
    refuse a replay through `challenges_used`.
  - The throwaway list: confirm the `disposable-email-domains` list's licence against the
    dependency policy (CC0 or CC-BY-4.0 for data), add it as a data file with its notice, and a
    release step that refreshes it. If the licence fails, stop and ask the owner.
  - The honeypot and the signed fill-time stamp. The per-IP and per-address limits, through 109's
    database-backed limiter.
  - *Done when:* `pnpm licenses:check` and the notices test pass with the list; tests refuse a
    throwaway address with *Any domain* (and ignore the list with an allow list), a filled honeypot, a fast post, a wrong answer, an expired challenge,
    a replay and too many tries, and accept a real solve; the solve takes under 1.5 s on the e2e
    browser.

- [x] **4. Settings panel.**
  - The Self-registration panel on the Authentication tab:
    - the switch, disabled with its reason without email (189), without the instance contact (189)
      or with the policy *Root only*;
    - the throwaway setting;
    - the domains and approval;
    - the code lifetime (5–60);
    - the challenge;
    - the terms link and version, with **Ask everyone to accept again** when the version changes.
  - Audited with before and after.
  - *Done when:* component tests cover each field and the disabled reasons; an action db test
    covers saving, validating (a bad domain, a lifetime out of range, a non-HTTPS link) and the
    audit row.

- [x] **5. Sign-up and code pages.** [risky]
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

- [x] **6. Accepting new terms.** [risky]
  - A row in `terms_acceptances` at sign-up and at each acceptance.
  - The hold after a web sign-in when `terms_required_version` isn't accepted, built like the
    password-change hold. Continue and Sign out.
  - Tokens, the API and the device flow untouched.
  - *Done when:* db tests cover ticked and unticked version changes, a password and a provider
    sign-in held, a token still working, and an acceptance row per acceptance; an e2e test accepts
    the new terms.

- [x] **7. Approval.** [risky]
  - `approval_pending_at` refused by password sign-in, the token exchange and the device flow, and
    only after the password is right.
  - Notifications to roots (139).
  - The *Awaiting approval* filter, Approve and Decline on the user page and in the list's
    selection.
  - Emails. The 30-day decline in the retention job.
  - *Done when:* db tests cover each refusal (and that a wrong password says nothing of approval),
    approve, decline, a race between two roots, and the 30-day decline; component tests cover the
    filter and the buttons.

- [x] **8. Data protection.** [risky]
  - The retention job purges pending sign-ups, codes and used challenges a day after they expire,
    and the sign-up audit emails with `ipDays`.
  - Erase (103) deletes pending rows, codes and terms acceptances.
  - Your data (104) lists `signed_up_at` and every terms acceptance.
  - *Done when:* `retention-purge.db.test.ts`, the erase and the user-data export db tests cover
    the new data.

- [x] **9. Languages.**
  - Every new message in `auth`, `admin` and 189's `mail` namespaces, in all three languages.
  - The glossary in `docs/knowledge/i18n.md` if a new term appears ("sign up", "awaiting
    approval").
  - *Done when:* the translation tests and the raw-text lint pass.

- [x] **10. Documentation.**
  - ronne-web: `account#signing-up`, `authentication#self-registration`, `privacy`, `security`,
    in three languages, in a branch that goes live with the release.
  - Here: the helpers and `topics.ts`.
  - *Done when:* the docs render tests, `pnpm docs:links` and the topics test pass, and each page
    says what the app does.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 2: the settings' defaults live in code, not in the migration.** `settings/models/sign-up-policy.ts` reads an absent key as its default (sign-up off, any domain, no approval, throwaway domains blocked, 15 minutes, challenge on), as 141's language policy does, so migration 0046 writes no `instance_settings` rows and a restore or an upgrade can't leave a stale default behind.
- **Task 2: email codes are bound to their purpose and subject.** The HMAC covers `code:<purpose>:<subject>:<code>`, so a code for one sign-up never works for another; a new code ends the subject's earlier ones (`consumed_at`); a right answer and a wrong try each change the row only by a conditional update, so racing requests get one success and no more than five tries.
- **For task 5: a listed domain is compared exactly, never as a pattern.** `sign_up_domains` reads `["any"]` as the domain `any` and `["*"]` as the domain `*` (only the JSON string `"any"` means every domain). The domain check must compare the address's domain to each listed one exactly, so neither ever works as a wildcard.
- **Task 3: no `altcha` package; our own solver.** The dependency policy's checklist on `altcha` 3.7.0 (2026-11-21): MIT, one dependency (`hash-wasm` 4.13.0, MIT, two maintainers), about 344,000 downloads a week, 30 releases in a year, no install script on registry installs. It fails the health question: its npm package has one maintainer. And the first question says no: the browser's own `crypto.subtle` does SHA-256, so the solver is `features/sign-up/solve-challenge.ts`, about 20 lines, run in a Web Worker by task 5's page; the server side is `identity/models/sign-up-guard.ts` on `node:crypto`. The app sets no content security policy, so a worker needs nothing more.
- **Task 3: the throwaway list is CC0-1.0, from a fixed commit.** `disposable-email-domains`' `LICENSE.txt` is CC0 1.0 Universal (GitHub's API says `NOASSERTION`, so the file itself was read). It's a module, `identity/lists/disposable-domains.ts` (one domain a line, in a string), because the server's bundles carry modules, not loose files; `disposable-domains.source.json` records the commit, the licence and the count. `pnpm data:disposable-domains` refreshes both, refusing a line that isn't a domain, a real mail provider on the list (`NEVER_THROWAWAY`), a shared suffix such as `co.uk` or `github.io` (`SHARED_SUFFIXES`: with subdomains matched, one would block every address under it), a list under 1,000 domains or a licence that's no longer CC0; the release checklist runs it. Not in a `data/` folder: `.gitignore` ignores every one (the dev database's).
- **Task 3: the worst-case solve takes 0.18 s** in the end-to-end Chromium at the 50,000 maximum (`e2e/sign-up-challenge.e2e.ts`, which fails past 1.5 s).
- **For task 5: refuse an address that isn't one before the guard.** `deliveryDomain` reads a host the way URLs do, so `example.com/x`, `example.com#y` or `%2E` map to a bare domain. The sign-up action checks the address with 106's rules (`normalizeEmail`, ASCII only, one `@`, at most 254 characters) before `signUpDomainAllowed`.
- **Task 3: the refresh's last check is a person's.** Real suffixes and providers are more than any hand list holds (the Public Suffix List is MPL-2.0, which needs an exception the owner hasn't made). The script refuses the lists it has and any two-label line shaped like a country's second-level suffix (`gouv.fr`, `qc.ca`, `com.br`) except the five the upstream list carries on purpose (`KNOWN_LISTED`: `biz.st`, `co.cc`, `gob.re`, `pe.hu`, `qc.to`, free-subdomain hosts it blocks whole; a new one stops the refresh for a person); and it prints every line it adds and removes, for the refresh's own pull request.
- **Task 3: what the hand-built check misses, for the owner.** It lets through suffixes under a three-letter TLD (`us.com`, `uk.com`), hosting suffixes it doesn't name (`myshopify.com`, `wixsite.com`), regional ones (`nhs.uk`, `art.br`, `k12.ca.us`) and providers off its grid (`yahoo.co.jp`, `libero.it`); none is on the bundled list today, and a refresh's printed `+` lines are where a person catches one. The bundled list does carry shared hosts upstream blocks whole on purpose, such as `mooo.com` (FreeDNS) besides the five in `KNOWN_LISTED`, so every address under them is refused too. The Public Suffix List (MPL-2.0) would close the suffix gap; using it needs the owner's exception.
- **Task 5: an existing address gets a real code too, never sent.** The same hash, the same code row, the same pending row and one email, so the two paths take the same time (`sign-up.db.test.ts` measures them) and a fifth wrong try ends both alike. Its pending row has no password hash, so even a right guess is only "wrong". An address MySQL only calls equal to an account's gets no email at all.
- **Task 5: the address is checked as typed, before `trim()`.** JavaScript's `trim()` drops a no-break space the ASCII rule must see; only ASCII spaces are trimmed (106's rule). The domain part must also be a plain host name: `normalizeEmail` lets `acme.com/x` through, and the domain check would read it as `acme.com`.
- **Task 5: a bot takes the existing address's path, silently.** A form with the honeypot filled or posted in under 3 seconds goes through every check and limit a person's does, gets a real pending row (no hash) and a real cookie, and no email. A decoy cookie was tried first and dropped: its shape, its order, its codes that never ran out and its resend timing each told a scripted bot apart (190's task 5 witnesses). The cost is a pending row per bot, bounded by the limits and purged by the retention job (task 8). A person whose password manager fills the form and who sends it in under 3 seconds gets the same; the form's minimum stays at 3 seconds (SPEC).
- **Task 5: the e2e test sends real email to 189's fake SMTP server.** The main instance gets `RONNE_MAIL_HOSTS=127.0.0.1` and a port of its own (`RONNE_E2E_SMTP_PORT`, `e2e/harness.ts`); `e2e/sign-up.e2e.ts` starts the fake there, writes the mail and sign-up settings into the instance's database, and deletes them afterwards, so the files after it see an instance with neither. Delivery needs a reply-to address as well as a sender.
- **Task 6: who is held is decided by time, not by version label.** Labels have no order, so any acceptance at or after the moment root last asked everyone counts, whatever its version: changes root makes after without asking everyone again ask no one again, and a new sign-up isn't held. That moment is the `terms_required_version` setting's `updated_at`, so `setSignUpPolicy` writes only the settings that changed. One check (`acceptedSinceAsked`) decides both the hold and whether Continue writes a row, and a row's time is never before that moment (a server whose clock is behind root's). The hold reads the required version alone first: with none, that's the only query on a page.
- **Follow-up, from task 6's witnesses: sign-up records the version at the request, not the one the form showed.** If root asks everyone to accept a new version while someone has the sign-up form open, their acceptance is recorded for the new version, whose link they didn't see. Built: the form posts the version it showed, and sign-up refuses a different one, or terms a form drawn before them didn't show, with `terms_changed` and the new link and version, which the form keeps showing ("the terms changed, read them again").
- **Task 7: a waiting account may get a session from Better Auth, never a signed-in person.** Better Auth's session hook (`mayHaveSession`) refuses only disabled and erased accounts, so password sign-in can open one for a waiting account and then end it at once, saying "waiting for approval" only after the right password. `findActiveUser` refuses a waiting account, so no session of one is a signed-in person (pages, actions, the device flow's approval), and a company sign-in refuses one as disabled. Decline deletes the rows a new account has (credential, terms, memberships, personal workspace); a foreign key that still points at it rolls the decline back. The 30-day decline runs in the retention job (`signUpsDeclined` in its counts); the Privacy tab's sentence and the `purge` command's lines don't name it yet (task 8).
- **For task 8, from task 7's witnesses: a declined person's email outlives the decline.** It stays in the audit log (`user.signed_up` and `user.declined` metadata, kept like any audit row) and, for 90 days, in the roots' `user.awaiting_approval` notifications (`params.email`). Decision 11 wants nothing kept for ever: task 8 should clear or shorten them, as 102 clears failed sign-ins' emails after `ipDays`.
- **For task 10, from task 8: the purge's lines changed.** `rmk-server purge` now prints "Emails typed at failed sign-ins and sign-ups cleared", "Ended sign-ups, codes and challenges deleted" and, when there were some, "Sign-ups declined after 30 days waiting". The website quotes the old line in `www/src/content/screenshots.ts`, and the Privacy tab's last-run sentence changed too.
