# 098 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The threat model.** `docs/security/threat-model.md` with the spec's six sections, the
  Mermaid boundary diagram and a threat table per boundary. Every "what stops it" names the
  feature and is checked against the code as it is (not the specs); every gap names the planned
  feature that closes it or the decision that accepts it (a gap with neither goes to the owner).
  *Done when:* each claim in the tables points at a file, test or setting that the witness can
  open and confirm; every gap has a feature ID or a decision it can be traced to.

- [x] **2. `revoke-access`.** [risky] The service in the `identity` domain (one transaction:
  delete sessions, set `revoked_at` on live tokens, the audit event `instance.access_revoked` with
  counts), the script `apps/web/scripts/revoke-access.ts` (`--everyone` / `--user`,
  `--sessions-only` / `--tokens-only`, the question, `--yes`), the `pnpm run` entry, the tsdown
  entry and `rmk-server`'s `SCRIPTS` and help. The new action joins `AUDIT_ACTIONS`.
  *Done when:* db tests on the four databases cover everyone, one user, each half, an unknown
  email, a disabled user and two runs at once; a test shows a revoked session and token get 401
  on the next request; `rmk-server revoke-access --help` lists it.

- [x] **3. `rotate-secret`.** [risky] The script: replaces only the `AUTH_SECRET` line atomically
  (mode 0600, other lines and comments kept, reusing setup's env-file writer), deletes every
  session, audits `instance.secret_rotated`, refuses when the secret comes from the environment or
  before setup, prints the restart command for the runtime (`runtime.ts`). Wired like task 2.
  *Done when:* tests cover the file rewrite (trailing newline, comments, mode), the refusals, the
  sessions deleted, and a scan of the output and the audit event that finds no secret; after a
  restart in a test, an old cookie is refused.

- [x] **4. Both commands everywhere.** As the service account when a service is installed
  (`scriptForService`), in Docker (`docker compose exec web pnpm run …`), from a clone.
  `server-probe.js` runs `revoke-access --everyone --yes` and checks the probe's token now gets 401.
  *Done when:* the server checks pass on Ubuntu, macOS and Windows in CI, and the image's smoke test
  runs both commands.

- [x] **5. The incident runbook.** `docs/runbooks/incident-response.md`: the six incidents with
  how to tell, what to do now, how to check, what to tell users; the commands for each way of
  installing; reading the audit log; what to tell users (with a template); after an incident.
  *Done when:* every command in it was run on a test instance (Docker and npm) and the steps
  match what happened; written in the notes.

- [x] **6. `SECURITY.md` and the release checklist.** Links to both documents, the supported
  version (the latest release), reporting unchanged; `docs/runbooks/release.md` gets "the threat
  model still matches" as a step; `docs/MVP/MVP.md` §12 links the threat model.
  *Done when:* the links resolve (`docs` link check, if any, or by hand in the notes).

- [x] **7. Documentation.** In `../ronne-web` (a branch that goes live with the release): the new
  topic `operations` with **Security** and **Incidents** in English, Portuguese and French, both
  `topics.ts`, Administration → Audit log and Install → Upgrade lines; here, the helper on Admin ›
  Audit log.
  *Done when:* the docs render tests pass in both repositories, and the helper's link lands on
  `operations#incidents`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 5, the runbook's commands, run on 2026-10-12** (macOS 27, Node 24.0.0):
  - npm (`@ronneai/marketplace` 0.3.2 packed from this branch, installed with npm): `setup --yes`,
    `rmk whoami` with a token (signed in), `revoke-access --user root@example.com --tokens-only --yes`
    ("Revoked 1 access token."; `rmk whoami` then: "The access token was revoked."),
    `reset-root-password --yes`, `rotate-secret --yes` ("uses the new secret from its next
    request"), `revoke-access --everyone --sessions-only --yes` ("Nothing to revoke … no
    sessions."), and `--everyone` through the server probe (task 4).
  - Docker (the image built from this branch, Docker 29.7): `pnpm run setup --yes`,
    `pnpm run revoke-access --everyone --yes` (the token then gets 401) and
    `pnpm run rotate-secret --yes` in the container, through `scripts-probe.sh` (task 4), which runs
    them with `docker exec` in the same container `docker compose exec web` reaches.
  - Also run by the task 5 witness: `docker compose exec web pnpm run revoke-access --everyone`
    (interactive), `… rotate-secret`, `… reset-root-password --yes` and `docker compose restart web`
    on a compose project of this branch's image.
  - The service forms (`sudo rmk-server revoke-access …` and `rotate-secret` on systemd and launchd,
    `rmk-server …` as administrator on Windows) ran in pull request #174's CI at `6180e8bc` (task 4's
    re-check).
  - The rest, run later on 2026-10-12, on `@ronneai/marketplace` 0.3.2 packed from `main` at
    `03e4c5be`, installed with npm, set up on PostgreSQL 15 (`pnpm test:db:up`'s server, its own role
    and database), the web app driven with Playwright:
    - A harmful version: root's skill `@incident/notes` 1.0.0, approved and released by a separate
      moderator; a proposed change released as 1.0.1. **Yank** on the Versions page as the
      moderator, with a reason: `rmk info` shows `1.0.1 [yanked]` and `latest → 1.0.0`; a fresh
      `rmk install` in an empty folder gets 1.0.0; `rmk install @incident/notes@1.0.1` is refused.
      **Deprecate** 1.0.0: `rmk info` marks it, and an install prints the message. The audit log has
      `version.published`, `submission.approved`, `version.yanked`, `version.deprecated`.
    - What a project with 1.0.1 in its `rmk.lock` does next differs from what the runbook said:
      asking for `latest` (what `rmk install <item>` records), a plain `rmk install` moved it to
      1.0.0, because a tag resolves to the version it names (`rangeOf`, `resolve.ts:143`) and the
      lock no longer fits; asking for `^1.0.0` (the lock edited to 1.0.1, as before the yank), it
      kept installing 1.0.1 with no warning, `rmk outdated` showed `locked 1.0.1, wanted 1.0.0`, and
      `rmk update` moved it. 022's spec says a plain install installs exactly the lockfile, with a
      warning for a yanked pin: the runbook, threat model, SPEC and Documentation now say what
      happens, and the threat model lists both as gaps (owner, 2026-10-12: document today, file the
      bug).
    - An account taken over (the moderator): **Disable** ended their session (the next page is
      sign-in) and their token got 401; **Reset password** then **Enable**; they signed in with the
      new password, and the old token stayed revoked. **Members** of global, their role set to user:
      `/reviews` became a 404 and Reviews left their navigation. The audit log's action filter has
      the `version` and `submission` groups, and an actor filter.
    - The settings file leaked: `rotate-secret --yes` (new `AUTH_SECRET`, 6 sessions ended, file
      still 0600), `revoke-access --everyone --tokens-only --yes` (3 tokens; `rmk whoami` then: "The
      access token was revoked."), the role's password changed on PostgreSQL (the running server got
      500s once its connections were closed), then `setup --yes` with the new `DATABASE_URL`: it
      rewrote `DATABASE_URL`, kept `AUTH_SECRET` and the root account, and the running `rmk-server`
      worked again with no restart. Setup with the old password: "The server refused the user name
      or password.", and the file unchanged. The interactive form, driven in a pseudo-terminal
      (Python's `pty`, given 200 columns: clack's prompts wrap every character without a width):
      "Use the database already in .env?" → no, then PostgreSQL, host, port, name, user (none
      filled in from the old URL: `localhost`, `5432`, `ronne`) and the new password → "Connected",
      `DATABASE_URL` rewritten, `AUTH_SECRET` kept, the running server answered with no restart (it
      reads the settings file on each request, one pool per URL; a clone's Next.js loads `.env` into
      the environment at start, so it needs a restart). The runbook says all of that now.
    - The Docker form, on the image task 4 built from this branch (`ronne-web:w4`, compose project
      `ronne098-docker`, ports 7660/7661, no pull): set up on the host's PostgreSQL
      (`host.docker.internal`), the role's password changed (500s), then
      `docker compose exec web pnpm run setup` interactively, the same answers: `/app/data/.env`
      got the new password, kept `AUTH_SECRET` and 0600, and the server answered with no restart.
      Then with the compose file's own database (project `ronne098-own`, `--profile postgres`,
      `postgres:18`, `RONNE_DB_PASSWORD` in the `.env` next to `compose.yaml`): the password changed
      with `docker compose exec postgres psql -U ronne -d ronne -c "ALTER ROLE ronne PASSWORD …"`,
      `RONNE_DB_PASSWORD` changed and `docker compose --profile postgres up -d` (it recreates the
      database container; the web container reports unhealthy until it's back), then setup again
      interactively with host `postgres`: the same result. MySQL's profile wasn't run.
    - Sign-in allows 5 attempts a minute per email, which a script signing the same person in and
      out reaches quickly ([e2e-sign-in-limit.md](../../knowledge/e2e-sign-in-limit.md)).
- **The rotate-secret settings-file rules took ten witness rounds** (WITNESS.md, task 3): Node's
  `parseEnv` and Next.js's dotenv loader differ on many shapes (multi-line values, `KEY: value`,
  escapes, edge whitespace, `export KEY=`), so the command only rewrites a "plain" file both read the
  same way (`firstUnplainLine` in `env-file.ts`), and checks everything again after its question.
