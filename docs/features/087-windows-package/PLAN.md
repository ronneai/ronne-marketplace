# 087 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The installer.** `packaging/windows/rmk-server.iss`: pages, program folder, `PATH`,
  service install and upgrade, uninstall with the data choice, silent mode.
  *Done when:* by hand on Windows 11: install, upgrade over the previous build, uninstall both ways.

- [ ] **2. Release.** Build both architectures in `release.yml` on Windows runners, smoke-test the
  x64 one silently (install, health, uninstall), attach both with checksums.
  *Done when:* a dry-run release produces both and the smoke test passes.

- [ ] **3. winget.** The manifest (`RonneAI.Marketplace`, version, both installers, silent switches),
  validated with `winget validate` and a local `winget install --manifest`; the first submission by
  hand; then the release job that opens the update pull request.
  *Done when:* the first version is accepted in `winget-pkgs`, and a dry run produces the update.

- [ ] **4. `install.ps1` without Docker.**
  *Done when:* by hand on Windows 11 without Docker, with and without winget.

- [ ] **5. Documentation and the policy.** Inno Setup as an allowed exception (its own licence),
  and the SignPath application noted.
  *Done when:* the docs render tests pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
