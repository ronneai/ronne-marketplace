# 190 — Self-registration

> Milestone: M32 · Depends on: 109, 189, 106, 105, 102, 103, 104, 122, 129, 139, 157 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Web sign-in", a new "Self-registration" row) · Standards: OWASP Authentication and Forgot Password cheat sheets, NIST SP 800-63B-4 (Sec. 3.2.2, rate limiting)

## Goal

Today only root creates accounts (Users › Create user, SCIM, or an identity provider's first
sign-in for its listed domains; `better-auth.ts` sets `disableSignUp: true`). Root may want a
public instance where people create their own account. This feature lets them, safely: off by
default, limited to the email domains root chooses, with the address proven by a 6-digit code sent
to it, optionally held until a root approves, and never telling a stranger which addresses already
have an account (owner, 2026-11-20).

The owner's goal for the whole milestone: "keep the safety for the user, follow any data protections
and standards".

## Scope

**In:**
- **A Self-registration panel** on Admin › Settings › Authentication
  (`features/admin-settings/authentication/`), root only (`settings.manage`):
  - **People can create their own account** (off on every instance, new or upgraded).
  - **Which email domains:** *Any domain* or *Only these domains* (a list). A domain matches
    exactly: `example.com` doesn't cover `eu.example.com` (owner, 2026-11-20). The instance-wide
    block list is 191's and applies on top.
  - **New accounts wait for root's approval** (off by default).
  - **Code lifetime:** 5 to 60 minutes, 15 by default. One setting for every one-time email code
    (sign-up here; forgot password, 194; email change, 197).
  - **Ask browsers to solve a challenge** (an invisible proof of work; on by default).
  - **Terms and privacy link** (optional): a URL and a version label root types (such as
    `2026-11`). When set, the sign-up form shows it with a required checkbox.
  - The switch can be turned on only while email is set up (189) and the password policy is
    *Everyone* (106's *Who may sign in with a password*): with *Root only*, a new account couldn't
    sign in. Otherwise it's disabled with the reason and a link to the place that fixes it.
  - Every change audited (`settings.sign_up_changed`, before and after).
- **One-time email codes**, a model shared with 194 and 197, in the identity domain:
  - 6 digits from `crypto.randomInt`; stored only as `code_hmac`, HMAC-SHA256 under a key HKDF
    derives from `AUTH_SECRET` with the purpose `email-code` (as `crypto/sealed.ts` derives its
    keys), so a copy of the database can't be searched offline for the code.
  - Compared in constant time (`timingSafeEqual`). Single use. Ends at the code lifetime.
  - 5 wrong tries end the code. Asking for a new one ends the previous one for the same purpose and
    subject. A new code can be asked for after 60 seconds, and at most 3 emails go to one address
    for one purpose in an hour (counted from `email_codes` rows), under 189's outbox cap of 10
    messages an hour to any one address.
- **The sign-up page**, `/sign-up`, in the auth shell (`components/auth-shell/AuthShell.tsx`):
  - Name, email, password (the password rule in `identity/models/password.ts`, with a show button
    and no second password field), the terms checkbox when root set a link.
  - A **Create an account** link on the sign-in page (`features/sign-in/SignInPage.tsx`) only while
    sign-up is on. While it's off, `/sign-up` answers 404.
  - Bot protection (below) and a language menu, as on sign-in.
- **The code page**, `/sign-up/code`: the six boxes of `components/ui/CodeInput.tsx` (the same as
  `app/sign-in/two-factor/page.tsx`), **Send a new code** (shown with its countdown) and **Use
  another email**. The pending sign-up is found through an HttpOnly, `SameSite=Lax` cookie, never
  through the URL. The email says to type the code in the window where the person signed up.
- **Pending sign-ups**: nothing is written to `user` until the code is right. Until then a
  `pending_sign_ups` row holds the email, name, password hash, the page's locale and the terms
  version accepted.
- **Account creation**, once the code is right, in one transaction:
  - The same write as Create user (`kysely-identity-repository.ts`, `insertUser`): a `user` in
    `global`, a personal workspace, a credential account with the hash, never root.
  - `email_verified` set to true. `user.locale` set from the sign-up.
  - `signed_up_at` and the terms version and time recorded. The pending row is deleted.
- **No automatic sign-in.** The person goes to `/sign-in` with the email filled in and "Your account
  is ready. Sign in." The one sign-in path keeps its rate limit, the two-factor requirement (105)
  and its audit.
- **Approval**, when it's on:
  - The account exists but `approval_pending_at` is set. Password sign-in, the token exchange
    (`POST /api/v1/auth/token`) and the device flow (107) refuse it with "Your account is waiting
    for a root's approval", and only once the password is right, so the message reveals nothing to
    someone guessing.
  - Every root gets an in-app notification (139).
  - Users gains the status filter *Awaiting approval* (`features/admin-users/list.ts`). The user
    page (123) gains **Approve** and **Decline**, and the list's selection gains Approve many.
  - Approve clears the mark and emails the person.
  - Decline deletes the account (it holds nothing yet) and emails the person.
  - An account left waiting for 30 days is declined by the retention job, with the same email.
- **Bot protection**, always on:
  - A hidden honeypot field. When it's filled, the answer looks like success and nothing is sent.
  - A minimum fill time of 3 seconds, from a timestamp the form carries signed with an HMAC.
  - The limits above, plus per client IP: 10 sign-ups and 20 code tries an hour, and per address:
    10 sign-up requests an hour. Counted by 109's database-backed limiter, so every replica shares
    the counts. The client IP is used only with `TRUST_PROXY=true`, as for sign-in.
  - Optionally, an invisible proof of work (see Decisions):
    - the server issues an HMAC-signed challenge (a salt and a hidden number up to a maximum);
    - the browser finds the number with SHA-256 in a Web Worker, within about a second on a phone;
    - the server checks the signature, the answer, the expiry (10 minutes) and that it wasn't used
      before.
    - It needs JavaScript. Without it, the page says so (sign-in still works without it).
  - No third-party CAPTCHA (owner, 2026-11-20).
- **Enumeration safety**:
  - `/sign-up` gives the same answer and the same code page for a new address and for one that
    already has an account. For the latter, the person who owns the inbox gets "You already have an
    account" instead of a code.
  - The password is hashed in both cases, and the email goes through 189's outbox, so the time
    taken is the same.
  - A domain that isn't allowed is said at once ("Sign-up isn't open to this email domain"): a
    rule about domains, not about accounts.
- **Emails** (through 189, in the sign-up's language): the code; "you already have an account";
  approved; declined. Never a link that signs anyone in, always "If this wasn't you, ignore this
  email".
- **Audit:**
  - `auth.sign_up_requested`, with its outcome: `sent`, `existing`, `domain_not_allowed`,
    `limited` or `bot`;
  - `auth.sign_up_code_failed`;
  - `user.signed_up`, with how: `password`;
  - `user.approved`, `user.declined` (with who, or `retention` when it ran out).
- **Data protection**:
  - pending sign-ups and email codes are purged a day after they expire, by the retention job (102);
  - the email typed in a sign-up attempt is kept in the audit log only as long as IP addresses
    (`ipDays`), as 102 already does for failed sign-ins;
  - erase (103) and your data (104) cover the new columns and tables.

**Out** (and where it goes instead):
- **Sign-up with Google, LinkedIn or Apple:** 191 decides who they may create, and 192 and 193 add
  them.
- **The instance-wide block list, and approval for identity providers:** 191. The two features
  ship in the same release.
- **Forgot password by email:** 194, which reuses the codes, the challenge and the limits.
- **Checking new passwords against breached ones:** 196.
- **Inviting people by email:** still not planned (owner, 2026-10-09).
- **Asking existing accounts to accept new terms:** an open question.
- **Third-party CAPTCHAs** (Turnstile, hCaptcha): left out. They send visitors' data elsewhere.

## Behaviour

**Root opens sign-up.** Email is set up. Root turns on *People can create their own account*,
picks *Only these domains* with `acme.com, acme.co.uk`, and leaves approval off. The sign-in page
now shows **Create an account**.

**Ana signs up.** She types her name, `ana@acme.com` and a password, and submits. She sees "Check
your email. If ana@acme.com can be used here, we've sent it a 6-digit code." The code page opens.
The email arrives: "Your code for Acme Marketplace is 482913. It works for 15 minutes. If this
wasn't you, ignore this email." She types it; the boxes submit by themselves. The account is
created, and the sign-in page opens with her email filled in and "Your account is ready. Sign in."

**Someone tries an address that has an account.** They see exactly what Ana saw, and the code page.
No code exists, so any code they type is wrong. The owner of the address gets "Someone tried to
create an account at Acme Marketplace with this address, but you already have one. Sign in, or
reset your password. If this wasn't you, ignore this email."

**Approval is on.** After the code, Ana sees "Your account was created and waits for a root's
approval. We'll email you." Each root sees a notification. One opens Users › *Awaiting approval*
and approves her. Ana gets "Your account at Acme Marketplace is approved" and signs in.

**A bot.** It fills the honeypot or posts in under 3 seconds: it sees the success page and nothing
is sent. Without a valid challenge answer, the form is refused with "Your browser couldn't finish
the check. Try again." Past the limits: "Too many tries. Wait a few minutes and try again."

## Edge cases

- **Two sign-ups for one address at once:** each makes its own pending row. Only the first code
  that's right creates the account (the email is unique). The second gets "An account with this
  address exists. Sign in, or reset your password." That's safe to say now, since they proved the
  inbox.
- **An account is created for the address meanwhile** (root, SCIM, a provider): the same as above.
- **Root turns sign-up off, or removes the domain, while a code is pending:** the code page refuses
  ("Sign-up has been closed") and the pending row is deleted. The rules are checked again when the
  account is created.
- **Approval turned on or off while a code is pending:** the setting at creation time decides.
  Accounts already waiting stay waiting when it's turned off: a root approves them.
- **Root changes the code lifetime:** new codes only.
- **An address that isn't plain ASCII,** or one the database only calls equal (MySQL's accent-blind
  comparison): refused, with 106's rules (`sso-sign-in.ts`), so `kåte@` never stands beside `kate@`.
- **Email transport fails** (189 retries, then gives up): the person sees nothing different. After
  60 seconds they can ask for a new code. Root sees the failure on the Email tab.
- **The person closes the tab:** the cookie keeps the code page for the code's lifetime. Signing up
  again starts over and ends the old code.
- **A different browser:** the code page doesn't know the sign-up, so the code can't be used there
  (see Decisions).
- **A disabled or erased account's address:**
  - Disabled: treated as existing. Its owner gets the "already have an account" email.
  - Erased (103): the address is free and can sign up again. 191's block list or root stops it if
    needed.
- **A waiting account signs in with a wrong password:** the usual "Wrong email or password". Only
  the right one says it's waiting.
- **Two roots approve and decline at once:** the first wins under a row lock; the other gets "This
  account was already approved" (or declined).
- **Without JavaScript:** CodeInput falls back to one field (157). The challenge needs JavaScript,
  so with the challenge on the form says "Turn on JavaScript to create an account". With it off,
  the form works without.
- **Replicas (M17):** the codes, pending rows, used challenges and the limits (109) are all in the
  database, so any replica can serve any step.
- **Root rotates `AUTH_SECRET`** (`rotate-secret`): codes and challenges made before it no longer
  verify. They live minutes, so the person asks for a new code.

## Data

- **`pending_sign_ups`:** id, email (exact string), name, password_hash (null for an address that
  already has an account), locale, terms_version, terms_accepted_at, created_at, expires_at.
- **`email_codes`:**
  - id; purpose (`sign_up`, `password_reset`, `email_change`); subject_id (a pending sign-up or a
    user);
  - email_hmac (HMAC of the address, for the hourly cap without keeping the address); code_hmac;
  - attempts; created_at; expires_at; consumed_at.
- **`challenges_used`:** challenge_hmac, expires_at. It refuses a replayed answer, and is purged on
  expiry.
- **`user`:** `approval_pending_at`, `signed_up_at`, `terms_version`, `terms_accepted_at`, all
  nullable.
- **Settings keys:** `sign_up_enabled`, `sign_up_domains` (JSON: `"any"` or a list),
  `sign_up_approval`, `email_code_minutes`, `sign_up_challenge`, `terms_url`, `terms_version`.
- One migration for all three databases. Every new table is purged by the retention job and covered
  by erase and your data.

## Documentation

- **Your account** (`account#signing-up`, new section): creating an account, the code, waiting for
  approval.
- **Identity providers** (`authentication#self-registration`, new section): the panel, domains,
  approval, the challenge, the terms link, and what has to be set up first.
- **Privacy** (`privacy#retention`, `privacy#your-data`): pending sign-ups, codes and the terms
  acceptance.
- **Security** (`security`): enumeration safety, codes and limits.
- **Helpers:** a help link on the Self-registration panel (`authentication#self-registration`) and
  on the sign-up page (`account#signing-up`); `topics.ts` here and in ronne-web change together.

## Acceptance criteria

- [ ] Sign-up is off on a new and an upgraded instance; `/sign-up` is 404 and the sign-in page has
  no link until root turns it on, which requires email set up and the password policy *Everyone*.
- [ ] A new address in an allowed domain gets a code; the right code creates a `user` in `global`
  with a personal workspace, `email_verified` true and no root role, and nothing is in `user`
  before that; the person isn't signed in.
- [ ] An existing address gets the same answer and code page, its owner gets the "already have an
  account" email, and no code works; the response time is the same within the test's tolerance.
- [ ] A disallowed domain is refused at once; `eu.example.com` isn't covered by `example.com`.
- [ ] Codes: 6 digits, stored only as an HMAC, single use, end after the lifetime, after 5 wrong
  tries and when a new one is sent; 60 seconds between sends; 3 emails an hour per address.
- [ ] The honeypot, the 3-second minimum, the per-IP limits and the challenge (when on) each refuse
  a bot's request; a replayed challenge answer is refused.
- [ ] With approval on, the account can't sign in, get a token or use the device flow; roots are
  notified; Approve and Decline work and email the person; 30 days unapproved declines it.
- [ ] The terms checkbox is required when root sets a link, and its version and time are stored.
- [ ] Retention purges pending sign-ups, codes and used challenges; erase and your data cover the
  new data; every step is audited.
- [ ] Every screen and email exists in English, Brazilian Portuguese and Canadian French.
- [ ] The Documentation and helpers listed above say what the feature does.

## Decisions

1. **Off by default, root opens it** (owner, 2026-11-20).
2. **Domains match exactly** (owner, 2026-11-20).
3. **Root approval is a setting** (owner, 2026-11-20).
4. **The account exists only after the code** (owner approved the recommendation, 2026-11-20).
   Nobody can take an address they don't read, and abandoned sign-ups leave no accounts.
5. **The same answer whether or not the account exists** (OWASP: "Return a consistent message for
   both existent and non-existent accounts", in a consistent time). The inbox's owner gets the
   explanation.
6. **No automatic sign-in after the code** (Claude, to confirm). One sign-in path keeps the rate
   limit, required two-factor and the audit. It costs one more step, once.
7. **Bot protection without third parties** (owner, 2026-11-20): limits, a honeypot, a minimum time
   and an optional proof of work. NIST SP 800-63B-4 lists bot challenges as optional; OWASP calls
   CAPTCHAs defence in depth. A proof of work asks nothing of the person and sends nothing
   elsewhere.
8. **The proof of work follows Altcha's design** (Claude, to confirm in plan task 3).
   - The server side is written with `node:crypto`: an HMAC-signed salt and SHA-256, about 60 lines,
     so the dependency policy's first question ("can Node.js do this?") says yes.
   - The browser side uses the `altcha` widget (MIT) if it and its tree pass the dependency policy
     and the content security policy. Otherwise we write a small Web Worker and a status line.
9. **Codes stored as an HMAC under a key from `AUTH_SECRET`** (Claude). With only a million possible
   codes, a plain hash would fall to an offline search of a leaked database.
10. **The code page is bound to the browser that signed up** (Claude). Someone who sees the code
    over a shoulder can't finish the sign-up elsewhere. Someone who switches browsers signs up
    again.
11. **Approval waits at most 30 days** (Claude, to confirm), so the waiting list doesn't keep
    personal data forever.
12. **190 and 191 ship in the same release** (Claude). With *Any domain*, root needs 191's block
    list from the first day.

## Open questions

- When root changes the terms version, should existing accounts be asked to accept the new terms
  at their next sign-in? Not in this feature.
- Should a root be able to create an account that skips approval through sign-up's flow? Create user
  already does that.
