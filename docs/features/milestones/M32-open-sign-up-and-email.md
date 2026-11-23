# M32 — Open sign-up and email

> [All milestones](README.md) · [Features index](../README.md)

People can create their own accounts on an instance that root opens to the public, and Ronne can
send email (owner, 2026-11-20). Root decides who may sign up, by email domain and by the way they
come in (a password, Google, LinkedIn, Apple or a company provider), and whether new accounts wait
for approval. Forgotten passwords are reset by an emailed code. The user's safety comes first,
following OWASP's cheat sheets and NIST SP 800-63B-4: nothing tells whether an account exists, codes
are short-lived and limited, an email alone never signs anyone in, and every change to how someone
signs in is told to them by email. Personal data is kept only as long as it's needed. Built in this
order: 109 (M17's shared rate limits, so every limit holds across replicas and restarts) first, then
189 → 190 → 191 → 194 → 196 → 197 → 192 → 193.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [189](../operations/189-outgoing-email/SPEC.md) | Outgoing email: SMTP, or the web APIs of Amazon SES, Mailgun, Postmark and Resend, set by root on an Email tab of Admin › Settings with the credentials sealed and a test email; an outbox sent by a job with retries, its messages sealed and deleted once sent; emails in three languages; security notices for password and two-factor changes | 122, 136, 102, 105, 106, 103, 104, 129 | done (the Documentation in ronne-web `docs/marketplace-189-outgoing-email`) |
| [190](../identity/190-self-registration/SPEC.md) | Self-registration: root turns on sign-up with a password, for any domain or listed ones; a 6-digit code by email (its lifetime set by root, 15 minutes by default), typed in six boxes; the account exists only once the code is checked, and waits for root's approval when root asks; the same answer whether or not the address has an account; rate limits, a honeypot and an invisible proof-of-work challenge; an optional terms and privacy link, its acceptance recorded | 109, 189, 106, 105, 102, 103, 104, 122, 129, 139, 157 | done |
| [191](../identity/191-account-creation-rules/SPEC.md) | Who may create accounts: an instance-wide block list of email domains that every way in obeys, and for each way in (password sign-up, Google, LinkedIn, Apple, each company provider) whether it may create accounts, for which domains, and whether they wait for approval; 106's domain lists migrated as they are | 109, 190, 106, 108, 139 | done (the Documentation in ronne-web `feat/191-account-creation-rules`) |
| [192](../identity/192-google-linkedin-sign-in/SPEC.md) | Google and LinkedIn sign-in: presets for personal Google accounts and for LinkedIn on 106's providers, shown as each brand's standard button; linked to an existing account by email only where the provider is the address's authority, otherwise from Account › Sign-in methods; a notice on every link and unlink | 191, 106, 157, 189, 105 | specified |
| [193](../identity/193-sign-in-with-apple/SPEC.md) | Sign in with Apple: its own provider type (a client secret signed from root's `.p8` key and renewed by Ronne, the form post callback, the name kept from the first sign-in, private relay addresses and sending to them through Apple's relay) and Apple's standard button | 192, 191, 189, 106 | specified |
| [194](../identity/194-forgot-password-email/SPEC.md) | Forgot password by email: the same answer for every address, a code, the account's two-factor, then a new password on a page that works once for 10 minutes; every session ended, access tokens revoked unless unticked, a notice email, and no automatic sign-in; roots still reset on the server | 109, 189, 190, 162, 105, 128 | in progress |
| [196](../identity/196-breached-passwords/SPEC.md) | Breached passwords refused: a bundled list of known breached and common passwords, and words from the instance and the address, checked wherever a password is set; optionally Have I Been Pwned's anonymous range check, off by default | 194, 128, 189, 122 | specified |
| [197](../identity/197-verified-email-change/SPEC.md) | Verified email changes: a person changes their email with their password and two-factor, a code to the new address and a notice to the old one; addresses a company provider or SCIM manages stay theirs; root's changes notify both addresses | 109, 189, 190, 191, 105, 106, 108, 123 | specified |
