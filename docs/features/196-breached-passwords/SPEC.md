# 196 — Breached-password check

> Milestone: M32 · Depends on: 194, 128, 189, 122 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Web sign-in"), [the dependency policy](../../policies/dependencies.md) · Standards: [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/) §3.1.1.2, [HIBP Pwned Passwords API](https://haveibeenpwned.com/API/v3#PwnedPasswords)

## Goal

Ronne's password rule follows NIST on length: 12 to 128 characters, no composition rules
(`identity/models/password.ts`). NIST SP 800-63B-4 §3.1.1.2 also says a new password must be
compared against "a blocklist that contains known commonly used, expected, or compromised
passwords", and that a password must be changed when there is evidence it was compromised. Ronne
does neither today. Now that anyone may sign up (190), common passwords matter more.

This feature adds an offline blocklist, bundled with Ronne and checked wherever a password is set.
Root can also turn on Have I Been Pwned's anonymous range check. A password found compromised at
sign-in must be replaced, with 128's hold.

## Scope

**In:**
- **One check, `checkNewPassword`**, in the identity domain, after the length rule. It runs
  wherever a person chooses a password:
  - sign-up (190);
  - Change password (`services/session.ts` `changePassword`);
  - forgot password (194);
  - root's typed password in Create user and Reset password (`services/user-admin.ts`);
  - the root account at setup (`services/root-account.ts`, `setup/run-setup.ts`);
  - `reset-root-password` (`setup/reset-root.ts`).

  Generated passwords (`models/generated-password.ts`) skip it: they are random.
- **The offline blocklist**, refused on a match:
  - **Common and breached passwords** from a permissively licensed list (below), kept only where
    the length is 12 to 128 characters. Shorter ones are refused by the length rule already, which
    keeps the file small.
  - **Context words** (NIST: "the name of the service, the username, and derivatives"):
    - the instance's name (setup's `server-name`);
    - `ronne`, `rmk`, `marketplace`;
    - the email's local part, and its domain without the top-level part;
    - each part of the person's name of 3 letters or more.

    A password matches when, lowercased and with digits and punctuation removed from both ends, it
    is one of these words or one repeated.
  - **Repeats and runs**: one character repeated (`aaaaaaaaaaaa`); a straight run up or down
    (`123456789012`, `abcdefghijkl`); a row of a US keyboard (`qwertyuiopas`).
  - Matching ignores letter case and compares after Unicode NFKC, as the length rule counts
    characters.
- **The list file**:
  - `apps/web/src/server/domains/identity/data/common-passwords.txt`: one entry per line,
    lowercased, NFKC, deduplicated, sorted;
  - a header line naming the source, its commit and its licence;
  - made by a script from a pinned commit, never fetched at run time;
  - loaded into a `Set` the first time it's needed;
  - credited in the `THIRD_PARTY_NOTICES` the packages ship (084's `notices.js` lists only pnpm
    dependencies today, so it learns to add vendored data files).
  - The source is SecLists (`danielmiessler/SecLists`, MIT): its
    `Passwords/Common-Credentials/10-million-password-list-top-1000000.txt`, or the largest file in
    that folder the plan's licence check clears. SecLists is MIT as a repository, but its lists
    come from public breach compilations, so the plan checks that nothing in the file's folder says
    otherwise. If something does, a CC0 or CC-BY-4.0 list takes its place (data only, §1 of the
    dependency policy).
  - The bundle checks keep the file under 2 MB.
- **Have I Been Pwned**: a setting on the Authentication tab, *Also check new passwords against Have
  I Been Pwned*, **off by default**.
  - When it's on, the check sends only the first 5 hex characters of the password's SHA-1 to
    `https://api.pwnedpasswords.com/range/{prefix}`, with `Add-Padding: true`. The match is found
    locally among the suffixes returned. A count above 0 refuses.
  - No account, email or address is sent.
  - The request has a 3-second timeout. If it fails, the offline check alone decides (fail open):
    a log event, and a status line beside the setting ("Last check failed: {when}").
  - Turning the setting on is audited, and the privacy note beside it names the service and what
    is sent.
- **The message** in every form: "This password is too common or appears in known data breaches.
  Choose another." Errors go through messages in all three languages (129).
- **At sign-in** (web, and `POST /api/v1/auth/token`), after a right password and before the
  session is handed out:
  - the offline check runs every time;
  - Have I Been Pwned, when it's on, at most once a day per account (`password_checks`).
  - A match sets 128's hold with a reason, `breached`: the person must choose a new password before
    anything else. The hold page says why: "Your password appears in a list of breached or common
    passwords. Choose a new one to continue."
  - It also sends a new security notice kind, `password_found_breached`, through 189's
    `sendSecurityNotice`, and records `user.password_found_breached` in the audit
    log.
  - The API refuses the token as 128 does for any hold, with a message to change the password in
    the web app.
- **128's hold gains a reason**: `root` (root asked for the change, today's meaning) or `breached`.

**Out:**
- **Passwords people already have, checked without a sign-in**: Ronne keeps only Argon2 hashes, so
  it can only check at sign-in, when it has the password.
- **Composition rules, expiry and forced periodic changes**: NIST says "SHALL NOT".
- **Downloading the whole Have I Been Pwned corpus for offline use**: tens of gigabytes. The range
  API covers the instances that want it.
- **A strength meter in the browser**: not needed for the check, and its libraries are large.

## Behaviour

**Eve signs up with `Summer2024!!!`.** It is 13 characters, but it's on the list. The form says it's
too common. She chooses a passphrase and goes on.

**Root at `acme.ronne.dev` sets a password of `acmeronne2026`.** That is a context word with digits
at the end, so it's refused.

**Frank signed up last year with a password that later turned up in a breach.** Root has turned on
Have I Been Pwned. Frank signs in; the password is right, and the range check finds it. He lands on
"Choose a new password", with the reason. He also gets an email saying his password was found in a
breach and that he should change it anywhere else he used it.

## Edge cases

- **The list file is missing or damaged** (a broken build): the server refuses to start and names
  the file. A password check must not be skipped silently.
- **Have I Been Pwned is slow or blocked by a firewall**: each check waits at most 3 seconds, then
  the offline check alone decides; the status line shows it.
- **An instance with no internet access**: leave the setting off; the offline check works.
- **A password with non-Latin characters**: compared after NFKC, as the length rule counts.
- **Root's terminal commands** (`reset-root-password`, the terminal setup) use only the offline
  check: settings may not be readable yet, and the terminal has no setting of its own.
- **A held person who then signs in with SSO**: the hold is on the account, so it applies to every
  sign-in, as 128's does. Someone with no password left can't be held for one: SSO-only accounts are
  never checked.

## Data

- **`password_checks`**: `user_id` (PK, FK cascade), `checked_at`. When Have I Been Pwned last
  cleared the account's password. Deleted on erasure (103) and on every password change.
- **The hold's reason**: a nullable `password_change_reason` beside 128's flag (`root`, `breached`).
- **Audit events**:
  - `user.password_found_breached` (source: `list`, `context`, `pattern` or `hibp`; never the
    password);
  - `settings.updated` for the setting.
- **Nothing about the password leaves the server**, except the 5-character prefix when root turned
  the setting on.

## Documentation

- **Your account** (`account#signing-in`): which passwords are refused, and why a password may have
  to be changed at sign-in.
- **Authentication** (`authentication#overview`): the setting, what it sends, and failing open.
- **Privacy**: a new section, `privacy#outbound`, listing what Ronne sends to outside services
  (this check; later ones add to it). New section id, so `topics.ts` changes here and in ronne-web.
- **Security** (`security#security`): the password rules, now with the blocklist.
- **Helpers**: the password fields' hint names the rule; the setting's helper.

## Acceptance criteria

- [ ] Every place listed in Scope refuses a listed password, a context word and a repeat or run, with
  the message in all three languages; generated passwords are not checked.
- [ ] The list file is built by a script from a pinned SecLists commit, filtered to 12–128 characters,
  under 2 MB, credited in the shipped `THIRD_PARTY_NOTICES`, and the server refuses to start without it.
- [ ] With the setting on, a known breached password is refused through the range API with
  `Add-Padding: true` and only the prefix sent (tested against a stub); a timeout falls back to the
  offline check and shows on the tab.
- [ ] A listed password at sign-in, or one the range API finds (at most once a day), sets the hold
  with reason `breached`, sends the notice and is audited; the API refuses the token while held.
- [ ] `password_checks` is cleared on a password change and deleted on erasure.
- [ ] The Documentation and helpers say what the feature does.

## Decisions

1. **An offline list by default, Have I Been Pwned only when root turns it on** (owner, 2026-11-20):
   it keeps the person's safety without sending anything out, and the privacy choice stays with
   root.
2. **Fail open on Have I Been Pwned** (owner, 2026-11-20): an outage of an outside service must not
   stop sign-ups and password changes. The failure is logged and shown on the tab, and the offline
   list always applies.
3. **Keep only 12–128 character entries** (Claude): shorter ones can't pass the length rule, and the
   file stays small enough for the image and the server package.
4. **Check at sign-in and hold** (Claude): NIST says a compromised password must be changed. The
   sign-in is the only time Ronne has the password to check.

## Open questions

None. The list's licence is checked in the plan's task 2.
