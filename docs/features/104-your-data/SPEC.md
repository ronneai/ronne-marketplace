# 104 — Your data

> Milestone: M15 · Depends on: 102, 103 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) (Personal data) · Contracts: none changed (a new web route, not part of `/api/v1`)

## Goal

A person can see what an instance holds about them, as Law 25, PIPEDA and the GDPR's right of
access expect (owner, 2026-10-06): one JSON file, from their Account page, with their account,
credentials' names, sessions, memberships, submissions, comments, items and audit events. Root can
make the same file for someone who asked (and for an account about to be erased, 103). It's a
record of the person, not a backup: files, tarballs and other people's data aren't in it.

## Scope

**In:**
- **Download your data** on Account (`/account`): a section, a button, a JSON file.
- **Download their data** in Admin › Users, for root, the same file for any account.
- **The file's shape** (Behaviour), versioned, made from the repositories the domains already have.
- **Limits:** one download per account per 10 minutes, and a bounded size.
- **Audited:** `user.data_exported`, with who asked.
- **The Your data section** of the Privacy topic, and the helpers `your-data` and
  `download-user-data`.

**Out** (and where it goes instead):
- **Submission files, item tarballs and manifests' contents:** the registry serves them (an item's
  files through the API, a draft through the editor); the file lists them by name and version.
- **Other people's data:** a review thread the person took part in holds only their own comments;
  a workspace's member list isn't theirs.
- **A machine-readable right of portability** beyond JSON: JSON is what the laws accept.
- **An API endpoint for `rmk`:** a token can't download the person's data; a session can (Rules).
- **Email delivery:** Ronne sends no email.

## Behaviour

### The file

`ronne-data-<id>-<date>.json`, UTF-8, `Content-Disposition: attachment`, made by a route handler
`GET /account/data` (the person's) and `GET /admin/users/<id>/data` (root's), both behind the web
session (`proxy.ts`), never a token. The shape, `version: 1`:

```json
{
  "version": 1,
  "exportedAt": "2026-10-18T14:03:22.417Z",
  "instance": { "name": "…", "url": "…" },
  "account": { "id": "…", "name": "…", "email": "…", "role": "user", "createdAt": "…",
               "disabledAt": null, "twoFactorEnabled": true,
               "signInMethods": ["password", { "provider": "Acme SSO", "linkedAt": "…" }],
               "scim": { "provider": "Acme SSO", "externalId": "…", "active": true } },
  "sessions": [{ "createdAt": "…", "expiresAt": "…", "ipAddress": "…", "userAgent": "…" }],
  "accessTokens": [{ "name": "…", "prefix": "rmk_ab…", "createdAt": "…", "createdVia": "web",
                     "lastUsedAt": null, "expiresAt": null, "revokedAt": null }],
  "deviceGrants": [{ "name": "…", "status": "approved", "createdAt": "…", "decidedAt": "…" }],
  "workspaces": [{ "name": "…", "role": "admin", "since": "…", "source": null }],
  "accessRequests": [{ "workspace": "…", "status": "approved", "message": "…", "createdAt": "…" }],
  "scopes": [{ "name": "@team", "workspace": "…", "createdAt": "…" }],
  "favorites": [{ "item": "@team/x", "addedAt": "…" }],
  "feedback": [{ "kind": "idea", "message": "…", "page": "/catalogue", "version": "1.2.3", "status": "new", "sentAt": "…", "handledAt": null }],
  "onboarding": { "hiddenAt": null, "installConfirmedAt": "…", "completedSeenAt": null },
  "items": [{ "name": "@team/x", "workspace": "…", "type": "skill", "owner": true,
              "versions": [{ "version": "1.0.0", "publishedAt": "…", "publishedByMe": true }] }],
  "submissions": [{ "name": "@team/x", "workspace": "…", "status": "approved", "createdAt": "…", "submittedAt": "…",
                    "revisions": 3, "files": ["ronne.yaml", "SKILL.md"] }],
  "comments": [{ "submission": "@team/x", "workspace": "…", "kind": "comment", "body": "…", "createdAt": "…" }],
  "auditEvents": [{ "at": "…", "action": "version.published", "as": "actor",
                    "target": { "type": "item_version", "id": "…" }, "ipAddress": null,
                    "metadata": { … } }]
}
```

`instance.name` is always "Ronne AI Marketplace" (the app has no instance name setting) and `url` is
`PUBLIC_URL`. `workspace` names the workspace the scope is in, since names are unique per workspace
(118). Every list is ordered oldest first. Secrets never: no token hashes or values, no password hash, no
two-factor secret or backup codes, no identity-provider tokens; `prefix` is the token's shown
prefix (009). Dates are ISO 8601 UTC. Private workspaces' names appear: they're the person's own
memberships. `auditEvents` holds the events where the person is the actor or the target, with
their metadata as stored (after 102's and 103's clearing; an event about another person names
that person only by id, since metadata emails of others aren't the exporter's data: every address
that isn't the person's, in values and keys at any depth, is replaced by `[other]`; and the
`ipAddress` of an event someone else did to the person is null, since it is that other person's).

### Limits

- At most 10,000 rows in any list; past it the list is cut, oldest kept, and the file says
  `"truncated": ["auditEvents"]` at the top, with the Account page's text saying so too (root
  can take a database export).
- The whole file is made in memory and sent at once; its size is bounded by the row limits
  (comments at 10,000 × 10 KB would be 100 MB: a comment's body is cut at 10,000 characters with
  `…` and `"truncated"` says `comments`).
- **One download per account per 10 minutes**, by the account the file is about, counted in the
  database from the audit log's `user.data_exported` events about it (retention keeps events at
  least a day, 102); the next one is 429 with
  the time left. Root's downloads for others count against that person's limit too.

### Where

- **Account → Your data:** a section (on the Password tab: `/account/data` is the download) with one sentence, the helper `your-data`, and **Download my
  data**. It's a link to `GET /account/data`, so it works with JavaScript off. Under it, "Last
  downloaded <date>" when there was one (from the audit log).
- **Admin › Users → Download their data** (root): in the row's menu, the same file for that
  account, for a person who asked and can't sign in (disabled, two-factor lost), and before an
  erasure (103's dialog links it). Greyed with "erased" for an erased account: the pseudonym has
  no data worth a file, and the file would name what's left.

### Rules

- Only a plain `GET` from the app downloads: any other method (a `HEAD` too) is 405, and a request
  the browser marks `Sec-Fetch-Site: cross-site` is 403, so another site can't use up a person's
  window. Answers that aren't the file are JSON in the API's error shape.
- The person's own: `GET /account/data` needs a web session; a disabled account can't sign in,
  so root does it. A session held on the two-factor step (105) can't download, and neither can a disabled account.
- Root's: `users.manage`; the audit event records root as actor and the person as target.
- `user.data_exported`, target the user, metadata `{ by: "self" | "root", rows: { … } }` (the
  counts), never the content.

### Phones (065)

A section and a button; nothing new.

## Edge cases

- **A root downloads their own:** through Account, as anyone; `by: "self"`.
- **An item the person owns in a workspace they left:** still listed under `items` with
  `owner: true`; the workspace's name is in the item's scope, which they can see as before.
- **A submission in a private workspace they are no longer a member of:** listed by name and
  status (it's theirs); no file contents either way.
- **A comment on a submission since deleted** (withdrawn as delete, 017): the review events went
  with it; nothing to list.
- **An identity provider since deleted** (106): `signInMethods` names it as `"(deleted provider)"`.
- **The same second, two downloads:** the second is 429.
- **JSON with a very long comment:** cut as above; the file is still valid JSON.
- **The person is erased between the click and the response:** the route reads the row once,
  finds `erased_at`, and answers 404.
- **Root's download of a root's data:** allowed; roots can see each other (059).
- **Time zone:** dates are UTC in the file; the Account page shows the last download in the
  person's zone, as other dates.

## Documentation

- **Privacy → Your data** (`privacy#your-data`): what the file holds, section by section, what
  it never holds, the limits, that root can make it for someone, and what to do when a list was
  cut. Both `topics.ts` get the section.
- **Your account** (`account`): a line pointing at the section.
- **Administration → Users** (`admin#users`): the Download action.
- **Helpers:** `your-data` on the Account section → `privacy#your-data`; `download-user-data` on
  the Admin › Users action's dialog → the same.

## Acceptance criteria

- [ ] A signed-in person downloads a JSON file with every section of the shape, filled from
      seeded rows of each kind, ordered oldest first; a db test checks each section's rows and
      that no secret (hashes, two-factor secret, backup codes, provider tokens) is in the output.
- [ ] Root downloads the same file for another account, including a disabled one; a moderator
      can't (404); a token can't (the route isn't under `/api/v1` and refuses a bearer token).
- [ ] The second download within 10 minutes is 429 with the time left; root's count against the
      same account.
- [ ] A list past 10,000 rows is cut, oldest kept, and `truncated` names it; a comment past
      10,000 characters is cut with `…`; the file is valid JSON.
- [ ] `user.data_exported` is recorded with `by` and the counts; the Account page shows the last
      download's date.
- [ ] An erased account's download is 404 and the Admin › Users action is greyed.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **A route handler and a link, not a server action** (Claude): a server action can't answer a
   file download without client JavaScript; a `GET` behind the session does, and works with
   JavaScript off.
2. **One file, in memory, with row limits** (Claude, to confirm): streaming JSON for a right-of-
   access file nobody's instance will fill is complexity for nothing; the limits make the size
   bounded and visible.
3. **Not through `rmk` or a token** (Claude): a token is for the registry; the person's data is a
   matter for the person, signed in, or root.
4. **Other people's emails are replaced in the person's audit events** (Claude): the file is the
   person's data; an event about someone else is in it only because the person acted.
5. **Audit events stay in the file after 103 cleared their IPs** (Claude): they're the person's
   record; the IP is simply null.

## Open questions

- Decision 2: streaming instead, with no limits? Left out unless you want it.
- Should the file include the manifests (`ronne.yaml` text) of versions the person published?
  They're public on the item page; left out to keep the file small.
