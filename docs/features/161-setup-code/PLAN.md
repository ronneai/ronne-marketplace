# 161 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §15's "Web setup" row says the setup asks for a setup code, and `docs/features/README.md`
    lists 161 in M28 with its dependencies.
  - *Done when:* both say what this spec says, and `pnpm witness:check` passes.

- [x] **2. The code.** [risky]
  - `server/setup/setup-code.ts`:
    - make (128 random bits, Crockford base32, groups of five);
    - write (0600, exclusive create: a temporary file linked into place; a file holding no code is
      replaced, by a rename, only when `setup-code` asks);
    - read; normalise a typed code; constant-time check on SHA-256; delete.
  - *Done when:* unit tests cover the format, look-alike decoding, case, spaces and dashes, a wrong
    code, the file's mode, two writers racing (one wins, the other reads), and an unwritable folder.

- [x] **3. Start and log.** [risky]
  - `prepareStart` makes or reads the code in setup mode and logs `server.setup_code` with the
    address.
  - `setup.code_created` and `setup.code_unwritable`.
  - The logger's no-secrets test allows the code in that one event.
  - *Done when:* `prepare-start` tests cover a fresh start, a restart (same code), a set-up
    instance (no file, no line) and an unwritable folder; `log/no-secrets.db.test.ts` passes with
    the allowance.

- [x] **4. The guard.** [risky]
  - `refusal` in `features/setup/install.ts` checks the code after the state, for every action.
  - The limiter (10 per address, 30 in all, per 10 minutes); `setup_code_wrong`,
    `setup_code_missing`, `setup_code_rate_limited`.
  - The file is deleted when root is created, by the web and the terminal setup (`run-setup.ts`);
    `reset-setup` deletes it.
  - *Done when:* `install.db.test.ts` covers each action without, with a wrong, and with the right
    code, the rate limit, and the deletion; `run-setup.db.test.ts` and `reset-setup.test.ts` cover
    theirs.

- [x] **5. `setup-code`.**
  - The script for a clone and Docker (`pnpm run setup-code`) and `rmk-server setup-code`: print,
    make if missing, refuse when set up.
  - *Done when:* CLI tests cover the three answers; `pnpm packages:check` lists the new entry.

- [x] **6. The setup page.**
  - The Setup code field first, filled from `#code=` (read on the client, never sent in a URL).
  - The errors, and "Where's the setup code?" with the command for this runtime (`runtimeOf`).
  - *Done when:* `setup.test.tsx` (the field and its place) and `code-field.test.tsx` (the
    fragment and each error) cover the page; the e2e wizard test reads the code from the throwaway
    instance's data folder and sets up with it.

- [ ] **7. Install paths.**
  - `install.sh` prints the code after its start check and opens `/setup#code=…`.
  - `rmk-server start` and `service install` print it on a terminal.
  - `compose.yaml`'s comments.
  - *Done when:* `pnpm test:install` asserts the printed code under dash and bash; the server
    package's tests cover `start`'s output.

- [ ] **8. Messages.**
  - Every new key in `en`, `pt` and `fr`.
  - *Done when:* the parity and raw-text tests pass; the phone sweep passes on the setup page.

- [ ] **9. Documentation and the threat model.**
  - `install#setup`, `install#https`, `security#security`, the helper; the install guide.
  - The threat model's §4.2 row and §5.
  - *Done when:* the docs render tests and `pnpm docs:links` pass, and the helper lands on a real
    section; the threat model's date and commit are updated.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
