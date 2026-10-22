import { personalWorkspaceName } from "@ronneai/core";
import { retryOnDeadlock } from "../../../db/locks";
import type { AuditMetadata } from "../../audit/models/audit-event";
import { renameLockedWorkspace } from "../../workspaces/services/workspaces";
import {
  CannotModifySelfError,
  EraseConfirmationError,
  ForbiddenError,
  LastRootError,
  UserErasedError,
  UserNotFoundError,
} from "../exceptions/errors";
import { requirePermission } from "../models/permissions";
import { erasedEmail, erasedName } from "../models/user";
import type { EraseRepository, PendingErasure } from "../repositories/erase-repository";
import type { Actor } from "./user-admin";

/**
 * Erasing a user (feature 103): the end of the account, which can't be undone. The person's email,
 * name and every credential go; what they did (items, versions, submitted submissions, reviews,
 * audit events) stays under the pseudonym `deleted-user-<id>`. One transaction with the user's
 * row locked (deadlocks retried, 113), then the audit log's rewrite of their email, inside the
 * transaction on PostgreSQL and SQLite and right after it on MySQL and MariaDB, where a long
 * rewrite would hold gap locks on `audit_log`; `user.erased` is recorded only once that's done.
 */
export type EraseDeps = {
  repo: EraseRepository;
  now?: () => Date;
  /** Rows per rewrite page, for tests; the default is kysely-audit-rewrite.ts's REWRITE_BATCH. */
  rewriteBatch?: number;
  /** Where the rewrite runs, for tests; the default is the repository's (the dialect's). */
  rewriteAfterCommit?: boolean;
};

/** What `user.erased` records: counts, and the personal workspace's fate; never the email or name. */
export type EraseCounts = {
  sessionsEnded: number;
  tokensDeleted: number;
  scimLinksDeleted: number;
  draftsDeleted: number;
  personalWorkspace: "renamed" | "deleted" | "none";
  requestsCancelled?: number;
  movesCancelled?: number;
  favoritesDeleted?: number;
};

export type EraseResult = EraseCounts & { eventsRewritten: number };

const now = (deps: Pick<EraseDeps, "now">) => (deps.now ?? (() => new Date()))();

/** The pseudonym's workspace name by 114's rule, the first one free. */
const freePersonalName = async (repo: EraseRepository, userId: string): Promise<string> => {
  for (let attempt = 0; ; attempt++) {
    const name = personalWorkspaceName(erasedEmail(userId), attempt);
    if (!(await repo.workspaces.findByName(name))) return name;
  }
};

/**
 * Records `user.erased` once the rewrite is done and the erasure's row is gone. Returns the count
 * the event recorded, or null when another finish got there first (a retry and the job can't both
 * record it).
 */
const finish = async (
  repo: EraseRepository,
  erasure: Pick<PendingErasure, "userId" | "counts" | "actorId">,
  via: "web" | "retry" | "job",
  ip: string | null,
  at: Date,
): Promise<number | null> => {
  const done = await repo.deleteErasure(erasure.userId);
  if (!done) return null;
  const metadata: AuditMetadata = {
    ...erasure.counts,
    eventsRewritten: done.eventsRewritten,
    ...(via === "web" ? {} : { via }),
  };
  await repo.recordAudit(
    {
      actorId: erasure.actorId,
      action: "user.erased",
      target: { type: "user", id: erasure.userId },
      metadata,
      ipAddress: ip,
    },
    at,
  );
  return done.eventsRewritten;
};

/** One attempt at the rewrite, its progress kept on the erasure's row page by page. */
const rewrite = async (
  deps: EraseDeps,
  repo: EraseRepository,
  erasure: Pick<PendingErasure, "userId" | "email">,
): Promise<void> => {
  let kept = 0;
  await repo.rewriteEmail(
    { userId: erasure.userId, email: erasure.email, replacement: erasedEmail(erasure.userId) },
    {
      batch: deps.rewriteBatch,
      onBatch: async (done) => {
        await repo.addRewritten(erasure.userId, done - kept);
        kept = done;
      },
    },
  );
};

/**
 * Erases the account: root only (`users.manage`), never the actor's own, never the last enabled
 * root, never twice. The transaction holds the roots' rows and the actor's (059), then the
 * target's, and checks the actor is still a root and the target still erasable. The dialog's
 * typed email (`confirm`) must be the account's, compared with the locked row, so a request with
 * a stale or forged id erases nothing.
 */
export const eraseUser = async (
  deps: EraseDeps,
  actor: Actor,
  userId: string,
  options: { confirm?: string } = {},
): Promise<EraseResult> => {
  requirePermission(actor.user, "users.manage");
  if (userId === actor.user?.id) throw new CannotModifySelfError();
  const confirm = options.confirm === undefined ? undefined : options.confirm.trim().toLowerCase();
  const at = now(deps);
  const afterCommit = deps.rewriteAfterCommit ?? deps.repo.rewritesAfterCommit;

  const erasure = await retryOnDeadlock(() =>
    deps.repo.transaction(async (repo): Promise<PendingErasure & { rewritten: number | null }> => {
      const actorId = actor.user?.id;
      if (!actorId) throw new ForbiddenError("users.manage");
      await repo.identity.lockRoots(actorId);
      requirePermission(await repo.identity.findActiveUser(actorId), "users.manage");
      const target = await repo.lockUser(userId);
      if (!target) throw new UserNotFoundError();
      if (target.erasedAt) throw new UserErasedError();
      if (confirm !== undefined && confirm !== target.email) throw new EraseConfirmationError();

      const pseudonym = { email: erasedEmail(userId), name: erasedName(userId) };
      await repo.anonymizeUser(userId, pseudonym, at);
      // A root's role went with the row: the instance must still have an enabled root (059).
      if (target.role === "root" && (await repo.identity.countActiveRoots()) === 0)
        throw new LastRootError();
      await repo.deleteCredentials(userId, target.email);
      const sessionsEnded = await repo.identity.deleteSessions(userId);
      const tokensDeleted = await repo.deleteAccessTokens(userId);
      await repo.deleteDeviceGrants(userId);
      const scimLinksDeleted = await repo.deleteScimRows(userId);
      await repo.deleteMemberships(userId);
      const favoritesDeleted = await repo.deleteFavorites(userId);
      const requestsCancelled = await repo.identity.cancelAccessRequests(userId, at);
      const movesCancelled = await repo.cancelScopeMoves(userId, at);
      const draftsDeleted = await repo.deleteDrafts(userId);

      let personalWorkspace: EraseCounts["personalWorkspace"] = "none";
      const personal = await repo.personalWorkspace(userId);
      if (personal) {
        await repo.workspaces.lockWorkspace(personal.id);
        if (await repo.holdsRecord(personal.id)) {
          const workspace = await repo.workspaces.findById(personal.id);
          if (workspace) {
            await repo.workspaces.lockOpenWorkIn(workspace.id);
            await repo.workspaces.lockItemsIn(workspace.id);
            const to = await freePersonalName(repo, userId);
            await renameLockedWorkspace(repo.workspaces, actor, workspace, to, at);
          }
          personalWorkspace = "renamed";
        } else {
          await repo.deleteEmptyWorkspace(personal.id);
          personalWorkspace = "deleted";
        }
      }
      await repo.clearAuditIps(userId);

      const counts: EraseCounts = {
        sessionsEnded,
        tokensDeleted,
        scimLinksDeleted,
        draftsDeleted,
        personalWorkspace,
        ...(requestsCancelled > 0 ? { requestsCancelled } : {}),
        ...(movesCancelled > 0 ? { movesCancelled } : {}),
        ...(favoritesDeleted > 0 ? { favoritesDeleted } : {}),
      };
      const row: PendingErasure = {
        userId,
        email: target.email,
        counts,
        eventsRewritten: 0,
        actorId,
        startedAt: at,
      };
      await repo.insertErasure(row);
      if (afterCommit) return { ...row, rewritten: null };
      await rewrite(deps, repo, row);
      return { ...row, rewritten: await finish(repo, row, "web", actor.ip, at) };
    }),
  );

  const counts = erasure.counts as EraseCounts;
  if (erasure.rewritten !== null) return { ...counts, eventsRewritten: erasure.rewritten };
  // MySQL and MariaDB: the rewrite in short transactions of its own, then the event. A failure
  // here leaves the row for the Privacy tab's Retry and the retention job.
  await rewrite(deps, deps.repo, erasure);
  const rewritten = await deps.repo.transaction((repo) =>
    finish(repo, erasure, "web", actor.ip, now(deps)),
  );
  return { ...counts, eventsRewritten: rewritten ?? 0 };
};

/** The erasures whose rewrite isn't done, for the Privacy tab (root only). */
export const pendingErasures = async (
  deps: Pick<EraseDeps, "repo">,
  actor: Actor,
): Promise<{ userId: string; startedAt: Date }[]> => {
  requirePermission(actor.user, "users.manage");
  return (await deps.repo.pendingErasures()).map(({ userId, startedAt }) => ({
    userId,
    startedAt,
  }));
};

/**
 * Finishes every pending erasure: the rewrite, then `user.erased` (with `via`). From the Privacy
 * tab's Retry (`actor` a root) or the retention job (102; no actor). Returns how many finished.
 */
export const finishErasures = async (
  deps: EraseDeps,
  via: { actor: Actor } | { job: true },
): Promise<number> => {
  if ("actor" in via) requirePermission(via.actor.user, "users.manage");
  let finished = 0;
  for (const erasure of await deps.repo.pendingErasures()) {
    await rewrite(deps, deps.repo, erasure);
    const done = await deps.repo.transaction((repo) =>
      finish(
        repo,
        erasure,
        "actor" in via ? "retry" : "job",
        "actor" in via ? via.actor.ip : null,
        now(deps),
      ),
    );
    if (done !== null) finished++;
  }
  return finished;
};
