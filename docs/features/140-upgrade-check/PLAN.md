# 140 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §15 has the "Upgrade check" row, and `docs/features/README.md` lists 140 in M21 with its
    dependencies.
  - *Done when:* both say what this spec says, and `pnpm witness:check` passes.

- [x] **2. The check.** [risky]
  - A pure `checkForUpdate({ fetch, current, now })`: the request (URL, timeout, `User-Agent`, size
    limit, same-host redirects only), parsing `tag_name`, semver comparison, the result or a short
    reason.
  - *Done when:* unit tests with a fake fetch cover newer, equal, older, a pre-release running, a bad
    tag, a 403, a 429, a timeout, a redirect to another host and an oversized body.

- [x] **3. The job, the settings and the notification.**
  - The scheduled job under a lease (10 minutes, then 24 hours), the `instance_settings` rows,
    `RONNE_UPDATE_CHECK` in `config.ts`, the notification to active roots once per version (139).
  - *Done when:* db tests cover the stored result, one notification per version per root, none on
    failure, none when off (fetch not called) and the lease; the scheduler test covers the timing.

- [x] **4. Settings › Updates and the sidebar mark.**
  - The tab (122's strip), Check now (once a minute), the commands per runtime from `runtime.ts`, the
    switch with the environment winning, the audit event; "Update available" at the sidebar's foot
    for root.
  - *Done when:* component tests cover each runtime's commands, the read-only switch and the mark
    (root only); an e2e test with a fake release answer sees the notification and the tab.

- [ ] **5. Messages.**
  - Every new key in `en`, `pt` and `fr`.
  - *Done when:* the parity and raw-text tests pass; the phone sweep passes on the tab.

- [ ] **6. Documentation.**
  - The `update#checking` section, the settings and privacy lines, `RONNE_UPDATE_CHECK` in the install
    guide, the helper; `topics.ts` here and in ronne-web together.
  - *Done when:* the docs render tests and `pnpm docs:links` pass, and the helper lands on a real
    section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
