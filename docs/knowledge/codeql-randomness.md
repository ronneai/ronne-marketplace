# Random values that look like secrets

CodeQL's `js/insecure-randomness` (high) fails a pull request when a `Math.random()` value reaches
something it reads as a secret: a password, a key, a token, or a helper that handles one. It follows
the value through function arguments, so the alert can land in a file the pull request didn't
change. On #259 it pointed at `apps/web/e2e/secrets.ts` (`recordSecret`), and the value came from a
fake API key built with `Math.random()` in a new end-to-end test.

- **Make anything secret-shaped with `node:crypto`**, in tests too: `randomBytes(12).toString("hex")`
  or `randomUUID()`. It costs nothing, and the value is then one CodeQL trusts.
- Keep `Math.random()` for what is plainly not a secret (jitter, a shuffled order), and never let
  it into a name such as `key`, `token`, `password` or `secret`.
- When the alert's file wasn't changed, look for where its value comes from: `gh api
  "repos/<owner>/<repo>/code-scanning/alerts?pr=<n>"` names the sink, and a search for
  `Math.random` in the changed files finds the source.
