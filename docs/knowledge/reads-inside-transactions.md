# Reads inside a transaction

**The rule:** inside `repo.transaction(async (trx) => …)`, read only through `trx`. Read anything
else you need before the transaction starts, and pass it in.

**Why:** SQLite, Ronne's default database, has one connection. While a transaction holds it, a
query on the outer `db` waits for that connection, and the transaction waits for the query: it
never finishes. PostgreSQL and MySQL have a pool, so the same code works there, on another
connection outside the transaction. That makes it the one database where the mistake shows, and
then only as a timeout.

**What it looks like:** every test in a database test file fails with `Test timed out in 30000ms`,
not with an error. In 190, the sign-up service rendered its email inside the transaction and read
the instance contact through `deps.mail()`, which used the outer `db`. All 13 tests timed out.
Reading it before the transaction fixed them all (`identity/services/sign-up.ts`, `sender`).

**How to apply:**

- A service's dependency that reads settings (a `() => Promise<…>` in its deps) is called before
  `transaction`, never inside it.
- Inside, use only the repository the transaction hands you (`trx` or `repo`).
- When a whole database test file times out on SQLite but passes on the servers, look for a read
  on the outer `db` inside a transaction first.
