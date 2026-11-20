# 196 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "Web sign-in" row (or a new "Passwords" row) says new passwords are checked
    against a bundled blocklist, context words and patterns, and optionally Have I Been Pwned's range
    API (off by default), and that a compromised password is held at sign-in.
    `docs/features/README.md` lists 196 in M32.
  - *Done when:* both say what this spec says, and `pnpm witness:check` passes.

- [ ] **2. The list's licence and the dependency policy.**
  - Pin a SecLists commit; confirm the MIT licence covers the chosen file and that nothing in its
    folder says otherwise; record it in `docs/policies/dependencies.md` (data, §1), and teach
    `packages/repo-tools/src/notices.js` to add vendored data files with their licence to the
    `THIRD_PARTY_NOTICES` it writes. If it doesn't clear, use the spec's fallback and record why.
  - *Done when:* the policy's checklist is filled in the change; `notices.test.js` covers a vendored
    data file; `pnpm licenses:check` and `pnpm docs:check` pass.

- [ ] **3. The list file and its script.**
  - A script in `packages/repo-tools` that reads the pinned file, keeps 12–128 characters, applies
    NFKC and lowercase, deduplicates, sorts, writes the header, and fails if the result is over
    2 MB. Its row in the CONTRIBUTING commands table if it's a root script.
  - The file is included in the server package and the Docker image (the bundle checks).
  - *Done when:* the script's unit test runs on a small fixture; `pnpm build`, `pnpm build:server`
    and `pnpm packages:check` pass with the file present, and the bundle check fails without it.

- [ ] **4. `checkNewPassword`.** [risky]
  - The offline check (list, context words, repeats, runs, keyboard rows) in the identity domain,
    loaded once, failing the server's start when the file is missing.
  - The Have I Been Pwned check behind the setting: `fetch`, the prefix only, `Add-Padding: true`,
    3-second timeout, fail open with a log event and a status record.
  - *Done when:* unit tests cover each kind of match, NFKC and case, near-misses that must pass, the
    range response with padding entries (count 0), a hit, a timeout and an error, and that nothing
    but the 5-character prefix is in the request.

- [ ] **5. Every place a password is set.** [risky]
  - Call it from sign-up (190), Change password, the forgot-password reset (194), Create user and
    Reset password with a typed password, the web setup's root, the terminal setup and
    `reset-root-password` (offline only). Not for generated passwords.
  - *Done when:* db tests (and the setup and CLI tests) show each place refusing a listed password
    with the same error code, and a generated password never checked.

- [ ] **6. The check at sign-in.** [risky]
  - Migration: `password_checks` and the hold's `password_change_reason`.
  - After a right password (web and `POST /api/v1/auth/token`): the offline check every time, the
    range API at most once a day; a match sets the hold with `breached`, queues the notice (189),
    records `user.password_found_breached`. The hold page shows the reason. A password change clears
    `password_checks`. Erasure (103) deletes it.
  - *Done when:* db tests on SQLite, PostgreSQL and MySQL cover a held sign-in on the web and the
    API, the once-a-day limit, the reason on the hold page, the row cleared on change and on
    erasure; an end-to-end test signs in with a listed password and is made to change it.

- [ ] **7. The setting.**
  - On the Authentication tab: the switch, the privacy note, the status line; audited.
  - *Done when:* component and db tests cover on, off, the audit row and the failed-check status;
    the translation tests pass.

- [ ] **8. Documentation.**
  - ronne-web: `account#signing-in`, `authentication#overview`, the new `privacy#outbound`
    (`topics.ts` here and there), `security#security`, in all three languages.
  - Helpers: the password hint and the setting's helper.
  - *Done when:* the docs render tests and `pnpm docs:links` pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
