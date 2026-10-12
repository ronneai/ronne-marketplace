# Incident response

> Feature [098](../features/098-threat-model/SPEC.md) · What Ronne defends against and what it
> doesn't: the [threat model](../security/threat-model.md) · Reporting a vulnerability in Ronne
> itself: [`SECURITY.md`](../../SECURITY.md)

For the people who run a Ronne instance. Each incident says how to tell it happened, what to do now,
how to check it worked, and what to tell users. Keep calm and keep notes as you go: what you saw,
when, and what you did (the [last section](#after-an-incident) says what to write down).

## The commands, for each way of installing

Two commands are made for incidents. Neither asks for a password; both ask before changing anything
(`--yes` skips the question, for scripts) and both are written to the audit log.

| | `revoke-access`: end sessions, revoke access tokens | `rotate-secret`: a new `AUTH_SECRET`, everyone signs in again |
|---|---|---|
| Docker (the install script) | `docker compose exec web pnpm run revoke-access --everyone` | `docker compose exec web pnpm run rotate-secret` |
| Linux or macOS service (the packages, `rmk-server service install`) | `sudo rmk-server revoke-access --everyone` | `sudo rmk-server rotate-secret` |
| Windows service | `rmk-server revoke-access --everyone`, in a terminal run as administrator | `rmk-server rotate-secret`, as administrator |
| npm, no service | `rmk-server revoke-access --everyone` | `rmk-server rotate-secret` |
| A clone of the repository | `pnpm run revoke-access --everyone` | `pnpm run rotate-secret` |

Run the Docker commands in the `ronne-marketplace` folder, where `compose.yaml` is.

**`revoke-access`** takes `--everyone` (every account, root's included) or `--user <email>` (one
person), and `--sessions-only` or `--tokens-only` to do half. It ends sessions (people are signed out
at their next click) and revokes access tokens (`rmk` and the MCP server get 401 and ask to log in
again). It doesn't disable anyone or change passwords. It's recorded as `instance.access_revoked`,
with the counts.

**`rotate-secret`** writes a new `AUTH_SECRET` to the settings file and ends every session. Docker and
`rmk-server` use the new secret from their next request; a clone's server must be restarted (the
command says so). Access tokens keep working: they aren't signed with the secret, so run
`revoke-access --everyone --tokens-only` too when they may have leaked. It refuses, changing nothing,
when `AUTH_SECRET` comes from the environment rather than the settings file (change it where it's
set), when the settings file has lines it can't rewrite safely (it names the line: edit it by hand),
and, in a clone, when another file Next.js loads (`apps/web/.env`, `.env.local`, …) also sets
`AUTH_SECRET` (remove it there). It's recorded as `instance.secret_rotated`.

`reset-root-password` (same forms: `docker compose exec web pnpm run reset-root-password`,
`sudo rmk-server reset-root-password`, …) sets a new password for a root account, ends its sessions,
revokes its tokens and enables it again.

## Incidents

### A harmful item version was released

**How you'd know:** a report from a developer, a risk flag noticed after the fact, a reviewer who
says they missed something.

**Now:**
1. Yank the version: the item's page › **Versions** › **Yank**, with a reason (moderators, workspace
   admins and root). New installs stop resolving it, `latest` moves back to the highest stable
   version left (or is removed when none is), and the plugin feeds drop it at their next refresh.
2. If the whole item shouldn't be used, **Deprecate** its other versions too, with a message that
   says why.
3. Find out how it got in: Admin › **Audit log**, filtered by the `version` group and then the
   `submission` group, around the dates, and look for the item (the log filters by action or group,
   actor and dates, not by item). Its `version.published`, `submission.approved` or
   `submission.override_approved` events show who submitted, approved and released it.
4. If the approval broke the rules, see [A moderator or admin acted against the
   rules](#a-moderator-or-admin-acted-against-the-rules).

**Check:** `rmk info <item>` shows the version as yanked; a fresh `rmk install` in an empty folder
doesn't pick it.

**Tell users:** projects whose `rmk.lock` pins the yanked version keep installing it until they run
`rmk update`, and `rmk` doesn't warn about it yet (a known gap in the threat model). Files already
written in their projects stay until they update. So tell them, through your own channels, which
item and version, what it does, and to run `rmk update` in every project that uses it (the template
below).

### An access token leaked

**How you'd know:** a token in a commit, a log, a chat, a secret scanner's alert (tokens start with
`rmk_`), or drafts in the audit log that the person didn't make.

**Now:**
1. Its owner revokes it: the sidebar's **CLI & tokens** (the Access tokens page) › **Revoke**.
2. If the owner can't, or several of their tokens may have leaked:
   `revoke-access --user <email> --tokens-only` (the forms above).
3. If you don't know whose: `revoke-access --everyone --tokens-only`; everyone runs `rmk login` again.
4. See what the token did: Admin › **Audit log**, filter by the owner's email; drafts made with a token
   name it in their details.

**Check:** `rmk whoami` with the old token says "The access token was revoked."

**Tell users:** only the owner, unless you revoked everyone's tokens: then everyone, with
`rmk login` as the one step to take.

### An account was taken over

**How you'd know:** the person says so, or the audit log shows sign-ins, tokens or approvals they
didn't make.

**Now:**
1. Admin › **Users** › the person › **Disable**: their sessions end and their tokens are revoked at
   once.
2. Read their audit events since the first one they don't recognise (filter by their email and the
   dates): drafts, submissions, approvals, releases, role changes. Yank what's harmful (above).
3. **Reset password** for them (Admin › Users), give it to them by a channel you trust, and
   **Enable** the account.
4. A root account taken over: from the server, `reset-root-password` (the forms above), with
   `--email` when there are several roots. Then read root's audit events the same way: root can do
   anything, including approving its own submissions as an override.

**Check:** the person signs in with the new password; their old sessions and tokens are gone.

**Tell users:** the person; and anyone affected by what was done in their name.

### The settings file, a backup or the server leaked

**How you'd know:** a copy of the settings file where it shouldn't be, or of a backup, or someone
else had access to the server. The settings file is `/app/data/.env` on the `ronne-data` volume
with Docker, `/etc/rmk-server/env` for a Linux service, `etc/rmk-server/env` under the Homebrew prefix (else `/usr/local`)
on macOS, `C:\ProgramData\RonneAI\Marketplace\.env` on Windows, and `.env` in the data folder for
npm.

Whoever has the settings file has `AUTH_SECRET`, which lets them forge sign-in cookies, and
`DATABASE_URL`, with the database password.

**Now:**
1. `rotate-secret`: a new secret, and everyone is signed out.
2. `revoke-access --everyone --tokens-only`: every access token.
3. Change the database password on the database server (MySQL, MariaDB or PostgreSQL), then run
   the setup again (`docker compose exec web pnpm run setup`, `sudo rmk-server setup`, …) and give
   it the new password: it rewrites `DATABASE_URL` and keeps the secret and the accounts. With the
   database `compose.yaml` runs, also put the new password in `RONNE_DB_PASSWORD` in the `.env`
   next to `compose.yaml`. With SQLite, the database is a file in the data folder: if the server
   itself was reached, treat it as read.
4. Treat every released item as possibly changed. `rmk` checks each download's sha256 against the
   database and refuses a file that doesn't match (`checksum_mismatch`), so changed storage alone
   shows up as installs failing. Someone who could write to both the storage and the database could
   change both: restore from a backup made before the incident, and compare.
5. Find out how it leaked, and close that first if it's still open.

**Check:** the old settings file's `AUTH_SECRET` no longer matches; `rmk whoami` with an old token
says it was revoked; the database refuses the old password. Backups made before the incident hold
the old settings: keep them as safe as before, and make a new one.

**Tell users:** everyone: they were signed out, and need to sign in again and run `rmk login`.

### A moderator or admin acted against the rules

**How you'd know:** an approval of their own work by another account they control, releases nobody
reviewed, role changes nobody asked for.

**Now:**
1. Take the role away: on the workspace's page, **Members**, change their role to user (a workspace
   admin or root); for an instance role, Admin › **Users** (root).
2. Admin › **Audit log**, filtered by their email and the dates: everything they approved, released,
   yanked or changed.
3. Yank or deprecate what's harmful (above). Look again at items they approved for others.

**Check:** they no longer see the review queue or the Admin pages they had.

**Tell users:** the workspace's members, about any item you yanked.

### A vulnerability in Ronne itself

**How you'd know:** a security advisory on Ronne's GitHub repository, or a release whose notes name
a security fix.

**Now:** upgrade when the fixed release is out (the install guide's **Upgrade**), and do what the
advisory says to check. If the advisory says the flaw may have been used, follow the incident above
that matches what it allowed (tokens, accounts, the settings file). To report one, follow
[`SECURITY.md`](../../SECURITY.md): privately, never in a public issue.

**Check:** `rmk-server --version` (or the image tag you run) is the fixed release or later.

**Tell users:** only when the advisory says they have something to do (sign in again, `rmk login`,
`rmk update`), or when you followed one of the incidents above.

## Reading the audit log

Admin › **Audit log**, for root. It filters by action (or a whole group, such as `version` or
`instance`), by the actor's email, and by dates; each event's details show what it recorded, and the
IP address when there was one. A command run on the server has no actor and `"via": "cli"` in its
details: `reset-root-password`, `revoke-access`, `rotate-secret`.

The actions that matter most in an incident:

| To find | Look for |
|---|---|
| Who signed in, and failed to | `auth.signed_in`, `auth.sign_in_failed` |
| Tokens made and revoked | `access_token.created`, `access_token.revoked`, `instance.access_revoked` |
| Accounts changed | `user.disabled`, `user.enabled`, `user.password_reset`, `user.role_changed`, `workspace.member_role_changed` |
| What was approved, and how | `submission.approved`, `submission.override_approved` |
| What was released or pulled | `version.published`, `version.yanked`, `version.deprecated`, `dist_tag.moved` |
| What you did during the incident | `instance.access_revoked`, `instance.secret_rotated` |

The audit log can't be edited from the app, and nothing in Ronne deletes it. It can't be exported
yet; take notes, or screenshots, as you go.

## What to tell users

Ronne sends no messages of its own (no email, no banner). What people see inside it: the yank
reason on the item's Versions page, the deprecation message on the item page, in `rmk` and in the
MCP server, and the sign-in page after their session ended. Everything else goes through the
channels your team already uses. A template:

> **Ronne: action needed.** On <date>, <what happened, in one sentence>. We have <what you did:
> yanked @scope/item 1.2.0 / signed everyone out / revoked every access token>. Please <the one
> thing to do: run `rmk update` in projects that use @scope/item / sign in again and run
> `rmk login`>. If you saw <something unusual>, tell <who>. More to follow by <when>.

## After an incident

Write down, while it's fresh: when it started and when you noticed; what you saw; every step you
took, with the time; what you told users, and when; what's still open. Then ask whether Ronne could
have stopped it or shown it sooner. If so, open an issue on Ronne's repository (privately, through
`SECURITY.md`, if it's a vulnerability), and update the threat model's known gaps if it's a gap.
