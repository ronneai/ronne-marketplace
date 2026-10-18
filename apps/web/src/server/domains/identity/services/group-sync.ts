import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import type { MappedRole } from "../models/identity-provider";
import type { SsoRepository } from "../repositories/sso-repository";

/** What applying groups needs from storage: 106's sign-in and 108's SCIM share it. */
export type GroupSyncRepository = Pick<
  SsoRepository,
  | "mappingsFor"
  | "membershipsOf"
  | "workspaceName"
  | "addMembership"
  | "setMembership"
  | "removeMembership"
  | "recordAudit"
>;

/**
 * What a sign-in's groups do to the person's memberships (feature 106), worked out without
 * touching storage, so it can be tested on its own and shown by a *Test sign-in*:
 * - each mapped group the person is in gives its workspace at least the mapped role, marked as
 *   coming from this provider (`source`); two mappings to one workspace give the higher role;
 * - a membership this provider gave whose group they left goes (or drops to what another mapping
 *   still gives);
 * - a membership set by hand (`source` null) is never changed, even to raise or lower it, with one
 *   exception: the plain `user` row in `global` every account has, which a mapping may take over;
 * - nobody leaves `global` (092): a mapping's `global` row goes back to a hand-set `user`;
 * - a membership another provider gave is that provider's;
 * - a mapping whose workspace was deleted is skipped.
 * Root is never changed: the caller doesn't call this for root.
 */
export type Membership = {
  workspaceId: string;
  role: MappedRole;
  source: string | null;
};

export type GroupChange =
  | { kind: "add"; workspaceId: string; role: MappedRole }
  | { kind: "change"; workspaceId: string; from: MappedRole; to: MappedRole; takeOver: boolean }
  | { kind: "remove"; workspaceId: string; role: MappedRole }
  /** `global`'s row goes back to a hand-set `user`. */
  | { kind: "release"; workspaceId: string; from: MappedRole };

const RANK: Record<MappedRole, number> = { user: 0, moderator: 1, admin: 2 };
const higher = (a: MappedRole, b: MappedRole) => (RANK[a] >= RANK[b] ? a : b);

export const planGroupChanges = (input: {
  providerId: string;
  groups: readonly string[];
  mappings: readonly { group: string; workspaceId: string | null; role: MappedRole }[];
  memberships: readonly Membership[];
}): GroupChange[] => {
  const { providerId, groups, mappings, memberships } = input;
  const inGroup = new Set(groups);
  const wanted = new Map<string, MappedRole>();
  for (const m of mappings) {
    if (!m.workspaceId || !inGroup.has(m.group)) continue;
    const before = wanted.get(m.workspaceId);
    wanted.set(m.workspaceId, before ? higher(before, m.role) : m.role);
  }
  const byWorkspace = new Map(memberships.map((m) => [m.workspaceId, m]));
  const changes: GroupChange[] = [];

  for (const [workspaceId, role] of wanted) {
    const current = byWorkspace.get(workspaceId);
    if (!current) {
      changes.push({ kind: "add", workspaceId, role });
      continue;
    }
    if (current.source === providerId) {
      if (current.role !== role)
        changes.push({
          kind: "change",
          workspaceId,
          from: current.role,
          to: role,
          takeOver: false,
        });
      continue;
    }
    // `global`'s default row: a mapping may take it over (and gives it back when it ends).
    const defaultGlobal =
      workspaceId === GLOBAL_WORKSPACE_ID && current.source === null && current.role === "user";
    // (A mapping to `global` as `user` changes nothing: everyone is a user there already.)
    if (defaultGlobal && role !== "user")
      changes.push({ kind: "change", workspaceId, from: current.role, to: role, takeOver: true });
    // Anything else set by hand, or given by another provider, isn't this provider's to change.
  }

  for (const current of memberships) {
    if (current.source !== providerId || wanted.has(current.workspaceId)) continue;
    if (current.workspaceId === GLOBAL_WORKSPACE_ID)
      changes.push({ kind: "release", workspaceId: current.workspaceId, from: current.role });
    else changes.push({ kind: "remove", workspaceId: current.workspaceId, role: current.role });
  }
  return changes;
};

/**
 * Applies a person's groups at a provider to their memberships, in the caller's transaction, each
 * change audited like 092's member changes with `via`: `sso` for a sign-in's groups claim (106),
 * `scim` for the provider's SCIM groups (108). Nothing happens when `groups` is null (a sign-in
 * without a groups claim: missing isn't "in no group", Entra leaves it out past 200 groups). Root
 * is never changed (the caller doesn't call this for root).
 */
export const applyGroups = async (
  repo: GroupSyncRepository,
  input: {
    providerId: string;
    user: { id: string; email: string };
    groups: readonly string[] | null;
    ip: string | null;
    now: Date;
    via?: "sso" | "scim";
  },
): Promise<GroupChange[]> => {
  if (input.groups === null) return [];
  const mappings = await repo.mappingsFor(input.providerId);
  const memberships = await repo.membershipsOf(input.user.id);
  // No mappings left still removes what earlier ones gave.
  if (mappings.length === 0 && !memberships.some((m) => m.source === input.providerId)) return [];
  const changes = planGroupChanges({
    providerId: input.providerId,
    groups: input.groups,
    mappings,
    memberships,
  });
  const names = new Map(memberships.map((m) => [m.workspaceId, m.workspaceName]));
  const audit = async (
    workspaceId: string,
    action: "workspace.member_added" | "workspace.member_role_changed" | "workspace.member_removed",
    change: Record<string, string>,
  ) =>
    repo.recordAudit(
      {
        actorId: null,
        action,
        target: { type: "user", id: input.user.id },
        metadata: {
          workspace: names.get(workspaceId) ?? (await repo.workspaceName(workspaceId)) ?? "",
          email: input.user.email,
          ...change,
          via: input.via ?? "sso",
          provider: input.providerId,
        },
        ipAddress: input.ip,
      },
      input.now,
    );
  for (const c of changes) {
    if (c.kind === "add") {
      await repo.addMembership(input.user.id, c.workspaceId, c.role, input.providerId, input.now);
      await audit(c.workspaceId, "workspace.member_added", { role: c.role });
    } else if (c.kind === "change") {
      await repo.setMembership(input.user.id, c.workspaceId, c.to, input.providerId, input.now);
      await audit(c.workspaceId, "workspace.member_role_changed", { from: c.from, to: c.to });
    } else if (c.kind === "remove") {
      await repo.removeMembership(input.user.id, c.workspaceId);
      await audit(c.workspaceId, "workspace.member_removed", { role: c.role });
    } else {
      await repo.setMembership(input.user.id, c.workspaceId, "user", null, input.now);
      if (c.from !== "user")
        await audit(c.workspaceId, "workspace.member_role_changed", { from: c.from, to: "user" });
    }
  }
  return changes;
};
