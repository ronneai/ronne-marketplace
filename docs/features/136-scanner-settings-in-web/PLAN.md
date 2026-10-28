# 136 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §15's "Security scan" row and 135's decisions 3 and 5 updated to point at 136.
  - `docs/features/README.md` lists 136 in M20.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [x] **2. Encryption for instance secrets.** [risky]
  - Generalise `provider-secrets.ts` into a helper for any instance secret (its own HKDF `info`,
    the associated data), keeping identity providers' format and tests unchanged.
  - `rotate-secret` re-encrypts the scan key too.
  - *Done when:* unit tests cover round trip, the associated data (a value copied to another setting
    doesn't decrypt), another `AUTH_SECRET`, and damaged values; the rotate-secret db test covers
    the scan key on the four databases.

- [x] **3. Endpoint checks.** [risky]
  - `https://` only.
  - Resolve the host and refuse private, loopback, link-local and metadata addresses (IPv4 and
    IPv6, mapped addresses included) unless allowed by `RONNE_SKILL_SCANNER_HTTP_HOSTS`.
  - Used on save and at scan time (wired in task 4, where the save and the job's provider are built).
  - *Done when:* unit tests with a fake resolver cover each address class, a hostname that resolves
    to a private address, userinfo and odd URL forms.

- [x] **4. Settings service and the scan job.** [risky]
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

- **For task 4 (from task 2's adversarial pass):** `rotate-secret` reads the `_enc` settings without
  a lock, as it does identity providers' secrets. A key saved in the web while it runs could be
  overwritten by the old key, re-sealed. The save path should make this impossible or harmless
  (lock the row, or compare before writing).
- `open` accepts only strict base64url parts: Node.js's decoder would skip stray characters.
- **For task 4 (from task 3's passes):**
  - store and pass `checkEndpoint`'s `url.href`, never the typed value, with a test;
  - Test connection (built in task 5) connects only to the addresses the check resolved (a
    `lookup` that returns them) and follows no redirects;
  - an allowed host is allowed on any port, and an entry with a port, a scheme or a wildcard never
    matches: the install guide and knowledge note say entries are bare host names or addresses.
- **From task 4's passes:** the key is sealed with the provider and the endpoint's origin it was
  typed for, and opens only for that pair, so two saves at once (or a hand edit) can't send it to
  another provider or host; `rotate-secret`'s compare-and-set is exact on MySQL and MariaDB
  (`db/exact.ts`, whose collation ignores case); queuing and the review page read the command
  only, never opening the key.
- **Remarks from task 4's last adversarial pass (harmless, for task 5 or later):** the timeout
  field accepts forms such as `1e2` or `0x40`, as `Number()` reads them (the tab can send digits
  only); the job passes the stored endpoint, already checked, where passing `checked.url.href`
  would keep the parser guard even if `AMBIGUOUS` were loosened.
