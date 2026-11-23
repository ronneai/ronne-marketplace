# M30 — Trust and hardening

> [All milestones](README.md) · [Features index](../README.md)

Planned on 2026-11-01, with M28, M29, M31: why, and in what order, in [the milestones](README.md#planned-on-2026-11-01).

What a developer installs can be traced to this instance's release, and the server ships with fewer
privileges. Shared rate limits stay 109 (M17).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 175 | Release signing with an instance key (MVP §14.2): an ed25519 key made at setup and sealed like the other secrets, each version's manifest and checksum signed at release (older versions on first read), `rmk login` pinning the key and every install and feed build verifying it | 015, 022, 078, 099 | planned |
| 176 | Signed release files: `checksums.txt` and the bundles signed in the release workflow, GitHub build attestations for bundles and packages, and the install script verifying the signature when it can | 081, 084, 085 | planned |
| 177 | Container hardening: `web` and `proxy` with no capabilities they don't need and no new privileges, read-only where they can be; the optional database images by digest; no default database password (the install script makes one) | 005, 080, 081 | planned |
