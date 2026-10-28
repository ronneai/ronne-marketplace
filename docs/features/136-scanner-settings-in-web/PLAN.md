# 136 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "Security scan" row and 135's decisions 3 and 5 updated to point at 136.
  - `docs/features/README.md` lists 136 in M20.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. Encryption for instance secrets.** [risky]
  - Generalise `provider-secrets.ts` into a helper for any instance secret (its own HKDF `info`,
    the associated data), keeping identity providers' format and tests unchanged.
  - `rotate-secret` re-encrypts the scan key too.
  - *Done when:* unit tests cover round trip, the associated data (a value copied to another setting
    doesn't decrypt), another `AUTH_SECRET`, and damaged values; the rotate-secret db test covers
    the scan key on the four databases.

- [ ] **3. Endpoint checks.** [risky]
  - `https://` only.
  - Resolve the host and refuse private, loopback, link-local and metadata addresses (IPv4 and
    IPv6, mapped addresses included) unless allowed by `RONNE_SKILL_SCANNER_HTTP_HOSTS`.
  - Used on save and at scan time.
  - *Done when:* unit tests with a fake resolver cover each address class, a hostname that resolves
    to a private address, userinfo and odd URL forms.

- [ ] **4. Settings service and the scan job.** [risky]
  - Provider, model, endpoint, timeout, command index and the write-only key, with the environment
    winning.
  - The job builds the provider from the environment or the settings, decrypting the key for the
    run only.
  - Audit without the key.
  - *Done when:* db tests cover set, replace, remove, keep (empty field), the environment winning, a
    key that no longer decrypts, a dropped command, and the key absent from every returned value and
    audit event, on the four databases.

- [ ] **5. The tab.**
  - Scanner choice, provider fields, key field with Key set / Replace / Remove, Test connection,
    and the timeout.
  - Messages in three languages.
  - *Done when:* component tests for each state, a test that the key never reaches the props, i18n
    parity, and an e2e (fake provider endpoint) pass; the phone sweep passes.

- [ ] **6. Documentation.** The spec's Documentation section, in ronne-web and here.
  - *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes
