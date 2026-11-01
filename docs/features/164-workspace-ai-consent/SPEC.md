# 164 — Workspaces consent before an AI provider sees their items

> Milestone: M28 · Depends on: 093, 114, 092, 135, 136, 137 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Security scan", "AI providers"), [147 SPEC](../147-ai-providers/SPEC.md) (its consent, brought forward here) · Contracts: none changed

## Goal

When root chooses semantic scanning (135, 136), every scanned revision goes to the LLM provider,
including those in private and personal workspaces. Root is warned where the files go, but the
private workspace's own admins aren't asked.

147 designed the fix: a workspace allows AI providers, or its content never reaches one. This
feature builds that consent now, for the security scan, ahead of 147's provider list, so a private
workspace's items stay on the server unless its admins say otherwise (owner, 2026-11-01). 147 then
reuses it for triage and every later AI feature.

## Scope

**In:** 147's consent, as its spec words it, for the security scan:
- **One switch per workspace, Allow AI providers.**
  - `global` and every public workspace count as allowing, with no switch.
  - A **private workspace** (093) allows only when its admins, or root, turn it on. The switch is
    on the workspace's page, beside its visibility (`workspaces#managing`).
  - A **personal workspace** (114) allows only when its owner turns it on, on Account.
  - Off for every private and personal workspace when this lands, including those whose revisions
    went to semantic scans before.
- **The switch names where items would go.** "Items in this workspace will be sent to
  api.example.com for the security scan." The host comes from the scan's provider (136's settings,
  or the operator's `RONNE_SKILL_SCANNER_ENV_*`). With no semantic scan set up: "No AI provider is
  in use. This applies if root turns one on."
- **The scan follows it.**
  - The job reads the revision's workspace and its consent when the scan starts.
  - Without consent it runs static (`--no-llm`), never skipped, so the static scan still runs and
    never leaves the server.
  - The scan's card says "Static: this workspace hasn't allowed AI providers".
- **Root's Security scan tab** (`security-scan#settings`), with semantic chosen: "Semantic for
  public workspaces and for 2 of 9 private and personal ones that allowed it".
- **Audit:** `workspace.ai_consent`, with on or off and the hosts named, by whom.

**Out** (and where it goes instead):
- **The provider list, triage and reports:** 147–151. They read this switch, and its wording grows
  to name them ("for the security scan and AI triage").
- **A provider per workspace:** never (147).
- **Removing results of semantic scans already made:** stored scans stay. They are findings, not
  item content.

## Behaviour

**A private workspace, semantic scanning on.**
1. An admin sees the switch, off, naming `api.example.com`. Revisions sent there are scanned
   statically, and their cards say why.
2. The admin turns the switch on. The next revision is scanned semantically.
3. Turned off again, the next scan is static. A scan queued meanwhile follows the switch as it is
   when the scan starts.

**A personal workspace.** Its owner sees the same switch on Account › AI providers. Root can't turn
it on for them: it's their own space (114). Root can turn it off.

**Root.** On any private workspace's page root can turn the switch on or off, audited like an
admin's change.

## Edge cases

- **A scope moved into a private workspace** (115): its next scans follow the target's consent.
- **A public workspace turned private** (093): starts not allowing, and the switch appears off.
- **A private workspace turned public:** counts as allowing. Its stored consent stays for the day
  it's private again.
- **The provider's host changes** (root edits 136's endpoint): consent stays, and the switch names
  the new host. 147 decides whether a new host asks again (its open question).
- **An erased owner's personal workspace** (103): nothing is scanned there any more.
- **A revision of a public workspace's item depending on a private one:** impossible (093). The
  scan reads one revision's files only.

## Data

- A migration: `workspaces.ai_consent_at` and `ai_consent_by` (nullable, as §9.4 prefers
  timestamps to booleans; `ai_consent_by` set null when the user is deleted). Set when a private or
  personal workspace allows, cleared when it stops. These are 147's columns: 147 doesn't add them
  again.

## Documentation

- **Security scan** (`security-scan#semantic`): only workspaces that allowed AI providers go to
  semantic analysis; the others are scanned statically.
- **Workspaces**: a new section, `workspaces#ai-providers` ("AI providers and your workspace"):
  what the switch does, who sets it, what's sent. In `topics.ts` here and in ronne-web together.
- **Account**: the personal workspace's switch (`account#ai-providers`, new, with the same pair of
  `topics.ts` changes).
- **Privacy** (`privacy#retention`, or a new `privacy#ai`): what leaves the server and when.
- **Helpers:** the switch's "What is sent?" → `workspaces#ai-providers`.

## Acceptance criteria

- [ ] The migration adds the two columns on all three dialects.
- [ ] A private workspace's admins and root, and a personal workspace's owner, can change the
  switch, each change audited; anyone else can't, and public workspaces have no switch.
- [ ] A scan of a revision in a private or personal workspace without consent runs static even
  with semantic chosen; with consent it runs semantic; a db test with a fake scanner checks the
  `semantic` flag it receives.
- [ ] The card says why a scan was static; the switch names the provider's host, or that none is
  in use.
- [ ] Root's Security scan tab counts the allowing private and personal workspaces.
- [ ] Every new text is a message in English, Portuguese and French; the workspace page and
  Account pass the phone sweep.
- [ ] The Documentation, 147's spec (its consent built here) and the threat model (§4.8, the row on
  content sent off the server) say what the feature does.

## Decisions

1. **147's consent, built first for the scan** (owner, 2026-11-01). Semantic scanning already sends
   private content today, so the consent can't wait for 147's provider list.
2. **Only the owner turns a personal workspace's switch on** (Claude): it's theirs alone (114). Root
   can turn it off, as root can stop any provider use.
3. **Static, never skipped, without consent** (147): the static scan never leaves the server, and a
   missing scan would block approval under 137's gate.

## Open questions

- None of its own. Whether a changed host asks again is 147's question.
