# #147 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The command

Witnessed: 2026-10-09 00:11 EDT, by a fresh agent (blind). Commit: d86fbc4. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: runtime.ts, runtime.test.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `hostCommand(name, env)` exists in `server/runtime.ts` and is exported | yes | confirmed | `apps/web/src/server/runtime.ts:40` `export const hostCommand = (name: string, env: Env = process.env)` |
| 2 | npm → `rmk-server <name>` | yes | confirmed | `runtime.ts:43`; test asserts `"rmk-server reset-root-password"`; mutating it to `` `rmk-server` `` in a scratchpad copy → 2 failed / 4 passed |
| 3 | docker → `docker compose exec web pnpm run <name>` | yes | confirmed | `runtime.ts:42`; hardcoding `setup` instead of `${name}` in a scratchpad copy → the #147 test fails (1 failed / 5 passed) |
| 4 | node (a clone) → `pnpm run <name>` | yes | confirmed | `runtime.ts:44`; mutating the clone string in a scratchpad copy → 2 failed |
| 5 | An unknown or missing RONNE_RUNTIME counts as a clone | no | confirmed | `runtimeOf` at `runtime.ts:11-12` (anything other than docker or npm is `node`); the test covers `{}` and `RONNE_RUNTIME: "other"` → `pnpm run reset-root-password` |
| 6 | `runtime.test.ts` covers all three runtimes for `hostCommand` | yes | confirmed | `runtime.test.ts:43-54` asserts npm, docker, missing and unknown; `npx vitest run src/server/runtime.test.ts` → 6 passed |
| 7 | `setupCommand` becomes `hostCommand("setup")` | yes | confirmed | `runtime.ts:48` `setupCommand = (env…) => hostCommand("setup", env)` |
| 8 | `setupCommand`'s tests still pass, unchanged | yes | confirmed | `git diff HEAD -- runtime.test.ts` → only additions, no lines removed; the "names the setup command for each runtime" test passes (6/6) |
| 9 | `scriptCommand` is unchanged | no | confirmed | `git diff HEAD -- runtime.ts` shows `scriptCommand` only as a context line; `runtime.ts:32-33` still maps npm to `rmk-server`, otherwise `pnpm run` |
| 10 | The changed files lint and type-check | no | confirmed | `npx biome check` on both files → "Checked 2 files… No fixes applied"; `tsc --noEmit -p apps/web` → exit 0 |

**Overall:** met: `hostCommand` gives the right command for npm, Docker and a clone (an unknown or missing runtime counts as a clone), `setupCommand` now calls it, `scriptCommand` and the setup tests are unchanged, and mutation probes show the new test catches wrong output.

## Task 2 — The note

Witnessed: 2026-10-09 00:19 EDT, by a fresh agent (blind). Commit: ffb67ab. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: page.tsx, ForgotPassword.tsx, SignInForm.tsx, SignInPage.tsx, sign-in.test.tsx, auth.e2e.ts, smoke.mobile.e2e.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The sign-in route works out the command on the server and passes it as a plain string through `SignInPage` and `SignInForm` to `ForgotPassword` | yes | confirmed | `app/sign-in/page.tsx` (server component) passes `resetCommand={hostCommand("reset-root-password")}`; `SignInPage.tsx` and `SignInForm.tsx` pass the `resetCommand: string` prop to `<ForgotPassword resetCommand={resetCommand} />`. `pnpm --filter @ronneai/web build` succeeded; typecheck and `biome check` clean |
| 2 | npm runtime: the note says `rmk-server reset-root-password` | yes | confirmed | Unit test "ForgotPassword (#147)" covers `npm`. Scratch Playwright probe on the built server with `RONNE_RUNTIME=npm` → `details code` reads `rmk-server reset-root-password` on Pixel 7, iPhone 15, iPhone SE and desktop without JavaScript |
| 3 | Docker runtime: the note says `docker compose exec web pnpm run reset-root-password` | yes | confirmed | The unit test covers `docker`. The same probe with `RONNE_RUNTIME=docker` → exact text on all 4 projects, read at request time |
| 4 | Clone, or an unknown or missing `RONNE_RUNTIME`: the note says `pnpm run reset-root-password` | yes | confirmed | The unit test covers `undefined`. Probe with `RONNE_RUNTIME=bogus` → `pnpm run reset-root-password`; the e2e run had it unset → clone text; `runtimeOf` (`runtime.ts:11-12`) falls back to `node` |
| 5 | Only one command is shown, never another install's | yes | confirmed | The unit test checks `reset-root-password` appears exactly once in the static HTML per runtime; the e2e checks 0 `rmk-server` text on the clone |
| 6 | The note links to Root accounts, `install#root` on the website | yes | confirmed | `ForgotPassword.tsx`: `NewTabLink` with `href={docsHref("install","root")}`; the probe saw `https://www.ronne.ai/marketplace/docs/install#root` on every runtime and project; `topics.ts:28` has `{ id: "root", title: "Root accounts" }` |
| 7 | `sign-in.test.tsx` covers the three commands and the link | yes | confirmed | `vitest run src/features/sign-in src/server/runtime` → 15 passed. Scratch mutations: hardcoded clone command → 2 failed; link text renamed → 3 failed; `#root` dropped → 3 failed |
| 8 | `auth.e2e.ts` opens Forgot? and sees `pnpm run reset-root-password` and the link on desktop | yes | confirmed | `playwright test e2e/auth.e2e.ts e2e/smoke.mobile.e2e.ts` on a fresh `next build` → `[chromium] auth.e2e.ts:31` passed (command, 0 `rmk-server`, the link's href) |
| 9 | The same on phone (the phone projects only run `*.mobile.e2e.ts`) | yes | confirmed | Same run: `smoke.mobile.e2e.ts:19` passed on phone, phone-webkit and tablet; second run 12/12. A first-run ENOENT on a Playwright trace file in an existing test (`:5`, phone-webkit) didn't recur |
| 10 | Still a native `<details>`, works without JavaScript | no | confirmed | `ForgotPassword.tsx` is still `<details>`/`<summary>`; the probe's no-JS project clicked Forgot? and saw the command and the link, for all three runtimes |
| 11 | The note, with its command, fits a phone without scrolling sideways; a long Docker command wraps | yes | confirmed | Probe with `RONNE_RUNTIME=docker`: the `code` box is two lines and `scrollWidth == innerWidth` on Pixel 7 (412), iPhone 15 (393) and iPhone SE (320); the `code` has `break-words`. The committed phone test exercises only the clone command |

**Overall:** met: every claim is confirmed. Test gaps, not bugs: no committed test runs the route with `RONNE_RUNTIME` set (a hardcoded command in `page.tsx` would pass every test), and none covers the Docker command wrapping on a phone; the probe covers both.

Witnessed: 2026-10-09 00:26 EDT, by a fresh agent (adversarial). Commit: ffb67ab. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: page.tsx, ForgotPassword.tsx, SignInForm.tsx, SignInPage.tsx, sign-in.test.tsx, auth.e2e.ts, smoke.mobile.e2e.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The sign-in route works out the command on the server (`hostCommand("reset-root-password")`) and passes a plain string through SignInPage and SignInForm to ForgotPassword | yes | confirmed | `app/sign-in/page.tsx:31` `resetCommand={hostCommand("reset-root-password")}`; `SignInPage.tsx` → `SignInForm` → `<ForgotPassword resetCommand={resetCommand} />` (`SignInForm.tsx:47`); typed `string` at each level |
| 2 | Nothing server-only (runtime.ts, `node:path`, RONNE_RUNTIME) leaks into the client bundle | no | confirmed | `grep -rlE 'docker compose exec web\|RONNE_RUNTIME\|node:path' apps/web/.next/static` → 0 files (build newer than the sources); `hostCommand` is imported only by the server page |
| 3 | The real built page shows the right command per runtime, chosen at request time and not frozen at build | no | confirmed | Probe: `next start` on the build with a fresh instance, restarted per RONNE_RUNTIME: `npm` → `rmk-server reset-root-password`, `docker` → `docker compose exec web pnpm run reset-root-password`. `/sign-in` isn't in the prerender manifest; `cache-control: private, no-cache, no-store` |
| 4 | An unknown or missing RONNE_RUNTIME shows the clone text | no | confirmed | The same probe with `RONNE_RUNTIME=bogus` and `""` → `pnpm run reset-root-password`; the unit test covers `undefined` |
| 5 | The note links "Root accounts" to `install#root` on the website and opens it as the inline helpers do | yes | confirmed | `NewTabLink href={docsHref("install","root")}`; built page → `href="https://www.ronne.ai/marketplace/docs/install#root"`, `target="_blank"` |
| 6 | Still a native `<details>`, which works without JavaScript | no | confirmed | Chromium with `javaScriptEnabled:false` (docker runtime): the code is hidden before the click and visible after clicking Forgot?, with the link. No test pins `<details>`: a `<div>` in a scratch copy keeps 9/9 green |
| 7 | A long Docker command wraps on a phone instead of widening the page | yes | confirmed | Probe at 280, 320 and 360 px in Chromium (mobile) and WebKit, docker runtime: `scrollWidth == innerWidth` every time; the code spans 4, 3 and 2 lines (`docker-chromium-280.png`) |
| 8 | `sign-in.test.tsx` covers the three commands and the link | yes | confirmed | `vitest run src/features/sign-in` → 9 passed. Scratch mutations: hardcoded clone command → 2 failed; link removed → 3 failed; no `#root` → 3 failed; SignInForm passing a fixed string → 2 failed |
| 9 | `auth.e2e.ts` opens Forgot? and sees `pnpm run reset-root-password` and the link on desktop; the same on phone | yes | confirmed | `playwright test e2e/auth.e2e.ts e2e/smoke.mobile.e2e.ts` → 12 passed, including `[chromium] auth.e2e.ts:31` and `opens the Forgot? note on a touch screen` on phone, phone-webkit and tablet |
| 10 | The changed files lint and type-check | no | confirmed | `biome check` on the 9 files → no fixes; `tsc --noEmit -p apps/web` → exit 0 |
| 11 | The note names one command, never another install's | yes | confirmed | The unit test asserts one `reset-root-password` per runtime; the built-page probe found exactly one `<code>` with it per runtime; the e2e asserts no `rmk-server` on the clone |
| 12 | On a touch screen, the Forgot? note and its command fit without scrolling sideways | yes | confirmed | `smoke.mobile.e2e.ts:19` asserts `scrollWidth <= innerWidth` after tapping Forgot? → passed on phone, phone-webkit and tablet; row 7's probe shows the same for the Docker command |

**Overall:** met: the built page names the right command for npm, Docker and a clone (and an unknown or missing runtime) per request, the link goes to `install#root`, the `<details>` works without JavaScript, the Docker command wraps at 280–360 px, nothing server-only reaches the client bundle, and every claim in the notes holds. Coverage gaps, not bugs: nothing pins `<details>`, and nothing tests the route's wiring for non-clone runtimes or the Docker command on a phone.

### Re-check — the route and <details> tests

Witnessed: 2026-10-09 00:26 EDT, by a fresh agent (blind). Commit: ffb67ab. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: as above, plus the new `app/sign-in/page.test.tsx`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | A test renders the real `/sign-in` route with RONNE_RUNTIME set to `npm`, `docker` and `""`, and expects `rmk-server reset-root-password`, `docker compose exec web pnpm run reset-root-password` and `pnpm run reset-root-password` | no | confirmed | `page.test.tsx:9` imports `./page`; only config, session, headers and actions are mocked, not `runtime`; `vi.stubEnv("RONNE_RUNTIME", …)` per row. `vitest run src/app/sign-in/page.test.tsx src/features/sign-in/sign-in.test.tsx` → 2 files, 13 passed |
| 13 | That test fails if the route hardcodes `"pnpm run reset-root-password"` | no | confirmed | Scratch copy with the hardcoded string → 2 failed (npm, docker), 1 passed; baseline 3 passed |
| 14 | That test fails if the route uses `scriptCommand` instead of `hostCommand` | no | confirmed | Copy with `scriptCommand("reset-root-password")` → 1 failed (docker), 2 passed |
| 15 | That test fails if the route stops reading the runtime in other ways | no | confirmed | Copy with `hostCommand("reset-root-password", {})` → 2 failed; copy computing it once at module load → 2 failed |
| 16 | A test pins the Forgot? note as a native `<details>` with `<summary>Forgot?</summary>` | no | confirmed | `sign-in.test.tsx` "is a native <details>, so it opens without JavaScript": `toMatch(/<details[^>]*><summary[^>]*>Forgot\?<\/summary>/)`; `ForgotPassword.tsx:11-26` |
| 17 | That test fails if the note becomes a `<div>` | no | confirmed | Copy with `<details>` → `<div>` → 1 failed, 9 passed; with `<summary>` → `<span>` too → the same test fails |

**Overall:** met: the route test reads RONNE_RUNTIME through the real page and catches a hardcoded command, `scriptCommand` and a fixed env; the `<details>` test catches a switch to `<div>`. The Docker command on a phone stays covered by the probes only (rows 11 and 7 above).
