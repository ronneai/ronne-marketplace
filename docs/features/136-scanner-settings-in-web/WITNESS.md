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

## Task 3 — Endpoint checks

Witnessed: 2026-10-28 16:20 EDT, by a fresh agent (blind). Commit: 62c6ff79 + working tree (`config.ts`, `endpoint.ts`, `system-resolver.ts`, their tests). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass | no | confirmed | `vitest run …endpoint.test.ts …system-resolver.test.ts` → 58 passed |
| 2 | Only `https://`; `http://` only for an allowed host; other schemes refused | no | confirmed | Probe: `http://localhost/` → `not https`, `ws://` → `not a url`. Mutation: no https check → 2 fail |
| 3 | Loopback refused, IPv4 and IPv6, `localhost` and `*.localhost` | no | confirmed | Also `127.0.0.1.`, full-width digits, `[::]`. Mutations: no 127/8 → 6 fail; no localhost check → 1 fails |
| 4 | Private addresses refused (10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7) | no | confirmed | Boundaries tested. Mutations: no 10/8 → 5 fail; no fc00::/7 → 3 fail |
| 5 | Link-local and metadata refused | no | confirmed | 169.254/16, fe80::/10 with a zone, fd00:ec2::254, 100.100.100.200. Mutations fail 5 and 2 |
| 6 | Addresses carrying IPv4 judged by it (mapped, NAT64, 6to4, compatible) | no | confirmed | Mutations: no NAT64 → 1 fails, no 6to4 → 1 fails; the mapped branch is redundant with Node's `BlockList` |
| 7 | A name resolving to any internal address is refused; failed or empty lookups `unresolved`; non-addresses internal | no | confirmed | Mutations `some`→`every` and non-address public each fail 1 |
| 8 | Userinfo refused, even on an allowed host | no | confirmed | Probe: `https://127.0.0.1:443@pub.test/`, `https://pub.test%2F@127.0.0.1/` → refused. Mutations fail 2 and 1 |
| 9 | Odd URL forms read as WHATWG reads them | no | confirmed | `a@b`, `\@`, `#@`, `?x=@127.0.0.1`, unclosed brackets, spaces, case, `[fe80::1%25en0]` → `not a url` |
| 10 | `RONNE_SKILL_SCANNER_HTTP_HOSTS` lets through only what it lists | no | confirmed | `config.ts:81`; probe passed. No `config.test.ts` case; entries with a port or a long IPv6 form never match (fail closed) |
| 11 | The resolver asks for every address and times out | no | confirmed | `system-resolver.ts:15`; test at 5000 ms with fake timers |
| 12 | The blocked ranges match the IANA special-purpose registries | no | partly | IPv4 matches. IPv6 misses 3fff::/20 (documentation, RFC 9637) and 5f00::/16 (SRv6, RFC 9602): a host resolving to 3fff::1 passes |
| 13 | The tests cover each address class | no | partly | Removing 198.51.100/24, 203.0.113/24, 192.88.99/24 or 100::/64 leaves the suite green; 240/4 only via 255.255.255.255 |
| 14 | Ready for the save and the scan to call (wired in task 4) | no | confirmed | Exports present, no callers yet, as PLAN says |

**Overall:** not met: rows 12 and 13.

### Adversarial

Witnessed: 2026-10-28 16:20 EDT, by a fresh agent (adversarial). Commit: 62c6ff79 + working tree (config.ts, PLAN.md, endpoint.ts and test, system-resolver.ts and test). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only `https://`; `http://` only for an allowed host | no | confirmed | `http://ollama.lan.evil.com/`, `http://127.0.0.1.nip.io/` → not https |
| 2 | Internal IPv4 literals refused in every form the parser accepts | no | confirmed | `%31%32%37.0.0.1`, full-width, `127.0.0.1。`, `0x7f000001`, `0`, `https:/\127.0.0.1` → internal address |
| 3 | Every IPv4 special-purpose range is internal | no | confirmed | All 15 listed; mutation dropping 169.254/16 → 5 fail |
| 4 | IPv6 internal ranges refused, mapped and embedded forms included | no | partly | All tried forms internal except `::ffff:0:127.0.0.1` (translated, RFC 2765) and `3fff::1` (RFC 9637) |
| 5 | A name resolving to any internal address is refused; odd resolver strings fail closed | no | confirmed | `::FFFF:127.0.0.1`, `[::1]`, `""`, `fe80::1%en0` → internal; throw or `[]` → unresolved |
| 6 | localhost names refused without DNS | no | confirmed | Full-width `localhost`, `localhost.:443` → internal |
| 7 | Userinfo refused, even on an allowed host | no | confirmed | `pub.test\t@127.0.0.1`, `pub.test%2F@127.0.0.1`, `ollama.lan@evil.com` → credentials in url |
| 8 | The checked host is the host the scanner gets | no | partly | `https://8.8.8.8\@169.254.169.254/` → ok as host 8.8.8.8, while Python's parsers read host 169.254.169.254 from the raw string |
| 9 | The allowlist can't be used for another host | no | confirmed | `ollama.lan.evil.com`, `evil.com/ollama.lan` don't match. Remarks: any port is allowed; entries with a port, wildcard or scheme never match |
| 10 | The resolver asks for every address and times out | no | confirmed | 1 ms timeout rejects; `{all:true, verbatim:true}` |
| 11 | `RONNE_SKILL_SCANNER_HTTP_HOSTS` is read into config | no | confirmed | `config.ts` diff; 64 passed |
| 12 | DNS rebinding between this check and the scanner's lookup is closed or stated | no | not met | The scanner resolves again itself; the limit wasn't stated. Test connection, made by Ronne, could pin the checked addresses |

**Overall:** not met: rows 4, 8 and 12. Fixed after both passes: 3fff::/20, 5f00::/16 and translated addresses added, with tests for every listed range; backslashes, spaces and control characters refused and the checked `href` returned for storing; SPEC states the rebinding limit, PLAN notes Test connection's pinning and the stored `href` for task 4; `config.test.ts` covers `httpHosts`. Re-checked below.

### Re-check

Witnessed: 2026-10-28 16:24 EDT, by a fresh agent (adversarial). Commit: 62c6ff79 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass | no | confirmed | `endpoint.test.ts`, `system-resolver.test.ts`, `config.test.ts` → 78 passed |
| 2 | 3fff::/20, 5f00::/16 and translated ::ffff:0:0:0/96 are refused, with tests | no | confirmed | Each mutation fails 1–2 tests; `3ffe::1`, `5eff::1` stay public, as they should |
| 3 | Every listed range has a test | no | confirmed | Removing 198.51.100/24, 203.0.113/24, 192.88.99/24, 100::/64 or narrowing 240/4 → 1 fails each |
| 4 | Backslash, space and control-character forms refused; `url.href` is the form passed on | no | confirmed | `endpoint.ts:24`; mutations fail. WHATWG vs Python `urlsplit` on 1845 hostile URLs: 167 accepted, 0 host differences. Storing `href` is task 4's (PLAN notes) |
| 5 | DNS rebinding against the scanner is stated as a limit | no | confirmed | SPEC.md "the limit"; Test connection's pinning is on task 4 in PLAN notes |
| 6 | `config.test.ts` covers `RONNE_SKILL_SCANNER_HTTP_HOSTS`, the environment over the file | no | confirmed | Removing or renaming the field → 1 fails |
| 7 | No internal address gets through with any URL or resolver form tried | no | confirmed | Every earlier probe refused; resolver strings with whitespace, short and octal forms, NAT64, 6to4, Teredo, zones refused. `::ffff:0:0:7f00:1` (::/8, not in the registry) counts public and didn't reach loopback |

**Overall:** met: findings (a)–(e) are fixed or stated, each test fails when its fix is reverted, and no internal address got through.

## Task 3 — Documentation links (owner's request)

The owner asked (2026-10-28) that the Documentation link NVIDIA's pages, so people can install SkillSpector.

Witnessed: 2026-10-28 16:25 EDT, by a fresh agent (blind). Commit: 62c6ff79 + working tree (ronne-web: 8dab20a + working tree). Machine: macOS 27 (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | ronne-web `links.ts` holds NVIDIA's guide, the SkillSpector repository and the install note on `main` | no | confirmed | `git diff www/src/content/links.ts` → the three URLs |
| 2 | Settings › Security scan links all three, in en, pt and fr | no | confirmed | A "Where to get it" paragraph in each `settings.tsx`, with the existing `LinkOut` helper |
| 3 | The built en, pt and fr settings pages contain the three hrefs | no | confirmed | `pnpm build` → exit 0; each href once per locale, `id="security-scan"` once |
| 4 | The install guide links NVIDIA's guide and the repository | no | confirmed | `install.md:319-322` |
| 5 | The knowledge note links them | no | confirmed | `skill-scanner.md:3-5` |
| 6 | SPEC's Documentation section says so | no | confirmed | "**Where to get SkillSpector** (owner, 2026-10-28)" |
| 7 | The links resolve to the right pages | no | confirmed | `curl -sIL` → 200, 0 redirects for all three; titles checked |
| 8 | pt and fr say what en says, per the translation guide | no | confirmed | Same sentences and order, "(em inglês)" / "(en anglais)"; glossary terms followed |
| 9 | Nothing claims more than the app does | no | partly | "keeps the scanner off the network" holds for static scans only (`SEMANTIC_NETWORK`); the site doesn't say installs without Docker only; "the version Ronne is tested with" vs "the reviewed commit" |
| 10 | ronne-web checks pass from `www/` | no | confirmed | lint, typecheck, 187 tests, build → exit 0 |

**Overall:** not met: row 9. The paragraph now says "keeps static scans off the network", "For now the scanner is for installs without Docker only", and "the pinned version", in all three languages. Re-checked below.

### Re-check

Witnessed: 2026-10-28 16:29 EDT, by a fresh agent (blind). Commit: 62c6ff79 + working tree (ronne-web: 8dab20a + uncommitted `settings.tsx` ×3, `links.ts`). Machine: macOS 27 (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The wrapper is described as keeping only static scans off the network | no | confirmed | en "keeps static scans off the network"; `skill-scanner.md:160` |
| 2 | The website says installs without Docker only, as the install guide does | no | confirmed | en "For now the scanner is for installs without Docker only."; `install.md:319` |
| 3 | "the version Ronne is tested with" became "the pinned version" | no | confirmed | `grep "tested with"` → none; `install.md:316` |
| 4 | pt and fr say the same as en, per the translation guide | no | confirmed | Same links, items and Docker sentence; terms and fr punctuation per the guide |
| 5 | ronne-web lint, typecheck and tests pass from `www/` | no | confirmed | exit 0; 187 passed |

**Overall:** met: with the first pass's confirmed rows, the Documentation links NVIDIA's guide and repository and Ronne's install note in all three languages, claiming no more than the app does. The website change is in ronne-web's `feat/136-scanner-settings-in-web`.
