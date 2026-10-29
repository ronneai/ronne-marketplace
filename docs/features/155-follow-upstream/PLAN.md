# 155 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "Import" row says upstream changes come in as proposals (155).
  - `docs/features/README.md` lists 155 in M26.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. The follow columns and settings.** [risky]
  - The migration on `item_imports`; Follow, Unfollow and Follow again for the item's maintainers
    only, audited.
  - *Done when:* db tests on the four databases cover who may change it, the defaults for a branch, a
    tag and a commit, and the audit events.

- [ ] **3. The check job.**
  - The scheduler's daily job under its lease, and Check now: references, the shallow fetch when the
    head moved, the folder compared, the licence found again, the states and reasons, `failing_since`.
  - *Done when:* tests against the local git server cover no move, a move outside the folder, a change,
    a licence change, a deleted branch and path, a host off the list, an unreachable host for 7 days,
    and two processes at once.

- [ ] **4. Bringing the change in.**
  - Before the first release, 051's update of the draft; after, a change proposal merged as 042's,
    owned by the importer (or the fallback owner), updated rather than duplicated; the notification
    (139); `item.source_updated`.
  - *Done when:* db tests cover each path, a draft in review left alone, a disabled importer, and the
    notification sent to each maintainer.

- [ ] **5. The screens.**
  - The follow state, Follow and Unfollow, and Check now on the item page; the proposal's source line;
    messages in the three languages.
  - *Done when:* component tests cover each state; an end-to-end test changes a source on the local
    git server, runs Check now and sees the proposal; the phone sweep passes.

- [ ] **6. Documentation.** The topics, sections and helpers in the spec's Documentation section,
  in ronne-web's `feat/155-follow-upstream` branch.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
