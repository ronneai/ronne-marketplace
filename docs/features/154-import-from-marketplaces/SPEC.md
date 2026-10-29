# 154 — Import items from other marketplaces

> Milestone: M26 · Depends on: 152, 037, 038, 040, 043, 051, 010, 135, 137, 014 · Design: [MVP §14.5](../../MVP/MVP.md#145-decided-out-of-scope-for-now) (import comes off the list), [§12](../../MVP/MVP.md#12-security-considerations), [§15](../../MVP/MVP.md#15-decision-log) ("Import") · Contracts: [`docs/spec/native-readers.md`](../../spec/native-readers.md) (a new section: repositories)

## Goal

A person brings a skill, agent, command, rule or MCP server that someone published elsewhere into
the instance, as a **draft** that goes through the same review and scan as anything written here
(owner, 2026-10-29: "import skills from different marketplaces, like skills.sh, Vercel as well").
Ronne records where it came from, at which commit and under which licence, and refuses what its
author didn't allow anyone to reuse.

## What the sources are (checked 2026-10-29)

- **skills.sh and Vercel are one source.** skills.sh is the directory Vercel runs for its open
  `skills` CLI (`npx skills add`, MIT); Vercel's docs list Vercel's own skills by linking to
  skills.sh. The directory holds no files: every entry is a skill folder (`SKILL.md`) in a **git
  repository**, named `owner/repo/skill`, mostly on GitHub. The CLI also takes GitLab, Azure Repos and
  any git URL, and looks for skills in the repository's root, `skills/`, `.agents/skills/`,
  `.claude/skills/` and many tool folders, and in `.claude-plugin/marketplace.json` and `plugin.json`.
- **skills.sh's search API** isn't documented by Vercel: the CLI calls an endpoint under
  `https://skills.sh/api/` (`SKILLS_API_URL` overrides it), and third-party pages give different
  paths. It's treated as optional and unstable (below).
- **Licences:** neither skills.sh nor the Agent Skills format requires one; `SKILL.md` may say
  `license:` in its frontmatter, and repositories usually carry a `LICENSE` file.
- **Claude Code plugin marketplaces** are git repositories too (`.claude-plugin/marketplace.json`),
  as are Codex's and Cursor's (`plugin-feeds.md`).

So one importer covers them all: **import from a git repository**, with skills.sh as a way to find
the repository.

## Scope

**In:**
- **Import** (`/import`, and "Import from a repository" in + Propose item), for anyone who may create
  drafts, when root has turned imports on:
  1. **Where from:** a repository URL or `owner/repo` (GitHub's shorthand), with an optional branch,
     tag or commit and a path inside it; or a **skills.sh search**, when root turned it on, whose
     results are repositories and paths (`owner/repo/skill`); or one of root's `read` repositories
     (152), for a private one.
  2. **What's there:** Ronne fetches the repository (a shallow clone through 152's `GitRemote`, with
     limits) and lists what it found, by type, read with the export readers (038, 040, 043) at the
     same places the `skills` CLI looks, and plugin folders listed in a marketplace file. Each row
     says its **licence** and whether it can be imported.
  3. **Into:** the scope (as export, 038: any scope the person may propose in), the names (taken from
     the source, editable), and the items to take.
  4. **Import:** one draft per item, as the person, with its files, its description (the source's;
     asked when there's none, 053) and its dependencies when the source names others imported at the
     same time (041's rule). A draft of the same item from the same source is updated instead (051).
- **Licences:**
  - found from the item's own `license:` (an SPDX id), else the `LICENSE`, `LICENSE.md`, `LICENSE.txt`
    or `COPYING` next to the item or at the repository's root, matched to an SPDX id by its text
    (a small matcher over the licences on root's list, not a guess: no match is "unknown");
  - **root's list** of licences that allow reuse, in Admin › Settings › Imports: by default MIT,
    Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0, CC-BY-4.0;
  - an item whose licence is unknown, missing or not on the list **can't be imported**, with the
    reason ("No licence found: its author hasn't allowed reuse", "GPL-3.0 isn't on this instance's
    list");
  - the licence file is copied into the draft's files and the manifest's `license` is set to the id,
    so the notice the licence asks for travels with every version.
- **Provenance**, recorded with each draft and kept on every version released from it: the source
  (normalised URL, never a token), the path, the ref asked for, the **commit**, the licence id and the
  licence file's sha256, who imported it and when. Shown on the review page (a line above the files:
  "Imported from github.com/acme/skills, skills/pdf at 3f2a9c1, MIT") and on the item page's Overview.
- **Review and scan:**
  - an imported draft is a draft: the person submits it, a moderator reviews it, 135 scans it and
    137's gate applies, as for any other;
  - a **risk flag** (014), *Imported*, on every revision with provenance, so reviewers read it as
    third-party content;
  - when the scan is off, the flag says "Not scanned: the security scan is off on this instance".
- **Admin › Settings › Imports** (`?tab=imports`), root:
  - **On / Off** (off by default: it fetches from the internet);
  - **Who may import:** everyone who may create drafts, moderators and admins, or root only;
  - **Hosts:** the hosts imports may fetch from, `github.com` and `gitlab.com` by default; any other
    must be added, and 152's URL checks apply (no internal addresses unless in `RONNE_GIT_HOSTS`);
  - **skills.sh search:** off by default; when on, searches go from the server to skills.sh and the
    page says so;
  - **Licences:** the list above.
- **Limits:** a repository of at most 50 MiB fetched and 5,000 files; each item within 037's package
  limits; no submodules, no LFS objects (their pointer files are left out with a warning), no
  symbolic links (left out with a warning); 20 imports per person per hour, as 037 limits uploads.
- **Audit:** `item.imported` per draft (source host and path, commit, licence, scope, name), and the
  settings' changes (`settings.imports`).

**Out** (and where it goes instead):
- **Following the source's changes.** 155.
- **Importing from another Ronne instance.** That's federation (§14.1), with release signing first.
- **`rmk import` and an MCP tool.** The web first; a person can already `npx skills add` and then
  `rmk export` (038). Later, if asked.
- **Registries that aren't git** (npm packages, tarball URLs). Later, if asked.
- **Bulk import of a whole marketplace without choosing.** The person picks the items.

## Behaviour

**Fetching.** The server fetches the ref (default branch when none) shallowly into a private
temporary folder under the data directory, reads it, and deletes the folder when the import ends or
is abandoned (a cleanup on start removes leftovers). Nothing from the repository runs: no hooks, no
scripts, no package installs.

**Reading.** The readers are 038's, 040's and 043's (`packages/core/src/read`), pointed at the
fetched folder instead of the person's machine; a new reader section in `native-readers.md` lists
the places looked at and how a plugin folder (`skills/`, `agents/`, `commands/`, `.mcp.json`) maps to
types. What a reader can't read is listed with the reason and not imported.

**Names.** The source's name (`pdf`) becomes `@<scope>/pdf`; a clash with an existing item in the
scope is shown, and the person renames or picks another scope.

## Edge cases

- **The repository is private and no `read` repository covers it:** "Couldn't read this repository:
  ask root to add it under Git repositories."
- **A licence file and a `license:` that disagree:** the stricter reading wins: the item can be
  imported only if both are on the list.
- **A repository with one licence and an item folder with another:** the item's own wins.
- **The same item imported twice by two people:** two drafts; the name clash shows at submit as for
  any two drafts.
- **skills.sh answers nothing, or something unexpected:** "skills.sh search isn't available right
  now: paste the repository instead"; the URL path always works.
- **A host taken off root's list:** its provenance stays; new imports from it are refused.

## Data

- A migration: `item_imports` (`id`, `submission_id`, later `version_id` once released, `source_url`,
  `source_path`, `ref`, `commit`, `license`, `license_sha256`, `imported_by`, `imported_at`), on all
  three databases.
- `instance_settings`: `imports_enabled`, `imports_who`, `imports_hosts`, `imports_skills_sh`,
  `imports_licenses`.
- Contracts: `docs/spec/native-readers.md` gains the repository reader; the manifest is unchanged
  (`license` already exists).

## Documentation

- **Importing items**, a new topic in the Authoring group (`import`): what can be imported and from
  where (`sources`: git repositories, skills.sh and Vercel, plugin marketplaces), licences and why
  some items can't come in (`licences`), what's recorded (`provenance`), and that imports are
  reviewed and scanned like anything else (`review`).
- **Settings** (`settings#imports`): the Imports tab.
- **Reviewing** (`reviews#imported`): the *Imported* risk flag and the provenance line.
- **Helpers:** the import page's "Why can't I import this one?" → `import#licences`; the Imports
  tab's "What does turning imports on do?" → `settings#imports`; the provenance line's "Where did
  this come from?" → `import#provenance`.
- `apps/web/src/components/help/topics.ts` and ronne-web's `topics.ts` gain the topic together.

## Acceptance criteria

- [ ] With imports on, a person imports a skill from a public repository on the local git server, and
  a draft appears with its files, licence file, `license` and provenance; with imports off, the page
  and the action refuse.
- [ ] An item without a licence, with an unknown one, or with one off root's list can't be imported,
  with the reason; tests cover each licence-finding rule.
- [ ] Imported drafts are reviewed and scanned like any other, and every revision with provenance
  carries the *Imported* flag.
- [ ] Only root's hosts are fetched from, 152's URL checks apply, and a private repository is read
  only through a `read` repository.
- [ ] The size, file-count, submodule, LFS and symbolic-link limits hold, and the temporary folder is
  removed after success, failure and a restart.
- [ ] Nothing from the repository is executed (a test repository with hooks and scripts shows it).
- [ ] skills.sh search, when on, lists repositories; when it fails, the URL path still works.
- [ ] Provenance shows on the review page and the item page, and never holds a token.
- [ ] The screens are in English, Portuguese and French, and pass the phone sweep.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Import from git, with skills.sh as a finder** (Claude, 2026-10-29, from the vendor check):
   every marketplace named stores its items in git repositories, so one importer covers them and
   doesn't depend on an undocumented API.
2. **Imports are drafts** (owner, 2026-10-29): reviewed and scanned like everything else; there is no
   way around review.
3. **No reusable licence, no import** (owner, 2026-10-29), with root's list deciding what's reusable
   and the licence file kept with the item.
4. **Off by default** (Claude): the server fetches from the internet only when root says so.

## Open questions

- Should root be able to import an unlicensed item with a recorded permission note ("the author
  allowed us by email")?
- Is CC-BY-4.0 right on the default list (it asks for attribution, which the provenance line gives)?
