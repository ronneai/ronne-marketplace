# #222 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — rmk-server on Windows

Witnessed: 2026-10-22 22:30 EDT, by a fresh agent (blind). Commit: 380e5275. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `SUPPORTED_PLATFORMS` is darwin, linux, win32; `platformRefusal` is undefined on all three | no | confirmed | `platform.ts:3`; `platform.test.ts:7-9`. Mutation that drops `win32` from `SUPPORTED_PLATFORMS` (scratch copy) → 2 more tests fail |
| 2 | On other systems the refusal names the three: "rmk-server runs on Linux, macOS and Windows." | no | confirmed | `platform.ts:8-11`; `platform.test.ts:10` checks `freebsd` against the exact string. `run.ts:83-87` refuses before anything is read or written |
| 3 | `package.json`'s `os` is `["darwin","linux","win32"]` and matches `SUPPORTED_PLATFORMS` | no | confirmed | `packages/server/package.json:51-55`. Mutation that removes `win32` from `os` → `platform.test.ts` "declares the same systems to npm" fails |
| 4 | `dataDir("win32")` is `%LOCALAPPDATA%\RonneAI\Marketplace`, else `<home>\AppData\Local\RonneAI\Marketplace`, the same as 0.3.2 | no | confirmed | `git diff e6b43434^ 380e5275 -- packages/server/src/paths.ts` → the only difference is one comment line. `paths.test.ts:29-39` covers LOCALAPPDATA, another drive, and the home fallback. Mutation that disables the win32 branch → 1 more test fails. An empty `LOCALAPPDATA` falls back too (`\|\|`) |
| 5 | `RONNE_DATA_DIR` wins on every system, win32 included; Linux (WSL 2) and macOS paths unchanged | no | confirmed | `paths.ts:7`; `paths.test.ts:7-8` loops darwin, linux and win32. The existing linux/darwin/XDG tests still pass |
| 6 | `--help` lists the Windows folder | no | confirmed | `cli.ts:171`; `cli.test.ts:181-183`. Mutation that removes the line → 1 more test fails |
| 7 | `run.ts` prints the Windows note after "Data folder: …" | no | confirmed | `run.ts:164-165`; the text is exact: `platform.ts:14`, `platform.test.ts:13-17`. Checked by reading only; nothing runs it (row 11) |
| 8 | The first start on Windows opens the browser with `cmd /c start "" <url>` | no | confirmed | `run.ts:40-47`, spawned detached with errors ignored. The URL is always `http://localhost:<port>` (`run.ts:166-167`). Checked by reading only |
| 9 | `rmk-server service <any action>` on win32 refuses in one line, exit 1, with the spec's line | no | partly | `service/index.test.ts:13-29`: install, uninstall, status and restart → exit 1, one stderr line, nothing run or written; disabling the guard → 1 more test fails. The output has the `rmk-server: ` prefix (`service/index.ts:71`); SPEC.md quoted the line without it |
| 10 | `service --help` still prints on win32; the scripts skip the service lookup and run on the data folder | no | confirmed | `service/index.test.ts:31-39`; `run.ts:114-128` goes to `scriptForService` only when there's no error, else to `defaultDataDir` |
| 11 | Done when: the tests cover each Behaviour row that runs without Windows | no | partly | The start row's note and browser command have no test: `scratchpad/222-t1-blind/mutations.sh` M5 (drop the `WINDOWS_NOTE` write) and M6 (swap `cmd /c start` for `xdg-open`) → no extra failure |
| 12 | `pnpm --filter @ronneai/marketplace test` passes | no | confirmed | 12 files, 104 tests passed; typecheck clean |
| 13 | It starts, migrates 0.3.2's data, runs the scripts and opens the browser on Windows | no | can't check here | Needs Windows (task 2's CI on `windows-latest`) |

**Overall:** not met: the refusal's wording differs from the spec's quote, the Windows note and browser command have no test, and the real Windows run can't be checked here.

Witnessed: 2026-10-22 22:40 EDT, by a fresh agent (adversarial). Commit: 380e5275. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `platformRefusal` is undefined on win32, darwin and linux; on freebsd it names the three | no | confirmed | `platform.ts:3,8-11`; mutations: dropping `win32` → +2 failing tests; the old refusal text → +1 |
| 2 | `package.json`'s `os` is darwin, linux and win32, the same as `SUPPORTED_PLATFORMS` | no | confirmed | `package.json:51-55`; removing `"win32"` from `os` → +1 failing test |
| 3 | Without `RONNE_DATA_DIR`, win32 uses 0.3.2's folder and no other | no | confirmed | `paths-compare.mjs` runs `e6b43434^`'s paths.ts against the current one: 30 win32 cases (empty, trailing `\`, `/`-style, Unicode `LOCALAPPDATA`, `XDG_DATA_HOME` or `APPDATA` set, empty or relative `RONNE_DATA_DIR`, UNC home) → 0 differences. `run.ts:130` passes `homedir()` as 0.3.2 did. Three mutations → +1 failing test each |
| 4 | `RONNE_DATA_DIR` wins on every system, win32 included | no | confirmed | `paths.ts:7`; `paths.test.ts` loops the three; empty falls through, as in 0.3.2 |
| 5 | Linux and macOS paths are unchanged | no | confirmed | Same compare against `380e5275^`: 60 linux and darwin cases → 0 differences |
| 6 | `--help` lists the Windows folder | no | confirmed | `cli.ts:171`; removing the line → +1 failing test |
| 7 | Every `service` action on win32 refuses in one line, exit 1, before running, reading or writing anything | no | confirmed | `probe-222.test.ts` runs the real `main()` with win32 stubbed and `child_process`/`fs` recorded: all actions → exit 1, the exact line, no spawn, no data read or write (only the package's `bin.js` and `package.json`) |
| 8 | `service --help` still prints on win32 | no | confirmed | Probe: `main(["service","--help"])` → 0 |
| 9 | On win32 the scripts don't look for a service and run on the data folder | no | confirmed | Probe with `reset-root-password`, `backup`, `restore`, `setup`: no spawn, no service state read; `mkdirSync C:\Users\ana\AppData\Local\RonneAI\Marketplace` |
| 10 | A start on win32 prints the note right after "Data folder: …" | no | confirmed | Probe `main(["--port","47123"])` on win32 → stdout is exactly the two lines |
| 11 | The first start opens the browser with `cmd /c start "" <url>`, and nothing a person types reaches cmd | no | confirmed | Probe → `spawn ["cmd",["/c","start","","http://localhost:47123"]]`, no shell; the URL is built from the parsed port only (`cli.ts:37-38`) |
| 12 | `cmd` is Windows' own `cmd.exe`, not one from the current folder | no | can't check here | A bare `"cmd"` may be searched in the current folder before `PATH` on Windows; `%SystemRoot%\System32\cmd.exe` would avoid it. Same code as 0.3.2 |
| 13 | The tests cover every Behaviour row that can run without Windows | no | partly | Not printing the note, dropping `""` from `cmd /c start`, or changing the note → no test fails |
| 14 | `pnpm --filter @ronneai/marketplace test` passes | no | confirmed | 12 files, 104 tests passed; typecheck clean |
| 15 | On real Windows: `npx` or a global install starts, serves 0.3.2's data, opens a browser, runs the scripts | no | can't check here | Needs Windows (task 2's CI) |

**Overall:** not met: `run.ts`'s Windows note and opener have no test, and rows 12 and 15 need Windows. Minor: `index.test.ts` covered 4 of the actions and didn't see `mkdir`.

### Re-check (blind): rows 9 and 11, and the diff

Witnessed: 2026-10-22 22:35 EDT, by a fresh agent (blind). Commit: 4fe845ca. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | The `service` refusal on Windows matches SPEC.md word for word | no | confirmed | `service/index.ts:21` plus the `rmk-server: ` prefix (`:72`) and `WINDOWS_HELP` (`platform.ts:7`) = SPEC.md lines 49–52; `index.test.ts` asserts the line for 8 actions; M9 (a "." added) → fails |
| 9b | The refusal comes before anything is run, read or written | no | confirmed | `runService` (`index.ts:69–74`) refuses before any backend call; the test checks no commands, dirs, file changes or output. `programPaths()` before it reads only the package's own `bin.js` and `package.json` |
| 11 | Done when: the tests cover each Behaviour row that runs without Windows, and the package's tests pass | no | confirmed | 12 files, 106 passed. `mutations-recheck.sh`: M5a (no note in `startLines`), M6a (bare `"cmd"`), M6b (`xdg-open`) → each fails `platform.test.ts` |
| 11b | `run.ts`'s call sites use `startLines` and `browserCommand`, and a test sees it | no | partly | `run.ts:41,158` call them, but M5b (print only `Data folder:`) and M6c (darwin/else `xdg-open`) → baseline failures only |
| 12 | The browser on Windows opens through `%SystemRoot%\System32\cmd.exe` by its full path, with `/c start "" <url>` | no | confirmed | `browserCommand`; `platform.test.ts` covers `SystemRoot=D:\WINNT`, unset, darwin, linux; M6a and M6b fail it |
| 13 | README's Windows data folder matches `paths.ts` | no | confirmed | `packages/server/README.md`; `paths.ts:13–14` |
| 14 | A real start and `service` refusal on Windows | no | can't check here | Task 2's CI on `windows-latest` |

**Overall:** not met: the `run.ts` call sites have no test (row 11b), and the run on Windows is task 2's CI.

### Re-check (adversarial): rows 9, 12, 13 and the minor finding

Witnessed: 2026-10-22 22:34 EDT, by a fresh agent (adversarial). Commit: 4fe845ca. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | The refusal matches SPEC.md word for word | no | confirmed | The SPEC.md quote and the test's string compared in the shell → `SAME`; 8 tests pass |
| 12 | The opener runs `%SystemRoot%\System32\cmd.exe` by its full path, never one from the current folder | no | confirmed | `platform.ts:27-38`, spawned with no shell. `probe-222.test.ts` with SystemRoot unset, `""`, `D:\WINNT`, `C:\Windows\`, `C:\a b&calc` → a single absolute path each. A relative `SystemRoot` (`.\x`) gives a relative path: needs someone who controls the environment; optional hardening. Bare `"cmd"` or no fallback → 3 tests fail |
| 13 | The note and `cmd /c start "" <url>` are tested, including `run.ts`'s call sites | no | partly | Mutations in `platform.ts` are caught (3 failed each). At `run.ts` they survive: a bare `cmd` at `:41`; only `Data folder:` at `:158`; `startLines("linux", dir)`. No test imports `run.ts` |
| M1 | `service/index.test.ts` covers every action and sees reads, `mkdir` and removals | no | partly | All 8 actions; a removed `.env` or a `mkdir` before the refusal → caught; `sys.readFile`/`sys.exists` before it → survives: the fake doesn't record reads (`fake-system.ts:75,79`) |
| W | `start` and the refusal on a real Windows machine | no | can't check here | `server-checks.yml` on `windows-latest` |

**Overall:** not met: no test covers `run.ts`'s call sites or a read before the refusal; the run on Windows can't be checked here.
