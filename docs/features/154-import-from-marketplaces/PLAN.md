# 154 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §14.5 and §2 no longer list importing from external marketplaces as out of scope (only
    federation stays out); §15's "Import" row points at 154 and 155.
  - `docs/features/README.md` lists 154 in M26.
  - Re-check skills.sh, Vercel's `skills` CLI and the search API; the dates go in the spec.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. Licences.**
  - A matcher from licence texts to SPDX ids for the licences a root can list (their texts vendored
    from the SPDX list, which is CC0), and the rules for `license:`, the files and disagreements.
  - *Done when:* unit tests cover each listed licence's text (with whitespace and copyright-line
    changes), a modified text (unknown), none, a disagreement, an item's own beside the repository's.

- [ ] **3. The repository reader.**
  - `packages/core/src/read`: the places looked at, plugin folders, marketplace files, what can't be
    read; `native-readers.md`'s new section.
  - *Done when:* unit tests over fixture repositories (a skills.sh-style repository, a Claude Code
    plugin marketplace, a Cursor one, a repository with hooks and scripts) list the right items and
    run nothing.

- [ ] **4. Settings and the table.** [risky]
  - The `item_imports` migration and the Imports settings (on, who, hosts, skills.sh, licences),
    audited.
  - *Done when:* db tests on the four databases cover each setting, who may import, and the audit
    events.

- [ ] **5. Fetching and importing.** [risky]
  - The fetch through 152's `GitRemote` with the host list, the URL checks and the limits, into a
    private temporary folder, removed after each run and on start; `read` repositories for private
    ones; the import action creating or updating drafts (037's and 051's services) with the licence
    file, `license` and provenance; rate limit; `item.imported`.
  - *Done when:* tests against the local git server cover a public import, a private one through a
    `read` repository, a host off the list, an internal address, each limit, a refused licence, an
    update of the same draft, the folder removed after a failure and a restart, and no token in any
    stored value.

- [ ] **6. skills.sh search.**
  - A small adapter behind an interface, off unless root turns it on, with a timeout; its answer
    checked against a schema, anything else read as unavailable.
  - *Done when:* unit tests with a fake server cover results, an empty answer, an unexpected shape and
    a timeout.

- [ ] **7. The screens.**
  - `/import` (where from, what's there with licences, into, import), the Imports tab, the provenance
    line and the *Imported* flag on the review page and the item page; messages in the three
    languages.
  - *Done when:* component tests cover each state; an end-to-end test imports a skill from the local
    git server, submits it and sees the flag and the provenance in review; the phone sweep passes.

- [ ] **8. Documentation.** The topics, sections and helpers in the spec's Documentation section,
  in ronne-web's `feat/154-import-from-marketplaces` branch.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
