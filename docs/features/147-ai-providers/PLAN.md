# 147 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "AI providers" row, and its "Security scan" row pointing at 147 for the provider.
  - 136's SPEC notes that its provider section moved to 147.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. The `ai_providers` table and repository.** [risky]
  - The migration, the repository interface and its Kysely implementation in a new `ai` domain.
  - Keys sealed with this feature's HKDF `info`, bound to id, kind and origin (`crypto/sealed.ts`).
  - `rotate-secret` re-seals `key_enc`.
  - *Done when:* db tests (SQLite, then the servers for these files) cover create, edit, delete, the
    unique name, the 20-provider cap, a key bound to another id or origin not opening, and
    rotate-secret.

- [ ] **3. Endpoint checks and the probe, shared.** [risky]
  - Move `endpoint.ts` and `provider-probe.ts` to the `ai` domain unchanged in behaviour; the scan
    imports them from there.
  - `RONNE_AI_HTTP_HOSTS`, merged with `RONNE_SKILL_SCANNER_HTTP_HOSTS`.
  - *Done when:* their existing tests pass from the new place, plus tests for both allowlist names.

- [ ] **4. The settings service and the environment provider.** [risky]
  - Create, edit, delete, Test connection, `forUse(id)`, the key rules of 136 (empty keeps, kind or
    origin change drops), the environment provider as read-only, "Used by" from registered
    consumers, audit without the key.
  - *Done when:* db tests cover each rule, the key absent from every returned value and audit row,
    and a log capture with no key in it.

- [ ] **5. Moving 136's settings.** [risky]
  - A one-time start-up step under a job lease: the provider row, the re-sealed key, the scanner's
    choice, the old rows deleted; idempotent.
  - *Done when:* db tests cover a full 136 setup, one without a key, one whose key doesn't open, none
    at all, and two runs at once moving it once.

- [ ] **6. The scanner picks a provider.**
  - `scanSetup` builds SkillSpector's variables from `forUse`; the environment still wins.
  - The Security scan tab's provider section becomes the choice and the model.
  - *Done when:* the scan's existing tests pass, with new ones for a picked provider, a deleted one
    (static) and an endpoint refused at scan time.

- [ ] **7. Workspace consent.** [risky]
  - `workspaces.ai_consent_at` and `ai_consent_by` (migration), the switch on a private workspace's
    settings page (its admins and root) and on Account (the personal workspace's owner), naming the
    providers' hosts; `workspace.ai_consent` audited.
  - The scan job reads it when a scan starts: no consent in a private or personal workspace means
    static, with the card's reason.
  - *Done when:* db tests cover public, private with and without consent, personal, a switch turned
    off while a scan is queued, and a scope moved into a private workspace, with no request reaching
    the fake provider without consent; an e2e test turns it on for a private workspace.

- [ ] **8. Ronne's client.** [risky]
  - OpenAI-compatible (with Azure's variant) and Anthropic Messages over `node:https`, pinned
    addresses, no redirects, timeout, answer cap, token counts, Ronne's short reasons.
  - *Done when:* unit tests against a local fake server cover both formats, Azure's path and header,
    a slow answer, an oversized answer cut, a 401, a 429, a body that isn't the expected JSON, and
    the provider's error body never in the reason or the logs.

- [ ] **9. The AI providers tab.**
  - List, dialog, Test connection, delete with "Used by", the environment row; messages in the three
    languages.
  - *Done when:* component tests and an e2e test (desktop and phone) add, test, edit and delete a
    provider and pick it in Security scan.

- [ ] **10. Documentation.** The topics, sections and helpers in the spec's Documentation section, in
  a ronne-web branch.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
