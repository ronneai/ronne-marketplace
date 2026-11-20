# 192 — Google and LinkedIn sign-in

> Milestone: M32 · Depends on: 191, 106, 157, 189, 105 · Design: [MVP §14.3](../../MVP/MVP.md#143-sso--planned-as-m16), [MVP §15](../../MVP/MVP.md#15-decision-log) ("Web sign-in"), [106's spec](../106-oidc-sign-in/SPEC.md) · Contracts: none

## Goal

On a public instance, people should be able to sign in with an account they already have. 106 built
identity providers for companies: OpenID Connect, presets, and accounts created for listed domains.
This feature adds two **social** presets on the same provider type: **Google** (any Google account,
beside the existing *Google Workspace*) and **LinkedIn**. Each shows its brand's own button. Each
follows 191's rules for creating accounts. Neither can claim an existing account unless it is the
authority for that address (owner, 2026-11-20). The owner's rule for M32 applies: the person's
safety first, and the standards followed.

## Scope

**In:**
- **Two presets** in `identity/models/oidc-presets.ts`, data like the others:
  - **`google-account`, "Google"**. Issuer `https://accounts.google.com`, scopes `openid email
    profile`. The steps: an OAuth client of type Web application, the consent screen set to
    *External* and published to *In production* (in *Testing*, only the listed test users can sign
    in). `openid`, `email` and `profile` are non-sensitive scopes, so Google's full app verification
    isn't needed. Brand verification is needed only to show the instance's logo and name on the
    consent screen (Google's documentation, checked 2026-11-20). The existing `google` preset stays
    *Google Workspace*, with an Internal consent screen.
  - **`linkedin`, "LinkedIn"** (Sign In with LinkedIn using OpenID Connect). Scopes `openid profile
    email`. Two quirks are handled in the preset, never by loosening a check:
    - **Where discovery lives.** LinkedIn serves its discovery document at
      `https://www.linkedin.com/oauth/.well-known/openid-configuration`, but the issuer it names is
      `https://www.linkedin.com` (vendor documentation and reports, 2026-11-20). The OIDC type
      therefore gets an optional `discoveryUrl` that only a preset sets (root never types it). The
      issuer check against the discovery document and against the ID token's `iss` stays exact.
    - **How the client signs in.** The discovery document doesn't list token endpoint
      authentication methods. The preset names the one LinkedIn accepts, checked at build.
  - LinkedIn's `email_verified` is optional. Without it the sign-in is refused, as 106's decision 6
    says, and *Test sign-in* shows why. LinkedIn says this product doesn't prove anyone's identity:
    the setup steps say so.
- **What a preset says about itself:**
  - **`kind`**: `company` (every preset today) or `social`. The sign-in page groups buttons by it, a
    social provider is a way in for 191, and the linking rule below depends on it.
  - **`authority`**: the email domains whose addresses this provider owns.
    - Google: `gmail.com` and `googlemail.com`. Also a Workspace domain, but only when the ID token's
      `hd` claim equals the email's domain.
    - LinkedIn: none.
- **Linking a social provider:** it links to an existing account by email **only** for an address it
  is the authority for. Any other existing account stays as it is: the sign-in is refused as
  `not_authority`, and the person sees the general "can't sign you in" message. They sign in first
  and link the provider from their Account page. In order, 106's decision list keeps:
  - verified email;
  - disabled and erased accounts refused;
  - a known link signs in.

  A new account is created only when 191's rules for this way in allow it, approval included.
- **Root accounts and social providers:** a social provider never links to, or signs in as, a root
  account on its own. Root can link one on their own Account page, like anyone else. A company
  provider (106) keeps its decision 9.
- **Two-factor after a social provider:** 106 doesn't ask for Ronne's two-factor after a company
  provider, which has its own MFA, and company providers keep skipping it. After Google or LinkedIn,
  Ronne asks for the person's own two-factor code whenever their account has two-factor on (105's
  second step), before any session exists.
- **Account › Sign-in methods** (a new section on `/account`, `features/account/`):
  - **The list:** the password (*Set* or *Not set*), and each linked provider with its name and when
    it was linked.
  - **Link** for each enabled provider not yet linked. The person enters their password, and their
    two-factor code if they have it. People with no password re-authenticate through a provider
    they've already linked. The provider's sign-in then runs in *link mode*:
    - its subject is attached to the signed-in account, whatever its email;
    - it is refused if that subject is already linked to another account.
  - **Unlink**, only while another way to sign in remains (a password, or another provider that
    policy allows).
  - Each link and unlink is audited (`auth.provider_linked`, `auth.provider_unlinked`) and sends
    189's security notice.
- **Brand buttons:**
  - **The assets:** each brand's standard button (Google's *Sign in with Google*, light in the light
    theme and dark in the dark one; LinkedIn's *Sign in with LinkedIn*). They are static assets from
    the vendors' official downloads, kept in `apps/web`, the logos unchanged. No vendor script loads
    and the content security policy doesn't change.
  - **The words** (checked 2026-11-20):
    - **Google:** its download (`signin-assets.zip`) has the buttons in English only, and its
      guidelines say translating the text "is permitted and encouraged". So the Google button is
      built to Google's rules (the standard colour "G" unchanged, its colours, Google Sans Medium
      14/20, its padding), with *Sign in with Google*, *Sign up with Google* or *Continue with
      Google* translated in Ronne's messages for Brazilian Portuguese and Canadian French.
    - **LinkedIn:** no translated official buttons were found, and LinkedIn's brand site refuses
      automated reading. The button stays in English for now (owner, 2026-11-20); task 6 checks
      the brand resources by hand and switches if LinkedIn offers translations.
    - Ronne's messages hold the accessible name in all three languages.
  - **The layout:** social buttons sit together under "Or continue with". All are the same size, as
    each brand's guidelines ask, 44px tall on a coarse pointer. 157's marks stay on company provider
    buttons.
  - **The sign-up page:** 190's page shows the same buttons, worded *Sign up with …*, for the ways
    in that may create accounts.
  - **Design rules:** this is a fourth exception to the design rules (one teal accent; red and amber
    only for errors and warnings). It is recorded in `CLAUDE.md` and MVP §15.
  - **Notices:** the logos are trademarks used under the vendors' guidelines, not MIT code. The
    third-party notices name them, with each guideline's address.
- **Sessions:** 24 hours, never extended, like every provider's (106's decision 12).

**Out** (and where it goes instead):
- **Sign in with Apple:** its own provider type (193).
- **More social presets** (GitHub, Microsoft personal accounts, Facebook): later rows, one preset
  each.
- **Google One Tap, FedCM and Google's button script:** they need a vendor script on the sign-in
  page.
- **Profile pictures and anything beyond name and email:** Ronne asks for no more than it uses.
- **Provider-initiated sign-in and single logout:** out, as in 106 (its decision 7).

## Behaviour

**Root sets up Google.**
1. Admin › Settings › Authentication › **Add provider**, preset *Google*. The steps show the
   redirect URI, the consent screen (External, In production) and the scopes.
2. Root pastes the client ID and secret.
3. Root runs **Test sign-in** with their own Google account. It shows the claims and what would
   happen ("Refuse: the account alice@gmail.com exists and is a root; link it from your Account
   page").
4. Root turns the provider on.
5. In 191's panel, root sets this way in: *may create accounts* on, allowed domains *any*, *needs
   approval* off.

**A visitor signs in with Google.** On the sign-in page they choose **Sign in with Google** and
pick their account at Google. Their address is `bob@gmail.com`, verified, with no account in Ronne.
191's rules allow it, so Ronne creates a `user` in `global` with a personal workspace and no
password, and lands on the home page. Once Bob turns two-factor on, every later Google sign-in asks
for his code too.

**Alice already has a password account, `alice@acme.com`**, and her Google account uses that
address, but `acme.com` isn't Google's (no `hd` claim). **Sign in with Google** is refused. She
signs in with her password, opens Account › Sign-in methods and chooses **Link** beside Google. She
enters her password and two-factor code, then picks her Google account. The link is made and an
email tells her so. From then on Google signs her in straight away (a known link), and asks for her
two-factor code.

**LinkedIn** behaves the same, except that it is the authority for no domain: it never links by
email, only from the Account page.

## Edge cases

- **A Google account with a non-Google address** (`bob@yahoo.com`, verified once by Google): no
  authority, so it never links by email. It creates an account only if 191's rules allow `yahoo.com`
  for this way in.
- **Dots and `+` in Gmail addresses:** the address is used as Google sends it. Ronne doesn't fold
  `b.ob@gmail.com` into `bob@gmail.com`, so a second account can't appear through spelling, and the
  linked subject decides.
- **The person changes their email at Google:** the subject is the same, so the known link signs
  them in. Ronne's address doesn't change (changing it is 197).
- **Both Google presets set up** (Workspace for `acme.com`, consumer for anyone): they are separate
  providers with separate links. The consumer preset is the authority for `acme.com` only with
  `hd = acme.com`, as the Workspace one already links within its listed domain.
- **The subject is already linked to another account:** link mode refuses (`linked_to_another`) and
  says so on the Account page. Nothing changes.
- **Unlinking the last way in:** the button is disabled, with the reason.
- **Root removes a provider:** its links go with it (106). People with no other way in ask root to
  set a password for them (008/059's reset), or use forgot password if they have a password (194).
- **LinkedIn sends no `email_verified`, or `false`:** refused (`unverified_email`), audited, and
  shown by *Test sign-in*.
- **LinkedIn's discovery address or issuer changes:** the next sign-in fails as a provider error
  (106's *Failing* badge). The preset is data, so a patch release fixes it.
- **A disabled account, or one awaiting approval (190):** refused as in 106, with the same
  messages.
- **Root's own account:** never linked or signed in by a social provider unless root linked it
  from Account.
- **A dark theme:** the dark variant of each brand's button. When the theme changes, the buttons
  change with it.
- **No JavaScript:** the buttons are forms that post to the start action, as 106's are.

## Data

- **No new table.**
  - A link is a Better Auth `account` row (`provider_id` = the provider's id, `account_id` = the
    subject), as in 106 (`kysely-sso-repository.ts`). *Linked on* is that row's `created_at`.
  - The `kind`, `authority`, `discoveryUrl` and the token authentication method are preset data, not
    stored per provider.
- **Audit:**
  - New events `auth.provider_linked` and `auth.provider_unlinked` (`via: "account"`, the
    provider).
  - New refusal reasons for `auth.sso_refused` and *Test sign-in*: `not_authority` and
    `root_not_linked`.

## Documentation

- **Authentication** (`authentication#google`, `authentication#linkedin`): setting up each, the
  consent screen and the verification Google asks for, LinkedIn's limits, and how linking works.
- **Signing in** (`account#signing-in`): the social buttons, two-factor after them, and why an
  existing account must be linked first.
- **Your account** (`account#sign-in-methods`, new): the list, Link, Unlink and the emails.
- **Helpers:** an inline helper on the Sign-in methods section and on the preset's form, through
  `components/help/Help.tsx`. The new topic sections go in `topics.ts` here and in ronne-web.

## Acceptance criteria

- [ ] The *Google* and *LinkedIn* presets fill the form and show their steps. *Google Workspace*
  is unchanged.
- [ ] Against the fake provider, LinkedIn's discovery at a path that isn't under its issuer works,
  and an ID token whose `iss` differs from the discovery's issuer is refused.
- [ ] A social provider links by email only for its authority's domains: Google with `gmail.com`,
  and a Workspace domain only with a matching `hd`. Otherwise it refuses `not_authority`; LinkedIn
  never links by email.
- [ ] A social provider never links to, or signs in as, a root account it wasn't linked to from
  Account. Company providers are unchanged.
- [ ] After a social provider, two-factor is asked whenever the account has it on, before any
  session; company providers still skip it.
- [ ] Account › Sign-in methods lists, links (after the password and two-factor) and unlinks. It
  refuses a subject linked elsewhere and refuses to unlink the last way in. Each change is audited
  and sends a notice.
- [ ] The brand buttons render each brand's standard asset in both themes, at equal size, with an
  accessible name in all three languages, and no vendor script loads (the CSP test is unchanged).
- [ ] `CLAUDE.md`, MVP §15 and the third-party notices record the brand exception.
- [ ] The Documentation and helpers listed above say what the feature does.

## Decisions

1. **Presets on 106's OIDC type, not Better Auth's social providers** (Claude, from 106's decision
   3): one decision list, *Test sign-in* and the sealed secret apply as they are.
2. **A social provider links by email only for addresses it owns** (owner, 2026-11-20). Otherwise
   a provider that once verified someone's address could take over that account.
3. **Social providers never claim a root account by themselves** (owner, 2026-11-20). A consumer
   account is outside the company's control. Root links one on purpose, after their password and
   two-factor.
4. **Two-factor is asked after a social provider** (owner, 2026-11-20). A company provider applies
   the company's MFA; a consumer account's protection is unknown, so Ronne's own applies.
5. **Brand buttons as static assets** (owner, 2026-11-20, "their standard buttons with their
   brand"; no vendor scripts: Claude). The buttons follow each brand's guidelines while no visitor
   data goes to the vendor before they click.
6. **LinkedIn's quirks live in its preset** (Claude): the issuer check stays exact for every other
   provider.

## Open questions

None. The vendor facts still to check are plan tasks: LinkedIn's PKCE (task 2; if LinkedIn refuses
it, the preset turns PKCE off for LinkedIn only, and the client secret, `state` and `nonce` carry
the protection) and LinkedIn's brand resources, checked by hand (task 6).
