# 161 — Setup code: only whoever started the server sets it up

> Milestone: M28 · Depends on: 036, 003, 005, 080, 081, 082, 083, 100 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Web setup", "Setup command"), [§5](../../MVP/MVP.md#5-installation--bootstrap) · Contracts: none changed

## Goal

Before setup is finished, anyone who can reach the instance can set it up. They become root and
choose the database. That was a deliberate choice for a computer of one's own (036). A server
installed with a domain, though (080, 081, 083), serves its setup on the internet until its owner
finishes it, and its new certificate is published in Certificate Transparency logs that scanners
watch.

A **one-time setup code** fixes this. The server shows it only where its operator looks: the
terminal, the server's log, the install script. The web setup asks for it, so being first to the
page is no longer enough (owner, 2026-11-01).

## Scope

**In:**
- **The code.**
  - At start, when the instance isn't set up (`prepareStart`'s `setup-required`, or `incomplete`),
    the server makes a code if there isn't one.
  - It is 128 random bits written as 26 Crockford base32 characters, shown in groups of five
    (`7KQ2M-…`). Case, spaces and dashes are ignored when typed.
  - It is written to `setup-code` in the data folder (`RONNE_DATA_DIR` when it's set, as the start
    script and backups read it: the Docker volume, the npm package's folder, or a clone started
    with one; else `./data` next to the app), mode 0600, by an exclusive create that never shows half
    a file: a temporary file, then a hard link into place, which fails when the file is already
    there. Where hard links aren't supported, a plain exclusive create, and a reader waits a moment
    for its content. A file holding the code that others can read is tightened to 0600.
- **Where it's shown:**
  - **The server's log**, at every start until setup is done: a `server.setup_code` line, an
    `info` event with the code and the address to open (`PUBLIC_URL`, else the local one), next to
    today's "Not set up yet" line. It is the one log line allowed to carry a credential (the
    logger's redaction test lists it); it's single-use and worthless once setup is done. It is
    written at every `LOG_LEVEL` (the only event marked `always`; owner, 2026-11-01), so a `warn`
    or `error` level never hides it; the lines around it follow the level.
    `server.started` says `setup: "incomplete"` when settings exist but root doesn't yet.
  - **The install script** (081): after the start check, it runs `setup-code` (in the container,
    or `rmk-server setup-code` for the package) rather than parsing the log, which
    holds older lines too; it prints the code with the address, and opens `/setup#code=<code>` on "This
    computer". The fragment never reaches the server or a proxy's log. A rerun on a set-up instance
    says nothing of a code.
  - **`rmk-server start` and `service install`** (082, 083) print it on a terminal (`start` on a
    first start once the server answers, opening the setup page with it filled in unless
    `--no-open`), and `rmk-server service logs` shows the log line.
  - **A clone**: `pnpm dev` and `pnpm start` print the log line like any other.
  - **`setup-code`**: `rmk-server setup-code`, `pnpm run setup-code`, or
    `docker compose exec web pnpm run setup-code`. It prints the current code, or makes one when
    there is none, and refuses once the instance is set up. Shell access is the proof.
- **The web setup asks for it.**
  - A **Setup code** field comes first, before the database. It is filled from `#code=` when the
    page was opened that way.
  - **Every setup action** (`testDatabase`, `installSettings`, `installMigrations`, `installRoot`,
    `installAll`) checks it in the guard they all run first (`refusal` in
    `features/setup/install.ts`). The check is constant-time, on the code's SHA-256.
  - A wrong or missing code gets `setup_code_wrong`: "That isn't this server's setup code. It's in
    the server's log, or run `<the setup-code command for this runtime>`."
  - At most 10 wrong codes per address (with `TRUST_PROXY`), and 30 in all, in a fixed 10-minute
    window that starts at the first wrong code, counted in memory as the sign-in limit counts
    (109 moves them). Past either limit, a wrong code gets `setup_code_rate_limited` ("Too many
    wrong setup codes, and that one is wrong too. This server's code is in its log, or run
    `<setup-code>`") and no log line, so the log can't be flooded. Only wrong codes count, and
    **the right code always passes** (owner, 2026-11-01): at 128 bits the limit isn't what stops
    guessing, and without `TRUST_PROXY` the server knows no addresses, so a limit on the right
    code would let a stranger hold the owner off.
  - No code on the server (no file, one that holds none, or one that can't be read) gets
    `setup_code_missing`: "No setup code on this server: restart it, or run `<setup-code>`. Or set
    it up from the terminal: `<setup>`", with each command as this runtime types it.
- **After setup** (root created, state `ready`), the file is deleted.
- **The terminal setup** (`pnpm run setup`, `rmk-server setup`, `--yes` with variables) doesn't
  ask: whoever runs it is on the server. It deletes the file when it finishes.
- **`reset-setup`** (development only) deletes the file. The next start makes a new code.
- **Logs:**
  - `setup.code_created` (no code: the code is only in `server.setup_code`);
  - `setup.code_unwritable` and `setup.code_invalid` (`error`: no code could be made or read);
  - `setup.code_not_deleted` (`warn`: setup finished, but the file couldn't be deleted);
  - `setup.code_refused` (`warn`, with the reason, `wrong` or `missing`; never the code typed, and
    no address: the logger keeps addresses out of every line, 100);
  - `setup.code_rate_limited` (`warn`, once, as a limit is reached).

  Nothing goes to the audit log: there is no database yet.

**Out** (and where it goes instead):
- **Refusing to listen on a public address until set up:** no. In Docker the server can't tell
  what the host publishes, and the code makes it unnecessary.
- **A code for anything after setup** (a reset, a new root): those stay terminal commands
  (`reset-root-password`, 059).
- **Showing the code in the browser**, even on localhost: never. Anyone could ask.

## Behaviour

**On a server with a domain.**
1. `curl … | sh -s -- --mode server --domain ronne.example.com` starts Ronne and prints:
   "Open https://ronne.example.com/setup and enter the setup code `7KQ2M-…`".
2. A visitor who finds the domain sees the setup page, asking for a code they don't have. Every
   action they try is refused.
3. The owner enters the code, sets up, and the code is gone.

**On this computer.** The install script opens the browser on `/setup#code=…`, so the field is
already filled and nothing changes for the person installing.

**The check, in order.** The guard reads the setup state first. A `ready` or `unavailable` instance
is refused as today, so a set-up instance never reads the file. Then it reads the file: with none,
`setup_code_missing`. Then it compares the codes: the right one passes. A wrong one past the limit
gets `setup_code_rate_limited`; otherwise it counts, is logged (`setup.code_refused`) and gets
`setup_code_wrong`, and the one that reaches the limit logs `setup.code_rate_limited` too.

## Edge cases

- **Several replicas before setup** (111): the exclusive create means one writes the file; the
  others read it and log the same code.
- **The data folder can't be written:** in Docker and the npm package the server doesn't start
  at all (005's check of the data folder, before any code). In a clone (`pnpm dev`), and when only
  the file can't be written or read, the server logs `setup.code_unwritable` and starts; every
  setup action then refuses ("No setup code", with the terminal setup's command).
- **A `setup-code` file that holds no code** (empty after a crash, edited by hand): a start never
  replaces it, since several servers starting at once would each write a code of their own. It
  logs `setup.code_invalid`, and the web setup refuses as with no file. `setup-code` replaces it.
- **The log was lost:** `setup-code` prints the code again. Restarting prints it too.
- **The file is deleted while the setup page is open:** the next action refuses ("No setup code").
  A restart or `setup-code` makes a new one.
- **An instance already set up when this lands:** nothing is made. An `incomplete` one (settings,
  no root) gets a code at its next start.
- **Settings from the environment** (Docker with `DATABASE_URL` and `AUTH_SECRET`): still
  `incomplete` until root exists, so the code is still asked for.
- **A typed code with look-alikes** (`O` for `0`, `I` or `L` for `1`): Crockford decoding accepts
  them.
- **A failed install step after a right code:** the code stays until root exists, so the person can
  retry.
- **The file can't be deleted once root exists** (its folder made read-only): the setup still
  finishes; the web setup logs `setup.code_not_deleted` and the terminal setup warns. A set-up
  instance never reads the file again.

## Data

- One file, `setup-code`, in the data folder, mode 0600. There's no database before setup.
- No migration.

## Documentation

- **Installing** (`install`), the setup section (`install#setup`): the setup code; where each
  install method shows it (install script, Docker logs, `rmk-server`, a service's logs, a clone's
  terminal); `setup-code`; why it exists.
- **A domain and HTTPS** (`install#https`): finish setup with the code; no window to rush.
- **Install guide** (`docs/runbooks/install.md`), `compose.yaml`'s comments (lines 6 and 16-17
  today) and the install script's messages: the code instead of "anyone can set it up".
- **Security** (`security#security`) and the threat model (§4.2, §5): the first-visitor setup gap
  closed.
- **Helpers:** the setup page's "Where's the setup code?" → `install#setup`.

## Acceptance criteria

- [x] A start in setup mode makes the code once (0600, exclusive) and logs `server.setup_code` at
  every start until set up; a set-up instance makes none.
- [x] Every setup action refuses without the right code, rate-limited as above, and accepts it
  typed with any case, spaces or dashes; db tests for each action.
- [x] The file is deleted when root is created, by the web or the terminal setup, and by
  `reset-setup`.
- [x] `setup-code` prints the code (making one if needed) and refuses on a set-up instance.
- [x] The install script prints the code and opens `/setup#code=…`; `pnpm test:install` asserts
  it under dash and bash.
- [x] The setup page's field comes first, is filled from the fragment, and says where the code is
  for the runtime; the e2e wizard test enters it.
- [x] The logger's redaction test allows the code only in `server.setup_code`.
- [x] Every new text is a message in English, Portuguese and French; the setup page passes the
  phone sweep.
- [x] The Documentation, the install guide, `compose.yaml`'s comments and the threat model say
  what the feature does.

## Decisions

1. **A setup code, reversing 036's "open to the first visitor"** (owner, 2026-11-01). The domain
   install path made the open setup reachable from the internet, and the terminal alternative
   wasn't the path anyone was shown.
2. **In a file in the data folder, printed in the log at each start** (Claude). Before setup there
   is no database. The disk and the log are what only the operator reaches. Keeping the code
   itself (not a hash) lets every start and `setup-code` show it again; the file is as protected as
   the settings file beside it.
3. **Always asked, local installs included** (Claude). A server can't know who reaches its port
   through Docker or a proxy. The install script passes it in the URL's fragment, so a local
   install doesn't type it.
4. **The terminal setup doesn't ask** (Claude): shell access is the proof.

## Open questions

- Should the install script's "server" mode also bind to loopback until setup is done, and switch
  to the domain's ports afterwards, as a second layer? It needs a restart of the proxy.
