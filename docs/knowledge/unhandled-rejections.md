# Expect a rejection before awaiting anything else

A test that starts an operation it expects to fail, then waits for something else, has a window
in which that failure has no handler:

```ts
const releasing = publishSubmission(…);   // will reject
await moving;                             // the rejection can land while we wait here
await expect(releasing).rejects.toThrow(ScopeMovedError);
```

If `releasing` rejects before `moving` settles, Node sees a rejected promise nobody handles yet.
Vitest reports it as an unhandled error and fails the whole run, even though every test passed and
the `expect` a moment later succeeds. It happened once on MariaDB in CI
(`scope-move-requests.db.test.ts`, "refuses a release whose dependency moved between its lookup
and its locks", 2026-10-16), after passing for weeks: it depends on which of the two transactions
the database finishes first.

## What to do

- **Attach the expectation as soon as the promise exists**, and await it last:

  ```ts
  const refused = expect(releasing).rejects.toThrow(ScopeMovedError);
  await moving;
  await refused;
  ```

- Two `expect(p).rejects` in a row on the same promise are fine: the first one attaches the
  handler before anything else is awaited.
- The same goes for `Promise.all` of things that may reject at different times: use
  `Promise.allSettled`, or attach each expectation first.
