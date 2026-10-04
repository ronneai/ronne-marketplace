# @ronneai/marketplace

[Ronne AI Marketplace](https://github.com/ronneai/ronne-marketplace), the open-source, self-hosted
registry of AI capabilities, as one command. You need Node.js 22.12 or later; no clone, no Docker,
no build.

```sh
npx @ronneai/marketplace            # or: npm install --global @ronneai/marketplace, then rmk-server
```

Then open http://localhost:7650 and follow the setup in the browser. SQLite needs nothing else.

| Command | Does |
|---|---|
| `rmk-server` or `rmk-server start [--port N] [--host H] [--no-open]` | Starts the server, applying pending migrations. On a terminal, the first start opens the browser |
| `rmk-server setup [--yes …]` | Sets the instance up in the terminal instead of the browser |
| `rmk-server migrate` | Applies pending migrations and exits |
| `rmk-server reset-root-password` | Sets a new password for root |
| `rmk-server --version` / `--help` | |

- **Network:** it listens on `127.0.0.1:7650`, this machine only. `--host 0.0.0.0` (or `HOST`)
  makes it reachable from the network; `--port` (or `PORT`) changes the port.
- **Data** (database, stored items, settings) lives in `RONNE_DATA_DIR`, or by default in
  `~/Library/Application Support/RonneAI Marketplace` (macOS), `$XDG_DATA_HOME/rmk-server` or
  `~/.local/share/rmk-server` (Linux), and `%LOCALAPPDATA%\RonneAI\Marketplace` (Windows).
- **Upgrading:** `npx @ronneai/marketplace@latest`, or `npm install --global @ronneai/marketplace`.
  Migrations run on start.
- **Native modules:** `better-sqlite3` ships prebuilt binaries for macOS, Linux (glibc and musl)
  and Windows, on x64 and arm64. On another platform npm compiles it, which needs Python, `make`
  and a C++ compiler. MySQL, MariaDB and PostgreSQL work regardless.

MIT licensed. Docker, the install script and the full guide are in the
[repository](https://github.com/ronneai/ronne-marketplace#readme).
