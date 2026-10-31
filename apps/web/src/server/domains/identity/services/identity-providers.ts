import { isUniqueViolation } from "../../../db/locks";
import {
  InvalidGroupMappingError,
  InvalidProviderNameError,
  ProviderIdTakenError,
  ProviderNotFoundError,
  ProviderNotTestedError,
  StaleProviderError,
} from "../exceptions/errors";
import {
  checkProviderId,
  type IdentityProvider,
  isMappedRole,
  type MappedRole,
  parseDomains,
} from "../models/identity-provider";
import { requirePermission } from "../models/permissions";
import type { ProviderTypeRegistry } from "../models/provider-types";
import type { CurrentUser } from "../models/user";
import type {
  IdentityProviderRepository,
  ProviderRow,
  StoredProvider,
} from "../repositories/identity-provider-repository";
import { encryptSecret } from "../repositories/provider-secrets";

/**
 * Identity providers (feature 106): root sets them up on the Authentication tab. Every operation
 * checks `settings.manage`, writes its change and its 007 event in one transaction, and never
 * returns or records the client secret: the event says only which fields changed.
 */
export type IdentityProviderDeps = {
  repo: IdentityProviderRepository;
  types: ProviderTypeRegistry;
  /** AUTH_SECRET: the key the client secrets are encrypted under derives from it. */
  authSecret: string;
  now?: () => Date;
};

export type ProviderActor = { user: CurrentUser | null; ip: string | null };

/** What the Add/Edit form sends. `config` holds the type's fields, the secret among them. */
export type ProviderInput = {
  type: string;
  preset: string;
  name: unknown;
  config: Record<string, unknown>;
  domains: unknown;
  linkByEmail: unknown;
  groupsClaim: unknown;
  /** The group mappings, all of them; left out, they stay as they are. */
  mappings?: unknown;
};

type MappingRow = { group: string; workspaceId: string; role: MappedRole };

/**
 * Checks the form's group mappings: each a group (exactly as the provider sends it, 1–255
 * characters), an existing workspace that isn't someone's personal one, and a role. The same
 * group and workspace twice keeps the last.
 */
const checkMappings = async (
  repo: IdentityProviderRepository,
  value: unknown,
): Promise<MappingRow[]> => {
  if (!Array.isArray(value)) throw new InvalidGroupMappingError("group");
  const rows = new Map<string, MappingRow>();
  for (const item of value as { group?: unknown; workspaceId?: unknown; role?: unknown }[]) {
    const group = typeof item?.group === "string" ? item.group : "";
    if (group.trim().length === 0 || group.length > 255)
      throw new InvalidGroupMappingError("group");
    if (!isMappedRole(item.role)) throw new InvalidGroupMappingError("role");
    const workspaceId = typeof item.workspaceId === "string" ? item.workspaceId : "";
    const workspace = workspaceId ? await repo.findWorkspace(workspaceId) : null;
    if (!workspace) throw new InvalidGroupMappingError("workspace");
    if (workspace.personal) throw new InvalidGroupMappingError("personal");
    rows.set(JSON.stringify([group, workspaceId]), { group, workspaceId, role: item.role });
  }
  return [...rows.values()];
};

const sameMappings = (
  before: { group: string; workspaceId: string | null; role: MappedRole }[],
  after: MappingRow[],
) =>
  JSON.stringify(before.map((m) => [m.group, m.workspaceId, m.role]).sort()) ===
  JSON.stringify(after.map((m) => [m.group, m.workspaceId, m.role]).sort());

const now = (deps: IdentityProviderDeps) => (deps.now ?? (() => new Date()))();

/** A save's time: later than the last one, even within the same millisecond, so versions only go up. */
const after = (at: Date, previous: Date): Date =>
  at.getTime() > previous.getTime() ? at : new Date(previous.getTime() + 1);

const checkName = (value: unknown): string => {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 1 || name.length > 100) throw new InvalidProviderNameError();
  return name;
};

const checkGroupsClaim = (value: unknown): string | null => {
  const claim = typeof value === "string" ? value.trim() : "";
  return claim ? claim.slice(0, 100) : null;
};

const checkPreset = (value: unknown): string => {
  const preset = typeof value === "string" ? value.trim() : "";
  return /^[a-z0-9-]{1,32}$/.test(preset) ? preset : "other";
};

const event = (
  actor: ProviderActor,
  action:
    | "instance.auth_provider_created"
    | "instance.auth_provider_updated"
    | "instance.auth_provider_deleted"
    | "instance.auth_provider_enabled"
    | "instance.auth_provider_disabled",
  provider: string,
  extra: Record<string, string | string[] | number> = {},
) => ({
  actorId: actor.user?.id ?? null,
  action,
  target: { type: "instance" as const },
  metadata: { provider, ...extra },
  ipAddress: actor.ip,
});

const load = async (repo: IdentityProviderRepository, id: string): Promise<StoredProvider> => {
  const stored = await repo.find(id);
  if (!stored) throw new ProviderNotFoundError();
  return stored;
};

/** Every provider, for the panel (secrets left out: `hasSecret` only). */
export const listProviders = async (
  deps: IdentityProviderDeps,
  actor: ProviderActor,
): Promise<IdentityProvider[]> => {
  requirePermission(actor.user, "settings.manage");
  return deps.repo.list();
};

export const getProvider = async (
  deps: IdentityProviderDeps,
  actor: ProviderActor,
  id: string,
): Promise<IdentityProvider> => {
  requirePermission(actor.user, "settings.manage");
  return (await load(deps.repo, id)).provider;
};

/** Root adds a provider. It starts off and untested. */
export const createProvider = async (
  deps: IdentityProviderDeps,
  actor: ProviderActor,
  id: unknown,
  input: ProviderInput,
): Promise<IdentityProvider> => {
  requirePermission(actor.user, "settings.manage");
  const providerId = checkProviderId(id);
  const type = deps.types.get(input.type);
  const name = checkName(input.name);
  const { config, secret } = type.parse(input.config, null);
  const row: ProviderRow = {
    type: type.id,
    preset: checkPreset(input.preset),
    name,
    config,
    secretEnc: secret ? encryptSecret(deps.authSecret, providerId, secret) : null,
    domains: parseDomains(input.domains),
    linkByEmail: input.linkByEmail !== false,
    groupsClaim: checkGroupsClaim(input.groupsClaim),
    testedAt: null,
    testedBy: null,
    enabled: false,
  };
  const at = now(deps);
  try {
    return await deps.repo.transaction(async (repo) => {
      if (await repo.find(providerId)) throw new ProviderIdTakenError(providerId);
      await repo.insert(providerId, row, actor.user?.id ?? null, at);
      if (input.mappings !== undefined)
        await repo.replaceMappings(providerId, await checkMappings(repo, input.mappings), at);
      await repo.recordAudit(
        event(actor, "instance.auth_provider_created", providerId, { type: type.id }),
        at,
      );
      return (await load(repo, providerId)).provider;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ProviderIdTakenError(providerId);
    throw error;
  }
};

/** The fields whose change the audit names (never their values). */
const changedFields = (
  before: StoredProvider,
  after: ProviderRow,
  secretTyped: boolean,
): string[] => {
  const p = before.provider;
  const changed: string[] = [];
  if (p.name !== after.name) changed.push("name");
  if (p.preset !== after.preset) changed.push("preset");
  for (const key of new Set([...Object.keys(p.config), ...Object.keys(after.config)]))
    if (JSON.stringify(p.config[key]) !== JSON.stringify(after.config[key])) changed.push(key);
  if (secretTyped) changed.push("client secret");
  if (JSON.stringify(p.domains) !== JSON.stringify(after.domains)) changed.push("domains");
  if (p.linkByEmail !== after.linkByEmail) changed.push("link by email");
  if (p.groupsClaim !== after.groupsClaim) changed.push("groups claim");
  return changed;
};

/**
 * Root edits a provider. `expectedUpdatedAt` is the time the form was opened with: if someone saved
 * since, StaleProviderError. Changing what the type says needs a retest (issuer, client, scopes)
 * clears the passing test, and turns an enabled provider off until it passes again.
 */
export const updateProvider = async (
  deps: IdentityProviderDeps,
  actor: ProviderActor,
  id: string,
  input: Omit<ProviderInput, "type">,
  expectedUpdatedAt: Date,
): Promise<IdentityProvider> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const stored = await load(repo, id);
    const p = stored.provider;
    if (p.updatedAt.getTime() !== expectedUpdatedAt.getTime())
      throw new StaleProviderError(p.updatedAt);
    const type = deps.types.get(p.type);
    const { config, secret } = type.parse(input.config, p.config);
    const retest = secret !== undefined || type.needsRetest(p.config, config);
    const row: ProviderRow = {
      type: p.type,
      preset: checkPreset(input.preset),
      name: checkName(input.name),
      config,
      secretEnc: secret ? encryptSecret(deps.authSecret, id, secret) : stored.secretEnc,
      domains: parseDomains(input.domains),
      linkByEmail: input.linkByEmail !== false,
      groupsClaim: checkGroupsClaim(input.groupsClaim),
      testedAt: retest ? null : p.testedAt,
      testedBy: retest ? null : p.testedBy,
      enabled: retest ? false : p.enabled,
    };
    const mappings =
      input.mappings === undefined ? null : await checkMappings(repo, input.mappings);
    const changed = changedFields(stored, row, secret !== undefined);
    if (mappings && !sameMappings(await repo.listMappings(id), mappings))
      changed.push("group mappings");
    if (changed.length === 0) return p;
    // Only if nobody saved since this read: a concurrent save makes this one stale.
    if (!(await repo.update(id, row, after(at, p.updatedAt), p.updatedAt)))
      throw new StaleProviderError(p.updatedAt);
    if (mappings) await repo.replaceMappings(id, mappings, at);
    await repo.recordAudit(event(actor, "instance.auth_provider_updated", id, { changed }), at);
    if (p.enabled && !row.enabled)
      await repo.recordAudit(
        event(actor, "instance.auth_provider_disabled", id, { reason: "retest" }),
        at,
      );
    return (await load(repo, id)).provider;
  });
};

/** Turns a provider on: only after a passing *Test sign-in* by this root (106, Decision 5). */
export const enableProvider = async (
  deps: IdentityProviderDeps,
  actor: ProviderActor,
  id: string,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const { provider } = await load(repo, id);
    if (provider.enabled) return { changed: false };
    if (!provider.testedAt || provider.testedBy !== actor.user?.id)
      throw new ProviderNotTestedError();
    // Only the version that was tested: a save since (which may have cleared the test) wins.
    if (!(await repo.setEnabled(id, true, after(at, provider.updatedAt), provider.updatedAt)))
      throw new StaleProviderError(provider.updatedAt);
    await repo.recordAudit(event(actor, "instance.auth_provider_enabled", id), at);
    return { changed: true };
  });
};

/** Turns a provider off: nobody signs in with it; links and group memberships stay. */
export const disableProvider = async (
  deps: IdentityProviderDeps,
  actor: ProviderActor,
  id: string,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const { provider } = await load(repo, id);
    if (!provider.enabled) return { changed: false };
    if (!(await repo.setEnabled(id, false, after(at, provider.updatedAt), provider.updatedAt)))
      throw new StaleProviderError(provider.updatedAt);
    await repo.recordAudit(event(actor, "instance.auth_provider_disabled", id), at);
    return { changed: true };
  });
};

/**
 * Deletes a provider. Accounts linked to it keep their `account` rows (and a password, if they have
 * one); the memberships its groups gave are removed, each audited with `via: "sso"`, except in
 * `global`, which nobody leaves (092): there the role goes back to a hand-set `user`.
 */
export const deleteProvider = async (
  deps: IdentityProviderDeps,
  actor: ProviderActor,
  id: string,
): Promise<{ membershipsRemoved: number }> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    await load(repo, id);
    const { removed, lowered } = await repo.releaseSourcedMemberships(id, at);
    for (const m of lowered)
      if (m.role !== "user")
        await repo.recordAudit(
          {
            actorId: actor.user?.id ?? null,
            action: "workspace.member_role_changed",
            target: { type: "user", id: m.userId },
            metadata: {
              workspace: m.workspaceName,
              email: m.email,
              from: m.role,
              to: "user",
              via: "sso",
              provider: id,
            },
            ipAddress: actor.ip,
          },
          at,
        );
    // Told what changed for them (139), by the workspace's name now.
    for (const m of lowered)
      if (m.role !== "user")
        await repo.notify(
          {
            recipients: [m.userId],
            kind: "membership.role_changed",
            actorId: actor.user?.id ?? null,
            subject: { type: "workspace", id: m.workspaceId },
            params: { workspace: m.workspaceName, from: m.role, to: "user" },
          },
          at,
        );
    for (const m of removed)
      await repo.notify(
        {
          recipients: [m.userId],
          kind: "membership.removed",
          actorId: actor.user?.id ?? null,
          subject: { type: "workspace", id: m.workspaceId },
          params: { workspace: m.workspaceName },
        },
        at,
      );
    for (const m of removed)
      await repo.recordAudit(
        {
          actorId: actor.user?.id ?? null,
          action: "workspace.member_removed",
          target: { type: "user", id: m.userId },
          metadata: {
            workspace: m.workspaceName,
            email: m.email,
            role: m.role,
            via: "sso",
            provider: id,
          },
          ipAddress: actor.ip,
        },
        at,
      );
    await repo.delete(id);
    await repo.recordAudit(
      event(actor, "instance.auth_provider_deleted", id, { membershipsRemoved: removed.length }),
      at,
    );
    return { membershipsRemoved: removed.length };
  });
};

/**
 * Records a passing *Test sign-in* by this root, so they can turn the provider on (task 6).
 * `testedVersion` is the provider's `updatedAt` when the test started: if it was saved since, the
 * test was of other settings, and StaleProviderError.
 */
export const markProviderTested = async (
  deps: IdentityProviderDeps,
  actor: ProviderActor,
  id: string,
  testedVersion: Date,
): Promise<void> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    const { provider } = await load(repo, id);
    if (!actor.user) return;
    if (
      provider.updatedAt.getTime() !== testedVersion.getTime() ||
      !(await repo.markTested(id, actor.user.id, at, testedVersion))
    )
      throw new StaleProviderError(provider.updatedAt);
  });
};

/**
 * The provider's group mappings, for the form; `warning` marks one whose workspace was deleted
 * (it's skipped at sign-in until root removes or changes it).
 */
export const listGroupMappings = async (
  deps: IdentityProviderDeps,
  actor: ProviderActor,
  id: string,
): Promise<
  {
    group: string;
    workspaceId: string | null;
    workspaceName: string | null;
    role: MappedRole;
    warning: "workspace_deleted" | null;
  }[]
> => {
  requirePermission(actor.user, "settings.manage");
  await load(deps.repo, id);
  return (await deps.repo.listMappings(id)).map((m) => ({
    ...m,
    warning: m.workspaceId === null ? "workspace_deleted" : null,
  }));
};
