# M20 — Security scan

> [All milestones](README.md) · [Features index](../README.md)

Moderators get a second opinion on what an item says and does (owner, 2026-10-28): NVIDIA's
SkillSpector, installed by the operator, scans each submission revision, statically by default and
with semantic (LLM) analysis when a provider is set up (by the operator; by root too once 136
lands) and root chooses it, and its
findings show on the review page. Advisory by default: it never blocks a submit or a release, and
once 137 lands, blocks an approval only when root sets a threshold score.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [135](../security-ai/135-skill-scanner/SPEC.md) | Security scan of submissions: the operator installs SkillSpector at a pinned version (`RONNE_SKILL_SCANNER`), root turns it on and picks the item types; each revision is scanned statically (`--no-llm`) by default, or with semantic analysis when the operator sets up a provider (`RONNE_SKILL_SCANNER_ENV_*`) and root chooses it, in a private folder with a short environment allowlist and a timeout; a Security scan panel on the review page | 013, 014, 015, 060, 129 | done (the Documentation in ronne-web `feat/135-skill-scanner`) |
| [136](../security-ai/136-scanner-settings-in-web/SPEC.md) | Scanner settings in Admin › Settings: root sets the provider, model, endpoint, timeout and a write-only API key (encrypted at rest as identity providers' secrets, re-keyed by `rotate-secret`, never shown or logged); endpoints `https://` and not internal unless the operator allows the host; root picks the command from the operator's `RONNE_SKILL_SCANNERS` list; environment variables still win | 135, 106, 098, 099 | done (the Documentation in ronne-web `feat/136-scanner-settings-in-web`) |
| [137](../security-ai/137-scan-gate-and-panel/SPEC.md) | Security scan redesign and gate: a summary card with the score, recommendation and findings by category, and a dialog with every finding (category tabs, jump to code, remediation, mark false positive, JSON export); authors see their own scan; root sets a threshold score that blocks approval, failing closed on a pending, failed or missing scan, with root's audited override | 135, 136, 014, 054, 058 | done (the Documentation in ronne-web `feat/137-scan-gate-and-panel`) |
| [156](../security-ai/156-scanner-container/SPEC.md) | The security scanner as a ready-to-run container: a small scan service in the scanner image, built on the server by compose behind the `scanner` profile (static, no outbound network) and `scanner-semantic` (semantic, with internet); Ronne reaches them through the proxy on internal networks they never share with Ronne, by address and a scan key (`RONNE_SKILL_SCANNER_URL`, `RONNE_SKILL_SCANNER_SEMANTIC_URL` and `RONNE_SCAN_KEY`, written by the installer), so no Docker socket and no `.env` editing; `install.sh` asks, on a fresh install or a rerun; a host install runs the same container with `scanner.compose.yaml` | 135, 136, 137, 005, 081 | done, two acceptance checks left for after the merge (a fresh install from GitHub, a semantic scan with a provider) (the Documentation in ronne-web `feat/156-scanner-container`) |
