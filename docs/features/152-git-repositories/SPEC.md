# 152 — Git repositories and their credentials

> Milestone: M25 · Depends on: 136, 122, 090, 093, 098, 099 · Design: [MVP §3.3](../../MVP/MVP.md#33-platform-renderers), [§12](../../MVP/MVP.md#12-security-considerations), [§15](../../MVP/MVP.md#15-decision-log) ("Git export") · Contracts: none changed

## Goal

Root links the instance to git repositories on GitHub, GitLab, Bitbucket, Azure DevOps or any git
host that speaks HTTPS, with a credential Ronne keeps encrypted, so the instance can push its items
there (153) and read private repositories to import from (154). Cursor and Codex take plugin
marketplaces only from a git repository (owner, 2026-10-29: "we need to set a git repo to use the
plugins/marketplace items"), and the instance is meant to serve any harness, so the repository is
the bridge. This feature is the connection only: what is pushed, and when, is 153.

## Scope

**In:**
- **Admin › Settings › Git repositories** (`?tab=git`, 122's tab strip), root only:
  - a list of repositories: name, host, branch, what it's used for (push, read or both), and its
    last result once 153 or 154 used it;
  - **Add**, **Edit**, **Remove** (asks first), **Test connection**.
- **A repository:**
  - a **name** (lowercase letters, digits and `-`, unique), shown in the list and the audit log;
  - the **URL**, `https://` only (no `user:password@`, no query or fragment), normalised and stored
    as checked, never as typed (136's rule);
  - the **host kind**, guessed from the URL and changeable: `github`, `gitlab`, `bitbucket`,
    `azure-devops` or `other`. It only chooses the help text and the user name sent with the token;
  - the **branch** (`main` by default);
  - the **use**: `push` (153), `read` (154) or both;
  - the **credential**: a user name where the host needs one, and a **token**, write-only.
- **The token, write-only, as 136's key:**
  - sealed at rest with `server/crypto/sealed.ts` (AES-256-GCM, HKDF from `AUTH_SECRET`, its own
    `info` string), bound to the repository's id and the URL's origin, so a token typed for one host
    never goes to another, and a sealed value copied to another row doesn't open;
  - never shown again, never sent to the browser, never in the audit log or the logs; "Token set" or
    "No token", with **Replace** and **Remove**;
  - removed when the URL's origin changes, unless a new token is typed with the change;
  - re-encrypted by `rotate-secret` (098); one that no longer opens reads as "No token" with a notice.
  - Through 147's shared secrets store once it lands; until then, the same helper 136 uses.
- **A token without one:** `read` repositories may have none (a public repository).
- **URL checks, as 136's endpoint checks** (`scans/models/endpoint.ts`, moved to a shared place):
  - every address the host resolves to is public; private, loopback, link-local and metadata
    addresses are refused unless the host is in the operator's `RONNE_GIT_HOSTS` (a self-hosted
    GitLab on the company network, say), which may also allow `http://`;
  - checked on save and again before every connection, as DNS can change;
  - Ronne's own git client connects only to the addresses it checked and follows no redirect to
    another origin.
- **Test connection:** lists the remote's references (git's smart HTTP `info/refs`), and says one of:
  "Reached <host>, branch main found", "Reached <host>; there's no branch main yet" (fine for
  `push`: 153 creates it), "The token was refused", "The repository wasn't found, or the token can't
  see it", "Couldn't reach <host>". Nothing is cloned and nothing is written.
- **The git client:** `isomorphic-git` (MIT), in the web server's process, over HTTPS, wrapped in a
  `GitRemote` interface in `server/git/` so the domains never import it. Not the `git` program: it
  is GPL-2.0, which the dependency policy forbids in the image, and it isn't in the npm package or
  the bundles. Checked against the policy in task 2.
- **Audit:** `git_repository.created`, `.updated`, `.removed`, with the name, the host, the branch,
  the use and `tokenChange` (`set`, `replaced`, `removed`); never the token, never the URL's path
  beyond the host (it can name private projects only as much as the host does).
- **Backups** (099): the repositories go with the database; the backup runbook says a full backup can
  open their tokens, as it can 136's key.

**Out** (and where it goes instead):
- **SSH and deploy keys.** `isomorphic-git` speaks HTTPS only. Every host listed issues HTTPS tokens
  (GitHub fine-grained tokens, GitLab project access tokens, Bitbucket and Azure DevOps access
  tokens). No SSH for now (owner, 2026-10-29); a later feature if asked.
- **OAuth apps and GitHub Apps** ("Connect with GitHub"). A token typed by root first; an app per host
  later, if asked.
- **Repositories set up by workspace admins.** Root only for now (open question).
- **Creating the repository on the host.** Root creates it there; Ronne pushes to it.

## Behaviour

**Adding a repository.** Root types the name, URL, branch, use and token, presses Test connection if
they like, and saves. The save checks the URL, seals the token and records the audit event. The help
beside the token field says, per host kind, which token to make and the least it needs:
- GitHub: a fine-grained token for that one repository, **Contents: read and write** (read only for
  `read`);
- GitLab: a project access token, `write_repository` (`read_repository` for `read`);
- Bitbucket: a repository access token with **Repositories: write** (read);
- Azure DevOps: a personal access token with **Code: read & write** (read);
- other: whatever the host issues for git over HTTPS.

**Using it.** 153 and 154 ask the `git` service for a repository by id and get a `GitRemote` with the
token opened in memory for that run only. The service checks the URL again first; a refused one fails
the run with `url refused`.

**Removing it.** Deletes the row and the sealed token. What 153 pushed stays on the host; imports
(154) keep their recorded source.

## Edge cases

- **`AUTH_SECRET` changed by hand:** the token no longer opens; the tab says "The stored token can't
  be read: enter it again", and 153 and 154 fail with `token unreadable` until then.
- **A restore onto another instance** (099): the same, unless its `AUTH_SECRET` came with it.
- **The host is renamed in the URL** (another origin): the token is removed unless typed again.
- **Two roots save at once:** the last one wins; each save is audited.
- **A token that expires on the host:** Test connection and the next push say it was refused; the
  list shows the last result.
- **The data download** (104): never; it's an instance setting.

## Data

- A migration: `git_repositories` (`id`, `name` unique, `url`, `host_kind`, `branch`, `use`,
  `username`, `token_enc` nullable, `created_by`, `created_at`, `updated_at`), on all three
  databases.
- Nothing new in the audit log's shape.

## Documentation

- **Git repositories**, a new topic in the Administration group (`git-repositories`): what they're
  for (pushing plugin marketplaces, 153; importing, 154), adding one (`add`), which token per host
  (`tokens`), the URL checks and `RONNE_GIT_HOSTS` (`network`), Test connection's answers
  (`troubleshooting`), and that a full backup can open the tokens.
- **Install guide:** `RONNE_GIT_HOSTS`, beside the scanner's variables.
- **Backups** (`backups`): the tokens, as 136's key.
- **Helpers:** the tab's "What are these for?" → `git-repositories`; the token field's "Which token
  do I need?" → `git-repositories#tokens`.
- `apps/web/src/components/help/topics.ts` and ronne-web's `topics.ts` gain the topic together.

## Acceptance criteria

- [ ] Root adds, edits, tests and removes repositories in the tab; nobody else sees the tab or its
  actions (server checks, not only hidden buttons).
- [ ] The token is stored only sealed and bound to the repository and its origin, and is never
  returned to the browser, written to the audit log or logged; tests show a token set through the
  tab is absent from the page props, the action's response, the audit metadata and the log lines.
- [ ] A URL that isn't `https://`, carries credentials, or resolves to a private, loopback,
  link-local or metadata address is refused on save and before each connection, unless its host is
  in `RONNE_GIT_HOSTS`.
- [ ] Changing the URL's origin removes the kept token unless a new one is typed.
- [ ] `rotate-secret` re-encrypts the tokens; one that no longer opens reads as "No token".
- [ ] Test connection answers each of its five lines, tested against a local git server.
- [ ] `isomorphic-git` passes the dependency policy checklist, and `pnpm licenses:check` passes.
- [ ] The tab is in English, Portuguese and French, and passes the phone sweep.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **HTTPS tokens, through `isomorphic-git`, not the `git` program** (Claude, 2026-10-29): the
   program is GPL-2.0 and would have to be installed in the image, the npm package and the bundles;
   `isomorphic-git` is MIT, pure JavaScript, and runs wherever the server does.
2. **136's sealing and endpoint checks, reused** (Claude): one reviewed implementation, already
   re-keyed by `rotate-secret`.
3. **Root only** (Claude): a repository credential can publish under the company's name; workspace
   admins choose what of theirs goes out (153), not where.

## Open questions

- Should a workspace's admins be able to add repositories for their own workspace?
