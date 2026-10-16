# 106 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Spike: the library.** [risky] Through the dependency checklist, read the installed
  `@better-auth/sso` (and `genericOAuth` in `better-auth`): licence, release age, peer
  dependencies (SAML ones must not come along), its tables on the three databases, whether it
  stores the client secret in clear, how it validates the response, how it takes a provider that
  Ronne reads from its own tables, and what `resolveUser`/hooks give. Build a throwaway sign-in
  against a fake OIDC server. Write the answer in Notes and, if it fails, switch Decision 3 to the
  fallback in `SPEC.md`.
  *Done when:* Notes name the chosen route with the evidence, and `pnpm licenses:check` and
  `pnpm audit --audit-level high` pass with it installed.

- [ ] **2. Tables and the contract.** [risky] Migration: `identity_providers`,
  `provider_group_mappings`, `workspace_members.source`, and the plugin's tables if used (all three
  dialects, `docs/spec` untouched); the `AuthProviderType` contract and the registry of types in the
  identity domain; the secret encryption (AES-256-GCM, key derived from `AUTH_SECRET`) with
  `encryptSecret`/`decryptSecret`; the repository and the provider service (create, update,
  enable, disable, delete, with the audit events), no UI yet.
  *Done when:* db tests cover each operation and the id rules; the migration test passes on the four
  database kinds; a test shows the stored secret is not the plain one and the logger and audit rows
  never carry it.

- [ ] **3. The OpenID Connect type and a fake provider.** The type's schema, `start`, `complete`,
  `test` and `instructions`; the presets as data; a fake OIDC server for tests (discovery, keys,
  authorize, token, with switches for unverified email, missing groups, a bad signature, a wrong
  issuer and a slow answer).
  *Done when:* unit tests cover discovery, the issuer rule (https or localhost, redirects refused,
  issuer mismatch), PKCE/state/nonce, a bad signature, expiry and each preset's issuer pattern.

- [ ] **4. Sign-in and accounts.** [risky] The start action, the callback route added to the HTTP
  allowlist (and only it), the decision list (verified email, disabled, known link, link by email,
  create for a listed domain, refuse), the session, `auth.sso_*` and `user.*` events. The creation
  goes through the same service as Create user (personal workspace included).
  *Done when:* db tests cover every branch of the decision list, two accounts with one email, a
  changed email at the provider, root, a disabled account, an off-site `next`, and that the other
  plugin routes return 404.

- [ ] **5. Groups.** [risky] The mapping service and its application at sign-in (add, raise, remove
  by `source`, never touch hand-set rows or root), the warning for a deleted workspace.
  *Done when:* db tests cover joining and leaving a group, two mappings giving one workspace
  different roles, a hand-set membership, a deleted workspace and root.

- [ ] **6. The panel and the form.** The provider list, Add/Edit with presets, the redirect URI
  with Copy, the steps beside the form, the write-only secret, domains, groups, the version check;
  Test connection and Test sign-in (the dry run, changing nothing); Turn on needs the test.
  *Done when:* component tests pass for each state, including "can't turn on before the test" and a
  stale form; the phone sweep passes.

- [ ] **7. The sign-in page and the password policy.** [risky] Provider buttons, the error
  messages, *Root only* with "Use your password (root)", the choice's preconditions and confirm, the
  token exchange's `password_sign_in_disabled`, and the Sign-in methods panel (122) listing it all.
  *Done when:* tests cover both policies for root and a non-root, the exchange, and refusing to
  choose *Root only* with no tested enabled provider.

- [ ] **8. Terminal commands.** `rmk-server disable-sso`; `rotate-secret` re-encrypts the provider
  secrets; `backup`/`restore` carry them and the restore runbook is updated.
  *Done when:* script tests pass for each, including a round trip through rotate and restore.

- [ ] **9. End-to-end.** Playwright with the fake provider: root adds a provider from a preset,
  tests and turns it on; a new person signs in and is created; a group grants a role; root chooses
  *Root only*; `disable-sso` restores it. Mind the sign-in limit.
  *Done when:* `pnpm test:e2e` passes the new spec on desktop and phone.

- [ ] **10. Documentation.** The Authentication topic, the seven guides, the helpers, the signing-in
  and incident pages, and MVP §14.3 / §15.
  *Done when:* the docs render tests pass in ronne-web, every helper's link lands on a real section
  here, and each guide's redirect URI example matches `PUBLIC_URL/api/auth/sso/callback/<id>`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
