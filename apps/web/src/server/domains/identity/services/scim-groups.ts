import { isUniqueViolation, retryOnDeadlock } from "../../../db/locks";
import {
  parseGroupFilter,
  parseGroupPatch,
  parseScimGroup,
  type ScimGroupChange,
  type ScimGroupRow,
  scimGroupResource,
} from "../models/scim-group";
import { ScimRequestError } from "../models/scim-user";
import type { UserSummary } from "../models/user";
import type { ScimGroupRepository } from "../repositories/scim-group-repository";
import { applyGroups, type GroupSyncRepository } from "./group-sync";
import type { ScimCaller } from "./scim-users";

/**
 * SCIM Groups (feature 108): a provider's groups and who is in them. After any change, each member
 * whose groups changed gets the provider's mappings (106) applied again, through 106's own
 * `applyGroups`: only memberships marked with this provider change, hand-set ones never, root
 * never. Every write is one transaction with the provider's row locked.
 */
export type ScimGroupDeps = { repo: ScimGroupRepository; now?: () => Date };

/** The most groups one list returns, whatever `count` asks. */
export const SCIM_GROUPS_PAGE_MAX = 100;
const START_INDEX_MAX = 2 ** 31 - 1;

const now = (deps: ScimGroupDeps) => (deps.now ?? (() => new Date()))();
const notFound = () => new ScimRequestError(404, "No such group.");

/** What re-applying a person's provider groups needs: 106's steps and the groups they're in. */
export type MembershipSyncRepository = {
  groupSync: GroupSyncRepository;
  findUser(userId: string): Promise<UserSummary | null>;
  groupNamesOf(providerId: string, userId: string): Promise<string[]>;
};

/**
 * Applies the provider's mappings to each of these accounts from the groups they're in now, in the
 * caller's transaction (audited `via: "scim"`). Root is skipped, as at sign-in.
 */
export const syncMemberships = async (
  repo: MembershipSyncRepository,
  caller: ScimCaller,
  userIds: Iterable<string>,
  at: Date,
): Promise<void> => {
  for (const userId of [...new Set(userIds)].sort()) {
    const user = await repo.findUser(userId);
    if (!user || user.role === "root") continue;
    await applyGroups(repo.groupSync, {
      providerId: caller.providerId,
      user: { id: user.id, email: user.email },
      groups: await repo.groupNamesOf(caller.providerId, userId),
      ip: caller.ip,
      now: at,
      via: "scim",
    });
  }
};

const write = async <T>(
  deps: ScimGroupDeps,
  caller: ScimCaller,
  work: (repo: ScimGroupRepository, at: Date) => Promise<T>,
): Promise<T> => {
  try {
    return await retryOnDeadlock(() =>
      deps.repo.transaction(async (repo) => {
        const provider = await repo.lockProvider(caller.providerId);
        if (!provider?.scimEnabled)
          throw new ScimRequestError(401, "A valid SCIM bearer token is required.");
        return work(repo, now(deps));
      }),
    );
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ScimRequestError(409, "A group with that externalId exists.", "uniqueness");
    throw error;
  }
};

/**
 * The accounts behind these SCIM ids, which must be this provider's live links (400 otherwise).
 * A root is left out of the group and the refusal audited: SCIM never touches a root.
 */
const resolveMembers = async (
  repo: ScimGroupRepository,
  caller: ScimCaller,
  linkIds: string[],
  at: Date,
): Promise<string[]> => {
  const links = await repo.liveLinks(caller.providerId, linkIds);
  const unknown = linkIds.filter((id) => !links.some((l) => l.linkId === id));
  if (unknown.length > 0)
    throw new ScimRequestError(400, `Unknown member: ${unknown[0]}`, "invalidValue");
  const userIds: string[] = [];
  for (const link of links) {
    const user = await repo.findUser(link.userId);
    if (user?.role === "root") {
      await repo.recordAudit(
        {
          actorId: null,
          action: "scim.request_refused",
          target: { type: "user", id: user.id },
          metadata: { reason: "root_member", provider: caller.providerId },
          ipAddress: caller.ip,
        },
        at,
      );
      continue;
    }
    userIds.push(link.userId);
  }
  return userIds;
};

const render = async (
  repo: ScimGroupRepository,
  caller: ScimCaller,
  group: ScimGroupRow,
  base: string,
  withMembers = true,
) => {
  if (!withMembers) return scimGroupResource(group, null, base);
  const links = await repo.linksOfUsers(caller.providerId, await repo.memberIds(group.id));
  return scimGroupResource(
    group,
    links.map((l) => ({ id: l.linkId, display: l.display })),
    base,
  );
};

/** Sets the group's members to exactly these accounts; returns who joined or left. */
const setMembers = async (
  repo: ScimGroupRepository,
  groupId: string,
  wanted: string[],
  at: Date,
): Promise<string[]> => {
  const current = await repo.memberIds(groupId);
  const changed: string[] = [];
  for (const userId of current)
    if (!wanted.includes(userId)) {
      await repo.removeMember(groupId, userId);
      changed.push(userId);
    }
  for (const userId of wanted)
    if (!current.includes(userId)) {
      await repo.addMember(groupId, userId, at);
      changed.push(userId);
    }
  return changed;
};

/** `POST /Groups`. */
export const createScimGroup = async (
  deps: ScimGroupDeps,
  caller: ScimCaller,
  body: unknown,
  base: string,
) => {
  const input = parseScimGroup(body);
  return write(deps, caller, async (repo, at) => {
    if (input.externalId && (await repo.findGroupByExternalId(caller.providerId, input.externalId)))
      throw new ScimRequestError(409, "A group with that externalId exists.", "uniqueness");
    const id = await repo.insertGroup({
      providerId: caller.providerId,
      displayName: input.displayName,
      externalId: input.externalId,
      createdAt: at,
    });
    const members = await resolveMembers(repo, caller, input.members, at);
    await setMembers(repo, id, members, at);
    await syncMemberships(repo, caller, members, at);
    const group = await repo.findGroup(caller.providerId, id);
    if (!group) throw notFound();
    return render(repo, caller, group, base);
  });
};

/** `GET /Groups/{id}`; `excludedAttributes=members` leaves the members out (Entra asks so). */
export const getScimGroup = async (
  deps: ScimGroupDeps,
  caller: ScimCaller,
  id: string,
  base: string,
  withMembers = true,
) => {
  const group = await deps.repo.findGroup(caller.providerId, id);
  if (!group) throw notFound();
  return render(deps.repo, caller, group, base, withMembers);
};

export type ScimGroupsQuery = {
  filter?: string | null;
  startIndex?: string | null;
  count?: string | null;
  withMembers?: boolean;
};

const integer = (value: string | null | undefined, fallback: number): number => {
  if (value === undefined || value === null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
};

/** `GET /Groups`: the provider's groups, with an `eq` filter, paged (RFC 7644 §3.4.2). */
export const listScimGroups = async (
  deps: ScimGroupDeps,
  caller: ScimCaller,
  query: ScimGroupsQuery,
  base: string,
) => {
  const filter = query.filter ? parseGroupFilter(query.filter) : null;
  const startIndex = Math.min(START_INDEX_MAX, Math.max(1, integer(query.startIndex, 1)));
  const count = Math.min(
    SCIM_GROUPS_PAGE_MAX,
    Math.max(0, integer(query.count, SCIM_GROUPS_PAGE_MAX)),
  );
  const page = await deps.repo.listGroups(caller.providerId, { filter, startIndex, count });
  const resources = [];
  for (const group of page.rows)
    resources.push(await render(deps.repo, caller, group, base, query.withMembers ?? true));
  return { resources, total: page.total, startIndex };
};

/** Renames or re-ids the group; a new name changes which mappings its members match. */
const setFields = async (
  repo: ScimGroupRepository,
  caller: ScimCaller,
  group: ScimGroupRow,
  fields: { displayName?: string; externalId?: string | null },
  at: Date,
): Promise<boolean> => {
  const rename = fields.displayName !== undefined && fields.displayName !== group.displayName;
  const reId = fields.externalId !== undefined && fields.externalId !== group.externalId;
  if (!rename && !reId) return false;
  if (reId && fields.externalId) {
    const other = await repo.findGroupByExternalId(caller.providerId, fields.externalId);
    if (other && other.id !== group.id)
      throw new ScimRequestError(409, "A group with that externalId exists.", "uniqueness");
  }
  await repo.updateGroup(
    group.id,
    {
      ...(rename ? { displayName: fields.displayName } : {}),
      ...(reId ? { externalId: fields.externalId } : {}),
    },
    at,
  );
  return true;
};

/** `PUT /Groups/{id}`: the name, the external id and the members, exactly as sent. */
export const replaceScimGroup = async (
  deps: ScimGroupDeps,
  caller: ScimCaller,
  id: string,
  body: unknown,
  base: string,
) => {
  const input = parseScimGroup(body);
  return write(deps, caller, async (repo, at) => {
    const group = await repo.findGroup(caller.providerId, id);
    if (!group) throw notFound();
    const before = await repo.memberIds(id);
    const renamed = await setFields(repo, caller, group, input, at);
    const members = await resolveMembers(repo, caller, input.members, at);
    const changed = await setMembers(repo, id, members, at);
    await syncMemberships(repo, caller, renamed ? [...before, ...members] : changed, at);
    const fresh = await repo.findGroup(caller.providerId, id);
    if (!fresh) throw notFound();
    return render(repo, caller, fresh, base);
  });
};

/** `PATCH /Groups/{id}`: the operations, in order. Answers the group, or 204 when asked not to. */
export const patchScimGroup = async (
  deps: ScimGroupDeps,
  caller: ScimCaller,
  id: string,
  body: unknown,
  base: string,
) => {
  const changes: ScimGroupChange[] = parseGroupPatch(body);
  return write(deps, caller, async (repo, at) => {
    const group = await repo.findGroup(caller.providerId, id);
    if (!group) throw notFound();
    const before = await repo.memberIds(id);
    let members = [...before];
    const fields: { displayName?: string; externalId?: string | null } = {};
    for (const change of changes) {
      if (change.kind === "rename") fields.displayName = change.displayName;
      else if (change.kind === "externalId") fields.externalId = change.externalId;
      else if (change.kind === "remove" && change.ids === null) members = [];
      else if (change.kind === "remove") {
        // Removing someone who isn't there (or isn't a live link any more) is no error.
        const gone = (await repo.liveLinks(caller.providerId, change.ids ?? [])).map(
          (l) => l.userId,
        );
        members = members.filter((m) => !gone.includes(m));
      } else {
        const ids = await resolveMembers(repo, caller, change.ids, at);
        members =
          change.kind === "replace"
            ? ids
            : [...members, ...ids.filter((m) => !members.includes(m))];
      }
    }
    const renamed = await setFields(repo, caller, group, fields, at);
    const changed = await setMembers(repo, id, members, at);
    if (changed.length > 0 && !renamed) await repo.updateGroup(id, {}, at);
    await syncMemberships(repo, caller, renamed ? [...before, ...members] : changed, at);
    const fresh = await repo.findGroup(caller.providerId, id);
    if (!fresh) throw notFound();
    return render(repo, caller, fresh, base);
  });
};

/** `DELETE /Groups/{id}`: the group goes, and with it the memberships it gave. */
export const deleteScimGroup = (deps: ScimGroupDeps, caller: ScimCaller, id: string) =>
  write(deps, caller, async (repo, at) => {
    const group = await repo.findGroup(caller.providerId, id);
    if (!group) throw notFound();
    const members = await repo.memberIds(id);
    await repo.deleteGroup(id);
    await syncMemberships(repo, caller, members, at);
  });
