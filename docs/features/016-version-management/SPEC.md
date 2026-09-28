# 016 — Version management

> Milestone: M3 · Depends on: 015 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§3.4](../../MVP/MVP.md#34-versions-and-dist-tags), [§4.3](../../MVP/MVP.md#43-install--update), [§12](../../MVP/MVP.md#12-security-considerations)

## Goal

Moderators and root look after published versions: they point dist-tags at the right version, warn
people off a version with a deprecation, and pull a bad one from new installs with a yank. Versions
themselves never change (MVP §3.4); only these markers do, and each change is audited.

## Scope

**In:**
- **Dist-tags:** point a tag at another version, add a tag, and remove one (never `latest`).
- **Deprecate** and undeprecate a version, with a message.
- **Yank** and unyank a version.
- The page they live on: an item's **Versions** page (`/items/[scope]/[name]/versions`), which 018
  builds the rest of the item page around.
- A permission `versions.manage` (moderator, root), and audit events for each change.

**Out:**
- Deleting a version or its artifact: never. Versions are immutable (MVP §3.4).
- Publishing (015) and the catalogue (018).
- Renderers and `rmk` honouring these markers → 020 and 022 (the resolver skips yanked versions and
  prints deprecation messages, MVP §4.3).

## Behaviour

**Dist-tags** (MVP §3.4):
- **Move** a tag to any published, non-yanked version of the item. `latest` must point to a stable
  version; any other tag may point to a pre-release.
- **Add** a tag: lowercase letters, digits and hyphens, up to 32 characters, and not a valid semver
  range (so `1.2` or `^1` can't become tags). Up to 20 tags per item.
- **Remove** a tag, except `latest`. An item always has `latest` once it has a stable version.
- Audit `dist_tag.moved { name, tag, from, to }` and `dist_tag.removed { name, tag, was }`.

**Deprecate** (MVP §3.4): the version stays installable, and shows its message (1 to 300 characters)
on the item page, in `rmk` and in the MCP server. Deprecating again changes the message.
**Undeprecate** clears it. Audit `version.deprecated { name, version, message }` and
`version.undeprecated`.

**Yank** (MVP §3.4): new installs can't resolve the version, but a lockfile that pins it still
downloads it, so existing projects keep working. The artifact is never deleted.
- **Yanking the version `latest` points to** moves `latest` to the highest remaining stable,
  non-yanked version (recommended, see Open questions). If none is left, the item loses `latest` and
  the page says it has no installable stable version.
- Any other tag that points to a yanked version stays, marked "yanked" on the page, until someone moves
  it.
- **Unyank** makes the version resolvable again; it doesn't move tags back.
- A reason (1 to 300 characters) is required, and shown on the Versions page.
- Audit `version.yanked { name, version, reason, latest_moved_to }` and `version.unyanked`.

**The Versions page** (`/items/[scope]/[name]/versions`): every version, newest first, with its tags,
published at and by, size and sha256, and any deprecation or yank. Everyone signed in can read it;
moderators and root get the actions (move tag, add tag, remove tag, deprecate, undeprecate, yank,
unyank) as dialogs. Each action locks the item's row, so two moderators can't leave the tags in a
state neither chose.

## Edge cases

- **Yanking every version:** allowed; the item has no `latest` and 018 shows it as "no installable
  version" rather than hiding it.
- **Moving `latest` to a version older than the current one:** allowed (a rollback), and audited.
- **A pre-release and `latest`:** refused with "latest can only point to a stable version".
- **The only stable version is yanked, and a pre-release exists:** `latest` is removed, not moved to
  the pre-release.

## Acceptance criteria

- [ ] Moving, adding and removing tags follow the rules above, and `latest` never points to a pre-release or disappears while a stable non-yanked version exists.
- [ ] Deprecate and undeprecate change only the message; the version stays resolvable.
- [ ] Yank and unyank follow the rules above, never delete an artifact, and move `latest` when it pointed to the yanked version.
- [ ] Only moderators and root change anything; everyone signed in reads the Versions page.
- [ ] Every change is audited, in the same transaction as the change, and concurrent changes to one item are serialised.
- [ ] Playwright: a moderator deprecates a version, yanks the latest one (and sees `latest` move back), then unyanks it.

## Open questions

The owner started 016 (2026-09-28) without answering these, so it's built on the recommendations;
either can still change.

1. **Yanking the `latest` version moves `latest` back** to the highest remaining stable version
   (recommended), or yanking it is refused until someone moves `latest` by hand.
2. **Unyank exists** (recommended, for a yank made by mistake), or a yank is final.
