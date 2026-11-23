# 049 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. `<LocalTime>`.** The client component and its three precisions, UTC on the server and
  in `title`, local after hydration.
  *Done when:* a component test renders the server form, and a test with a fixed time zone renders
  the local forms (minute, second, day across midnight).

- [x] **2. Every timestamp.** The call sites in Scope, including the joined lines; `utcMinute` and
  the pages' own `day()` helpers go.
  *Done when:* the page tests still pass with the UTC text in server HTML, and no `utcMinute`,
  `toISOString().slice` or `slice(0, 10)` date formatting is left in `app/`, `features/` or
  `components/`, except usage days.

- [x] **3. Documentation and an end-to-end check.** The `overview` sentence; an end-to-end test with
  a `timezoneId` other than UTC reads local times on an item page and in the audit log.
  *Done when:* the docs render tests pass, and the end-to-end test passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 2.** `components/ui/time.ts` (`utcMinute`) and the audit log's `formatUtc` are gone; the
  pages' own `day()` helpers too. Page tests that matched a whole sentence with a date in it now
  compare the page's text (tags stripped), since the date is a `<time>` element.
- **Task 3.** The end-to-end check lives in `audit.e2e.ts`'s root test (root's sign-ins are limited,
  `docs/knowledge/e2e-sign-in-limit.md`), with `timezoneId: "America/Sao_Paulo"` for the file. The
  server renders UTC, so seeing `GMT-3` proves the browser converted it.
- **CI after the pull request.** Two of my tests failed there, not locally:
  - A time zone's short name comes from Node's ICU data, which differs by build: Lisbon in winter is
    `GMT` on macOS and `GMT+0` on the Ubuntu runners. The test accepts both; the time is what it
    checks. The other names in the tests (`GMT-3`, `GMT+9`, `UTC`) agree everywhere.
  - CodeQL flagged a tag-stripping test helper as incomplete sanitization (high), three times; the
    tests now match the HTML with its `<time>` element instead (`docs/knowledge/codeql-regex.md`).
