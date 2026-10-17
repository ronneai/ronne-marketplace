# Text comparison in MySQL and MariaDB

MySQL's and MariaDB's default collation (`utf8mb4_0900_ai_ci`, `utf8mb4_general_ci`) compares text
**without case and without accents**: `WHERE email = 'kate@acme.com'` also finds `Kåte@acme.com`,
and `ß` can equal `ss`. SQLite and PostgreSQL compare byte for byte. Tests on SQLite don't show it;
the database servers do (`pnpm test:db:mysql`, `:mariadb`).

When the match decides **who someone is** or **what they may reach**, compare again in JavaScript
after the query, and treat a row the database matched but JavaScript didn't as no match, or as a
refusal:

- Identity provider sign-in (106): a found account whose stored email isn't exactly the provider's
  is refused (`services/sso-sign-in.ts`), so a provider's `kate@` can't take over `kåte@`.
- Account subjects (`account.account_id`, `text`) are compared in JavaScript
  (`repositories/kysely-sso-repository.ts`).
- The reserved address of 106's timing rule (`refused@sign-in.invalid`): no account may have a
  `.invalid` address, but a look-alike can still match it on these databases, so a session opened
  for it is ended at once (`services/session.ts`).
- Ids that are lowercase by rule (provider ids) can't collide this way.

Where byte-for-byte matching must hold in the database itself (file paths, group names), use the
`exactString` column type (`db/column-types.ts`), which is `utf8mb4_bin` on MySQL.
