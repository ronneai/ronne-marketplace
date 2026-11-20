# 192 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP §15: the "Web sign-in" row names social providers, with linking only by authority and two-factor after them.
  - MVP §15's "Design system" row and `CLAUDE.md` list the brand buttons as the fourth exception.
  - `docs/features/README.md` lists 192 in M32.
  - *Done when:* the three say what this spec says, and `pnpm witness:check` and `pnpm docs:check`
    pass.

- [ ] **2. The presets and the OIDC type's options.** [risky]
  - `oidc-presets.ts`: `kind` and `authority` on every preset (`company` and no authority for those
    there today), `google-account` and `linkedin` with their steps.
  - `oidc-provider-type.ts`:
    - a preset's `discoveryUrl`, with the issuer still checked exactly against the discovery
      document and the ID token;
    - the token endpoint authentication method a preset names;
    - PKCE turned off only by a preset that says so.
  - Check LinkedIn's behaviour with a real LinkedIn app (discovery, `iss`, authentication method,
    PKCE, `email_verified`), and record it with the date in Notes.
  - *Done when:*
    - `oidc-provider-type.test.ts` covers discovery at a separate address, an `iss` mismatch
      refused, each authentication method, and PKCE on and off;
    - every other preset's tests are unchanged and pass.

- [ ] **3. The linking rule for social providers.** [risky]
  - `services/sso-sign-in.ts`'s `planSsoSignIn`:
    - a social provider links by email only for its authority;
    - Google's `hd` rule;
    - a root account never linked or signed in unless already linked;
    - `not_authority` and `root_not_linked` in `SsoNotAllowed`, *Test sign-in*'s words and the
      audit log;
    - creation through 191's rules for the way in.
  - *Done when:* `sso-sign-in.test.ts` and `sso.db.test.ts` cover:
    - `gmail.com` linking;
    - `hd` matching and not matching;
    - a Google account with a `yahoo.com` address;
    - LinkedIn never linking by email;
    - root refused;
    - company providers unchanged.

- [ ] **4. Two-factor after a social provider.** [risky]
  - The callback (`actions/sso.ts`) hands a social sign-in to 105's second step (the existing
    two-factor hold) when the account has two-factor, or to the setup when 105's requirement covers
    the person. Company providers skip it as before.
  - *Done when:* db tests cover each case: with two-factor, required but not set up, neither, and a
    company provider. A session exists only after the second step.

- [ ] **5. Account › Sign-in methods.** [risky]
  - The section, the link action with re-authentication (password and two-factor, or a linked
    provider), link mode through the callback, unlink with the last-way-in guard, the audit events
    and 189's security notices.
  - All screen text in the three languages.
  - *Done when:*
    - db tests cover link, a subject linked elsewhere, unlink, the last way refused, and
      re-authentication refused with a wrong password or code;
    - `account.test.tsx` renders the section;
    - the notices are queued in 189's outbox.

- [ ] **6. Brand buttons.**
  - Pass the [dependency policy](../../policies/dependencies.md) checklist for the vendors' button
    assets (trademarks under guidelines, not a package), and add them to the third-party notices.
  - The assets in light and dark, each brand's wording per language (or English, Open question 2).
  - The sign-in and sign-up pages: "Or continue with", equal sizes, 44px on a coarse pointer.
  - The CSP test is unchanged.
  - *Done when:*
    - `sign-in.test.tsx` and the sign-up page's tests render both brands in both themes, with
      accessible names in all three languages;
    - the end-to-end sign-in test with the fake provider passes on a phone and a desktop project.

- [ ] **7. End to end with the fake provider.**
  - The fake provider (106's decision 13) plays a social preset with and without `hd`.
  - Playwright covers:
    - a new account through a social button;
    - a refusal for an existing account;
    - linking from Account, then signing in through the link with two-factor.
  - *Done when:* the e2e file passes in both shards' projects.

- [ ] **8. Documentation.**
  - The topics and helpers listed in the spec, in ronne-web's branch for the release, and
    `topics.ts` in both repositories.
  - *Done when:* `pnpm docs:links` finds no difference, and the words match how the app behaves.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
