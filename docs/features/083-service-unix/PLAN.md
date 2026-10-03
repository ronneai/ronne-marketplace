# 083 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The service model.** A platform-neutral description (user, folders, command, environment,
  proxy) and renderers to a systemd unit and a launchd plist, written so 086 adds a WinSW renderer.
  *Done when:* golden-file tests for both, with and without a domain.

- [ ] **2. The shared Caddyfile.** Move 080's Caddyfile into one template used by `compose.yaml`'s
  generator check and by this feature.
  *Done when:* a test fails if `compose.yaml`'s inline Caddyfile differs from the template's output.

- [ ] **3. `service install` and `uninstall` on Linux.** User, folders, permissions, environment
  file, unit, enable, start, wait; the proxy service with `--domain`.
  *Done when:* CI on Ubuntu (systemd is there on GitHub's runners) installs, checks health, restarts,
  uninstalls; with `--domain localhost --tls internal`, HTTPS answers.

- [ ] **4. macOS.** The same with launchd, the `--user` variant, Homebrew prefixes.
  *Done when:* by hand on macOS 15, recorded in the notes; CI on macOS runs install up to
  `launchctl bootstrap` if the runner allows it.

- [ ] **5. `status`, `start`, `stop`, `restart`, `logs`.**
  *Done when:* tests for the output and CI calls each.

- [ ] **6. Documentation.**
  *Done when:* the docs render tests pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
