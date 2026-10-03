# 082 — The server as an npm package

> Milestone: M12 · Depends on: 034, 035, 036 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap), [§15](../../MVP/MVP.md#15-decision-log) (Packages) · Guide: [`docs/runbooks/install.md`](../../runbooks/install.md)

## Goal

`npx @ronneai/marketplace` starts a working Ronne on any machine with Node.js 22 or later, with no
clone, no Docker and no build. It's also the base the service install (083, 086) and the packages
(084, 085, 087) are made from.

## Why

MVP §5 promises a Node path, `pnpm dlx @ronneai/marketplace init`, but the package was never
published (checked on npm, 2026-10-03), so without Docker people must clone the repository and
build it.

## Scope

**In:**
- The npm package `@ronneai/marketplace`, published by `release.yml` with the other three, at the
  same version, with provenance (034's rules).
- Its command, **`rmk-server`** (owner, 2026-10-03), with `start` (the default), `setup`,
  `migrate`, `reset-root-password` and `--version`.
- The standalone Next.js server and the compiled scripts inside it, as in the Docker image (005).
- A data folder per user and system, and port 7650 by default.
- `packages:check` and `release:smoke` cover it.

**Out** (and where it goes instead):
- Running in the background, at boot → [083](../083-service-unix/SPEC.md),
  [086](../086-service-windows/SPEC.md).
- Bundling Node.js → [084](../084-bundles/SPEC.md).
- `init` as a separate step: `start` runs the web setup when needed (036), so it isn't needed;
  `setup` stays for the terminal.

## Behaviour

**Commands:**

| Command | Does |
|---|---|
| `rmk-server` or `rmk-server start [--port N] [--host H] [--no-open]` | Prepares the data folder, applies migrations when set up, starts the server, and on a terminal opens the browser on the first start |
| `rmk-server setup [--yes …]` | 003's terminal setup, with the same flags and variables |
| `rmk-server migrate` | Applies pending migrations and exits |
| `rmk-server reset-root-password` | As today |
| `rmk-server --version` / `--help` | |

`start` reuses `scripts/start.ts` (`prepareStart`), so the Docker image and the package start the
same way. It listens on `127.0.0.1` by default (a personal install isn't reachable from the network);
`--host 0.0.0.0` or `HOST` opens it, as a server needs.

**Where things are.** `RONNE_DATA_DIR` wins; otherwise:

| System | Data folder (database, storage, `.env`) |
|---|---|
| macOS | `~/Library/Application Support/RonneAI Marketplace` |
| Linux | `$XDG_DATA_HOME/rmk-server`, else `~/.local/share/rmk-server` |
| Windows | `%LOCALAPPDATA%\RonneAI\Marketplace` |

`RONNE_ENV_FILE` defaults to `.env` in that folder, as in Docker. `PUBLIC_URL` defaults to
`http://localhost:<port>`. A new `RONNE_RUNTIME=npm` value lets the setup and Documentation give the
right commands (005 added `docker`).

**What the package contains**: the standalone server (`server.js`, `.next/`, `public/`), the static
files, `dist-scripts/`, and the CLI entry. Dependencies the standalone build traces are declared
normally, so npm installs `better-sqlite3`'s prebuilt binary for the platform. Expected size: the
same as the image's app layer (measured in task 1; npm's limit isn't a concern below 100 MB).

**The port.** 7650, as 080 chose. If it's busy, `start` says so and names `--port`; it doesn't pick
another silently, because `PUBLIC_URL` and saved `rmk` logins depend on it.

## Edge cases

- **Node.js older than 22.12**: `engines` warns at install; `rmk-server` checks at start and exits
  with the version needed.
- **No prebuilt `better-sqlite3` for the platform** (an unusual libc or architecture): npm compiles
  it, which needs build tools; the message from npm stays, and the README names the tools. MySQL
  and PostgreSQL work regardless.
- **`npx` with a cached older version**: `npx @ronneai/marketplace@latest` is what the docs show for
  upgrades; migrations run on start.
- **Moving from a clone** (`apps/web/data`): set `RONNE_DATA_DIR` to that folder; documented.
- **Two versions sharing a data folder**: the older refuses to start on a newer database (002).

## Documentation

- **README** and **Documentation › Installing an instance**: a *With Node.js, no clone* section
  replacing "from a clone" as the first Node path (the clone stays for developers): the commands,
  the data folders, `--port`, `--host`.
- **MVP §5** (install paths) and **§15** (Packages: four published packages plus the server; the
  command name).
- **Setup's** *Public address* helper: the default address reflects the port.

## Acceptance criteria

- [ ] `npx @ronneai/marketplace` on macOS, Linux and Windows, Node 22 and 24, with no clone, opens
      the web setup at `http://localhost:7650`, and setup with SQLite ends signed in.
- [ ] Data lands in the folder for that system; `RONNE_DATA_DIR` overrides it.
- [ ] `setup --yes`, `migrate` and `reset-root-password` behave as their `pnpm run` forms.
- [ ] A newer package version applies its migrations on start.
- [ ] The package contains no dev dependencies, sources or tests (`packages:check` allowlist).
- [ ] `release:smoke` installs it with npm in an empty folder and gets a health answer.
- [ ] `release.yml` publishes it with provenance, at the shared version.
- [ ] The README, MVP §5 and §15 and the Documentation say what the feature does now.

## Open questions

None. Decided by the owner, 2026-10-03: the command is **`rmk-server`**. It pairs with `rmk` and
avoids the reserved `ronne` and `ronneai`; the package stays `@ronneai/marketplace`.
