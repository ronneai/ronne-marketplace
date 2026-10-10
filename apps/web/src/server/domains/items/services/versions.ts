import { formatItemName } from "@ronneai/core";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { can, canInSome, requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import {
  ItemNotFoundError,
  TagRuleError,
  VersionDependsOnPrivateError,
  VersionMessageError,
  VersionNotFoundError,
} from "../exceptions/errors";
import type { Item, ItemRef, ItemVersion } from "../models/item";
import {
  latestAfterYank,
  messageFrom,
  moveTagProblem,
  removeTagProblem,
} from "../models/version-rules";
import type { ItemRepository } from "../repositories/item-repository";

/**
 * Looking after published versions (feature 016, MVP §3.4): dist-tags, deprecation and yanks, for
 * the moderators of the item's workspace and root (`versions.manage`, 091). Versions themselves
 * never change. Every action locks the item's row and is audited in the same transaction.
 */
export type VersionDeps = { items: ItemRepository; now?: () => Date };
export type VersionActor = { user: CurrentUser | null; ip: string | null };
export type { ItemRef } from "../models/item";

const nameOf = (ref: ItemRef) => formatItemName(ref);

/** Runs `work` on the locked item, with its versions, as `versions.manage`. */
const withItem = <T>(
  deps: VersionDeps,
  actor: VersionActor,
  ref: ItemRef,
  work: (context: {
    items: ItemRepository;
    item: Item;
    versions: ItemVersion[];
    at: Date;
    audit: (
      action: Parameters<ItemRepository["recordAudit"]>[0]["action"],
      metadata: Record<string, string | null>,
      target?: { type: "item" | "item_version"; id: string },
    ) => Promise<void>;
  }) => Promise<T>,
): Promise<T> => {
  // Moderators somewhere get "not found" for a missing item; anyone else is refused first.
  if (!canInSome(actor.user, "versions.manage")) throw new ForbiddenError("versions.manage");
  const at = (deps.now ?? (() => new Date()))();
  return deps.items.transaction(async (items) => {
    const item = await items.findByName(ref);
    if (!item) throw new ItemNotFoundError(nameOf(ref));
    // In the item's workspace: its moderators, or root (091).
    requirePermission(actor.user, "versions.manage", item.workspaceId);
    await items.lockItem(item.id);
    const versions = await items.versions(item.id);
    return work({
      items,
      item,
      versions,
      at,
      audit: (action, metadata, target = { type: "item", id: item.id }) =>
        items.recordAudit(
          {
            actorId: actor.user?.id ?? null,
            action,
            target,
            metadata: { name: nameOf(ref), ...metadata },
            ipAddress: actor.ip,
          },
          at,
        ),
    });
  });
};

const find = (versions: ItemVersion[], ref: ItemRef, version: string) => {
  const found = versions.find((v) => v.version === version);
  if (!found) throw new VersionNotFoundError(nameOf(ref), version);
  return found;
};

const rulesView = (v: ItemVersion) => ({
  id: v.id,
  version: v.version,
  yanked: v.yankedAt !== null,
});

/** Points `tag` at `version`, creating the tag if it's new. */
export const moveTag = (
  deps: VersionDeps,
  actor: VersionActor,
  ref: ItemRef,
  input: { tag: string; version: string },
) =>
  withItem(deps, actor, ref, async ({ items, item, versions, audit }) => {
    const tag = input.tag.trim();
    const target = find(versions, ref, input.version);
    const tags = await items.tags(item.id);
    const current = tags.find((t) => t.tag === tag);
    const problem = moveTagProblem(tag, rulesView(target), tags.length, !current);
    if (problem) throw new TagRuleError(problem);
    if (current?.versionId === target.id) return;
    await items.setTag(item.id, tag, target.id);
    await audit("dist_tag.moved", {
      tag,
      from: versions.find((v) => v.id === current?.versionId)?.version ?? null,
      to: target.version,
    });
  });

/** Removes a tag; `latest` stays. */
export const removeTag = (
  deps: VersionDeps,
  actor: VersionActor,
  ref: ItemRef,
  input: { tag: string },
) =>
  withItem(deps, actor, ref, async ({ items, item, versions, audit }) => {
    const problem = removeTagProblem(input.tag);
    if (problem) throw new TagRuleError(problem);
    const current = (await items.tags(item.id)).find((t) => t.tag === input.tag);
    if (!current) return;
    await items.removeTag(item.id, input.tag);
    await audit("dist_tag.removed", {
      tag: input.tag,
      was: versions.find((v) => v.id === current.versionId)?.version ?? null,
    });
  });

/** Deprecates a version with a message, or changes the message; it stays installable. */
export const deprecate = (
  deps: VersionDeps,
  actor: VersionActor,
  ref: ItemRef,
  input: { version: string; message: string },
) =>
  withItem(deps, actor, ref, async ({ items, versions, audit }) => {
    const version = find(versions, ref, input.version);
    const message = messageFrom(input.message);
    if (!message) throw new VersionMessageError("A deprecation message");
    await items.setDeprecated(version.id, message);
    await audit(
      "version.deprecated",
      { version: version.version, message },
      { type: "item_version", id: version.id },
    );
  });

export const undeprecate = (
  deps: VersionDeps,
  actor: VersionActor,
  ref: ItemRef,
  input: { version: string },
) =>
  withItem(deps, actor, ref, async ({ items, versions, audit }) => {
    const version = find(versions, ref, input.version);
    if (version.deprecatedMessage === null) return;
    await items.setDeprecated(version.id, null);
    await audit(
      "version.undeprecated",
      { version: version.version },
      { type: "item_version", id: version.id },
    );
  });

/**
 * Yanks a version: new installs can't resolve it, but lockfiles that pin it still download it, and
 * its artifact stays. If `latest` pointed to it, `latest` moves to the highest stable version left,
 * or goes away when there's none (owner's recommendation, spec 016).
 */
export const yank = (
  deps: VersionDeps,
  actor: VersionActor,
  ref: ItemRef,
  input: { version: string; reason: string },
) =>
  withItem(deps, actor, ref, async ({ items, item, versions, at, audit }) => {
    const version = find(versions, ref, input.version);
    const reason = messageFrom(input.reason);
    if (!reason) throw new VersionMessageError("A yank reason");
    if (version.yankedAt) return;
    await items.setYanked(version.id, { at, reason });
    const latest = (await items.tags(item.id)).find((t) => t.tag === "latest");
    let movedTo: string | null = null;
    if (latest?.versionId === version.id) {
      const next = latestAfterYank(versions.map(rulesView), version.id);
      if (next) await items.setTag(item.id, "latest", next.id);
      else await items.removeTag(item.id, "latest");
      movedTo = next?.version ?? null;
    }
    await audit(
      "version.yanked",
      {
        version: version.version,
        reason,
        latest_moved_to: latest?.versionId === version.id ? (movedTo ?? "(none)") : null,
      },
      { type: "item_version", id: version.id },
    );
  });

/** Unyanks a version: resolvable again. It doesn't move any tag back. */
export const unyank = (
  deps: VersionDeps,
  actor: VersionActor,
  ref: ItemRef,
  input: { version: string },
) =>
  withItem(deps, actor, ref, async ({ items, item, versions, audit }) => {
    const version = find(versions, ref, input.version);
    if (!version.yankedAt) return;
    // Not if it depends on a private workspace's item other than its own (093): under the lock
    // Make private takes, which counts only versions that aren't yanked.
    const dependencies = await items.dependencyWorkspaces(version.id);
    const privateOnes = await items.lockWorkspaces(dependencies.map((d) => d.workspaceId));
    const hidden = dependencies.find(
      (d) => privateOnes.has(d.workspaceId) && d.workspaceId !== item.workspaceId,
    );
    if (hidden) throw new VersionDependsOnPrivateError(version.version, hidden.name);
    await items.setYanked(version.id, null);
    await audit(
      "version.unyanked",
      { version: version.version },
      { type: "item_version", id: version.id },
    );
  });

/** A version as the Versions page shows it, with the tags that point to it. */
export type VersionRow = ItemVersion & { tags: string[] };

export type VersionsPage = {
  item: Item;
  /** Newest first. */
  versions: VersionRow[];
  tags: { tag: string; version: string }[];
  canManage: boolean;
};

/** An item's versions and tags (feature 016): everyone signed in reads them. */
export const listVersions = async (
  deps: VersionDeps,
  actor: VersionActor,
  ref: ItemRef,
): Promise<VersionsPage> => {
  requirePermission(actor.user, "account.manage_own");
  const item = await deps.items.findByName(ref);
  if (!item) throw new ItemNotFoundError(nameOf(ref));
  const versions = await deps.items.versions(item.id);
  const tags = await deps.items.tags(item.id);
  const versionOf = (id: string) => versions.find((v) => v.id === id)?.version ?? "?";
  return {
    item,
    versions: versions
      .map((v) => ({ ...v, tags: tags.filter((t) => t.versionId === v.id).map((t) => t.tag) }))
      .sort(
        (a, b) =>
          b.publishedAt.getTime() - a.publishedAt.getTime() || (a.version < b.version ? 1 : -1),
      ),
    tags: tags.map((t) => ({ tag: t.tag, version: versionOf(t.versionId) })),
    canManage: can(actor.user, "versions.manage", item.workspaceId),
  };
};
