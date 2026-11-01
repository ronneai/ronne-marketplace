# 164 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "Security scan" and "AI providers" rows say the consent lands here, 147's spec
    says it reuses it, and `docs/features/README.md` lists 164 in M28 and adds 164 to 147's
    dependencies.
  - *Done when:* all three say what this spec says, and `pnpm witness:check` passes.

- [ ] **2. Migration and model.** [risky]
  - `workspaces.ai_consent_at` and `ai_consent_by`.
  - `allowsAiProviders(workspace)` (public: yes; private or personal: the column).
  - `setAiConsent` with its permission rules and the `workspace.ai_consent` audit event.
  - *Done when:* migration db tests pass on the three servers (`pnpm test:db:postgres -- <file>`,
    `:mysql`, `:mariadb`); db tests cover who may set it (admin, root, owner; a moderator, a member
    and another user refused), the owner-only "on" for personal workspaces, and the audit row.

- [ ] **3. The scan follows it.** [risky]
  - The scan job resolves each revision's workspace and passes `semantic` only when the policy
    chose it, a provider is set, and the workspace allows.
  - The result records why it was static.
  - *Done when:* db tests with a fake scanner cover public, private without and with consent,
    personal without and with consent, a switch turned off while queued, and a scope moved in.

- [ ] **4. Screens.**
  - The switch on the workspace page (private only) and on Account (the personal workspace), with
    the provider's host or "No AI provider is in use".
  - The card's static reason.
  - The count on Settings › Security scan.
  - *Done when:* component tests cover each state; an e2e test turns a private workspace's switch
    on and sees the audit line.

- [ ] **5. Messages.**
  - Every new key in `en`, `pt` and `fr`.
  - *Done when:* the parity and raw-text tests pass; the phone sweep passes on the workspace page
    and Account.

- [ ] **6. Documentation, 147 and the threat model.**
  - `security-scan#semantic`, `workspaces#ai-providers` and `account#ai-providers` (new,
    `topics.ts` in both repositories), the privacy line, the helper.
  - 147's spec: its consent is built (no new columns).
  - The threat model's §4.8.
  - *Done when:* the docs render tests and `pnpm docs:links` pass, and the helper lands on a real
    section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
