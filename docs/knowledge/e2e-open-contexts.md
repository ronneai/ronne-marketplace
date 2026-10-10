# End-to-end tests and contexts left open

Playwright closes the `page` a test gets, but **not a context the test opens itself**
(`browser.newContext()`), nor a `request.newContext()`. The run has one worker, so each project's
tests share one browser until a test fails, and every context left open keeps running in it, with
its page and its timers.

Chromium copes. WebKit (the `phone-webkit` project, which runs last) slows down as they pile up.
Before this was fixed, in a full run a 2-second phone test took 55 seconds and the next one timed
out, while each passed alone. A failure restarts the worker, so the tests after it were fast again,
and whichever test happened to be slow at the time failed. It looked like a flaky test.

## What to do

- **Close what you open**, at the end of the test: `await moderator.context().close()` for a page
  from `(await browser.newContext(…)).newPage()`, and `await api.dispose()` for a request context.
  The phone tests (`*.mobile.e2e.ts`) all do. Several desktop tests still don't; Chromium hasn't
  minded so far, but close them when you touch them.
- **Don't fix it with `test.slow()`** or a longer timeout: it hides the leak, and the next test
  pays for it.

## How to spot it

`phone-webkit` tests get slower one after another in the run's list (the times in brackets), and the
one that fails is a long one late in the project, at a plain click or `goto`. The server is fast: in
the failed test's trace (`test-results/…/trace.zip`, the `*-trace.network` files), responses take
milliseconds. The trace also lists the pages of earlier tests, still open.
