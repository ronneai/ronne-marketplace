# 098 — Threat model and incident response

> Milestone: M14 · Depends on: 007, 016, 009 · Design: [MVP §12](../../MVP/MVP.md#12-security-considerations), [§14.4](../../MVP/MVP.md#144-other-future-topics), [§15](../../MVP/MVP.md#15-decision-log) (Operations) · Contracts: none changed

## Goal

A company deciding whether to run Ronne can read what it defends against, what it doesn't, and what
to do on the day something goes wrong (owner, 2026-10-06, from an evaluator's feedback). Today MVP
§12 lists the protections, but nothing says who the attackers are, where the trust boundaries lie,
or how to revoke everyone's access in one step: root can only disable people one by one.

## Scope

**In:**
- **The threat model**, `docs/security/threat-model.md`: what Ronne protects, who might attack it,
  where the trust boundaries are, each threat with what stops it today and what's left, and the
  known gaps, each pointing at the feature or issue that closes it, or the decision that accepts it
  (below).
- **The incident runbook**, `docs/runbooks/incident-response.md`: what to do, step by step, for
  each kind of incident (below), with the exact commands for Docker, the packages, the service and
  npm.
- **Two commands** the runbook needs that don't exist yet (owner's row: "revoke tokens in bulk,
  rotate `AUTH_SECRET`"):
  - `rmk-server revoke-access`: ends sessions and revokes access tokens for everyone, or for one
    person, in one transaction, audited.
  - `rmk-server rotate-secret`: writes a new `AUTH_SECRET` to the settings file.
  Both also run as `pnpm run …` from a clone and through `docker compose exec web pnpm run …`,
  like `reset-root-password`.
- **`SECURITY.md`** links both documents, says which versions get fixes (the latest release; it
  still says "no releases yet"), and keeps private GitHub advisories as the only way to report.
- **The Documentation:** a new topic, **Running Ronne** (`operations`), whose first sections are
  **Security** and **Incidents** (099–101 add theirs).

**Out** (and where it goes instead):
- **Fixing the gaps the threat model finds.** Each becomes an issue in `docs/issues` or points at
  a planned feature (116 per-workspace tokens, 105 two-factor sign-in, 109 shared rate limits,
  MVP §14.2 release signing). 098 writes them down; it doesn't close them.
- **Telling users from inside Ronne** (an announcement banner, email). Notifications are out of
  scope (MVP §14.5); the runbook uses the channels that exist (below).
- **Root viewing or revoking another person's single token.** 009 left it out on purpose;
  `revoke-access --user` revokes all of one person's.
- **An audit log export or a SIEM feed.** 007 left it post-MVP; the runbook reads `/admin/audit`.
- **Backups:** 099. The runbook links to its restore steps.

## Behaviour

### The threat model

One Markdown file, readable by someone who has never seen the code. Its sections:

1. **What Ronne is, in one paragraph**, and what it holds: accounts (emails, names, password
   hashes), sessions, access-token hashes, items and their versions (instructions and code that
   run on developers' machines), drafts, the audit log (with IP addresses), usage totals, and the
   settings file (`DATABASE_URL`, `AUTH_SECRET`).
2. **Who might attack it:** someone on the network with no account; a signed-in user; a malicious
   or careless author; a moderator or workspace admin acting alone; a stolen access token or
   session; someone who reads the server's disk, database or backups; a compromised dependency or
   image; a compromised developer machine that holds an `rmk` token.
3. **Trust boundaries,** drawn as a diagram (Mermaid, which GitHub renders): the browser and `rmk`
   / the MCP server / Claude Code's feed helper → the web app → the database and storage; the
   review between an author and everyone who installs; the developer's machine, where items run;
   a git mirror (078) pushed to another host.
4. **Threats, one table per boundary:** each row says the threat, what stops it today (with the
   feature that built it), and what's left. At least:
   - **Items run on developers' machines.** Review is the boundary (014): one approval by someone
     who isn't the author, root's override audited; risk flags (`hook`, `mcp_server`,
     `permission_policy`, `status_or_lsp`, `executable`, `shell_script`, `network`) shown to
     reviewers and in `rmk info`; `rmk install` writes files and runs nothing; sha256 checked on
     every download and against `rmk.lock`; managed-file boundaries. Left: a reviewer who approves
     something harmful; skills, commands and agents can tell the AI to run commands, and no flag
     catches every such instruction; no release signatures (MVP §14.2).
   - **Tokens.** Stored as sha256, `rmk_` prefix (secret scanners can match it), 30–365 days or
     no expiry, revoked by their owner, by Disable and Reset password, and now in bulk. Left: a
     token acts as its whole user, in every workspace (116); no expiry is allowed.
   - **Sessions and sign-in.** Better Auth sessions in the database, checked for a disabled user
     on every request; sign-in limited to 5 a minute per email and per IP. Left: the limits are in
     one process's memory and reset on restart (109); no second factor (105).
   - **Private workspaces** (093): not found to outsiders everywhere, guarded by a test. Left:
     what MVP §12 says private doesn't do (not encryption; root sees all; a mirror's privacy is its
     repository's).
   - **Plugin feeds** (076–079): the token in a header, never in the URL; Claude Code's helper
     strips credential-like variables; a yanked version leaves the feed. Left: a mirror's
     repository and its push token are outside Ronne.
   - **Export and uploads** (037–043): only the files the person saw; no `.env`, keys, `.git` or
     symbolic links; known secret formats stop the export; size, count and rate limits;
     path-traversal and symlink checks when unpacking.
   - **The server and its data.** The settings file is written with mode 0600; `AUTH_SECRET` only
     signs session cookies; access tokens are hashes. Left: the database, storage and backups are
     in the clear unless the disk or the database encrypts them (099 documents how); whoever
     reads the settings file can sign in as anyone until the secret rotates.
   - **Our supply chain:** the dependency policy (licenses, versions, advisories), pnpm's
     protections (`minimumReleaseAge`, `trustPolicy`, `strictDepBuilds`, `blockExoticSubdeps`),
     CodeQL, the image scan, npm provenance through trusted publishing, the image's provenance and
     SBOM, base images pinned by digest. Left: no signatures on the server packages or bundles
     beyond provenance; time-limited CVE exceptions such as E-7 (Caddy).
5. **Known gaps**, one list, each with the feature or issue that closes it or the decision that
   accepts it (MVP §12, §15, a feature's spec), and the date it was checked.
6. **When to update it:** a feature that adds a boundary, a token kind, an upload path or a new
   kind of item updates the model in the same change (the Documentation rule's twin); the release
   checklist (`docs/runbooks/release.md`) gets a line to check it.

### The incident runbook

For people running an instance, in plain steps. Each incident says how to tell it happened, what to
do now, how to check it worked, and what to tell users. At least:

| Incident | What to do |
|---|---|
| **A harmful item version was released** | Yank it with a reason (Versions page; 016): new installs stop, `latest` moves back, the feeds drop it at their next refresh. Deprecate the item if it shouldn't be used at all. Find who approved and released it in the audit log (`version.published`, `submission.approved`, `submission.override_approved`). Tell users: the yank reason shows on the item page and the Versions page; projects whose lockfile pins it keep installing it until they run `rmk update` (and `rmk` doesn't warn yet, though 022's spec says it should: a known gap), and files already written stay until they do. |
| **An access token leaked** | Its owner revokes it at Account › Access tokens. If the owner can't, or several leaked: `rmk-server revoke-access --user <email>`, or `--everyone`. Check the audit log for what the token did (drafts created with its name). |
| **An account was taken over** | Root disables it (008: ends its sessions, revokes its tokens), checks its audit events, resets its password, and enables it again with the person. A root account: `rmk-server reset-root-password` from the server. |
| **The settings file, a backup or the server leaked** | `rmk-server rotate-secret` (everyone is signed out), `revoke-access --everyone` (tokens), change the database password and `DATABASE_URL`, and treat every item as possibly changed: compare the stored artifacts' sha256 with the database (099's `backup --verify` does it). |
| **A moderator or admin acted against the rules** | Change their role (008, 092), review what they approved and released since a date (audit log filters by actor and time), yank what's harmful. |
| **A vulnerability in Ronne itself** | Upgrade when the fix is released (install guide's Upgrade); the advisory on GitHub says what to check. Report one through `SECURITY.md`. |

Common sections: **Reading the audit log** (where it is, the actions that matter for each incident,
filtering by actor and time, that IP addresses are kept there; a null actor with `via: "cli"` is the
server's command line), **What to tell users** (no messages from Ronne itself: the yank reason, the
deprecation message, and the instance's own channels; a short template), and **After an
incident** (what to write down, and opening an issue if Ronne could have stopped it).

### `rmk-server revoke-access`

```
rmk-server revoke-access --everyone [--sessions-only | --tokens-only] [--yes]
rmk-server revoke-access --user <email> [--sessions-only | --tokens-only] [--yes]
```

- Exactly one of `--everyone` and `--user`. Without `--yes` it says what it will do ("End 41
  sessions and revoke 23 access tokens for every account, root's included?") and asks; with `--yes`
  it doesn't ask (for scripts).
- One transaction: deletes the sessions, sets `revoked_at` on the tokens not revoked yet, writes one
  audit event `instance.access_revoked` (actor null; `{ via: "cli", scope: "everyone" | "user",
  email, sessionsEnded, tokensRevoked }`, `email` only for `--user`, whose user is the event's
  target; the counts use the same keys as Disable's `user.disabled`). It doesn't disable anyone or change passwords: people
  sign in again and make new tokens.
- `--user` with an unknown email says so and changes nothing (exit 1). A disabled user's sessions
  and tokens are already gone; it says "nothing to revoke".
- Prints what it did: "Ended 41 sessions and revoked 23 access tokens." `rmk` on those machines then
  gets 401 and asks to log in again (022).
- On a server with a service installed, it runs as the service's account like the other commands
  (083, 086).

### `rmk-server rotate-secret`

```
rmk-server rotate-secret [--yes]
```

- Writes a new `AUTH_SECRET` (32 random bytes, base64, as setup does) to the settings file,
  atomically, keeping its mode 0600 and every other line. Asks first ("Replace AUTH_SECRET?
  Everyone is signed out, you included."), unless `--yes`.
- Refuses, changing nothing, when `AUTH_SECRET` comes from the environment rather than the file
  ("AUTH_SECRET is set in the environment, so the server doesn't read it from the settings file.
  Change it where it's set, then restart the server."), and before setup ("This instance isn't set
  up yet, so it has no secret to replace.").
- Docker and `rmk-server` (the packages and the services) read the settings file on each request,
  so the server uses the new secret from its next request; it says so. A clone (`pnpm dev`,
  `pnpm start`) loaded `.env` when it started, so it says to restart it. Sessions are also deleted
  in the same run, so nobody stays signed in on a server that hasn't read the new secret yet.
- Audited as `instance.secret_rotated` (actor null, `via: "cli"`; no secret, old or new, anywhere
  in the event, the output or a log).
- Access tokens aren't affected: they're hashes, not signed with the secret.

## Edge cases

- **`revoke-access --everyone` signs out the person running it**, root included: the output says to
  sign in again. Root's password is unchanged.
- **Two runs at once:** the second finds nothing left to revoke for what the first did and says so;
  the counts are right for each.
- **`rotate-secret` while the server runs:** Docker and `rmk-server` use the new secret from the next
  request; a clone keeps the old one until it restarts. Either way every session is already gone,
  so cookies signed with either secret find no session.
- **A settings file without a trailing newline or with comments:** kept as it was, apart from the
  one line, each line's own ending (LF or CRLF) included. An `export ` prefix or an inline comment on the
  `AUTH_SECRET` line itself isn't kept.
- **Two `AUTH_SECRET` lines:** the last one is what the server reads, so `rotate-secret` writes the
  new secret on the first and removes the others (setup does the same for any key it writes).
- **Only a plain settings file is rewritten:** every line empty, a `#` comment, or `KEY=value` /
  `export KEY=value` with the value right after `=` (unquoted printable ASCII without quotes, `#` or
  edge spaces, or quoted on one line without a backslash before the closing quote), then optionally
  ` # comment`, and `export ` only with a value; lines end in LF or CRLF. Setup writes such files,
  except for a value ending in a backslash (a folder written as `C:\data\`), which it single-quotes
  and which Next.js's loader would read as an escape: rotate-secret refuses that line until the
  trailing backslash is removed by hand. The server's reader (Node's
  `parseEnv`) and Next.js's loader in a clone (dotenv) split them into the same lines and keys;
  anything else (a multi-line value, `KEY: value`, a newline before `=`, escapes, edge whitespace,
  a carriage return or a Unicode line separator inside a line) could make one of them read an old
  `AUTH_SECRET` or another value change, so it refuses, naming the line, and changes nothing
  ("edit the file by hand, then run this again"). The new file is also read back before it's
  written: the new secret, and every other setting as before. Setup's merge does the same read-back
  and fails with a message, changing nothing; setup refuses values with a Unicode line separator,
  as it refuses line breaks. What's left in a clone: Next.js expands `$NAME` in values (setup's own
  values included), so a value that names `${AUTH_SECRET}` changes with it there.
- **The file changes while the question waits:** every check (set up, the clone's other files, the
  plain rule) runs before the question and again after it, on the file as it is then, and only
  what's read after it is used: the database it names and the text that's rewritten. Only an edit
  in the moment between that read and the rename would be lost.
- **A settings file it can't read:** refused with the error's code, never the path, changing
  nothing. A missing one reads as empty, as the server reads it, so the command says the instance
  isn't set up yet.
- **In a clone, other files Next.js loads:** `.env.local`, `.env.development[.local]` and
  `.env.production[.local]` override `.env`, and the app folder's own `.env` is loaded too when the
  settings file is another one (`RONNE_ENV_FILE`). An `AUTH_SECRET` in any of them would stay in
  effect, so it refuses, naming the file. Docker and `rmk-server` load none of them.
- **A settings file it can't write:** refuses with the error's code, never the file's path, and
  changes nothing (the sessions are ended in the same transaction, which rolls back). The temporary
  file, which holds every setting, is removed whenever the write, the `chmod` or the rename fails.
  Where the folder can't take a new file but the file can be written (a Linux service's
  `/etc/rmk-server`, 083; on Windows, always), the file is rewritten in place, as setup does: if it
  can't be opened, nothing changed; if the write fails once it's open (a full disk), the file may be
  incomplete, and the command says so ("check it, and restore it from a backup"). If the content was
  written in full and only setting its mode failed, the new secret is in place, and the command says
  so as for a failed commit (below); a failed close counts as possibly incomplete (it can report a
  write the disk didn't finish).
- **The database fails to commit after the file is written** (the file is written last, just before
  the commit): the new secret is in place but the sessions aren't ended and nothing is audited; the
  command says so and names `revoke-access --everyone --sessions-only` as typed on the host (with
  `sudo` for a service, or "as an administrator" on Windows), and the restart for a clone. The old cookies stop working once the server
  reads the new secret.
- **Docker:** both commands run in the `web` container (`docker compose exec web pnpm run
  revoke-access …`); the settings file is on the data volume, so `rotate-secret` persists.
- **The audit log's own actions:** the two new actions join the Admin › Audit log's filters and
  groups (007, 060); being `instance.*`, they fall in the `instance` group with
  `instance.root_created`.
- **Sessions end at once:** Better Auth reads the session row on every request (no cookie cache is
  configured), so a deleted session signs its person out on their next request. If a cookie cache
  is ever turned on, these commands must clear it too: the threat model notes it.
- **A threat model claim that the code stops matching:** the release checklist line catches it at
  release; any feature that changes a boundary updates the model in its own change.

## Documentation

- **New topic, Running Ronne** (`operations`), in the "start" group after Administration, in both
  repositories' `topics.ts`, in English, Portuguese and French. Its first sections:
  - **Security** (`operations#security`): what the review protects and what it can't, where
    secrets live (the settings file, token hashes), what private workspaces aren't, and a link to
    the threat model on GitHub.
  - **Incidents** (`operations#incidents`): the incidents table above in short, the two commands,
    and a link to the full runbook.
- **Administration → Audit log** (`admin#audit`): the two new actions; "for an incident, see
  Running Ronne → Incidents".
- **Install → Upgrade** (`install#upgrade`): a line that security fixes come in releases, with a
  link to `SECURITY.md`.
- **Helper:** on Admin › Audit log, "Responding to an incident?" → `operations#incidents`.

## Acceptance criteria

- [ ] `docs/security/threat-model.md` has the six sections above, a boundary diagram, a threat
      table per boundary with what stops each threat and what's left, and a known-gaps list where
      every gap names a feature, an issue, or the decision that accepts it.
- [ ] `docs/runbooks/incident-response.md` covers the six incidents with commands for Docker,
      the packages, the service and npm, plus reading the audit log and what to tell users.
- [ ] `rmk-server revoke-access --everyone` and `--user` end the sessions and revoke the tokens in
      one transaction, write `instance.access_revoked` with counts, and leave passwords and
      accounts as they were; `--sessions-only` and `--tokens-only` do half.
- [ ] `rmk-server rotate-secret` replaces only `AUTH_SECRET` in the settings file (mode kept),
      deletes every session, writes `instance.secret_rotated`, refuses when the secret comes from
      the environment, and prints no secret.
- [ ] Both commands work from `rmk-server`, `pnpm run` and Docker, and as the service account when
      a service is installed.
- [ ] `SECURITY.md` links both documents and names the supported version; the release checklist
      has the threat-model line.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

- None. (An announcement banner for incidents was considered and left out: notifications are out
  of scope, MVP §14.5.)
