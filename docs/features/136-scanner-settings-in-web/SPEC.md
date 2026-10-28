# 136 — Scanner settings in Admin › Settings

> Milestone: M20 · Depends on: 135, 106, 098, 099 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Security scan"), [135 SPEC](../135-skill-scanner/SPEC.md) decisions 3 and 5 · Contracts: none changed

## Goal

Root sets up the security scan entirely from Admin › Settings › Security scan, instead of asking
the server's operator to edit environment variables (owner, 2026-10-28). That covers the LLM
provider, its model, endpoint and **API key**, the timeout, and which scanner command to run. The
one thing that stays with the operator is the list of commands root may choose from: whoever sets a
command runs anything on the server, and that would reach every secret Ronne holds.

## Scope

**In:**
- **Provider settings in the web:**
  - the provider: one of 135's six (`openai`, `anthropic`, `nv_build`, `azure_openai`,
    `openai_compatible`, `ollama`);
  - the model, the endpoint where the provider has one, and the timeout (30–3600 seconds).
- **The API key, write-only:**
  - stored encrypted, never shown again after Save, never sent to the browser, never in the audit
    log or the logs;
  - the tab shows "Key set" or "No key", with **Replace** and **Remove**.
- **Encryption at rest, as 106 does for identity providers' client secrets:**
  - AES-256-GCM, under a key derived with HKDF-SHA256 from `AUTH_SECRET` with this feature's own
    `info` string, a fresh nonce per value, and the setting's key as associated data
    (`provider-secrets.ts`'s pattern, reused rather than copied);
  - `rotate-secret` (098) re-encrypts it with the client secrets;
  - a key that no longer decrypts (another `AUTH_SECRET`) reads as "No key", with a notice, never
    as an error page.
- **Endpoint checks:**
  - `https://` only; `http://` only for a host the operator allows (`RONNE_SKILL_SCANNER_HTTP_HOSTS`,
    for a local Ollama);
  - private, loopback, link-local and metadata addresses (for example `169.254.169.254`) are refused
    unless the operator allows them in the same list, so the field can't be used to reach internal
    services;
  - checked when saved and again when a scan starts (DNS can change), and stored as checked (the
    normalised URL), never as typed; backslashes, spaces and control characters are refused, as
    other URL parsers read them differently;
  - **the limit:** the scanner looks the host up again itself, so a name whose DNS answer changes
    between Ronne's check and that lookup (DNS rebinding) isn't covered. Only an egress proxy or
    firewall the operator runs closes that; the docs say so. Test connection, which Ronne makes
    itself, connects only to the addresses it checked and follows no redirects.
- **The command, chosen from the operator's list:**
  - `RONNE_SKILL_SCANNERS`: a JSON array of allowed commands, each a JSON array as 135's
    `RONNE_SKILL_SCANNER` is (absolute path, no shell);
  - root picks one in the tab. With one in the list it's chosen by itself; with none, scanning can't
    be turned on, as now.
- **Environment variables still work, and win.** An operator who sets 135's `RONNE_SKILL_SCANNER` or
  `RONNE_SKILL_SCANNER_ENV_*` keeps them. The tab shows those values as set by the server, read-only
  (never the key).
- **Audit:**
  - `settings.skill_scan` records what changed: the provider, model, endpoint host, timeout, the
    command's index in the list, and `keyChange`: `set`, `replaced` or `removed`;
  - never the key, and never the full endpoint URL (only its host, as userinfo and query strings can
    hold secrets).

**Out** (and where it goes instead):
- **Typing a command in the web.** Not planned (135 decision 3 stands): that's code execution on the
  server.
- **Keys protected from a full backup.** `rmk-server backup` holds the database and the settings
  file, with `AUTH_SECRET`, so a full backup can decrypt the key, as it can the identity providers'
  secrets today. Encrypted backups or a separate key store are a later feature; the backup runbook
  says so.
- **An external secret manager** (Vault, a cloud KMS). Later, if asked.
- **Several providers at once, or one per workspace.** One provider per instance.

## Behaviour

**The tab.** Below 135's switch, types and analysis:
- **Scanner:** the operator's commands, by their first part's file name, as a choice (or one line
  when there's one). Each is described by its position and file name only, never its arguments.
- **Provider** (shown when semantic is chosen, or to set it up before choosing it):
  - the provider, the model, the endpoint where needed, and the key field (a password input, empty,
    "Key set" beside it once there is one);
  - **Test connection**: one request to the provider's models endpoint with the key, saying
    "Reached <host>", "The key was refused" or "Couldn't reach <host>". Never item content; no
    output beyond that line.
- **Timeout:** seconds, 300 by default.
- A setting the environment fixes is shown with "Set on the server", and its field is read-only.

**Saving.** One Save for the tab:
- The key is sent only when root typed one; an empty field keeps the stored key.
- A kept key is removed when the provider or the endpoint's origin (scheme, host and port)
  changes, unless root types a key with the change: a key typed for one provider or endpoint never
  goes to another. The sealed value holds the provider and origin with the key, and it opens only
  for that pair: a save that raced this one, or a hand edit, can't redirect it either.
- Remove asks first, then deletes the encrypted value.
- Semantic still needs a provider (135): a provider whose required key or endpoint is missing counts
  as none, as `scanProvider` decides today.

**Running.** The scan job builds the provider the same way as 135, from the environment if set, else
from the settings with the key decrypted in memory for that run only. It's passed only to the
scanner's environment, by 135's allowlist; the endpoint is checked again first, and a refused one
fails the scan with a new short reason, `endpoint refused`.

## Edge cases

- **`AUTH_SECRET` rotated without `rotate-secret`** (it was edited by hand): the key no longer
  decrypts. The tab says "The stored key can't be read: enter it again", and semantic scans run
  static until then.
- **A restore onto another instance** (099): the same as the case above, unless its `AUTH_SECRET`
  came with it.
- **The operator's list changes and drops the chosen command:** the tab says so, and scanning stops
  as if no command were set (scans fail `not configured`) until root picks another.
- **Two roots save at once:** the last one wins; each save is audited.
- **The key in the data download** (104): never; it's an instance setting, not personal data.

## Data

- `instance_settings` rows (no migration):
  - `skill_scan_provider`, `skill_scan_model`, `skill_scan_endpoint`, `skill_scan_timeout`;
  - `skill_scan_command`: the index into `RONNE_SKILL_SCANNERS`;
  - `skill_scan_key_enc`: `v1.<nonce>.<ciphertext and tag>`, with the setting's key as associated
    data.
- Nothing new in the audit log's shape: `metadata` gets the fields above, never the key.

## Documentation

- **Settings › Security scan** (`settings#security-scan`): set up from the tab; what the operator
  still provides (the list of commands, any `http://` or private hosts); how the key is kept;
  "Test connection"; that the environment wins.
- **Backups** (`backups`): a full backup can decrypt stored keys, as it can identity providers'.
- **Install guide** and `docs/knowledge/skill-scanner.md`: `RONNE_SKILL_SCANNERS` and the host
  allowlist, beside 135's variables.
- **Where to get SkillSpector** (owner, 2026-10-28): the Settings topic, the install guide and the
  knowledge note link NVIDIA's guide (`docs.nvidia.com/skills/scanning-agent-skills`), its
  repository (`github.com/NVIDIA/SkillSpector`), and the website links Ronne's install note.
- **Helpers:** the key field, "How is the key kept?" → `settings#security-scan`.

## Acceptance criteria

- [ ] Root sets the provider, model, endpoint, key and timeout in the tab, and a semantic scan uses
  them; the environment's values, when set, win and are shown read-only.
- [ ] The key is stored only as AES-256-GCM ciphertext bound to its setting, and is never returned to
  the browser, written to the audit log or logged. Tests show a key set through the tab is absent
  from the page props, the action's response, the audit metadata and the log lines.
- [ ] `rotate-secret` re-encrypts it; a key that no longer decrypts reads as "No key" with a notice,
  and semantic runs static.
- [ ] An endpoint that isn't `https://`, or resolves to a private, loopback, link-local or metadata
  address, is refused on save and at scan time, unless the operator allowed that host.
- [ ] Root can choose only among `RONNE_SKILL_SCANNERS`; no web input becomes a command or an
  argument.
- [ ] Test connection makes one request to the provider and reports only reached, refused or
  unreachable.
- [ ] Every change is audited without the key or the endpoint's path and query.
- [ ] The tab is in English, Portuguese and French, and passes the phone sweep.
- [ ] The Documentation and inline helpers listed above say what the feature does.

## Decisions

1. **Provider, model, endpoint, key and timeout move to the web; the command stays the operator's,
   chosen from a list** (owner, 2026-10-28, from Claude's proposal). This changes 135's decision 5 (the
   provider and key from the environment only) and keeps its decision 3 (no command from the web).
2. **106's encryption, not a new scheme** (Claude): one reviewed implementation, already re-keyed by
   `rotate-secret`.
3. **The environment wins** (Claude): an operator who manages secrets outside Ronne keeps doing so,
   and nothing set that way can be changed from the web.

## Open questions

- Should Test connection also be offered for the scanner itself (run it on a sample skill)?
