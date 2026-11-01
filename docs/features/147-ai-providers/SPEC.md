# 147 — AI providers, set up once and shared

> Milestone: M24 · Depends on: 136, 122, 106, 098, 099, 092, 093, 114, 164 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("AI providers", "Security scan"), [136 SPEC](../136-scanner-settings-in-web/SPEC.md) · Contracts: none changed

## Goal

Root sets up an AI provider once, in **Admin › Settings › AI providers**, and every feature that
needs a model picks one from that list: the security scan's semantic analysis (135, 136) today, AI
triage (148–151) next (owner, 2026-10-29: "reusable settings for AI providers; we don't need to
repeat them in the scanner and triage"). Keys stay in the database, encrypted, never in `.env`.

Today the provider lives inside the Security scan tab (136). This feature moves it out, keeps
everything 136 promised about the key and the endpoint, and adds the part triage needs that the
scanner never did: Ronne itself calling the model.

## Scope

**In:**
- **A new Settings tab, AI providers** (`?tab=ai`), root only, after Security scan:
  - a list of providers, each with a **name** root gives it ("Company OpenAI", "Local Ollama"),
    its **kind**, its default **model**, its endpoint's host, "Key set" or "No key", and what uses
    it ("Security scan", "AI triage");
  - **Add provider**, **Edit**, **Test connection** and **Delete** on each.
- **Kinds:** 135's six, unchanged: `openai`, `anthropic`, `nv_build`, `azure_openai`,
  `openai_compatible`, `ollama`. Each kind says whether it takes a key and an endpoint, as
  `providerFields` does today.
- **Everything 136 does for one provider, for each of them:**
  - the key write-only: never shown again after Save, never sent to the browser, never in the audit
    log or the logs; Replace and Remove;
  - sealed with AES-256-GCM through `crypto/sealed.ts`, under this feature's own HKDF `info`, bound
    to the provider's id, kind and endpoint origin, so a key typed for one provider or host never
    opens for another; `rotate-secret` re-seals it;
  - the endpoint checks of `scans/models/endpoint.ts`: `https://` only, private, loopback,
    link-local and metadata addresses refused unless the operator allows the host, checked on save
    and again before each use, stored normalised. The operator's allowlist gets a general name,
    `RONNE_AI_HTTP_HOSTS`; `RONNE_SKILL_SCANNER_HTTP_HOSTS` keeps working and the two are merged;
  - Test connection: the one request `provider-probe.ts` makes, to the checked addresses, no
    redirects, "Reached", "The key was refused" or "Couldn't reach".
- **The environment still wins.** A provider the operator sets in the environment
  (`RONNE_SKILL_SCANNER_ENV_*`, 135) shows in the list as **Set on the server**, read-only, never
  with its key. Any feature may pick it, as it may pick one root made.
- **Consumers pick a provider.** A feature that uses a model stores the provider's id and, if it
  wants another than the provider's default, a model. The Security scan tab's provider section
  becomes **Provider for semantic analysis**: a choice from this list, the model, and a link to the
  AI providers tab. The command, the timeout, the types and the threshold stay in the Security scan
  tab.
- **Moving 136's settings over:** on the first start after this feature, a provider stored by 136
  (`skill_scan_provider`, `_model`, `_endpoint`, `_key_enc`) becomes a provider named "Security
  scan", the scanner picks it, and the old rows go. The key is opened under 136's purpose and sealed
  under this one; one that no longer opens moves without its key and says "Enter the key again".
  Done once, under a job lease, so two replicas can't both do it.
- **Ronne's own client for the model**, for 148 onwards (the scanner keeps getting environment
  variables, as now):
  - two wire formats over `node:https` with the checked addresses pinned, as the probe does: the
    OpenAI-compatible chat completions API (`openai`, `openai_compatible`, `ollama`, `nv_build`,
    and `azure_openai` with its deployment path and `api-key` header) and Anthropic's Messages API;
  - no tools, no function calling, no streaming to the browser: one request in, text out;
  - a timeout, a cap on the answer's size (read no further than it), and the token counts the
    provider reports, kept for 148's limits;
  - errors become short reasons written by Ronne (`timeout`, `refused`, `unreachable`,
    `rate limited`, `bad answer`), never the provider's body, which can echo the prompt.
- **Workspaces consent before their content goes to a provider** (owner, 2026-10-29): one switch
  per workspace, **Allow AI providers**, for every feature that sends item content to one (the
  semantic security scan now, triage (148) and its reports (151) later):
  - **built first in [164](../164-workspace-ai-consent/SPEC.md)** (owner, 2026-11-01), for the
    security scan: the switch, its columns and its audit event exist when 147 starts; 147 widens
    the switch's wording to every feature that uses a provider and adds nothing to the data;
  - `global` and other public workspaces count as allowing;
  - a **private workspace** (093) only when its admins (or root) turn it on, on the workspace's
    settings page;
  - a **personal workspace** (114) only when its owner turns it on, on Account;
  - the switch names the hosts of the providers the features use: "Items in this workspace will be
    sent to api.example.com"; it is off for every private and personal workspace when this lands,
    including for semantic scans that ran without asking before (135, 136).
- **Deleting a provider** a feature uses asks first, saying which ones; those features then have no
  provider (the scan runs static; triage stops with "No provider").
- **Audit:** `settings.ai_provider_created`, `_changed`, `_deleted`, with the name, kind, model,
  endpoint host and `keyChange` (`set`, `replaced`, `removed`); never the key, never the full URL.
  Choosing a provider for the scan stays in `settings.skill_scan`. `workspace.ai_consent` records
  the switch (on or off, by whom, the hosts named).

**Out** (and where it goes instead):
- **A provider per workspace.** One list for the instance, set by root. Workspaces choose whether
  their content may go to it (the consent above), not where it goes.
- **Keys protected from a full backup.** As 136: a full backup holds `AUTH_SECRET`; the Backups topic
  says so.
- **An external secret manager** (Vault, a cloud KMS). Later, if asked.
- **Embeddings.** Not needed by 149 (it uses the search index); a later feature adds an embeddings
  model to a provider if overlap needs it.
- **Spending in money.** Providers don't report prices the same way; 148 limits requests and
  tokens, not currency.

## Behaviour

**The tab.** The list, then the form in a dialog (full screen on a phone, 067): name (1–60
characters, unique), kind, model, endpoint where the kind has one (required where 136 required it),
key. Save checks the endpoint; Test connection works on the saved provider, or on the form's values
before saving.

**Saving a key**, as 136: sent only when typed; an empty field keeps the stored one; a change of kind
or endpoint origin drops a kept key unless one is typed with the change.

**Using a provider.** `aiProviders.forUse(id)` returns, for the server only, the kind, model, checked
endpoint and the key opened for that call; it checks the endpoint again first and gives `endpoint
refused` when the check fails. The scanner builds SkillSpector's variables from it (what
`providerFromSettings` does today); triage uses the client.

**Which features use it.** Each consumer registers a name and reads its own setting; the tab's "Used
by" column and the delete warning come from that.

**The scan and consent.** A revision in a private or personal workspace that hasn't allowed AI
providers is still scanned, statically (`--no-llm`), never skipped: the static scan never leaves the
server. The scan's card says "Static: this workspace hasn't allowed AI providers". Consent is read
when the scan starts, so a queued scan follows a switch turned off meanwhile.

## Edge cases

- **A key that no longer opens** (another `AUTH_SECRET`, a restore): "The stored key can't be read:
  enter it again"; the scan runs static and triage stops, until it's entered.
- **The environment provider disappears** (the operator removed it): features that picked it have no
  provider, and the tab says so.
- **Two roots edit one provider:** the last save wins; each is audited.
- **A provider renamed:** features keep it (they store the id).
- **A scope moved into a private workspace** (115): its next scans follow that workspace's consent;
  results already stored stay.
- **Consent turned off:** new semantic scans run static at once; nothing already stored is removed.
- **More than 20 providers:** refused; nobody needs more, and the list stays one screen.
- **The data download** (104): providers are instance settings, not personal data; never included.

## Data

- Migration `ai_providers`: `id`, `name` (unique), `kind`, `model`, `endpoint`, `key_enc`,
  `created_at`, `updated_at`, `updated_by`.
- `workspaces.ai_consent_at` and `ai_consent_by` (nullable, as §9.4 prefers timestamps to
  booleans): set when a private or personal workspace allows AI providers, cleared when it stops.
  Added by 164; 147 only reads them.
- `instance_settings`: `skill_scan_ai_provider` (an id, or `environment`) and
  `skill_scan_ai_model`; 136's `skill_scan_provider`, `_model`, `_endpoint` and `_key_enc` removed
  once moved.
- `rotate-secret` re-seals `ai_providers.key_enc` with the identity providers' and settings' secrets.

## Documentation

- **AI providers**, a new topic in the Administration group (`ai-providers`): what a provider is,
  adding one (`add`), the key and how it's kept (`keys`), the endpoint checks and
  `RONNE_AI_HTTP_HOSTS` (`endpoints`), Test connection, the environment provider, which
  features use one (`used-by`), and workspace consent (`consent`). `topics.ts` here and in ronne-web.
- **Security scan** (`security-scan#semantic`): the provider is now picked from AI providers; the key
  steps move to the new topic and link there.
- **Workspaces** (`workspaces#settings`) and **Account**: the Allow AI providers switch.
- **Backups** (`backups`): "a full backup can decrypt stored keys" now names AI providers.
- **Install guide** and `docs/knowledge/skill-scanner.md`: `RONNE_AI_HTTP_HOSTS`, and the older
  name still read.
- **Helpers:** the tab's "What is an AI provider?" → `ai-providers`; the key field's "How is the key
  kept?" → `ai-providers#keys`; the Security scan tab's provider choice "Where do I add one?" →
  `ai-providers#add`; the consent switch's "Where does our content go?" → `ai-providers#consent`.

## Acceptance criteria

- [ ] Root adds, edits, tests and deletes providers in the AI providers tab; the environment's
  provider shows read-only; the tab is root only.
- [ ] Keys are stored only sealed, bound to the provider's id, kind and origin, and are absent from
  page props, action responses, audit metadata and log lines (tests as 136's).
- [ ] `rotate-secret` re-seals provider keys on the four databases; a key that no longer opens reads
  as "No key" with a notice.
- [ ] Endpoint checks refuse what 136 refuses, on save and before each use, with both allowlist
  names read.
- [ ] A 136 setup moves to a provider named "Security scan", once, the scanner keeps scanning with it,
  and the old rows are gone; a key that can't be opened moves without it.
- [ ] The Security scan tab picks a provider and a model from the list; semantic scans use them.
- [ ] Ronne's client sends one request per call in both wire formats, with no tools, honours the
  timeout and the answer cap, records token counts, and reports only Ronne's short reasons.
- [ ] A private workspace without its admins' consent, and a personal one without its owner's, is
  scanned only statically: tests show no request reaches the fake provider, and the card says why.
- [ ] Every change is audited without the key or the endpoint's path and query.
- [ ] The tab is in English, Portuguese and French and passes the phone sweep.
- [ ] The Documentation and inline helpers listed above say what the feature does.

## Decisions

1. **One list of providers for the instance, picked by each feature** (owner, 2026-10-29). Changes
   136's tab: the provider moves out of Security scan.
2. **136's protections, reused, not rewritten** (Claude): the sealing, the endpoint checks and the
   probe were reviewed once; this feature generalises them.
3. **No AI SDK** (Claude): two wire formats over `node:https` cover the six kinds, keep the pinned
   addresses the endpoint check needs (an SDK would do its own lookup), and add nothing to the
   dependency tree. Revisit if a kind needs more than chat completions or Messages.
4. **The environment still wins** (136 decision 3).
5. **One consent per workspace, for every feature that uses a provider** (owner, 2026-10-29: the
   semantic scan asks the same consent as triage). Turned off for private and personal workspaces
   when it lands, so a scan that sent their content before without asking now stops until they
   choose.

## Open questions

- Should a provider record which models it offers (from the models endpoint Test connection already
  calls), so the model field can be a choice?
