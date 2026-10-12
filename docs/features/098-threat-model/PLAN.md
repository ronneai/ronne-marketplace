# 098 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. The threat model.** `docs/security/threat-model.md` with the spec's six sections, the
  Mermaid boundary diagram and a threat table per boundary. Every "what stops it" names the
  feature and is checked against the code as it is (not the specs); every gap names a planned
  feature or a new issue in `docs/issues` (opened for gaps no feature covers).
  *Done when:* each claim in the tables points at a file, test or setting that the witness can
  open and confirm; every gap has a feature ID or an issue folder.

- [ ] **2. `revoke-access`.** [risky] The service in the `identity` domain (one transaction:
  delete sessions, set `revoked_at` on live tokens, the audit event `instance.access_revoked` with
  counts), the script `apps/web/scripts/revoke-access.ts` (`--everyone` / `--user`,
  `--sessions-only` / `--tokens-only`, the question, `--yes`), the `pnpm run` entry, the tsdown
  entry and `rmk-server`'s `SCRIPTS` and help. The new action joins `AUDIT_ACTIONS`.
  *Done when:* db tests on the four databases cover everyone, one user, each half, an unknown
  email, a disabled user and two runs at once; a test shows a revoked session and token get 401
  on the next request; `rmk-server revoke-access --help` lists it.

- [ ] **3. `rotate-secret`.** [risky] The script: replaces only the `AUTH_SECRET` line atomically
  (mode 0600, other lines and comments kept, reusing setup's env-file writer), deletes every
  session, audits `instance.secret_rotated`, refuses when the secret comes from the environment or
  before setup, prints the restart command for the runtime (`runtime.ts`). Wired like task 2.
  *Done when:* tests cover the file rewrite (trailing newline, comments, mode), the refusals, the
  sessions deleted, and a scan of the output and the audit event that finds no secret; after a
  restart in a test, an old cookie is refused.

- [ ] **4. Both commands everywhere.** As the service account when a service is installed
  (`scriptForService`), in Docker (`docker compose exec web pnpm run …`), from a clone.
  `server-probe.js` runs `revoke-access --everyone --yes` and checks the probe's token now gets 401.
  *Done when:* the server checks pass on Ubuntu, macOS and Windows in CI, and the image's smoke test
  runs both commands.

- [ ] **5. The incident runbook.** `docs/runbooks/incident-response.md`: the six incidents with
  how to tell, what to do now, how to check, what to tell users; the commands for each way of
  installing; reading the audit log; what to tell users (with a template); after an incident.
  *Done when:* every command in it was run on a test instance (Docker and npm) and the steps
  match what happened; written in the notes.

- [ ] **6. `SECURITY.md` and the release checklist.** Links to both documents, the supported
  version (the latest release), reporting unchanged; `docs/runbooks/release.md` gets "the threat
  model still matches" as a step; `docs/MVP/MVP.md` §12 links the threat model.
  *Done when:* the links resolve (`docs` link check, if any, or by hand in the notes).

- [ ] **7. Documentation.** In `../ronne-web` (a branch that goes live with the release): the new
  topic `operations` with **Security** and **Incidents** in English, Portuguese and French, both
  `topics.ts`, Administration → Audit log and Install → Upgrade lines; here, the helper on Admin ›
  Audit log.
  *Done when:* the docs render tests pass in both repositories, and the helper's link lands on
  `operations#incidents`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
