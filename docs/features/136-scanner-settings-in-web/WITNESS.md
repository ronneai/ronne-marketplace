# 136 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-10-28 16:00 EDT, by a fresh agent (blind). Commit: 26edfd61 + uncommitted diff to docs/MVP/MVP.md, docs/features/135-skill-scanner/SPEC.md, docs/features/README.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §15's "Security scan" row describes 136 as its SPEC does | no | partly | The new text matches SPEC Scope and Decisions 1–3, but the row's earlier sentences ("the key never goes in the database or the web") and its rationale ("both stay with the operator") still contradict it |
| 2 | The wording fits a feature that isn't built yet | no | partly | §15 says "Since NNN" only for shipped features (118, 036, 093) and "Planned as …" otherwise; "**Since 136**" in §15 and "since 136" in §12 read as shipped |
| 3 | MVP §12's "Security scan in review" bullet matches 136 | no | confirmed | `MVP.md:739` → provider set by the operator, or by root in Admin › Settings, key encrypted at rest |
| 4 | 135 decision 3 points at 136 and says what 136 keeps | no | confirmed | "136 keeps this: root picks a command only from the operator's list." |
| 5 | 135 decision 5 points at 136 and says what changes | no | confirmed | "Changed by [136](…): root sets the provider and its key in the web too, the key encrypted at rest; the environment still wins." |
| 6 | README M20 lists 136 with the right dependencies and status | no | confirmed | `README.md:372` → "135, 106, 098, 099", as the SPEC header; `in progress` |
| 7 | The new relative links resolve | no | confirmed | `test -f` on both targets → ok |
| 8 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** not met: rows 1 and 2. The §15 row's old sentences and rationale are marked "until 136", and 136 is worded as planned in §15 and §12; README's M20 intro is updated too. Re-checked below.

### Re-check

Witnessed: 2026-10-28 16:01 EDT, by a fresh agent (blind). Commit: 26edfd61 + uncommitted `git diff docs/`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The §15 row no longer contradicts itself | no | confirmed | `MVP.md:1006` → "(until 136, below)", "(until 136)"; the rationale keeps only the command with the operator |
| 2 | 136 is worded as planned in §15 and §12, as MVP.md words unbuilt work | no | confirmed | `grep -n 'Since 136\|since 136'` → nothing; "Planned in [136] (owner, 2026-10-28): root will set …"; §12 "or, planned in [136], by root" |
| 3 | The row and the §12 bullet agree with each other and with 136's SPEC | no | confirmed | Write-only key, AES-256-GCM from `AUTH_SECRET`, `rotate-secret`, `https://` and not internal unless allowed, command from `RONNE_SKILL_SCANNERS`, environment wins |
| 4 | Sentence breaks are right | no | confirmed | "… ([135]). Planned in [136] …" |
| 5 | README's M20 intro no longer says only the operator sets up a provider | no | confirmed | "by the operator; by root too once 136 lands" |
| 6 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** met: the §15 row and §12 bullet agree, 136 is worded as planned throughout, and the README matches. (The remark "136 moves them" now reads "will move".)

## Task 2 — Encryption for instance secrets

Witnessed: 2026-10-28 16:06 EDT, by a fresh agent (blind). Commit: f1289d0b + working tree (uncommitted diff under apps/web). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A shared helper seals any instance secret: AES-256-GCM, HKDF-SHA256 from `AUTH_SECRET` with a per-purpose `info`, a fresh 12-byte nonce, the bound-to value as associated data, `v1.<nonce>.<ciphertext+tag>` | no | confirmed | `crypto/sealed.ts:25-34`; `instance-secrets.ts` has its own `INFO` and `boundTo: key`, and refuses keys not ending `_enc` |
| 2 | Identity providers use the helper and their stored format is unchanged | no | confirmed | Probe with HEAD's `provider-secrets.ts` (`git show HEAD:`): HEAD-sealed opens with the new code and the reverse, for `"shh"`, `""`, `"clé-秘密-🔑\r\n"` and 100,000 chars; the pinned fixture opens with HEAD's code → 3 passed |
| 3 | Identity providers' existing tests unchanged | no | confirmed | `git diff provider-secrets.test.ts` → 6 lines added (the fixture test), nothing changed |
| 4 | Unit test: round trip | no | confirmed | 81 passed. Mutation VERSION `v2` → the round-trip tests fail |
| 5 | Unit test: a value copied to another setting doesn't decrypt | no | confirmed | Mutation: constant AAD → that test and the provider's "another provider's row" fail |
| 6 | Unit test: another AUTH_SECRET | no | confirmed | Mutation: HKDF ignores `authSecret` → 4 failed; ignores `info` → "doesn't open an identity provider's secret" fails |
| 7 | Unit test: damaged values | no | confirmed | 6 malformed values and one changed byte. Mutation: catch removed → 8 failed |
| 8 | rotate-secret re-encrypts `_enc` settings in the same transaction, counted in the audit, never the key | no | confirmed | `services/instance-access.ts` reseals in the transaction, records `settingSecretsReencrypted`; db test checks the new value opens, other rows are left, the audit omits the key, a failed write changes nothing. Mutation: drop `resealSetting` → fails |
| 9 | The rotate-secret db test passes on the four databases | no | confirmed | SQLite in the 81; `pnpm test:db:postgres\|mysql\|mariadb -- …instance-access.db.test.ts` → 16 passed each |
| 10 | rotate-secret's messages mention the Admin › Settings secrets | no | confirmed | New rotate-secret.test.ts case and the failure message pass |

**Overall:** met: the helper keeps the identity providers' format (checked against HEAD's code), the scan key is resealed on all four databases, and each Done-when test fails when its behaviour is broken. Remark: the tests named the setting `skill_scan_api_key_enc`, the spec `skill_scan_key_enc`; the tests now use the spec's name.

### Adversarial

Witnessed: 2026-10-28 16:09 EDT, by a fresh agent (adversarial). Commit: f1289d0b + working tree (uncommitted diff under apps/web). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Values sealed by the old `provider-secrets.ts` still open, and the other way round | no | confirmed | Probe with HEAD's file → both directions give the value |
| 2 | Setting and provider secrets can't be swapped, even when the provider id equals the setting key | no | confirmed | Each throws its unreadable error. Mutation: same `INFO` → the swap test fails |
| 3 | Associated data binds a value to its setting key | no | confirmed | Mutation: no `setAAD` → fails. DB probe: the same value on `a_enc` and `b_enc` → `b_enc` counted unreadable, left byte-identical (4 dialects) |
| 4 | A fresh 12-byte nonce for every value | no | confirmed | 20,000 seals → 20,000 distinct nonces. Mutation: zero nonce → fails |
| 5 | Round trip, including empty and non-ASCII values | no | confirmed | 52 passed; a Unicode `AUTH_SECRET` round-trips |
| 6 | Another `AUTH_SECRET` → unreadable | no | confirmed | Unit test; `resealSetting` → null for a foreign value |
| 7 | Damaged or hostile values are refused and never decrypt to anything else | no | confirmed | Non-ASCII nonce, leading dot, `..`, `V1`, empty ciphertext, 15-byte tag, 50 MB → unreadable (29 ms). Remark: base64url decoding was lenient (a trailing CRLF or `!!` still opened the original value; GCM still authenticated) |
| 8 | Errors never hold secret material or `AUTH_SECRET` | no | confirmed | Message, stack and JSON checked; only `Not a secret setting: <key>` names a key |
| 9 | rotate-secret re-seals in the same transaction; on failure nothing changes and the file isn't written | no | confirmed | DB probe: `rekeySetting` throws on the 2nd key → the 1st rolled back, `writeSecret` never called. Mutation: no `rekeySetting` → db test fails |
| 10 | Only non-empty `_enc` rows count; unreadable values are kept | no | confirmed | 4 dialects: `xyenc`, `plain_ENC`, `model`, `garbage_enc` untouched; `Ünï_enc`, `p%_enc` and 20,000 chars re-seal. A second rotate → 0 re-sealed, rows byte-identical. Mutations on both filters → db test fails |
| 11 | The rotate-secret db test covers the scan key on the four databases | no | confirmed | 29 passed on each |
| 12 | Audit and log lines hold counts, never the key | no | confirmed | `settingSecretsReencrypted: <n>` only; `grep -c sk-1` over the db logs → 0 |
| 13 | A full backup can decrypt the key | no | confirmed | `run-backup.ts:49` keeps `AUTH_SECRET`; `archive.ts:176` dumps `instance_settings` |

**Overall:** met. After it: `open` now refuses parts that aren't strict base64url (a test covers a trailing CRLF, `!!` and padding), and the tests use the spec's name `skill_scan_key_enc`; the lock-free read is a note for task 4. 781 tests pass.
