import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { forUpdate } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import type { AccessRequest } from "../models/access-request";
import type { WorkspaceRepository } from "./workspace-repository";

type RequestRow = {
  id: string;
  workspace_id: string | null;
  workspace: string;
  user_id: string;
  message: string | null;
  status: AccessRequest["status"];
  reason: string | null;
  created_at: Date | string;
  decided_at: Date | string | null;
};

const toRequest = (row: RequestRow): AccessRequest => ({
  id: row.id,
  workspaceId: row.workspace_id,
  workspace: row.workspace,
  userId: row.user_id,
  message: row.message,
  status: row.status,
  reason: row.reason,
  createdAt: fromDbDate(row.created_at),
  decidedAt: fromDbDate(row.decided_at),
});

type AccessRequestMethods = Pick<
  WorkspaceRepository,
  | "lockAccessRequest"
  | "accessRequest"
  | "latestRequest"
  | "membershipChangedSince"
  | "countOpenRequestsBy"
  | "insertAccessRequest"
  | "decideAccessRequest"
  | "approveOpenRequest"
  | "pendingRequests"
  | "countPendingRequests"
  | "requestsOf"
  | "attachRequests"
>;

/** Requests to join a workspace (feature 094), for the workspace repository. */
export const accessRequestMethods = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): AccessRequestMethods => {
  const requests = () =>
    db
      .selectFrom("workspace_access_requests as r")
      .leftJoin("workspaces", "workspaces.id", "r.workspace_id")
      .select([
        "r.id",
        "r.workspace_id",
        "r.workspace_name as workspace",
        "r.user_id",
        "r.message",
        "r.status",
        "r.reason",
        "r.created_at",
        "r.decided_at",
      ]);

  const latestRequest: AccessRequestMethods["latestRequest"] = async (workspaceName, userId) => {
    const row = await requests()
      .where("r.workspace_name", "=", workspaceName)
      .where("r.user_id", "=", userId)
      .orderBy("r.created_at", "desc")
      .orderBy("r.id", "desc")
      .executeTakeFirst();
    return row ? toRequest(row) : null;
  };

  const decide = async (
    id: string,
    decision: Parameters<AccessRequestMethods["decideAccessRequest"]>[1],
  ) => {
    const result = await db
      .updateTable("workspace_access_requests")
      .set({
        status: decision.status,
        decided_by: decision.decidedBy,
        reason: decision.reason,
        decided_at: toDbDate(decision.at, dialect),
      })
      .where("id", "=", id)
      .where("status", "=", "open")
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  };

  return {
    lockAccessRequest: async (id) => {
      await forUpdate(
        db.selectFrom("workspace_access_requests").select("id").where("id", "=", id),
        dialect,
      ).execute();
    },

    accessRequest: async (id) => {
      const row = await requests().where("r.id", "=", id).executeTakeFirst();
      return row ? toRequest(row) : null;
    },

    latestRequest,

    membershipChangedSince: async (workspaceName, userId, since) => {
      const rows = await db
        .selectFrom("audit_log")
        .select("metadata")
        .where("target_type", "=", "user")
        .where("target_id", "=", userId)
        .where("action", "in", ["workspace.member_added", "workspace.member_removed"])
        .where("created_at", ">", toDbDate(since, dialect))
        .execute();
      return rows.some((row) => {
        try {
          return (JSON.parse(row.metadata) as { workspace?: unknown }).workspace === workspaceName;
        } catch {
          return false;
        }
      });
    },

    countOpenRequestsBy: async (userId) => {
      const row = await db
        .selectFrom("workspace_access_requests")
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .where("user_id", "=", userId)
        .where("status", "=", "open")
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    insertAccessRequest: async ({ workspaceId, workspaceName, userId, message, at }) => {
      const id = newId();
      await db
        .insertInto("workspace_access_requests")
        .values({
          id,
          workspace_id: workspaceId,
          workspace_name: workspaceName,
          user_id: userId,
          message,
          status: "open",
          decided_by: null,
          reason: null,
          created_at: toDbDate(at, dialect),
          decided_at: null,
        })
        .execute();
      return id;
    },

    decideAccessRequest: decide,

    approveOpenRequest: async (workspaceId, userId, decidedBy, at) => {
      const row = await requests()
        .where("r.workspace_id", "=", workspaceId)
        .where("r.user_id", "=", userId)
        .where("r.status", "=", "open")
        .executeTakeFirst();
      if (!row) return null;
      if (!(await decide(row.id, { status: "approved", decidedBy, reason: null, at }))) return null;
      return { ...toRequest(row), status: "approved", decidedAt: at };
    },

    pendingRequests: async (workspaceId, limit) =>
      (
        await db
          .selectFrom("workspace_access_requests as r")
          .innerJoin("user", "user.id", "r.user_id")
          .select(["r.id", "r.user_id", "user.email", "user.name", "r.message", "r.created_at"])
          .where("r.workspace_id", "=", workspaceId)
          .where("r.status", "=", "open")
          .where("user.disabled_at", "is", null)
          .orderBy("r.created_at")
          .orderBy("r.id")
          .limit(limit)
          .execute()
      ).map((row) => ({
        id: row.id,
        userId: row.user_id,
        email: row.email,
        name: row.name,
        message: row.message,
        createdAt: fromDbDate(row.created_at),
      })),

    countPendingRequests: async (workspaceIds) => {
      if (workspaceIds !== "all" && workspaceIds.length === 0) return 0;
      let query = db
        .selectFrom("workspace_access_requests as r")
        .innerJoin("user", "user.id", "r.user_id")
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .where("r.status", "=", "open")
        .where("user.disabled_at", "is", null);
      query =
        workspaceIds === "all"
          ? query.where("r.workspace_id", "is not", null)
          : query.where("r.workspace_id", "in", [...workspaceIds]);
      return Number((await query.executeTakeFirstOrThrow()).n);
    },

    requestsOf: async (userId, limit) =>
      (
        await requests()
          .select(["workspaces.description", "workspaces.visibility"])
          .where("r.user_id", "=", userId)
          .orderBy("r.created_at", "desc")
          .orderBy("r.id", "desc")
          .limit(limit)
          .execute()
      ).map((row) => ({
        ...toRequest(row),
        description: row.description,
        visibility: row.visibility,
      })),

    attachRequests: async (workspaceName, workspaceId) => {
      await db
        .updateTable("workspace_access_requests")
        .set({ workspace_id: workspaceId })
        .where("workspace_id", "is", null)
        .where("workspace_name", "=", workspaceName)
        .where("status", "=", "open")
        .execute();
    },
  };
};
