# 086 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. WinSW renderer.** The XML from 083's service model, with and without a domain.
  *Done when:* golden-file tests pass.

- [ ] **2. WinSW in the bundles.** Download the official release, check its checksum, place it in the
  Windows bundles (084); record it in the dependency policy.
  *Done when:* the Windows archives contain it and the content check passes.

- [ ] **3. Install, uninstall and the other subcommands on Windows.** Elevation check, folders and
  ACLs, the virtual account, firewall rules, health wait.
  *Done when:* CI on `windows-latest` installs, checks health, restarts and uninstalls.

- [ ] **4. The proxy service.** `--domain` with Caddy.
  *Done when:* CI with `--tls internal` answers over HTTPS.

- [ ] **5. Documentation.**
  *Done when:* the docs render tests pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
