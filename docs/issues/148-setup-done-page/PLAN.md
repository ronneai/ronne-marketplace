# #148 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The finished page.** `SetupPage` becomes a client component that keeps `done`;
  `SetupForm` takes an `onDone` and the wizard calls it when the root step is done. While `done`,
  the page renders no sentence under the heading and no warning. *Done when:* `setup.test.tsx`
  still shows both before the install, and `setup-wizard.e2e.ts` sees both before **Install** and
  neither after "Ronne AI Marketplace is set up", on desktop.
