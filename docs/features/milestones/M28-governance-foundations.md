# M28 — Governance foundations

> [All milestones](README.md) · [Features index](../README.md)

Planned on 2026-11-01, with M29, M30, M31: why, and in what order, in [the milestones](README.md#planned-on-2026-11-01).

Small changes that close the cheapest governance gaps, with no new concepts.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [161](../install/161-setup-code/SPEC.md) | Setup code: a one-time code made when the server starts and isn't set up, kept in the data folder (0600) and printed in the server's log and by the install script (which, on this computer, opens `/setup#code=…`), asked for by every step of the web setup, rate-limited; `setup-code` prints it again; the terminal setup doesn't ask; deleted once root exists | 036, 003, 005, 080, 081, 082, 083, 100 | done (the Documentation in ronne-web `docs/marketplace-161-setup-code`) |
| [162](../identity/162-token-lifetime-policy/SPEC.md) | Token lifetime policy: root sets the longest lifetime on the Authentication tab (shorter for reviewers and root; defaults 365 and 90 days), every way of making a token honours it, Shorten applies it to older tokens; a person's tokens listed on their page with Revoke; changing your password (a box, checked) and root's two-factor reset revoke tokens | 009, 105, 107, 122, 123, 128 | done (the Documentation in ronne-web `docs/marketplace-162-token-lifetime-policy`) |
| [163](../review/163-override-reasons/SPEC.md) | Overrides need a reason: root's approval of their own submission requires one again (optional since 054), on the review page and in Approve many when the selection has overrides; shown on the review page and the Overview | 014, 054, 058, 137 | done (the Documentation in ronne-web `docs/marketplace-163-override-reasons`) |
| [164](../workspaces/164-workspace-ai-consent/SPEC.md) | Workspaces consent before an AI provider sees their items: 147's Allow AI providers switch, built first for the security scan; private workspaces (admins or root) and personal ones (their owner) are scanned statically until they allow it; the switch names the provider's host; audited | 093, 114, 092, 135, 136, 137 | specified |
| [165](../operations/165-encrypted-backups/SPEC.md) | Backups encrypted by default: `backup` seals the archive with a passphrase (file, variable or asked; 12 characters at least for new ones), `--plain` by name with a warning, a schedule without a passphrase stops instead of writing plain; the runbook's schedules use a passphrase file | 099, 083 | specified |
| [166](../operations/166-audit-context/SPEC.md) | Audit context: `audit_log` gains the request ID, the channel (web, API, SCIM, terminal, job), the client, the workspace and the outcome, filled in `recordAudit` from the request context; the audit page filters by workspace and request ID; user agents cleared with addresses by retention and erasure; `audit.read` checked in the audit's own actions; people shown by name; the sidebar gains an Admin group, and its groups open and close | 007, 060, 100, 102, 103, 104 | done |
