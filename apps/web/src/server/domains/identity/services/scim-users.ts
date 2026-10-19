import { isUniqueViolation, retryOnDeadlock } from "../../../db/locks";
import {
  parseScimUser,
  parseUserFilter,
  parseUserPatch,
  ronneName,
  ScimRequestError,
  type ScimUserLink,
  type ScimUserPatch,
  scimUserResource,
} from "../models/scim-user";
import type { UserSummary } from "../models/user";
import type { ScimLinkPatch, ScimUserRepository } from "../repositories/scim-user-repository";
import { syncMemberships } from "./scim-groups";
import { disableAccount } from "./user-admin";

/**
 * SCIM Users (feature 108): what an identity provider's requests do to Ronne's accounts. Every
 * write is one transaction with the provider's row locked, so two requests for one user can't
 * interleave; its audit events name the provider as the actor (`via: "scim"`). Reads take no lock.
 */
export type ScimUserDeps = { repo: ScimUserRepository; now?: () => Date };

/** Who's calling: the provider whose token it was, and the client address when it can be trusted. */
export type ScimCaller = { providerId: string; ip: string | null };

/** A create adopts an account the provider signs in to only if it did so this recently. */
export const ADOPTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** The most users one list returns, whatever `count` asks. */
export const SCIM_USERS_PAGE_MAX = 100;
/** The furthest `startIndex` taken: a safe offset on every database. */
const START_INDEX_MAX = 2 ** 31 - 1;

const ROOT_DETAIL = "root accounts are managed in Ronne";

const now = (deps: ScimUserDeps) => (deps.now ?? (() => new Date()))();
const notFound = () => new ScimRequestError(404, "No such user.");
const conflict = (detail: string) => new ScimRequestError(409, detail, "uniqueness");
const emailTaken = () => conflict("That email belongs to another account.");
const rootRefused = () => new ScimRequestError(403, ROOT_DETAIL);

const event = (
  caller: ScimCaller,
  action: "user.created" | "user.updated" | "user.disabled" | "user.enabled" | "user.scim_adopted",
  userId: string,
  metadata: Record<string, string | number | boolean | string[]> = {},
) => ({
  actorId: null,
  action,
  target: { type: "user" as const, id: userId },
  metadata: { via: "scim", provider: caller.providerId, ...metadata },
  ipAddress: caller.ip,
});

/**
 * One write, with the provider locked. A request naming a root is refused with 403 and audited;
 * the event is written after the rollback, so it stays.
 */
const write = async <T>(
  deps: ScimUserDeps,
  caller: ScimCaller,
  work: (repo: ScimUserRepository, at: Date) => Promise<T>,
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
    if (error instanceof ScimRequestError && error.detail === ROOT_DETAIL)
      await deps.repo.recordAudit(
        {
          actorId: null,
          action: "scim.request_refused",
          target: { type: "instance" },
          metadata: { reason: "root", provider: caller.providerId },
          ipAddress: caller.ip,
        },
        now(deps),
      );
    // Another provider's write at the same moment took the email (the lock is per provider): the
    // transaction rolled back, and the answer is the one a check would have given.
    if (isUniqueViolation(error)) throw conflict("That userName, externalId or email is taken.");
    throw error;
  }
};

/** Enables or disables the account as the provider says, when that changes anything. */
const setActive = async (
  repo: ScimUserRepository,
  caller: ScimCaller,
  account: UserSummary,
  active: boolean,
  at: Date,
  extra: Record<string, boolean> = {},
): Promise<void> => {
  if (active && account.disabledAt) {
    await repo.enableUser(account.id, at);
    await repo.recordAudit(event(caller, "user.enabled", account.id, extra), at);
  } else if (!active && !account.disabledAt) {
    const ended = await disableAccount(repo.identity, account.id, at);
    await repo.recordAudit(event(caller, "user.disabled", account.id, { ...ended, ...extra }), at);
  }
};

const render = async (
  repo: ScimUserRepository,
  caller: ScimCaller,
  link: ScimUserLink,
  base: string,
) => {
  const account = await repo.findUser(link.userId);
  // An erased account (103) has no links left; one that survived by hand is as gone as the rest.
  if (!account || account.erasedAt) throw notFound();
  return scimUserResource(link, account, base, await repo.groupsOf(caller.providerId, link.userId));
};

const load = async (repo: ScimUserRepository, caller: ScimCaller, id: string) => {
  const link = await repo.findLink(caller.providerId, id);
  if (link) await repo.lockUser(link.userId);
  const account = link ? await repo.findUser(link.userId) : null;
  if (!link || !account || account.erasedAt) throw notFound();
  if (account.role === "root") throw rootRefused();
  return { link, account };
};

/** `POST /Users`: a new account, an account adopted, or a deleted user's account linked again. */
export const createScimUser = async (
  deps: ScimUserDeps,
  caller: ScimCaller,
  body: unknown,
  base: string,
) => {
  const input = parseScimUser(body);
  const { providerId } = caller;
  return write(deps, caller, async (repo, at) => {
    if (await repo.findLinkByUserName(providerId, input.userName))
      throw conflict("A user with that userName exists.");
    if (input.externalId && (await repo.findLinkByExternalId(providerId, input.externalId)))
      throw conflict("A user with that externalId exists.");
    const found = await repo.findUserByEmail(input.userName);
    // MySQL may call a look-alike address equal: that's someone else's, never this person's.
    if (found && found.email !== input.userName) throw emailTaken();
    // Locked, then read again: a change root made meanwhile is the state the checks see.
    if (found) await repo.lockUser(found.id);
    const owner = found ? await repo.findUser(found.id) : null;
    // Root may have changed the address meanwhile: then it isn't this account's any more.
    if (owner && owner.email !== input.userName) throw emailTaken();
    if (owner?.role === "root") throw rootRefused();

    const tombstone = input.externalId
      ? await repo.findTombstoneByExternalId(providerId, input.externalId)
      : null;
    if (tombstone) await repo.lockUser(tombstone.userId);
    const back = tombstone ? await repo.findUser(tombstone.userId) : null;
    // Erasing deletes the tombstones (103); one that survived by hand brings nobody back.
    const returning = back && !back.erasedAt ? back : null;
    let userId: string;
    if (tombstone && returning) {
      // This provider's deleted user, back by its external id: the same account, a new link.
      if (returning.role === "root") throw rootRefused();
      if (owner && owner.id !== returning.id) throw emailTaken();
      await repo.deleteLink(tombstone.id);
      const name = ronneName(input);
      await repo.updateUserProfile(returning.id, { email: input.userName, name }, at);
      await repo.recordAudit(
        event(caller, "user.updated", returning.id, { changed: ["email", "name"], relinked: true }),
        at,
      );
      await setActive(repo, caller, returning, input.active, at);
      userId = returning.id;
    } else if (owner) {
      // Adoption, on every condition: enabled, not erased (103), no SCIM link anywhere, the
      // provider's own sign-in link, used within the window. Otherwise the email is simply someone's.
      const adoptable =
        !owner.disabledAt &&
        !owner.erasedAt &&
        !(await repo.hasAnyLink(owner.id)) &&
        (await repo.hasProviderAccount(owner.id, providerId)) &&
        (await repo.signedInThroughSince(
          owner.id,
          providerId,
          new Date(at.getTime() - ADOPTION_WINDOW_MS),
        ));
      if (!adoptable) throw emailTaken();
      const name = ronneName(input);
      if (name !== owner.name) await repo.updateUserProfile(owner.id, { name }, at);
      await repo.recordAudit(event(caller, "user.scim_adopted", owner.id), at);
      if (!input.active) await setActive(repo, caller, owner, false, at);
      userId = owner.id;
    } else {
      if (tombstone) await repo.deleteLink(tombstone.id);
      userId = await repo.createUser({ email: input.userName, name: ronneName(input) }, at);
      await repo.recordAudit(
        event(caller, "user.created", userId, { email: input.userName, role: "user" }),
        at,
      );
      if (!input.active) {
        const created = await repo.findUser(userId);
        if (created) await setActive(repo, caller, created, false, at);
      }
    }
    const id = await repo.insertLink({ ...input, providerId, userId, createdAt: at });
    const link = await repo.findLink(providerId, id);
    if (!link) throw notFound();
    return render(repo, caller, link, base);
  });
};

/** `GET /Users/{id}`. */
export const getScimUser = async (
  deps: ScimUserDeps,
  caller: ScimCaller,
  id: string,
  base: string,
) => {
  const link = await deps.repo.findLink(caller.providerId, id);
  if (!link) throw notFound();
  return render(deps.repo, caller, link, base);
};

export type ScimUsersQuery = {
  filter?: string | null;
  startIndex?: string | null;
  count?: string | null;
};

const integer = (value: string | null | undefined, fallback: number): number => {
  if (value === undefined || value === null || value.trim() === "") return fallback;
  const n = Number(value);
  // Any integer, the clamps below keep it a safe offset or count (`1e21` means past the end).
  return Number.isInteger(n) ? n : fallback;
};

/** `GET /Users`: the provider's live links, with an `eq` filter, paged (RFC 7644 §3.4.2). */
export const listScimUsers = async (
  deps: ScimUserDeps,
  caller: ScimCaller,
  query: ScimUsersQuery,
  base: string,
) => {
  const filter = query.filter ? parseUserFilter(query.filter) : null;
  const startIndex = Math.min(START_INDEX_MAX, Math.max(1, integer(query.startIndex, 1)));
  const count = Math.min(
    SCIM_USERS_PAGE_MAX,
    Math.max(0, integer(query.count, SCIM_USERS_PAGE_MAX)),
  );
  const page = await deps.repo.listLinks(caller.providerId, { filter, startIndex, count });
  const resources = [];
  for (const link of page.rows) {
    const account = await deps.repo.findUser(link.userId);
    if (!account || account.erasedAt) continue;
    resources.push(
      scimUserResource(
        link,
        account,
        base,
        await deps.repo.groupsOf(caller.providerId, link.userId),
      ),
    );
  }
  return { resources, total: page.total, startIndex };
};

/** Replace and patch share this: the link's fields, then the account's email, name and state. */
const change = (
  deps: ScimUserDeps,
  caller: ScimCaller,
  id: string,
  patch: ScimUserPatch,
  base: string,
) =>
  write(deps, caller, async (repo, at) => {
    const { providerId } = caller;
    const { link, account } = await load(repo, caller, id);
    if (patch.userName !== undefined && patch.userName !== link.userName) {
      const owner = await repo.findUserByEmail(patch.userName);
      if (owner && owner.id !== account.id) throw emailTaken();
      if (await repo.findLinkByUserName(providerId, patch.userName))
        throw conflict("A user with that userName exists.");
    }
    if (
      patch.externalId &&
      patch.externalId !== link.externalId &&
      (await repo.findLinkByExternalId(providerId, patch.externalId))
    )
      throw conflict("A user with that externalId exists.");

    const merged = { ...link };
    const linkPatch: ScimLinkPatch = {};
    for (const key of [
      "externalId",
      "userName",
      "givenName",
      "familyName",
      "displayName",
      "active",
    ] as const) {
      const value = patch[key];
      if (value !== undefined && value !== link[key]) {
        (linkPatch as Record<string, unknown>)[key] = value;
        (merged as Record<string, unknown>)[key] = value;
      }
    }
    if (Object.keys(linkPatch).length > 0) await repo.updateLink(id, linkPatch, at);

    // The provider owns the email and the name: a value root changed by hand goes back.
    const profile: { email?: string; name?: string } = {};
    if (merged.userName !== account.email) profile.email = merged.userName;
    const name = ronneName(merged);
    if (name !== account.name) profile.name = name;
    if (Object.keys(profile).length > 0) {
      await repo.updateUserProfile(account.id, profile, at);
      await repo.recordAudit(
        event(caller, "user.updated", account.id, { changed: Object.keys(profile) }),
        at,
      );
    }
    if (patch.active !== undefined) await setActive(repo, caller, account, patch.active, at);
    const fresh = await repo.findLink(providerId, id);
    if (!fresh) throw notFound();
    return render(repo, caller, fresh, base);
  });

/** `PUT /Users/{id}`: every managed field, as the body says. */
export const replaceScimUser = (
  deps: ScimUserDeps,
  caller: ScimCaller,
  id: string,
  body: unknown,
  base: string,
) => change(deps, caller, id, parseScimUser(body), base);

/** `PATCH /Users/{id}`: only the fields the operations name. */
export const patchScimUser = (
  deps: ScimUserDeps,
  caller: ScimCaller,
  id: string,
  body: unknown,
  base: string,
) => change(deps, caller, id, parseUserPatch(body), base);

/**
 * `DELETE /Users/{id}`: deprovision. The account is disabled (sessions ended, tokens revoked), the
 * link becomes a tombstone that keeps only its external id, and the user leaves the provider's
 * groups. The account itself stays, for *Deprovisioned by* and for root to erase (103).
 */
export const deleteScimUser = (deps: ScimUserDeps, caller: ScimCaller, id: string) =>
  write(deps, caller, async (repo, at) => {
    const { link, account } = await load(repo, caller, id);
    await setActive(repo, caller, account, false, at, { deprovisioned: true });
    await repo.tombstoneLink(link.id, at);
    // Out of the provider's groups, and so out of every membership marked as the provider's,
    // whether its SCIM groups or its sign-in before SCIM gave it: a re-create starts in none.
    await repo.removeFromGroups(caller.providerId, link.userId);
    await syncMemberships(repo, caller, [link.userId], at);
  });
