# 191 — Who may create accounts

> Milestone: M32 · Depends on: 109, 190, 106, 108, 139 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) (a new "Who may create accounts" row), [106's decisions 8 and 9](../106-oidc-sign-in/SPEC.md#decisions)

## Goal

After 190, an account can be created in several ways: email sign-up and each identity provider's
first sign-in (106 today; Google, LinkedIn and Apple in 192 and 193). Each way in has its own rules
and lives on its own form. Root can't see in one place who may get an account. A domain can't be
kept out everywhere at once.

This feature gives root that place, with the rule the owner chose (option C, 2026-11-20):
- an instance-wide **block list** of email domains that applies to every way in and always wins;
- each way in keeps its own settings: **creates accounts** or not, which **allowed domains** (a
  list, or any), and whether new accounts **need approval**.

## Scope

**In:**
- **The block list.** A list of email domains on the Authentication tab, in a new **Who may create
  accounts** panel. Root only, audited before and after (`settings.account_rules_changed`).
  - A domain matches exactly, as in 190: `example.com` doesn't cover `eu.example.com`.
  - Entries are lowercased and their final dot is removed. A domain that isn't plain ASCII (an
    internationalised domain must be typed as `xn--…`) or isn't a valid host name is refused.
- **The rule, in this order, for every new account made by a way in:**
  1. the email's domain is on the block list → refused (`domain_blocked`); and so is a domain on
     190's throwaway list, when the way in allows *Any domain* and **Also block throwaway email
     domains** is on (`domain_throwaway`);
  2. the way in doesn't create accounts → refused (`creating_off`);
  3. the way in allows only listed domains and this one isn't listed → refused (`domain_not_allowed`,
     106's reason);
  4. else the account is created, waiting for approval when the way in needs it.
- **The throwaway setting** moves from 190's panel to this one, beside the block list, and applies
  to every way in that creates accounts with *Any domain*. It's on by default; an allow list makes
  it irrelevant.
- **The ways in:** *Email sign-up* (190's settings) and each identity provider. A provider's
  "Who may sign in" step (106's step 3, `features/admin-settings/authentication/providers/`) gains:
  - **Creates accounts on first sign-in** (on or off).
  - **Allowed domains:** *Any domain* or *Only these domains*. This is 106's *Email domains this
    provider signs in*, renamed.
  - **New accounts wait for root's approval** (190's mechanism), only while email is set up
    (Decision 8).
  - **Link existing accounts by verified email, in the allowed domains only** stays as 106 has it.
    It can't be turned on with *Any domain*: a provider could then claim any account on the
    instance. 192's authority rule is the only exception.
- **The panel's overview:** a table with one row per way in (Email sign-up, then each provider by
  name).
  - Its columns: on, creates accounts, allowed domains, approval, link by email.
  - Each row links to its form. The block list is above the table.
  - A row whose allowed list names a blocked domain shows a warning ("acme.org is blocked, so this
    provider can't create accounts for it").
- **Approval for providers:**
  - A first sign-in through a provider that needs approval creates the account with
    `approval_pending_at` (190) and links it. Group mappings are not applied yet.
  - The person sees "Your account was created and waits for a root's approval. We'll email you"
    (the provider has proved who they are, so saying so is safe). Roots are notified (139).
  - After approval, the next sign-in applies the groups, as every sign-in does (`group-sync.ts`).
- **`planSsoSignIn`** (`identity/services/sso-sign-in.ts`) gains the rule's first two steps and the
  `create_pending` outcome. `SsoNotAllowed` gains `domain_blocked`, `domain_throwaway` and `creating_off`, shown by
  *Test sign-in* and in the audit row's `why`.
- **190's sign-up** checks the block list first, with the same answer as a domain that isn't allowed.
- **Which way in made each account:** `user.created_via`, written by every creation (`setup`,
  `root` for Create user, `sign_up`, `scim`, `provider:<id>`). 197 checks a new address against
  that way in's allowed domains. It's shown on the user page (123) and in your data (104).
- **Migration** of 106's providers, with no change in behaviour:
  - *creates accounts* is on when the provider's domain list isn't empty;
  - *allowed domains* is that list;
  - *approval* is off;
  - the block list starts empty.

**Out** (and where it goes instead):
- **Root's own ways to make accounts** (Create user, SCIM provisioning, setup): not subject to the
  rules. Root and the identity provider's administrators decide those. Create user warns when the
  domain is blocked ("acme.org is on the block list. Create anyway?").
- **Blocking existing accounts by domain:** the rules govern creating accounts only. Disabling
  accounts stays a root action on Users.
- **Google and LinkedIn buttons and linking by authority:** 192. **Apple:** 193.

## Behaviour

**A company with a public side.**
- The company's Entra provider creates accounts for `acme.com`, with no approval.
- Email sign-up is on for any domain, with approval.
- The block list holds `yahoo.com` and `mailinator.com`.

The panel shows two rows and the list above them. An employee's first Entra sign-in creates their
account at once. A stranger signing up as `sam@gmail.com` waits for approval. `x@mailinator.com` is
refused at once: "Sign-up isn't open to this email domain."

**Root tests a provider.** *Test sign-in* with an address in a blocked domain reads "Refuse
(domain_blocked): `acme.org` is on the instance's block list."

## Edge cases

The cases the owner weighed when choosing option C (2026-11-20). "C" is how this feature answers.

| # | Case | C |
|---|---|---|
| 1 | Entra creates accounts for `acme.com`, and public sign-up is open for `gmail.com`. An Entra guest user with a `@gmail.com` address signs in. | Refused: Entra's allowed list is `acme.com` (`domain_not_allowed`). |
| 2 | Email sign-up is off, but Google is on and creates accounts. | Google creates accounts. Both rows are in the overview, so root sees it. Turning sign-up off doesn't silently govern Google. |
| 3 | Approval is wanted for strangers, not for employees. | Per way in: Entra off, email sign-up and Google on. |
| 4 | A Google account can use any address, such as `bob@yahoo.com`, verified once by Google. | The domain rules apply to the email, not to the provider: the block list refuses `yahoo.com`, and Google's allowed list decides the rest. |
| 5 | Apple's private relay: the email is `xyz@privaterelay.appleid.com`. | It's a domain like any other: allowed or blocked as `privaterelay.appleid.com`. A relay hides the real domain, so blocking `yahoo.com` doesn't stop a Yahoo user behind it. The Documentation says so (193). |
| 6 | Alice has a password account and then uses "Sign in with Google" with the same address. | 192: linked only when Google is the authority for the address; otherwise she signs in and links it on Account. |
| 7 | Alice's account came from Google (no password), then she tries email sign-up. | 190: the same answer as anyone, and she gets the "already have an account" email. |
| 8 | A domain is removed from an allowed list, or added to the block list, later. | Existing accounts stay and still sign in: the rules govern new accounts only. |
| 9 | An erased user (103) signs up again with the old address. | Allowed: erasure freed the address. The block list or approval can stop it. |
| 10 | A provider's allowed list names a domain on the block list. | Blocked: the block list always wins. The form and the overview warn. |
| 11 | A provider is set to *Any domain* with link by email on. | Not possible: the form turns link by email off and says why (192's authority rule aside). |
| 12 | A pending account (approval) is in a domain root blocks meanwhile. | It still waits. A root declines or approves it, since the rules govern creating, not waiting accounts. |
| 13 | SCIM provisions a user in a blocked domain. | Created: SCIM is the identity provider's administrators acting, outside these rules. |
| 14 | Two roots edit the block list at once. | The first save wins, and the other form says it's stale (a version check, as 106's providers do). |

Also:
- **A domain typed as `@acme.com` or `ACME.COM.`:** stored as `acme.com`.
- **A way in that's turned off:** its row stays in the overview, marked off. It creates nothing.
- **Restoring a backup:** the rules are settings and provider columns, restored with them.

## Data

- **`identity_providers`:** `creates_accounts` (boolean), `any_domain` (boolean), `needs_approval`
  (boolean). `domains` stays the allowed list.
- **`user.created_via`** (string, 48): `setup`, `root`, `sign_up`, `scim`, `provider:<id>`, or
  `unknown`. Backfilled as best it can, the surest evidence first:
  - an account with a sign-up time (190) gets `sign_up`: only a sign-up writes it, while a provider
    link or SCIM can be added to an account that already existed;
  - else an account in `scim_users` gets `scim` (SCIM provisions before the first sign-in);
  - else an account linked to a provider gets `provider:<id>` of its earliest link;
  - the rest get `unknown`, since setup's root and Create user can't be told apart afterwards.
- **Settings keys:** `blocked_domains` (a JSON list) and `account_rules_version`, for the stale
  check.
- 190's `sign_up_enabled`, `sign_up_domains` and `sign_up_approval` are the Email sign-up row.
- One migration for all three databases, setting the three columns from each provider's `domains`.

## Documentation

- **Identity providers** (`authentication#account-rules`, new section): the block list, the rule's
  order, the overview, the per-way-in settings, and the table of cases above in plain words.
- **Identity providers** (`authentication#providers`): step 3's new fields.
- **Provider guides:** each guide's "Who may sign in" line uses the new names.
- **Helpers:** a help link on the Who may create accounts panel and on the provider form's step 3.
  `topics.ts` here and in ronne-web change together.

## Acceptance criteria

- [ ] After the migration every existing provider behaves as before: same sign-ins, links, creations
  and refusals (the existing SSO db tests pass unchanged).
- [ ] A blocked domain refuses a new account through email sign-up and every provider, even when
  the way in allows it, and doesn't affect existing accounts.
- [ ] *Creates accounts* off refuses new accounts and still signs in linked ones.
- [ ] A throwaway domain is refused through every way in with *Any domain* while the setting is on,
  and not through one with an allow list.
- [ ] *Any domain* creates accounts in any domain not blocked, and can't be combined with link by
  email.
- [ ] Approval for a provider creates a waiting, linked account with no groups; after approval the
  next sign-in applies the groups.
- [ ] Every way of creating an account writes `user.created_via`; the migration backfills it as the
  Data section says; the user page and your data show it.
- [ ] *Test sign-in* reports `domain_blocked`, `creating_off` and "create, waiting for approval".
- [ ] The overview lists every way in with its settings and warns about blocked domains in allowed
  lists; every change is audited with before and after.
- [ ] Every screen exists in the three languages; the Documentation and helpers say what the
  feature does.

## Decisions

1. **Option C: an instance block list over per-way-in rules** (owner, 2026-11-20). It keeps 106's
   provider settings, shows every way in on one page, and lets one list keep a domain out
   everywhere.
2. **Domains match exactly** (owner, 2026-11-20).
3. **The rules govern new accounts only** (Claude). Removing access from existing accounts is
   disabling them, a root action with its own audit.
4. **No link by email with *Any domain*** (Claude). Linking by email trusts the provider for those
   domains. With any domain, it would trust it for every account on the instance, root's included.
5. **Root's own ways to make accounts aren't governed** (owner, 2026-11-20). Create user warns, and
   SCIM is the identity provider's administrators' decision.
6. **A provider's waiting account gets no groups until approved** (Claude). Groups can give
   workspace roles.

7. **Throwaway domains blocked for every way in with *Any domain*** (owner, 2026-11-20). A
   provider that accepts any domain is as open as sign-up. A provider with an allow list is
   already narrower than the list.
8. **A provider's approval needs email** (owner, 2026-11-22). A waiting person is told "We'll
   email you", and a root's answer goes by email (190). *New accounts wait for root's approval*
   can be turned on only while email is set up with an instance contact (189), as 190 asks of
   sign-up's switch; the form says why it's unavailable. Once on, it stays on through other
   edits. If email stops being set up later, the overview warns on that provider's row, and its
   accounts still wait for a root.

## Open questions

None.
