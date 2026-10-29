# 149 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "AI triage" row gains overlap: search candidates, compared only with what every
    reader may see.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. Candidates.** [risky]
  - The index query, the visibility rule (public, `global`, own workspace), consent for private
    candidates, the item and base left out, top 8.
  - *Done when:* tests against a seeded index cover each workspace kind, a root requester, the item
    itself and a proposal's base left out, and search unavailable.

- [ ] **3. Prompt and answer.**
  - Candidate blocks, the cap with candidates cut first, `overlaps` in the schema, unknown names
    dropped, the `overlaps` column.
  - *Done when:* unit tests cover an answer naming an unsent item, a candidate over the cap, and the
    stored JSON; a db test for the column on the four databases.

- [ ] **4. Similar items on the pages.**
  - The section, the card's line, badges for yanked and deprecated, a candidate no longer visible.
  - *Done when:* component tests and an e2e test with a fake provider.

- [ ] **5. Documentation.** The section and helper in the spec's Documentation section, in a
  ronne-web branch.
  *Done when:* the docs render tests pass, and the helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
