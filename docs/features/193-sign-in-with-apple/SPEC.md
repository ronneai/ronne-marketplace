# 193 — Sign in with Apple

> Milestone: M32 · Depends on: 192, 191, 189, 106 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Web sign-in"), [106's spec](../106-oidc-sign-in/SPEC.md), [192's spec](../192-google-linkedin-sign-in/SPEC.md) · Contracts: none

## Goal

People with an Apple account should be able to sign in with it, as 192 does for Google and
LinkedIn. Apple doesn't fit a preset of 106's OpenID Connect type:
- its client secret is a JSON Web Token the instance signs with a private key;
- the browser comes back with a cross-site `POST`, not a `GET`;
- the person's name arrives only on their first authorisation, outside the ID token;
- the address is often a private relay address that hides the real one.

So Apple is a provider type of its own, `apple`, behind 106's provider type contract
(`identity/models/auth-provider-type.ts`). It is a **social** way in with 192's rules for kind,
authority, linking, root accounts, two-factor and the brand button. Vendor facts were checked
against Apple's documentation and developer forums on 2026-11-20.

## Scope

**In:**
- **The `apple` type** (`identity/repositories/apple-provider-type.ts`), registered beside OIDC
  (`provider-type-registry.ts`). Its fields:
  - **Services ID**: the client ID;
  - **Team ID** and **Key ID**;
  - **Private key**: the `.p8` file's text, a `secret` field.

  The key is sealed like every provider secret (`repositories/provider-secrets.ts`), never shown
  again, and blank on edit keeps it. `parse` checks the key is a P-256 PKCS #8 key and the IDs are
  10-character Apple identifiers.
- **The client secret:**
  - **A short life.** It is made fresh for each token request: `ES256`, `kid` = Key ID, `iss` = Team
    ID, `sub` = Services ID, `aud` = `https://appleid.apple.com`, and `exp` 5 minutes after `iat`.
    Apple accepts up to six months (15,777,000 seconds), and an expired long-lived secret is the
    usual cause of Apple sign-in breaking. With a 5-minute life there is nothing to renew.
  - **The signature** uses `node:crypto` (`dsaEncoding: "ieee-p1363"`), so no new dependency.
- **The authorisation request:**
  - **The request:** `https://appleid.apple.com/auth/authorize` with `response_type=code`,
    `response_mode=form_post` (Apple requires it when name or email is asked), `scope=name email`,
    `state` and `nonce`.
  - **PKCE** is sent only if Apple's discovery document
    (`https://appleid.apple.com/.well-known/openid-configuration`) lists `S256`, checked at build.
    Otherwise `state`, `nonce` and the confidential client carry it, as OIDC Core allows.
- **The `form_post` callback:**
  - **Why it needs a hand-off.** 106 keeps the sign-in's state in a short-lived `HttpOnly`,
    `SameSite=Lax` cookie (`actions/sso.ts`). Browsers don't send it with a cross-site `POST`.
    Rather than loosen the cookie to `SameSite=None`, the callback gets a `POST` handler that only
    hands off:
    - `POST /api/auth/sso/callback/<id>` accepts `application/x-www-form-urlencoded` up to 8 KB, and
      only for a provider whose type asks for `form_post`;
    - it stores the fields (`code`, `state`, `user`, or `error`) in a `verification` row keyed by
      the hash of `state`, kept for 60 seconds and readable once;
    - it answers `303 See Other` to `GET /api/auth/sso/callback/<id>?state=…&handoff=1`.
  - **What the `GET` does:** it is a top-level navigation in the same browser, so the `Lax` cookie
    is sent and 106's checks run unchanged: the state matches the cookie, the sign-in in progress is
    taken once, and then the hand-off is taken once.
  - **What the `POST` never does:** read cookies, make a session or a redirect anywhere else. A
    forged post without the victim's cookie can't finish anything.
- **`complete`:**
  - **The code exchange:** at `https://appleid.apple.com/auth/token`, with the client secret.
  - **The ID token** is checked with `oauth4webapi`: Apple's keys, `iss`
    `https://appleid.apple.com`, `aud` = Services ID, `nonce`, and `iat` (as 106's type checks it).
  - **The identity:**
    - the subject is `sub`;
    - the email is `email`;
    - `email_verified` counts when it is `true` or `"true"` (Apple sends either);
    - `is_private_email` is kept for the rules below;
    - the name comes from the hand-off's `user` field (`{"name":{"firstName","lastName"}}`). It is
      sent only on the first authorisation and isn't signed, so it is used only as a new account's
      name, never for the email or a link. Without it, 106's rule applies (the email's local part).
  - Ronne keeps none of Apple's tokens (minimum data): the ID token is read and dropped.
- **Authority and the relay:**
  - Apple is the authority (192) for `icloud.com`, `me.com` and `mac.com`, only when
    `is_private_email` is false.
  - The relay domain `privaterelay.appleid.com` is a domain like any other in 191's rules (allowed,
    blocked or not listed). Apple is never its authority, so a relay address never links by email.
- **Email to relay addresses:**
  - **Registration with Apple.** Apple forwards mail to a relay address only from registered
    sources that pass SPF or DKIM: the sending domain must match the envelope sender (SPF) or the
    `From` domain (DKIM).
  - **In the setup:** the provider's steps say to register 189's `From` domain in Apple's Private
    Email Relay Service.
  - **On the Email tab:** while an Apple provider is on, 189's tab shows "Register <domain> with
    Apple's Private Email Relay" with a link to the Documentation.
  - **When mail bounces:** a send to a relay address that bounces as unregistered shows the same
    hint on the outbox's failure.
- **Apple's server-to-server notifications:**
  - **The endpoint:** `POST /api/auth/sso/apple-events/<id>`, which root registers in Apple's
    portal. Apple registers it on the primary App ID the Services ID is grouped with; the steps say
    so.
  - **Checking a notification:** the body is a JWT signed by Apple, checked with Apple's keys, `iss`
    and `aud`, then handled by its `type`, each case idempotent:
    - **`email-disabled`:** the person turned off forwarding to the relay. Ronne stops sending to
      that address through 189's mail domain and marks it on the user's page.
    - **`email-enabled`:** sending resumes.
    - **`consent-revoked`:** the person stopped using their Apple account with Ronne. Their sessions
      from Apple end. The link is kept, so signing in with Apple again (which asks for consent
      again) finds the same subject.
    - **`account-delete`, and `account-deleted` as observed:** the person deleted their Apple
      account. The link is removed and their sessions from Apple end. The account itself stays,
      since erasing is root's decision (103). With no other way in left (no password, no other
      provider), the account is disabled as root's Disable does (its tokens stop working) and the
      roots are told (139); a root can enable it again and give it a password.
  - **Audit:** each notification is recorded as `auth.apple_event`, with the type and the user.
  - **Limits:** unknown types are recorded and ignored. Duplicates change nothing. The endpoint is
    rate-limited and answers `200` only after the signature checks.
- **Test.** *Test connection* checks four things:
  - Apple's discovery document and keys answer;
  - the key signs a client secret;
  - Apple accepts that secret: the token endpoint with a dummy code answers `invalid_grant`, which
    means the client authenticated, while `invalid_client` means the key, Team ID, Key ID or
    Services ID is wrong;
  - the instance's public address is `https` on a domain name.

  *Test sign-in* works through the hand-off, as for 106.
- **The rules 192 sets for social providers:** linking by authority, root accounts never claimed,
  two-factor after (the person's Ronne two-factor is asked whenever their account has it on, as
  after Google and LinkedIn; owner, 2026-11-20), Account › Sign-in methods, the 24-hour session and
  191's creation rules.
- **The button:**
  - Apple's standard *Sign in with Apple* button: black in the light theme, white in the dark one.
  - From Apple's official assets, with Apple's approved title per language.
  - The same size as the other social buttons, as Apple's guidelines ask.
  - No Apple script.

**Out** (and where it goes instead):
- **Sign in with Apple JS** (Apple's script): no vendor scripts on the sign-in page (192).
- **Apple's native apps and App Store rules:** Ronne is a website. TN3194's token revocation applies
  to apps that keep Apple's tokens, and Ronne keeps none.
- **Sending email through Apple's relay ourselves:** the relay is Apple's, and 189 sends as usual.
- **Changing a person's email when their relay address changes:** 197 is the way to change an
  address.

## Behaviour

**Root sets up Apple.**
1. In Apple's developer account, root creates an App ID with Sign in with Apple, a Services ID
   grouped with it, the redirect URI Ronne shows (`https://ronne.acme.com/api/auth/sso/callback/apple`),
   and a key with Sign in with Apple. They download the `.p8`.
2. Root registers the `From` domain in the Private Email Relay Service, and the notifications
   address Ronne shows.
3. In Ronne, **Add provider** › *Apple*, then the four values.
4. **Test connection** shows that Apple answered, the key signed and Apple accepted the secret.
5. **Test sign-in** with root's Apple account, then turn it on and set 191's rules for this way
   in.

**A visitor signs in with Apple and hides their email.**
1. At Apple they share their name and choose *Hide My Email*.
2. Apple posts back to the callback, the hand-off redirects, and Ronne checks the cookie and the
   state.
3. The ID token says `abc123@privaterelay.appleid.com`, verified, private. 191's rules for Apple
   allow `privaterelay.appleid.com`, so an account is created with the name Apple sent.
4. Ronne's emails to that person go through Apple's relay, because root registered the domain.

**Later they turn off forwarding** in their Apple account settings. Apple sends `email-disabled`,
and Ronne stops emailing them. The user's page says why.

## Edge cases

- **The name is missing** (not the first authorisation, or declined): the new account takes the
  email's local part, which is random for a relay. The person can change their name on Account.
- **The `user` field is malformed or too long:** ignored. The name falls back as above.
- **The hand-off is never read** (the browser stopped after the `POST`): it expires after 60
  seconds, and so does the sign-in after 10 minutes, as in 106.
- **A replayed `POST`:** the second hand-off for the same state replaces nothing, because the first
  was taken or the state is gone. The `GET` finishes once at most.
- **An `error` from Apple** (the person cancelled): the hand-off carries it, and the sign-in page
  says the sign-in was cancelled.
- **The instance's address isn't `https` on a domain** (Apple refuses `localhost` and IP
  addresses): the type can't be turned on, and the test says why. Development and CI use the fake
  Apple.
- **The key is revoked in Apple's portal:** the token request answers `invalid_client`. The
  provider shows *Failing* (106), and the test names the key.
- **A relay address in 191's block list:** the relay domain is blocked like any other.
- **An existing account `jo@icloud.com`, signed in with Apple, not private:** Apple is the
  authority, so it links. The same person hiding their email gets a relay address, so there is no
  link by email, and the sign-in is refused or creates an account by 191's rules. The setup steps
  and the Documentation explain linking from Account.
- **A notification for an unknown subject:** recorded and ignored.
- **The notifications endpoint is called without Apple's signature, or with another app's `aud`:**
  refused with `401`, rate-limited, and nothing is recorded beyond the limiter.

## Data

- **Provider config:** `identity_providers` with `type = "apple"`. The config holds the Services ID,
  Team ID and Key ID. `secret_enc` holds the sealed `.p8`.
- **Hand-offs:** rows in the existing `verification` table, 60 seconds, deleted on use or on expiry
  (as 106's sign-ins in progress are).
- **Undeliverable addresses:** 189's mail domain records them, by recipient hash with the reason
  `apple_email_disabled`. If 189 has no suppression list by then, this feature adds
  `mail_suppressions` (recipient hash, reason, since) there. Erasure (103) deletes the user's rows,
  and your data (104) lists them.
- **Audit:** `auth.apple_event` (type, user, provider), plus 106's and 192's events.

## Documentation

- **Authentication** (`authentication#apple`): Apple's developer account steps, the relay
  registration, the notifications endpoint, the key's revocation and what *Test connection* checks.
- **Email** (189's topic, `email#apple-relay`): registering the sending domain.
- **Signing in** (`account#signing-in`): Hide My Email, and linking from Account.
- **Helpers:** the Apple form's steps and the Email tab's hint, through `components/help/Help.tsx`.
  The new sections go in `topics.ts` here and in ronne-web.

## Acceptance criteria

- [ ] The `apple` type parses and seals the key, refuses a key that isn't P-256 PKCS #8, and keeps
  the stored key when the field is blank.
- [ ] Every token request carries a fresh `ES256` client secret that lives 5 minutes, which Apple's
  rules (and the fake Apple) accept.
- [ ] The `POST` callback stores a 60-second hand-off and redirects with `303`. The `GET` finishes
  only with the state cookie. A forged or replayed post finishes nothing, and the `POST` reads no
  cookie and makes no session.
- [ ] The ID token is validated (keys, `iss`, `aud`, `nonce`, `iat`). `email_verified` as a string
  or a boolean, `is_private_email` and the first-authorisation name are handled. No Apple token is
  stored.
- [ ] Apple is the authority for `icloud.com`, `me.com` and `mac.com` only when not private. Relay
  addresses never link by email and follow 191's rules.
- [ ] The notifications endpoint verifies Apple's signature and handles the four types (both delete
  spellings) idempotently, each audited; a deleted Apple account is unlinked, and disabled with the
  roots told when no other way in is left.
- [ ] *Test connection* tells `invalid_client` from `invalid_grant`, and refuses an instance that
  isn't on `https` with a domain.
- [ ] The Email tab and the outbox show the relay hint while Apple is on.
- [ ] Apple's button renders in both themes with the approved title in all three languages, and no
  Apple script loads.
- [ ] The Documentation and helpers listed above say what the feature does.

## Decisions

1. **Apple is a provider type, not an OIDC preset** (owner, 2026-11-20): its client secret,
   `form_post` and name delivery don't fit the OIDC type's flow.
2. **A 5-minute client secret per request** (Claude): nothing to renew, and a stolen one is
   useless within minutes. The `.p8` stays sealed.
3. **A `POST` that hands off to the `GET`, not a `SameSite=None` cookie** (Claude): 106's cookie and
   checks stay exactly as they are, and the cross-site request can't act on the session.
4. **No Apple tokens kept** (Claude, from the owner's data-protection goal): Ronne uses the ID token
   only at sign-in.
5. **Deleted Apple accounts unlink, they don't erase** (owner, 2026-11-20): erasure (103) is root's
   decision, with its consequences.

## Open questions

None. The vendor facts still to check are plan tasks: whether Apple's discovery lists PKCE (`S256`)
(task 2; the flow is safe either way) and whether Apple delivers notifications for a web-only
Services ID (task 5, with a real Apple account).
