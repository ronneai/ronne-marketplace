# 015 — Release

> Milestone: M3 · Depends on: 014 · Design: [MVP §3.4](../../MVP/MVP.md#34-versions-and-dist-tags), [§4.2](../../MVP/MVP.md#42-release), [§10](../../MVP/MVP.md#10-data-model-mvp), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md)

## Goal

An approved submission becomes a published version: an immutable `.tgz` with a sha256, stored through
a `StorageAdapter`, recorded as an item version and pointed to by a dist-tag. After this, Ronne has a
registry, and the checks that 013 ran against an empty one start to mean something.

## Scope

**In:**
- Migration `0007_items`: `items`, `item_versions`, `dist_tags` and `version_dependencies` (MVP §10).
- The `StorageAdapter` interface and its local-disk implementation under `STORAGE_PATH`.
- **Publish**: the version, the pack, the artifact, the database rows, the dist-tag, and the audit
  events, from the approved revision (014).
- The real `RegistryLookup` over these tables, replacing 013's `unreleasedRegistry`.
- The publish dialog on an approved submission.

**Out:**
- Moving tags by hand, deprecating and yanking → 016.
- New versions of an existing item (change proposals) and the suggested bump from a diff → 017. The
  version rules below already cover later releases, so 017 only adds the suggestion.
- The catalogue and item pages → 018. Downloading artifacts over the API → 019.
- S3 storage (MVP §14): the interface keeps the door open.

## Behaviour

**Tables** (migration `0007_items`, the 002 portability rules):
- `items`: id, scope_id (RESTRICT), name, type, description, owner_id (the first author, set null),
  created_at; unique (scope_id, name).
- `item_versions`: id, item_id (RESTRICT), version (`exactString(64)`), manifest (JSON text), readme
  (long text, nullable), files (JSON: each path, size and executable flag), notes (release notes, text,
  nullable), artifact_path, sha256, size, published_by (RESTRICT), published_at, deprecated_message
  (nullable), yanked_at (nullable), submission_id (the submission it came from); unique (item_id,
  version).
- `dist_tags`: item_id, tag, version_id — PK (item_id, tag).
- `version_dependencies`: version_id, depends_on_item_id, range.

`readme` and `files` are copied at publish time, so the catalogue (018) never unpacks an artifact to
show a page. They extend MVP §10's `item_versions`.

**Who publishes:** the submission's author, or any moderator or root (MVP §2), from `approved`.

**The version** (MVP §3.4 and §4.2):
- A first stable release is `1.0.0`. A first pre-release is `1.0.0-<id>.1` (the publisher types the
  id, such as `beta`; lowercase letters and digits).
- A later release (017) bumps the highest published version: patch, minor or major; or a pre-release
  of the next version (`1.1.0-beta.1`, then `.2`), and releasing the stable version drops the suffix.
- The server computes the version from the choice; the publisher never types a version number.
- A version that already exists is refused (`VersionExistsError`), even a yanked one: versions are
  immutable and never reused.

**The dist-tag:** `latest` by default for a stable release; `next` by default for a pre-release, which
can never be `latest`. The publisher may choose another tag (lowercase letters, digits and hyphens,
not a valid semver range).

**Publishing, in order:**
1. Check the permission and that the submission is `approved`, and compute the version.
2. Pack the approved revision with 011's `packItem(files, { version })`, which also sets `version` in
   the packed `ronne.yaml`.
3. Store the artifact at `<scope>/<name>/<version>.tgz` through the `StorageAdapter`. `put` refuses to
   overwrite a different file at the same key; the same bytes again are accepted (a retried publish).
4. In one transaction: create the item on its first release; insert the version (manifest, readme,
   files, notes, sha256, size) and its dependency rows; move the dist-tag; move the submission to
   `published` (013's table); record `version.published { name, version, tag, sha256 }` and
   `dist_tag.moved { name, tag, from, to }`.
5. If the transaction fails, the stored file stays but nothing points to it; a retry reuses it (step 3).

**`StorageAdapter`** (`server/storage/`): `put(key, bytes)`, `get(key)` (the bytes: artifacts are at
most 5 MB, MVP §12), `exists(key)`, `size(key)`. The local implementation writes under
`STORAGE_PATH` through a temporary file hard-linked into place, which fails if the key already
exists, so two writers can't race; it refuses keys with `..` or absolute paths, and never deletes
(yanked versions keep their files, MVP §3.4).

**The registry lookup** (`kyselyRegistryLookup`): `findItem` and `publishedVersions` over the new
tables, so 013's name and dependency checks see published items.

**The publish dialog** (on `/submissions/[id]` when approved, and on the review page): stable or
pre-release (with its id), the tag (with its default), optional release notes (Markdown, up to 2,000
characters), and a summary: "Publishes @scope/name 1.0.0 as latest". On success, the page shows the
version and its sha256.

## Edge cases

- **Two publishes of one approved submission at once:** the row lock and 013's transition table let
  one through; the other gets `InvalidStatusTransitionError`.
- **Two different submissions for one new name:** 013 stops the second at submit; if both got through
  anyway, the unique (scope_id, name) index refuses the second item.
- **The disk is full or read-only:** the publish fails before the transaction, with the error; the
  submission stays approved.
- **A dependency was yanked after the submission was approved:** publishing re-runs the dependency
  checks, and refuses with the same messages as 013.

## Acceptance criteria

- [ ] `0007_items` creates the four tables, unique indexes and table-level foreign keys on all four databases.
- [ ] Publishing packs the approved revision deterministically, stores it, and records the version, its dependencies, the dist-tag and the audit events in one transaction.
- [ ] The version rules hold: first stable and pre-release, bumps, pre-release numbering, never reused, and pre-releases never `latest`.
- [ ] The local `StorageAdapter` never overwrites different bytes, accepts a retried identical put, and refuses unsafe keys.
- [ ] Only the author, moderators and root publish, and only from `approved`.
- [ ] 013's registry checks now see published items: a draft can depend on a released item, and a published name can't be proposed again.
- [ ] Playwright: a moderator approves a skill, the author publishes it as `1.0.0` on `latest`, and a second draft depending on `^1.0.0` submits.

## Open questions

The owner started 015 (2026-09-28) without answering these, so it's built on the recommendations;
either can still change.

1. **Who may publish:** the author, moderators and root, as MVP §2 says (recommended), or moderators
   and root only.
2. **Release notes** in the publish dialog, stored on the version (recommended; MVP §8 lists "notes"),
   or left out of the MVP.
