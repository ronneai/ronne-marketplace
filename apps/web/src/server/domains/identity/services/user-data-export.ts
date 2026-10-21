import { retryOnDeadlock } from "../../../db/locks";
import {
  DataExportLimitError,
  ForbiddenError,
  UserErasedError,
  UserNotFoundError,
} from "../exceptions/errors";
import { requirePermission } from "../models/permissions";
import {
  cutBody,
  scrubOtherEmails,
  USER_DATA_INSTANCE_NAME,
  USER_DATA_MAX_ROWS,
  USER_DATA_VERSION,
  USER_DATA_WINDOW_MS,
  type UserData,
  type UserDataSection,
} from "../models/user-data";
import type { UserDataRepository } from "../repositories/user-data-repository";
import type { Actor } from "./user-admin";

/**
 * Making a person's data file (feature 104): their own, or root's for them. One transaction with
 * the account's row locked, so two downloads at once can't both pass the ten-minute limit, which
 * is counted from the audit log's `user.data_exported` events about the account (root's downloads
 * count against the person's). The file is made in memory, every list cut at the row limit.
 */
export type UserDataDeps = {
  repo: UserDataRepository;
  /** The instance's public URL, when it has one. */
  url?: string | null;
  now?: () => Date;
  /** Rows in a list, for tests; the default is USER_DATA_MAX_ROWS. */
  maxRows?: number;
  /** A comment's body in characters, for tests; the default is USER_DATA_COMMENT_MAX. */
  commentMax?: number;
};

const now = (deps: Pick<UserDataDeps, "now">) => (deps.now ?? (() => new Date()))();

/** The list as it is kept: at most `max` rows, oldest first, and whether it was cut. */
const kept = <T>(rows: T[], max: number): { rows: T[]; cut: boolean } =>
  rows.length > max ? { rows: rows.slice(0, max), cut: true } : { rows, cut: false };

/**
 * The file for `userId`: the person's own (`actor` is them), or root's (`users.manage`). Throws
 * ForbiddenError for anyone else, UserNotFoundError for no such account, UserErasedError for an
 * erased one, and DataExportLimitError (with the seconds left) inside the ten minutes.
 */
export const exportUserData = async (
  deps: UserDataDeps,
  actor: Actor,
  userId: string,
): Promise<{ data: UserData; rows: Record<string, number>; by: "self" | "root" }> => {
  const actorId = actor.user?.id;
  if (!actorId) throw new ForbiddenError("users.manage");
  const by = actorId === userId ? "self" : "root";
  if (by === "root") requirePermission(actor.user, "users.manage");
  const max = deps.maxRows ?? USER_DATA_MAX_ROWS;
  const ask = max + 1;
  const at = now(deps);

  return retryOnDeadlock(() =>
    deps.repo.transaction(async (repo) => {
      // Both rows, in id order so two roots downloading each other's can't deadlock.
      const locked = new Map<string, Awaited<ReturnType<typeof repo.lockUser>>>();
      for (const id of [...new Set([userId, actorId])].sort())
        locked.set(id, await repo.lockUser(id));
      const user = locked.get(userId);
      if (!user) throw new UserNotFoundError();
      if (user.erasedAt) throw new UserErasedError();
      // Root may have lost the role, or been disabled, while this waited for the lock (059).
      const asker = locked.get(actorId);
      if (by === "self" && user.disabledAt) throw new ForbiddenError("users.manage");
      if (by === "root" && (asker?.role !== "root" || asker.disabledAt))
        throw new ForbiddenError("users.manage");

      const recent = await repo.exportedSince(userId, new Date(at.getTime() - USER_DATA_WINDOW_MS));
      if (recent)
        throw new DataExportLimitError(
          Math.min(
            USER_DATA_WINDOW_MS / 1000,
            Math.max(1, Math.ceil((recent.getTime() + USER_DATA_WINDOW_MS - at.getTime()) / 1000)),
          ),
        );

      const account = await repo.account(userId);
      if (!account) throw new UserNotFoundError();
      const truncated: UserDataSection[] = [];
      const list = <T>(section: UserDataSection, rows: T[]): T[] => {
        const result = kept(rows, max);
        if (result.cut) truncated.push(section);
        return result.rows;
      };

      const sessions = list("sessions", await repo.sessions(userId, ask));
      const accessTokens = list("accessTokens", await repo.accessTokens(userId, ask));
      const deviceGrants = list("deviceGrants", await repo.deviceGrants(userId, ask));
      const workspaces = list("workspaces", await repo.workspaces(userId, ask));
      const accessRequests = list("accessRequests", await repo.accessRequests(userId, ask));
      const scopes = list("scopes", await repo.scopes(userId, ask));
      const favorites = list("favorites", await repo.favorites(userId, ask));
      const found = await repo.items(userId, ask);
      const items = [];
      if (found.versions > max) truncated.push("items");
      // The versions are what's bounded: the oldest `max` are kept, an item losing the rest of its
      // versions with them (and disappearing when it has none left).
      let room = max;
      for (const item of found.items) {
        const versions = item.versions.slice(0, room);
        room -= versions.length;
        if (versions.length > 0) items.push({ ...item, versions });
      }
      const submissions = list("submissions", await repo.submissions(userId, ask));
      let commentCut = false;
      const comments = list("comments", await repo.comments(userId, ask)).map((comment) => {
        if (comment.body === null) return comment;
        const { body, cut } = cutBody(comment.body, deps.commentMax);
        commentCut ||= cut;
        return { ...comment, body };
      });
      if (commentCut && !truncated.includes("comments")) truncated.push("comments");
      const auditEvents = list("auditEvents", await repo.auditEvents(userId, ask)).map((event) => ({
        ...event,
        metadata: scrubOtherEmails(event.metadata, account.email),
      }));

      const data: UserData = {
        version: USER_DATA_VERSION,
        exportedAt: at,
        instance: { name: USER_DATA_INSTANCE_NAME, url: deps.url ?? null },
        ...(truncated.length > 0 ? { truncated } : {}),
        account,
        sessions,
        accessTokens,
        deviceGrants,
        workspaces,
        accessRequests,
        scopes,
        favorites,
        items,
        submissions,
        comments,
        auditEvents,
      };
      const rows: Record<string, number> = {
        sessions: sessions.length,
        accessTokens: accessTokens.length,
        deviceGrants: deviceGrants.length,
        workspaces: workspaces.length,
        accessRequests: accessRequests.length,
        scopes: scopes.length,
        favorites: favorites.length,
        items: items.length,
        submissions: submissions.length,
        comments: comments.length,
        auditEvents: auditEvents.length,
      };
      await repo.recordAudit(
        {
          actorId,
          action: "user.data_exported",
          target: { type: "user", id: userId },
          metadata: { by, rows },
          ipAddress: actor.ip,
        },
        at,
      );
      return { data, rows, by };
    }),
  );
};

/** When the account's data was last downloaded (the Account page shows it); null if never. */
export const lastExport = (deps: Pick<UserDataDeps, "repo">, userId: string) =>
  deps.repo.lastExported(userId);
