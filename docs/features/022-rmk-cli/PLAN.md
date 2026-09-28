# 022 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Foundations.** Argument parsing, the user config (mode `0600`, env overrides), the API
  client with its errors, `--json` output and exit codes; `login`, `logout`, `whoami`.
  *Done when:* unit tests cover the config file's permissions, env overrides and parsing; and tests
  against a stub server cover login by password and by token, logout offline, and API errors.

- [ ] **2. Reading the registry.** `search`, `info`, `list`, `platforms`.
  *Done when:* tests against a stub server cover each, in text and `--json`.

- [ ] **3. The applier.** Planning changes against the state file and the disk, conflicts and
  `--force`, JSON key editing, sections, atomic writes, and the state file itself.
  *Done when:* unit tests over a temporary folder cover every change kind created, replaced,
  removed, edited by the user (conflict) and missing, plus unmanaged content left alone.

- [ ] **4. Install.** Targets, resolution, downloads with the cache and checksums, rendering, and
  writing `rmk.config.json` and `rmk.lock`.
  *Done when:* tests cover a fresh install, a reinstall from the lockfile, a checksum mismatch, an
  unsupported type's warning, missing env vars, and user scope.

- [ ] **5. Update, outdated and remove.**
  *Done when:* tests cover updating within a range, a yanked locked version, outdated's columns, and
  removing an item with dependencies still needed by another.

- [ ] **6. End to end.** Against a built instance with a published item: install into a temporary
  project with the reference renderer, update after a new release, remove.
  *Done when:* it passes in CI.

## Notes
