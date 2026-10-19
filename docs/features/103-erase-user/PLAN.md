# 103 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The column and the rules.** [risky] The migration adding `user.erased_at` (all
  dialects); `erased_at` in the user model and summaries; every path that must refuse an erased
  account: sign-in by password, 106's link, the token exchange, enable, disable, reset password,
  reset two-factor, SCIM adopt, create and patch (108's conditions), `reset-root-password` and
  `reset-two-factor`; `keepAnActiveRoot` (059) counts only non-erased roots.
  *Done when:* db tests cover each refusal with its message and that nothing changed; the SCIM
  tests of 108 pass with an erased account seeded; `pnpm test:db` passes on the servers.

- [ ] **2. The erase service.** [risky] `identity/services/erase-user.ts`: the transaction from the
  spec's table (the lock, the counts, the personal workspace rule, the SCIM rows, the drafts and
  their files, the memberships, requests and moves, the IPs), the `user.erased` event and its
  sentence; the metadata rewrite (`audit/repositories`: find by target id and by the JSON value
  `LIKE`, rewrite in batches of 500), inside the transaction on PostgreSQL and SQLite, after it on
  MySQL and MariaDB, with the "not completed" state and its retry; the retention job (102) finishes
  an incomplete rewrite.
  *Done when:* a db test seeds a person with every kind of row the table names (two of each where
  there can be two), erases them, and checks each row's fate, on SQLite and the three servers; the
  email is free for a new account; a second erase is refused; self and the last root are refused;
  a `user.created` for another address containing the erased one as a substring is untouched; on
  MySQL an interrupted rewrite (a fake that throws after one batch) is finished by the retry and by
  the job.

- [ ] **3. The action and the dialog.** The server action (`users.manage`, the wrapper of 100), the
  Erase row action and the link beside *Deprovisioned by* (108's test that it's absent flips), the
  dialog with the typed email, the Erased badge, the greyed download (104's place, "erased" until
  104 lands), the helper `erase-user`, the pseudonym everywhere a name is shown (audit page, item
  page, review thread, members list, API bodies: check each reads `user.name`, never a cached
  value).
  *Done when:* component tests cover the dialog's states and the badge; an e2e test erases a user
  who published an item and commented on a review, then sees the pseudonym on the item page, the
  review and the audit page, and signs in with the old email into a new, empty account; the phone
  sweep passes.

- [ ] **4. Documentation.** In `../ronne-web`: **Erase an account** in Privacy (both `topics.ts`),
  the Users, SCIM and Backups lines, in English, Portuguese and French; here, the `erase-user`
  helper and this feature's index row set to done.
  *Done when:* the docs render tests pass in both repositories; `pnpm witness:check` passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 1.** `erased_at` is a plain nullable timestamp (migration `0030_erased_at`), typed
  `Timestamp | null` in the schema so inserts may leave it out (`Generated<…>` would nest the
  column type, as `two_factor_enabled`'s comment says). The refusals: `loadTarget` in
  `services/user-admin.ts` (every root admin change), `typedEmail` in `services/root-account.ts`
  and `chooseRoot` in `setup/reset-root.ts` (the two commands), `findActiveUser` and
  `countActiveRoots` and `listRoots` in the Kysely identity repository (sessions, Better Auth's
  sign-in hook, 059's count, and `reset-root-password` without `--email`, which the adversarial
  pass found could reach an erased row that still said root), `findCredentialByEmail`'s `erasedAt`
  (the token exchange), the token repository's `erasedAt` (a bearer token that survived),
  `planSsoSignIn` (106), and
  `load`, `render`, `listScimUsers` and the adoption and tombstone conditions in
  `services/scim-users.ts` (108). Until task 2's service exists, tests seed an erased account with
  `testing/erased-user.ts`, which writes the row as erasing will leave it (and, for the rows no
  erasure leaves, a real email, a root role or `disabled: false`, to show the flag alone refuses:
  with the row also disabled, a test can't tell the two checks apart). The SCIM users API test
  seeds one in every test.
