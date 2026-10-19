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

- [x] **2. The erase service.** [risky] `identity/services/erase-user.ts`: the transaction from the
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

- [x] **3. The action and the dialog.** The server action (`users.manage`, the wrapper of 100), the
  Erase row action and the link beside *Deprovisioned by* (108's test that it's absent flips), the
  dialog with the typed email, the Erased badge, the greyed download (104's place, "erased" until
  104 lands), the helper `erase-user`, the pseudonym everywhere a name is shown (audit page, item
  page, review thread, members list, API bodies: check each reads `user.name`, never a cached
  value).
  *Done when:* component tests cover the dialog's states and the badge; an e2e test erases a user
  who published an item and commented on a review, then sees the pseudonym on the item page, the
  review and the audit page, and signs in with the old email into a new, empty account; the phone
  sweep passes.

- [x] **4. Documentation.** In `../ronne-web`: **Erase an account** in Privacy (both `topics.ts`),
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
- **Task 2.** The service is `identity/services/erase-user.ts` over `repositories/erase-repository.ts`
  (Kysely in `kysely-erase-repository.ts`), which carries the identity and workspace repositories
  bound to the same transaction, as the SCIM one does. The only updates of `audit_log` are in
  `audit/repositories/kysely-audit-rewrite.ts` (the guard test's second allowlist entry): the IP
  clearing by actor or target, and the email rewrite, a keyset walk over the rows a LIKE for the
  JSON string value `"<address>"` or the target id finds, every string value equal to the address
  (any case: MySQL's LIKE ignores it) replaced at any depth. The LIKE needs `ESCAPE '!'` in the
  query, not only `escapeLike` on the needle: without it an address with `_` was never found (the
  blind pass caught it; `containsInsensitive` in `db/search.ts` is the model, and `LIKE_ESCAPE` is
  now shared). The MySQL path keeps its state in
  `user_erasures` (migration 0031): the row's `events_rewritten` grows page by page, so an
  interrupted attempt's count isn't lost, and `deleteErasure` returns it for the event. 113's rename
  body moved to `renameLockedWorkspace` in the workspaces service so the personal workspace's
  rename is the real one (aliases, open drafts rewritten, the event). Tests force the after-commit
  path with `rewriteAfterCommit: true` and a repository whose rewrite fails after one page, so the
  interrupted state is tested on every dialect, not only MySQL. The "last enabled root" refusal
  is unreachable in practice (the actor is an enabled root and can't erase themself), so the check
  after the role change is belt and braces; the test covers self, another root, and a non-root.
  The adversarial pass found that root's own draft in a person's otherwise empty personal
  workspace made the erase fail on the scope's foreign key: any submission left there now counts
  as the record (the workspace is renamed, the draft kept). On PostgreSQL the LIKE is
  case-sensitive, so a metadata value in another case than the stored address is found only by
  the target id; every writer lowercases, so nothing real is missed.
- **Task 3.** The typed email is checked twice: the dialog enables Erase only when it matches
  (any case, trimmed), and `eraseUser` compares it with the locked row (`EraseConfirmationError`),
  so the server action can't be replayed against another id. `EraseUserButton` owns its dialog and
  is rendered twice: in the row's actions and, as a link, beside *Deprovisioned by* (the page
  passes it through `UsersPage`'s `erase` prop, so the component test can pass its own). The
  Status filter got `erased`; `disabled` now means disabled and not erased. The API's item and
  version bodies name no publisher, so the spec no longer says they do. The e2e flow lives in
  `user-admin.e2e.ts` (root's sign-ins are limited, `docs/knowledge/e2e-sign-in-limit.md`), on a
  seeded user with a released rule and a review comment (`E2E_ERASE`, a fixed submission id so the
  test can open its review). The erase action doesn't revalidate the list: with a search by the
  old email, the row (and the dialog inside it) vanished before root could read "Erased.", so the
  dialog shows the outcome and refreshes the page on Done (`router.refresh()`).

