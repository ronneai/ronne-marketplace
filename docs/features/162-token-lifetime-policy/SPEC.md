# 162 — Token lifetime policy, and tokens revoked when an account is recovered

> Milestone: M28 · Depends on: 009, 105, 107, 122, 123, 128 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Access tokens") · Contracts: `POST /api/v1/auth/token` and the device flow (107) issue at most the longest lifetime

## Goal

Today a personal access token can live 30, 90 or 365 days, or forever, whoever its user is. Root
sees how many tokens a person has, but not which. Recovering an account also leaves its tokens
working: a new password, or a two-factor reset.

This feature lets root set the **longest lifetime** a token may have, shorter for reviewers and
root if wanted, and shorten tokens made before the policy. Root sees a person's tokens on their
page, and recovering an account ends its tokens with its sessions (owner, 2026-11-01).

## Scope

**In:**
- **Authentication tab › Access tokens**, a new panel (122):
  - **Longest lifetime**: 30, 90 or 365 days, or no limit.
  - **For reviewers and root**: the same or shorter. "Reviewers" means moderators and admins of a
    shared workspace, as the two-factor policy counts them (`coveredBy` in
    `identity/models/two-factor-coverage.ts`).
  - **Shorten longer tokens**: "14 active tokens last longer than this. Shorten them to it". It
    asks first, then sets each one's expiry to the earlier of its own and now plus the maximum.
  - Audited: `settings.token_policy` (`{ from, to }`) and `access_token.shortened` (`{ count,
    days }`).
- **Enforced wherever a token is made**:
  - `createToken` (Account › Tokens);
  - the password exchange (`POST /api/v1/auth/token`, `rmk login`);
  - the device flow (107, `rmk login --web`).

  The dialog offers only the lifetimes allowed. The exchange and the device flow give 90 days, or
  the maximum when it's shorter. A request for more is refused with `token_lifetime_too_long`.
- **Root sees a person's tokens** on `/admin/users/<id>` (123): name, how it was made (web, `rmk`,
  device), created, last used, expires, never the secret or its preview. Root can **Revoke** one,
  audited `access_token.revoked` with root as the actor.
- **Recovering an account ends its tokens**:
  - **Change your password** (Account): a box, **Also revoke my access tokens**, checked by
    default. They're revoked in the same transaction, and `user.password_changed` records
    `tokensRevoked`.
  - **Root's two-factor reset** (the user page, and `reset-two-factor` in a terminal) revokes the
    tokens as well as ending the sessions, as Reset password does already.
- The defaults (Decision 2): **365 days** for everyone, **90 days** for reviewers and root.

**Out** (and where it goes instead):
- **Scopes and workspaces on a token:** 116 and the token scopes planned in M29.
- **Turning off an identity provider revokes its people's tokens:** an open question.
- **SCIM tokens** (108): their own kind, rotated by root; unchanged.
- **A setting per workspace:** tokens belong to a person, not a workspace.

## Behaviour

**Root sets 90 days.**
1. Account › Tokens's dialog now offers 30 and 90 days.
2. `rmk login` gives 90-day tokens, as it always has. With 30 days set, it gives 30.
3. The panel says 14 tokens last longer than 90 days. Root shortens them, and each one now expires
   at the earlier of its own date and 90 days from now. Each person's Tokens page shows the new
   date.

**A person thinks their laptop was taken.** They change their password with the box ticked. Their
other sessions end and every token stops at once. `rmk` on the laptop gets 401 at its next request.

**Which cap applies.** A person's cap is read when the token is made: reviewers and root get the
shorter one. Becoming a moderator later doesn't touch tokens already made. Shorten applies the cap
each token's owner has today.

## Edge cases

- **The policy changes while the dialog is open:** the server refuses the old choice with "The
  longest lifetime is now 90 days".
- **"No limit" for reviewers when everyone's is 90:** refused; the reviewers' cap is the same or
  shorter.
- **A held account** (two-factor enrolment 105, password change 128): it can't reach the tokens
  page, as today.
- **The device flow's 90 days under a 30-day cap:** 30.
- **A disabled account's tokens:** already revoked; they don't count in "longer than".
- **The last root changes their password with the box ticked:** `rmk` stops until they make a new
  token. That's the point, and the box can be unticked.
- **Shorten on thousands of tokens:** one update per batch of 500, in a transaction.

## Data

- `instance_settings`: `token_max_days` and `token_max_days_reviewers` (30, 90, 365, or absent for
  no limit). No migration.
- `access_tokens.expires_at` is updated by Shorten. Nothing new.

## Documentation

- **rmk** (`rmk#tokens`): the longest lifetime root may set; what Shorten does to a token.
- **Authentication** (`authentication#overview`): the Access tokens panel; a new section,
  `authentication#tokens` ("Access tokens policy"), in `topics.ts` here and in ronne-web together.
- **Account** (`account#signing-in`): changing your password also revokes your tokens unless you
  untick it.
- **Admin › Users** (`admin#users`): a person's tokens on their page; Revoke.
- **Incidents** (the incident runbook and the website's `incidents`): "a leaked token" names
  Shorten and the password box.
- **Helpers:** the panel's "Why shorter for reviewers?" → `authentication#tokens`.

## Acceptance criteria

- [ ] Root sets both caps (reviewers' the same or shorter), audited with `{ from, to }`.
- [ ] Every way of making a token honours the cap: web, password exchange, device flow; db tests
  for each, with a reviewer and a plain user.
- [ ] Shorten sets the earlier expiry on every longer active token, reports the count, and is
  audited.
- [ ] A person's page lists their tokens without secrets, and root can revoke one, audited.
- [ ] Changing your password with the box revokes your tokens in the same transaction; root's
  two-factor reset (web and terminal) revokes them.
- [ ] Every new text is a message in English, Portuguese and French; the panel and the user page
  pass the phone sweep.
- [ ] The Documentation, the incident runbook and the threat model (§4.2's stolen-token row, §5's
  "no expiry") say what the feature does.

## Decisions

1. **A lifetime policy root sets, and recovery that ends tokens** (owner, 2026-11-01, M28). **One
   cap for everyone, a shorter one for reviewers and root** (Claude, to confirm): their tokens
   reach most. "Reviewers" is counted as the two-factor policy counts them, so root reads one rule.
2. **Defaults: 365 days for everyone, 90 for reviewers and root** (Claude, to confirm). This keeps
   the dialog's default (90) and `rmk login`'s 90 days, and ends new "no expiry" tokens unless root
   allows them. Existing tokens are untouched until root shortens them.
3. **Shorten, never revoke, for the policy** (Claude). Cutting tokens at once would break every
   `rmk` in the middle of work. A shorter date gives people time to make new ones.
4. **The password box is checked by default** (Claude). Changing a password is most often a
   recovery, and an unticked box is one click for the person who knows better.

## Open questions

- Should turning off an identity provider (106) offer to revoke the tokens of accounts that sign in
  only through it? Without SCIM, a person removed at the provider keeps their tokens until they
  expire.
- Should root be warned by notification (139) a week before a reviewer's token expires? Probably
  not: the person sees it on their own Tokens page.
