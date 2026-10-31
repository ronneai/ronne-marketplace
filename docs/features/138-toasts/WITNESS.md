# 138 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-10-30, by a fresh agent (blind). Commit: 1905ece7. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 has a row for the toasts decision | no | partly | `grep -n -i toast docs/MVP/MVP.md` → row at line 1009 in "## 15. Decision log", but named "Action feedback", not "Toasts" as SPEC.md:3 says |
| 2 | The MVP row says what SPEC.md says | no | confirmed | MVP.md:1009 → placement, announcement, errors persist, Sonner unstyled behind a `components/ui` wrapper, inline notices stay; "bottom centre" is looser than the spec's "across the bottom" |
| 3 | README lists 138 in M21 with its dependencies | no | confirmed | `docs/features/README.md:391` → depends on 032, 065, 067, 129, same as SPEC.md:3 |
| 4 | The README row says what SPEC says | no | confirmed | README:391 → Sonner unstyled with fallback, placement, durations, live regions, `flashToast` cookie with a key, inline field errors and one-time secrets |
| 5 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check` → exit 0 |

**Overall:** not met: the MVP.md §15 row is named "Action feedback", not "Toasts".

### Re-check

Witnessed: 2026-10-30 22:40 EDT, by a fresh agent (blind, re-check of claim 1 and the wording). Commit: 1905ece7 plus the uncommitted diff of docs/MVP/MVP.md line 1009. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 has a "Toasts" row, and README lists 138 in M21 with its dependencies; both say what the SPEC says | no | confirmed | `grep -n Toasts docs/MVP/MVP.md` → line 1009 `\| Toasts \| … across the bottom above the bottom bars on a phone …`; README.md:391 lists 138 with `032, 065, 067, 129`; SPEC.md:3 refers to MVP §15 ("Toasts") |
| 2 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check` → no errors |

**Overall:** met: the §15 row is now "Toasts" with "across the bottom", and the README and witness check agree with the SPEC.

## Task 2 — Sonner checked, the toast region and `useToast`

Witnessed: 2026-10-30 22:55, by a fresh agent (blind). Commit: d150ec68 plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Sonner is the latest stable and passes the dependency checklist | no | confirmed | `npm view sonner` → 2.0.8, MIT, published 2026-08-09; no install scripts; `pnpm audit --audit-level high` → none high; `pnpm licenses:check` → 353 packages allowed |
| 2 | happy-dom (new dev dependency) is acceptable | no | confirmed | 21.0.4, latest, MIT, 10 days old, no install scripts; licence check passes |
| 3 | Every label Sonner shows can come from our messages | no | confirmed | `Toaster.tsx` `customAriaLabel={t("region")}`; `ToastCard` draws its own close button with `t("close")`; en, pt, fr `common.json` have `toast` keys |
| 4 | Sonner can sit above `--bottom-bar-height` | no | can't check here | `grep bottom-bar-height apps/web/src` → no match; `BottomBar` does not publish it yet |
| 5 | The region is in the root layout, so every page has it | no | confirmed | `layout.tsx` renders `<Toaster />` inside `NextIntlClientProvider` |
| 6 | ok and info last 5 s; warning and error stay until closed | no | confirmed | `TOAST_DURATION` 5000/5000/Infinity/Infinity; tests pass; `ok: 9000` mutation failed 5 tests |
| 7 | Pause on hover, focus and a hidden tab | no | confirmed | three tests pass; removing the `focusin` listener failed the focus test |
| 8 | At most three; the fourth pushes out the oldest that isn't an error | no | confirmed | test passes; limit `>= 99` mutation failed it |
| 9 | The same message twice is one toast, timer restarted | no | confirmed | test passes; random id mutation failed it |
| 10 | The close button is labelled and works | no | confirmed | test finds `aria-label="Close notification"`; click removes only that toast |
| 11 | status/alert roles and the OK:/INFO:/WARN:/ERR: prefixes | no | confirmed | test passes; warning role `status` mutation failed it |
| 12 | A test finds the `status` and `alert` regions while idle | no | not met | idle DOM has one empty polite `<section>` and no `role=alert`; Sonner has a single live region |
| 13 | No shadow | no | partly | Sonner's shadow rules sit under `data-styled=true`; no test or computed-style check |
| 14 | Reduced motion | no | partly | Sonner's own CSS turns transitions off under `prefers-reduced-motion`; no test (browser check left to the e2e task) |
| 15 | A lint rule allows `sonner` imports only in the wrapper | no | confirmed | `import { toast } from "sonner"` in another file → `biome lint` 1 error, "import is restricted" |
| 16 | Lint and typecheck pass | no | confirmed | `biome check` 0 errors on the touched files; `tsc --noEmit` clean |
| 17 | Unit tests with fake timers cover lifetimes, pauses, limit and repeat | no | confirmed | `vitest run toast.test.tsx` → 9 passed; five mutations each failed a test |

**Overall:** not met: row 12 (no idle `alert` region).

### Re-check

Witnessed: 2026-10-30 22:55, by a fresh agent (blind, re-check). Commit: d150ec68 plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | The always-present polite region is in the page while idle and the boxes carry `status` and `alert` (changed Done when, SPEC Decision 6) | no | confirmed | SPEC.md Accessibility bullets and Decision 6; `toast.test.tsx` idle test finds `section[aria-live=polite]` named "Notifications" and the roles test passes |
| 4 | A toast can sit above `--bottom-bar-height` | no | partly | `Toaster.tsx` offsets use `var(--bottom-bar-height, 0px)`; the test reads the style string only |
| 13 | No shadow | no | partly | `toast.test.tsx` asserts `data-styled="false"`; either `custom` or `unstyled` alone gives it |
| – | The test file passes; lint and typecheck pass | no | confirmed | 11 passed; `biome check` clean; typecheck no errors |

**Overall:** not met: rows 4 and 13 are partly.

### Re-check 2

Witnessed: 2026-10-30 22:55, by a fresh agent (re-check of rows 4 and 13, with mutations). Commit: d150ec68 plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | No shadow: Sonner's styling is off, and the test fails without that | no | confirmed | `vitest run toast.test.tsx` → 11 passed; `toastOptions={{}}` and `sonner.success` instead of `sonner.custom` together → the "unstyled" test fails; each alone still passes, as either is enough to switch Sonner's styling off |
| 4 | The offset reads `--bottom-bar-height` and a test sees it in the region's style (scoped by PLAN.md task 2: the box above a real bar is task 3) | no | confirmed | removing `var(--bottom-bar-height…)` from `ABOVE_BAR` → exactly that test fails; restored → 11 pass |

**Overall:** met: rows 4 and 13 are confirmed within the scope PLAN.md states; row 14 (reduced motion) rests on Sonner's own CSS and its browser check is task 3's and the e2e task's.
