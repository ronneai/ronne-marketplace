# 049 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. `<LocalTime>`.** The client component and its three precisions, UTC on the server and
  in `title`, local after hydration.
  *Done when:* a component test renders the server form, and a test with a fixed time zone renders
  the local forms (minute, second, day across midnight).

- [ ] **2. Every timestamp.** The call sites in Scope, including the joined lines; `utcMinute` and
  the pages' own `day()` helpers go.
  *Done when:* the page tests still pass with the UTC text in server HTML, and no `utcMinute`,
  `toISOString().slice` or `slice(0, 10)` date formatting is left in `app/`, `features/` or
  `components/`, except usage days.

- [ ] **3. Documentation and an end-to-end check.** The `overview` sentence; an end-to-end test with
  a `timezoneId` other than UTC reads local times on an item page and in the audit log.
  *Done when:* the docs render tests pass, and the end-to-end test passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
