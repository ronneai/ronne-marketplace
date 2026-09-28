import {
  parseItemName,
  type RegistryReader,
  type Resolution,
  type ResolveRequest,
  resolve,
} from "@ronneai/core";
import { requirePermission } from "../../identity/models/permissions";
import type { ItemRepository } from "../repositories/item-repository";
import type { VersionActor, VersionDeps } from "./versions";

/**
 * Resolving on the server (feature 020): core's `resolve()` over the published items, for
 * `POST /api/v1/resolve`. Everyone signed in may resolve what they may read.
 */
export const databaseRegistry = (items: ItemRepository): RegistryReader => ({
  item: async (name) => {
    const parsed = parseItemName(name);
    const item = parsed ? await items.findByName(parsed.scope, parsed.name) : null;
    if (!item) return null;
    const versions = await items.versions(item.id);
    if (versions.length === 0) return null;
    const versionOf = new Map(versions.map((v) => [v.id, v.version]));
    return {
      type: item.type,
      tags: Object.fromEntries(
        (await items.tags(item.id)).map((t) => [t.tag, versionOf.get(t.versionId) ?? ""]),
      ),
      versions: versions.map((v) => ({
        version: v.version,
        sha256: v.sha256,
        yanked: v.yankedAt !== null,
        deprecated: v.deprecatedMessage,
        dependencies: v.dependencies,
      })),
    };
  },
});

export const resolveRequest = async (
  deps: VersionDeps,
  actor: VersionActor,
  request: ResolveRequest,
): Promise<Resolution> => {
  requirePermission(actor.user, "account.manage_own");
  return resolve(request, databaseRegistry(deps.items));
};
