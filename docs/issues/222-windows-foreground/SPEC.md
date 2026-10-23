# #222 — `rmk-server` runs on Windows again, in a terminal, without a service

> GitHub: [#222](https://github.com/ronneai/ronne-marketplace/issues/222) · Feature:
> [121](../../features/121-no-windows-server/SPEC.md) (partly reversed), with
> [082](../../features/082-server-npm-package/SPEC.md)'s `rmk-server` · Reported on: 0.5.0

## Report

- On Windows, `npx @ronneai/marketplace@0.5.0` stops with npm's `EBADPLATFORM … wanted
  {"os":"darwin,linux"}`. 0.3.2 had no `os` limit, and the same command ran the server on that PC;
  the 0.3.2 process still serves port 7650.
- With `npm install --force`, 0.5.0 gets past npm and then refuses on its own (`platformRefusal`,
  121). The documented way, WSL 2, isn't there either: WSL is installed with no Linux distribution.
- With `win32` added to `SUPPORTED_PLATFORMS`, 0.5.0 starts on Node.js 24.16.0: `better-sqlite3`
  and `@node-rs/argon2` load, migrations run, and it serves `http://127.0.0.1:7650`.
- `rmk-server reset-root-password`, which the sign-in page names, is the same binary, so a
  locked-out root on Windows can't run it either.

121 withdrew the Windows server because "nobody installs it there". This report shows someone
does, through `npx`, as the website's "Run it" gives it.

**Adding `win32` alone isn't enough.** 121 also removed the Windows data folder. 0.3.2 kept its data
in `%LOCALAPPDATA%\RonneAI\Marketplace`; today's `dataDir` gives any system but macOS
`~/.local/share/rmk-server`. Without that branch, 0.5.0 on Windows ignores the 0.3.2 database and
starts a new, empty instance, whose setup page goes to whoever reaches it first.

## Goal

A Windows machine runs `rmk-server` in a terminal, as 0.3.2 did: `npx @ronneai/marketplace` (or
`npm install --global`) starts it on 0.3.2's data, and its commands (`setup`,
`reset-root-password`, `backup`, …) run there. It's best-effort: checked in CI, not a production
setup. For a server that starts at boot, Windows still uses WSL 2 or a Linux virtual machine.

## Scope

**In:**
- **`rmk-server` runs on Windows.** `SUPPORTED_PLATFORMS` and `package.json`'s `os` are
  `darwin`, `linux` and `win32`. Other systems (FreeBSD, say) keep the refusal, which now names
  the three: "rmk-server runs on Linux, macOS and Windows."
- **The data folder is 0.3.2's.** On Windows, `RONNE_DATA_DIR`, else
  `%LOCALAPPDATA%\RonneAI\Marketplace` (`<home>\AppData\Local\RonneAI\Marketplace` when
  `LOCALAPPDATA` isn't set), as 082 had it. `--help` lists it.
- **One line at start on Windows**, after "Data folder: …": "On Windows, rmk-server runs in this
  terminal only (no service). To run it at boot, use WSL 2 or Linux:
  https://www.ronne.ai/marketplace/docs/install#windows".
- **The first start opens the browser on Windows** too (`cmd /c start "" <url>`, as 082 did, but
  with `%SystemRoot%\System32\cmd.exe` by its full path, so a `cmd.exe` in the current folder is
  never the one run; the address is always `http://localhost:<port>`, nothing a person types).
- **`rmk-server service …` on Windows refuses**, in one line, exit 1, before running, reading or
  writing anything: "rmk-server: service isn't available on Windows. Run rmk-server start in a
  terminal, or run Ronne in WSL 2 or Linux to start it at boot:
  https://www.ronne.ai/marketplace/docs/install#windows". `service --help` still
  prints. The scripts don't look for a service there (none can exist) and run on the data folder.
- **CI:** `server-checks.yml` adds `windows-latest` (Node 22 and 24) to the install matrix, which
  runs `server-probe.js` there: start, setup, sign-in, `revoke-access`, `rotate-secret`, backup and
  restore, the port free after stopping. The probe gets back its Windows branches (npm's `.cmd`
  through a shell, `taskkill` for the tree, the case-insensitive `--out` check) and checks the
  `service` refusal on Windows. The **Refuses Windows** job goes. `release.yml`'s comments and
  notes say what's above.

**Out:**
- **The Windows service, `install.ps1`, winget and the Windows bundles** stay withdrawn (121's
  reasons hold: they were the costly, security-sensitive part).
- **Windows-only code 121 removed for the service**: `env-file.ts`'s write in place, the "as an
  administrator" hints. A terminal run writes the `.env` as on Linux (a rename in a folder the
  person owns).
- **099's Windows disk job** (`sameFile` and stored names on NTFS). The probe's backup and restore
  run on Windows; the deeper disk tests stay on Linux.
- **Developing Ronne on Windows** (a clone with `pnpm dev`): still WSL 2.

## Behaviour

| On Windows | What happens |
|---|---|
| `npx @ronneai/marketplace` | Starts on `%LOCALAPPDATA%\RonneAI\Marketplace`, prints the data folder and the one-line note, opens the browser on the first start |
| The same, with 0.3.2's data there | Applies pending migrations and serves it: same root, same items |
| `npm install --global @ronneai/marketplace` | Installs; `rmk-server` works as above |
| `rmk-server reset-root-password` (and the other scripts) | Runs on the data folder |
| `rmk-server service install` (or any action) | The one-line refusal, exit 1 |
| WSL 2 | Unchanged: the Linux paths |

Linux and macOS: no change.

## Edge cases

- **0.4.0 or 0.5.0 forced onto Windows** with `--force` and the patch: none were released working
  there, so no data sits in `~\.local\share\rmk-server` from them. Nothing to move.
- **`RONNE_DATA_DIR` set**: wins on every system, as before.
- **WSL running Windows' `node.exe`** through interop: it's Windows' Node, so it's the Windows
  path above, with Windows' data folder; installing Node.js inside WSL gives the Linux path.
- **A 0.3.x Windows service someone still has**: the new version's `service uninstall` refuses;
  `npx @ronneai/marketplace@0.3.2 service uninstall`, as administrator, removes it (the
  Documentation says so).
- **No browser** (a Windows server over SSH): `start` fails quietly; the address is in the log.

## Documentation

- **Installing** (`install#windows`, website, en/pt/fr): two ways. In a terminal on Windows with
  `npx @ronneai/marketplace` (no service; the data folder; best-effort), or WSL 2 / a Linux VM for
  a server that starts at boot (the current steps, plus `wsl --install -d Ubuntu` when WSL has no
  distribution). The `EBADPLATFORM` sentence goes; the 0.3.x service removal line is added. Same
  anchor, so `topics.ts` doesn't change.
- **Running Ronne** (`operations`), **Backups** (`backups`): checked; where they say the server
  doesn't run on Windows, they say it runs in a terminal there.
- **Repository docs:** `install.md` (Windows section, the troubleshooting row), `backup.md`'s
  systems line, `release.md`'s checklist, `README.md` and `packages/server/README.md`; MVP §15
  (Easy install) and its reason; the features index rows for 121; a line at the top of 121's SPEC:
  "Partly reversed by #222".
- **In-app helpers:** none mention Windows (checked in 121); none change.

## Acceptance criteria

- [ ] `platformRefusal` is undefined on `win32`, `darwin` and `linux`, and names the three on
  `freebsd`; `package.json`'s `os` matches (unit tests).
- [ ] `dataDir("win32", …)` is `%LOCALAPPDATA%\RonneAI\Marketplace`, with the home fallback, and
  `RONNE_DATA_DIR` wins (unit tests).
- [ ] `service` on `win32` refuses with the line above; `service --help` prints (unit tests).
- [ ] The Install and run job passes on `windows-latest`, Node 22 and 24, including the probe's
  `service` refusal check; the Refuses Windows job is gone.
- [ ] The Documentation (en, pt, fr) and the repository docs say what's above.

## Decisions

1. **Foreground only, best-effort** (owner, 2026-10-22, taking Claude's recommendation): the start,
   the scripts and their CI come back; the service, installer and bundles don't. The reporter showed
   the app runs as it is on Windows; 121's cost was in the service.
2. **0.3.2's data folder** (Claude): the only Windows data that exists is 0.3.2's; another folder
   would start a new instance beside it.
3. **A note at every start on Windows** (Claude): it's the one place a Windows user sees that this
   isn't a production setup, and where to go for one.

## Open questions

None.
