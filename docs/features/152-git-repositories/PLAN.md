# 152 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "Git export" row points at 152 and 153, and §3.3 says the instance can push the git
    mirror itself (153), with `rmk feed build` (078) kept for mirrors built outside it.
  - `docs/features/README.md` lists 152 in M25.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. The git client.**
  - Check `isomorphic-git` against [the dependency policy](../../policies/dependencies.md): latest
    stable, MIT, its whole tree's licences, no high or critical advisories, `minimumReleaseAge`.
  - `server/git/`: a `GitRemote` interface (list references, shallow clone of one branch, commit,
    push fast-forward only) and its `isomorphic-git` adapter with an HTTP client that connects only
    to checked addresses, sends the token only to the repository's origin and follows no redirect to
    another origin.
  - A local git server for tests: a pinned Gitea image (MIT) started like the database servers, or an
    in-process smart HTTP server if one passes the policy; whichever is chosen goes in
    `docs/knowledge/test-runs.md` (Docker Hub pulls count, `docker-hub-pulls.md`).
  - *Done when:* `pnpm licenses:check` and `pnpm audit --audit-level high` pass; tests list
    references, clone, commit and push against the local server, refuse a cross-origin redirect, and
    never send the token to another origin.

- [ ] **3. URL checks, shared.** [risky]
  - Move 136's endpoint check out of `scans/models` to a shared module (scans keep using it), with a
    host list parameter: `RONNE_SKILL_SCANNER_HTTP_HOSTS` for the scanner, `RONNE_GIT_HOSTS` for git.
  - Git URLs: `https://`, no userinfo, query or fragment, normalised.
  - *Done when:* 136's endpoint tests pass unchanged, and new tests cover git URLs, each address class
    with a fake resolver, and the allowlist.

- [ ] **4. The table and the service.** [risky]
  - The `git_repositories` migration.
  - The `git` service: add, edit, remove, the write-only token sealed and bound to id and origin, the
    token removed on an origin change, `rotate-secret` re-encrypting it, audit without the token.
  - *Done when:* db tests on the four databases cover set, replace, remove, keep (empty field), the
    origin change, a token that no longer opens, rotate-secret, root-only access, and the token absent
    from every returned value and audit row.

- [ ] **5. The tab.**
  - Admin › Settings › Git repositories: the list, the add and edit dialog with the per-host token help,
    Remove, Test connection with its five answers; messages in the three languages.
  - *Done when:* component tests cover each state and answer; an end-to-end test adds a repository
    against the local git server and tests it; the phone sweep passes.

- [ ] **6. Documentation.** The topics, sections and helpers in the spec's Documentation section,
  in ronne-web's `feat/152-git-repositories` branch.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
