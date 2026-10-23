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

### Re-check 2 (blind): row 11b, and the diff

Witnessed: 2026-10-22 22:39 EDT, by a fresh agent (blind). Commit: 60252ed3. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 11b | A test sees `run.ts`'s call sites of `startLines` and `browserCommand` | no | confirmed | `mutations-recheck2.sh` M5b (the old `Data folder:` line) and M6c (the old open/xdg-open choice) → `run.test.ts` fails |
| 11c | The test sees that `run.ts` passes `process.env` (so SystemRoot) to `browserCommand` | no | not met | M6d, `browserCommand(process.platform, url, {})` → still passes: the test's `SystemRoot` is `C:\Windows`, the fallback |
| 12 | `run.test.ts` runs the real `main()` as win32: the data folder, `WINDOWS_NOTE`, and `cmd.exe /c start "" <url>` | no | confirmed | `run.test.ts:59-75`; output and spawn asserted exactly; passes |
| 13 | `browserCommand` ignores a relative or empty SystemRoot | no | confirmed | `platform.ts:35-39` (`win32.isAbsolute`); M10 (any non-empty) → `platform.test.ts` fails |
| 14 | The fake system records reads, and the refusal reads nothing | no | confirmed | `fake-system.ts` pushes to `reads`; `index.test.ts:32`; M11 (`sys.exists`/`sys.readFile` before the refusal) → fails |
| 15 | `run.test.ts` never imports the real start script, assembled or not | no | confirmed | Passes with `app` assembled and with it moved aside; M12 (no `node:url` mock) → "process.exit unexpectedly called", so the mock is what keeps it out; no stray `C:\…` folders; `git status` clean |
| 16 | `pnpm --filter @ronneai/marketplace test` passes | no | confirmed | 13 files, 107 tests passed |
| 17 | It really starts on Windows | no | can't check here | Task 2's CI on `windows-latest` |

**Overall:** not met: no test sees `run.ts` pass `process.env` to `browserCommand` (row 11c).

### Re-check 2 (adversarial): rows 13, M1, 12's hardening, and the diff

Witnessed: 2026-10-22 22:45 EDT, by a fresh agent (adversarial). Commit: 60252ed3. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | `run.ts` call-site mutations fail a test | no | confirmed | `mutate2.sh` (baseline 103/103): `spawn("cmd", …)`, only `Data folder:`, `startLines("linux", dir)`, `browserCommand("linux", …)` → each fails `run.test.ts` |
| M1 | A read before the refusal fails `service/index.test.ts` | no | confirmed | `sys.readFile`, `sys.exists` or `sys.isLink` before `serviceTarget` → each fails at `expect(sys.reads).toEqual([])` |
| 12h | `browserCommand` falls back to `C:\Windows` for a relative or empty SystemRoot | no | confirmed | Reverting the `isAbsolute` check → `platform.test.ts` fails; `C:Windows` and `"  "` fall back; `\Windows` and UNC roots are absolute, never a current-folder lookup |
| N1 | `run.test.ts` imports no start script, starts no server, writes nothing outside the scratch area | no | confirmed | Rejects with `/not-there\.mjs/`; `git status` empty; `find -newer` → nothing new; no `C:*`; `fetch` stubbed |
| N2 | The fake-system change weakens no other service test | no | confirmed | Only `sys.reads.push(path)` added; `reads` used only at `index.test.ts:32`; service suite 87/87 |
| W | `rmk-server` starts and opens the browser on a real Windows machine | no | can't check here | The Windows CI job (`server-checks.yml`) |

**Overall:** not met: every row checkable here is confirmed; only the real Windows run is left. Remark: the fixed port 47123 could clash with something on the machine.

**Since these passes** (uncommitted when they ran, in the next commit): `run.test.ts` sets `SystemRoot` to `D:\WINNT` and expects `D:\WINNT\System32\cmd.exe` (row 11c; M6d then fails the test, run in the adversarial scratch copy), and takes a free port instead of 47123. That's the third round of fixes for task 1: whether it gets a third re-check is the owner's call (state-witness.md, "Two rounds, then the owner").

## Task 2 — Windows in CI

Witnessed: 2026-10-22 22:39 EDT, by a fresh agent (blind). Commit: 5ebc96d8. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `server-checks.yml`'s install matrix runs on `windows-latest` with Node 22 and 24, and runs `server-probe.js` there | no | confirmed | `server-checks.yml:27`; the probe step runs on every matrix entry; the npm install step is `shell: bash` |
| 2 | The probe gets back its 0.3.2-era Windows branches | no | confirmed | `diff old-probe.js server-probe.js` (old from `git show e6b43434^:…`) → `line()`/`execSync`/`shell: true`, `taskkill /T /F`, the STORAGE check for Windows, back unchanged |
| 3 | On Windows the probe checks the start's note and the `service` refusal (exit 1) | no | confirmed | `server-probe.js:100-117` matches `WINDOWS_NOTE` and the refusal with status 1; `node --check` OK. Not run: no Windows here |
| 4 | The Refuses Windows job is gone | no | confirmed | `git diff 22d56946 5ebc96d8 -- .github/`; `grep -rn "refuses-windows\|Refuses Windows"` → none |
| 5 | `release.yml`'s comments and notes follow | no | partly | Notes (`:433`), `:351`, `server-package.yml:86`, `clients-windows.yml:3-5` updated; `release.yml:25` and `bundles.yml:4` still said "no Windows server since 121" |
| 6 | The pull request's Install and run jobs pass on Windows, Node 22 and 24 | no | can't check here | Needs the GitHub run after the owner pushes |

**Overall:** not met: the GitHub Windows run doesn't exist yet, and `release.yml:25` still said "no Windows server".

### Re-check (blind): row 5

Witnessed: 2026-10-22 22:41 EDT, by a fresh agent (blind). Commit: 159a9fed. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | `release.yml`'s comments and `bundles.yml:4` no longer say there's no Windows server | no | confirmed | `git diff 5ebc96d8 159a9fed -- .github` → `release.yml:25` "no Windows bundle since 121"; `bundles.yml:4` "Windows bundle since 121; on Windows, rmk-server runs from npm in a terminal, #222"; `grep -ni windows` → nothing else says so |
| 6 | The Windows job passes on GitHub | no | can't check here | Needs a GitHub Actions run |

**Overall:** not met: row 6 waits for the GitHub run after the owner pushes; everything else holds.

## Task 3 — Repository docs

Witnessed: 2026-10-22 22:39 EDT, by a fresh agent (blind). Commit: 5ebc96d8. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | None of the listed docs says the server refuses Windows | no | confirmed | grep across the 9 files → only 121's historical SPEC body and row, and `install.md:328`'s new EBADPLATFORM row |
| 2 | `install.md`'s Windows section covers both ways, `wsl --install -d Ubuntu`, the 0.3.x service removal, and drops the EBADPLATFORM sentence | no | confirmed | `install.md:241-273` |
| 3 | `install.md`'s troubleshooting rows match the code | no | confirmed | `:327` = `service/index.ts:21`; `:328`: `git show v0.4.0/v0.5.0:packages/server/package.json` → `os` darwin/linux; v0.3.2 → none |
| 4 | The facts in `install.md`'s Windows section match the code | no | partly | Data folder = 0.3.2's; 0.3.2 had `service uninstall`. But `:246` said "Node.js 22 or later"; `MIN_NODE` is 22.12.0 |
| 5 | `backup.md`'s systems line | no | confirmed | `backup.md:69-71` |
| 6 | `release.md`'s checklist | no | confirmed | `release.md:49-51` |
| 7 | `README.md` and `packages/server/README.md` | no | confirmed | `README.md:231-234`; `packages/server/README.md:25,28-29`. Couldn't check the claim of a Windows arm64 prebuild for better-sqlite3 (no network) |
| 8 | MVP §15 Easy install and its reason | no | confirmed | `MVP.md:968` |
| 9 | Features index 121 row, 121's SPEC header, this issue's row | no | confirmed | `docs/features/README.md:231,246`; `121-no-windows-server/SPEC.md:7-9`; `docs/issues/README.md:28` |

**Overall:** not met: `install.md`'s Windows section gave the wrong Node.js minimum.

### Re-check (blind): row 4, and the README's native modules

Witnessed: 2026-10-22 22:41 EDT, by a fresh agent (blind). Commit: 159a9fed. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | `install.md`'s Windows section gives the Node.js minimum the code enforces | no | confirmed | `node-version.ts:2` `MIN_NODE = "22.12.0"`, `package.json:49` `>=22.12`; `install.md:246` "Node.js 22.12 or later", `:138` agrees. `install.md:27`'s table still said "Node.js 22+" (outside the section, loose) |
| 7 | `packages/server/README.md`'s better-sqlite3 sentence can be backed up | no | not met | better-sqlite3 13.0.3 ships `prebuilds/win32-arm64.node` (an Aarch64 Windows DLL; `lib/binding.js:5-6` loads win32 x64 and arm64), so "Windows x64" understates it; and `"gypfile": false` with no install script means npm never compiles it, so "On another platform npm compiles it" is false (it was before #222 too) |

**Overall:** not met: the README's native-modules sentence.

## Task 4 — The website

Witnessed: 2026-10-22 22:39 EDT, by a fresh agent (blind). Commit: 9699b32 (ronne-web; marketplace 5ebc96d8). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | ronne-web's checks pass on the branch | no | confirmed | Scratch copy: `biome check` clean; typecheck exit 0; `vitest run` 31 files, 183 passed; `next build` exit 0, 174 pages |
| 2 | The Windows section has both ways and the spec's content; EBADPLATFORM gone | no | confirmed | `en/install.tsx:401-424`; no EBADPLATFORM in en/pt/fr; the Data bullet adds `%LOCALAPPDATA%\RonneAI\Marketplace` in all three |
| 3 | en, pt and fr say the same | no | confirmed | The three diffs read side by side: same ways, sentences and order |
| 4 | `operations` and `backups` checked | no | confirmed | Only `install.tsx` mentions Windows; `backups.tsx:16-17` rows stay true; `topics.ts` unchanged |
| 5 | The facts match how the code behaves | no | partly | Data folder, refusal, upgrade in place hold; "Node.js 22 or later" in en `:401`, pt `:411`, fr `:427`, where the code needs 22.12 |

**Overall:** not met: all three Windows sections gave Node.js 22 where the code needs 22.12.

### Re-check (blind): row 5, and the checks

Witnessed: 2026-10-22 22:41 EDT, by a fresh agent (blind). Commit: d81a8cb. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | en, pt and fr `install.tsx` give Node.js 22.12 and say the same | no | confirmed | `git diff 9699b32 d81a8cb` → one line each: `en:401`, `pt:411-412`, `fr:427` "22.12"; the npx sections (`en:255`, `pt:262`, `fr:273`) agree; `MIN_NODE` is 22.12.0 |
| 6 | ronne-web's checks pass on d81a8cb | no | confirmed | Scratch copy: `pnpm lint` clean; `next typegen` + `tsc --noEmit` exit 0; `pnpm test` 31 files, 183 passed; `pnpm build` exit 0 |

**Overall:** met: the three languages give Node.js 22.12, matching the code, and ronne-web's checks pass.
