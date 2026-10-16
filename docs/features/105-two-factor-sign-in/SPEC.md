# 105 — Two-factor sign-in

> Milestone: M16 · Depends on: 122, 006, 008, 059, 007 · Design: [MVP §9.5](../../MVP/MVP.md#95-auth), [§14.3](../../MVP/MVP.md#143-sso--planned-as-m16) · Contracts: none new

## Goal

A person can protect their password sign-in with a second step: a code from an authenticator app
(TOTP), with backup codes for a lost phone. Root decides whether it is optional, required for
everyone, or required for the people whose approvals decide what runs on developers' machines.
Built on Better Auth's `twoFactor` plugin, checked against its docs (2026-10-15).

## Scope

**In:**
- **Enrolment on `/account/security`** (a new Account page, linked from the Account menu next to
  Password and Access tokens): turn two-factor on with the current password, scan a QR code or type
  the secret, confirm with a first code, then see **10 backup codes once**. Turn it off (password
  and a code), regenerate the backup codes (password), see how many are left.
- **The second step at sign-in:** after a correct password, a person with two-factor goes to
  `/sign-in/two-factor` for a 6-digit code, or a backup code. Remember-me and `next` survive the
  step.
- **Root's policy, on the Authentication tab (122)**, a new *Two-factor sign-in* panel:

  | Policy | Who must have two-factor |
  |---|---|
  | **Optional** (default) | nobody; people choose |
  | **Reviewers and root** | root, and anyone who is moderator or admin of any workspace (they can approve what developers install) |
  | **Everyone** | every account that signs in with a password |

- **Enforcement:** a person the policy covers who has no two-factor yet signs in, and is held on
  `/account/security` until they finish enrolling: every other page redirects there, with a notice
  saying why. Becoming covered later (the policy tightens, or they become a moderator) works the
  same way at their next request.
- **Root resets someone's two-factor** (Admin › Users, "Reset two-factor"), for a lost phone and
  lost backup codes: clears it, ends their sessions, audited. Not on your own row (059's rule: the
  other root does it).
- **`pnpm run reset-root-password` also resets that root's two-factor**, so the terminal remains
  the last way back in; it says so.
- **The API's password exchange stops being a way around it** (`POST /api/v1/auth/token`, 009): a
  person with two-factor who sends the right password gets 401 `two_factor_required` and no token.
  They create a token in the web app (`/account/tokens`), or use `rmk login --web` once 107 lands.
- **Audit events** (007): `auth.two_factor_enabled`, `auth.two_factor_disabled`,
  `auth.backup_codes_regenerated`, `auth.two_factor_failed`
  (`{ method: "totp" | "backup_code" }`), `user.two_factor_reset` (actor root, target the user) and
  `instance.two_factor_policy_changed { from, to }`.

**Out** (and where it goes instead):
- **Two-factor for single sign-on.** An identity provider sign-in (106) is not asked for a Ronne
  code: the provider's own multi-factor is what protects it, and root requires it there. The policy
  says *accounts that sign in with a password*, and the panel says so.
- **Codes by email or SMS (OTP).** Ronne sends no email (MVP §14.5) and no SMS.
- **Passkeys and security keys (WebAuthn).** Later, if asked for.
- **Trusted devices** ("don't ask for 30 days"), which Better Auth offers: off, so every password
  sign-in asks (owner can reverse it later).
- **Forcing a second factor on the API.** Personal access tokens are machine credentials (009); they
  are made behind the web sign-in, which has the second step.

## Behaviour

**Better Auth.** `twoFactor({ issuer: "Ronne AI Marketplace" })` joins the plugins in
`createAuth`, before `nextCookies()`; TOTP only (no `otpOptions`). Its migration adds the
`two_factor` table (user id, secret, backup codes) and `user.two_factor_enabled`; `authSchema`
maps their names to snake_case, and the migration test checks them (all three databases). Its
account lockout stays on: failed codes (TOTP and backup) share one counter and lock the account's
second step for a while with 429 `ACCOUNT_TEMPORARILY_LOCKED`; the sign-in page says "Too many
attempts, wait a minute". The HTTP allowlist (006) does not grow: every two-factor call is a server
action that calls `auth.api` with the request's headers.

**Secrets at rest.** Better Auth encrypts the TOTP secret and the backup codes with a key from
`AUTH_SECRET`; task 1 confirms that in the installed version. Rotating `AUTH_SECRET` (098) then makes
every stored secret unreadable: `rmk-server rotate-secret` must either re-encrypt them or clear
them. It clears them and says how many people will enrol again (re-encrypting needs the old key in
the same process and is not worth the risk; the command already ends every session).

**Enrolling** (`/account/security`, any signed-in user with a password):
1. *Turn on two-factor* asks for the current password (Better Auth requires it for credential
   accounts) and shows the QR code, the secret in groups of four for typing, and an input for the
   first code. Nothing is active until the code is right.
2. The QR code is an SVG drawn on the server from the `otpauth://` URI; it is never sent to a
   third party. The URI and secret are in the response of that one action only.
3. After the first code, **10 backup codes** (`XXXXX-XXXXX`) are shown once with Copy all and
   Download (.txt), and "I've saved them" closes the step. They can't be shown again; Regenerate
   makes ten new ones and voids the old.
4. The page then says "Two-factor is on", the codes left, Regenerate and Turn off.

**Signing in.** The password step is unchanged (006, same rate limit, same error text). For a
person with two-factor Better Auth answers with a challenge instead of a session: the sign-in action
redirects to `/sign-in/two-factor?next=…` and Better Auth's short-lived cookie holds the pending
state (about 10 minutes). The page has one input (`autocomplete="one-time-code"`,
`inputmode="numeric"`), **Verify**, and "Use a backup code instead". A right code creates the
session (with Remember me as chosen on the first step) and goes to `next`. A pending state that
expired sends the person back to the password step with "Start again". A used backup code is gone.
The disabled-user rule (006) is applied before any code is asked, and again when the session is
created.

**The policy** (root, Authentication › Two-factor sign-in): three radio choices as above and Save,
audited with the old and new value. Choosing a stricter policy says how many people it covers and
how many of them have not enrolled ("12 people must enrol at their next visit"). It never signs
anyone out. The setting lives with the other instance settings (046) as `twoFactorPolicy`.

**Held until enrolled.** The route guard (006's layout check) sends a covered, unenrolled person to
`/account/security` for every page except that page, sign-out, the Documentation and the API's
health check. The page opens with a notice naming the policy. Server actions other than enrolment
and sign-out refuse them too (`TwoFactorRequiredError`), so a stale tab can't act. Bearer tokens
(`/api/v1`) are not held: they were made behind a sign-in, and revoking is the incident tool (098).

**Who is covered by "Reviewers and root":** root, and anyone for whom `submissions.review` holds in
some workspace (moderators and admins). Personal workspaces (114) don't count: everyone owns one.

**Root's reset.** *Reset two-factor* on a user's row (shown only when they have it) confirms,
deletes the user's two-factor record, ends their sessions, and writes `user.two_factor_reset`. If a
policy covers them they enrol again at the next sign-in. A root can reset another root's (059).

**Sign-in page and API texts.** The sign-in page's "Forgot?" note mentions that a lost authenticator
is reset by a root (or, for root, `reset-root-password`). `POST /api/v1/auth/token` answers a
two-factor account's correct password with `{ "error": { "code": "two_factor_required", "message":
"This account uses two-factor sign-in. Create a token at <PUBLIC_URL>/account/tokens, or run rmk
login --web." } }`. It answers only after the password is right, so it reveals nothing to someone
without it. `rmk` prints the message.

## Edge cases

- **Clock drift.** A code from one 30-second window before or after is accepted (Better Auth's
  default); the enrolment step says to check the phone's clock when a right-looking code fails.
- **The last root with two-factor required and no phone.** `reset-root-password` is the way back.
  The last root can't be locked out by the policy alone: it holds, but the terminal path stays.
- **An SSO-only account** has no password, so it can't enrol here and is not covered by the policy.
  If it later gets a password (root resets it, 008), it is.
- **Disabling two-factor while a policy covers you:** allowed; you are held on the page until you
  enrol again, which makes "turn off, turn on" the way to re-enrol with a new phone.
- **Two sign-ins at once with the same backup code:** one wins; the other is refused (the code is
  removed inside the verification).
- **Changing the password** (006) keeps two-factor and ends the other sessions, as now.
- **Disabling a user** (008) is unaffected; enabling them keeps their two-factor.
- **Backup restore (099) to a server with another `AUTH_SECRET`:** the stored secrets can't be
  read. Restore already requires the same settings file (it carries `AUTH_SECRET`), so this is the
  same instance; the restore runbook says so.
- **Unsupported authenticator apps** (those that ignore the 30-second, 6-digit default): the
  enrolment page names the settings in the URI; no option to change them.

## Documentation

- **Your account → Two-factor sign-in** (a new section `account#two-factor`, in ronne-web en/pt/fr
  and `apps/web/src/components/help/topics.ts` together): why, enrolling step by step, backup codes,
  a lost phone, what happens when root requires it, and that single sign-on is covered by the
  identity provider.
- **Administration → Settings** (`admin#settings`): the Two-factor sign-in panel and the policy's
  three choices; **Administration → Users** (`admin#users`): Reset two-factor.
- **Security** (`security#security`): sign-in protections now include two-factor; **Incidents**:
  a person lost their authenticator.
- **Root accounts** (`install#root`): `reset-root-password` also resets two-factor.
- **API:** the `two_factor_required` code in the token exchange's page.
- **Helpers:** on the enrolment page, "Why can't I show the codes again?" → `account#two-factor`;
  on the policy panel, "Who must enrol?" → `admin#settings`; on the two-factor step, "Lost your
  phone?" → `account#two-factor`.

## Acceptance criteria

- [ ] A person turns two-factor on with the right password and a right first code, gets ten backup
  codes once, and signs in with a code afterwards; a wrong code or a wrong password at enrolment
  changes nothing.
- [ ] A backup code works once; Regenerate voids the old ones; Turn off needs the password and a
  code and removes the record.
- [ ] The failed-code lockout answers 429 and the sign-in page shows its message; every failure is
  audited.
- [ ] With "Reviewers and root", a moderator without two-factor is held on `/account/security`
  until enrolled, on pages and on server actions; an ordinary user is not held; "Everyone" holds
  them too; "Optional" holds nobody.
- [ ] Root's reset clears the record, ends the sessions and is audited; it isn't offered on your own row.
- [ ] `reset-root-password` resets two-factor and says so; `rotate-secret` clears the stored secrets
  and reports how many people must enrol again.
- [ ] `POST /api/v1/auth/token` with a two-factor account's right password gets 401
  `two_factor_required` and no token; with a wrong password, the usual `invalid_credentials`.
- [ ] No Better Auth endpoint is added to the HTTP allowlist; the TOTP secret, backup codes and QR
  data appear in no log or audit metadata (a test inspects both).
- [ ] The migration runs on SQLite, PostgreSQL, MySQL and MariaDB, and the schema test passes.
- [ ] The pages pass the phone sweep (065).
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **TOTP and backup codes only; no email or SMS codes** (Claude): Ronne sends no email.
2. **The policy covers password sign-ins; single sign-on relies on the provider's multi-factor**
   (Claude, to confirm): asking an SSO user for a second Ronne code on top of their provider's is
   the common complaint with enterprise tools.
3. **"Reviewers" means anyone who can review in some workspace** (Claude, to confirm), since those
   approvals are the boundary the threat model (098) relies on.
4. **A covered person is held on the enrolment page rather than refused at sign-in** (Claude): they
   can still reach the page that fixes it, and a root can't lock out the whole company by tightening
   the policy.
5. **The token exchange refuses a two-factor account instead of asking for a code** (Claude): a
   code prompt in `rmk login` is what 107 does better, through the browser.

## Open questions

- **A QR code library.** Drawing the SVG needs one (for example `qrcode`, MIT, or
  `qrcode-generator`, MIT), through the dependency checklist in task 2. Writing a QR encoder is not
  worth it.
- **Trusted devices:** do you want "remember this device for 30 days" as an option? Left out.
