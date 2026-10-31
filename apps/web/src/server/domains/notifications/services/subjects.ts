import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import type { NotificationKind } from "../models/notification";
import type { ResolvedSubject } from "../models/visibility";

type Db = Kysely<Database>;

export type Ref = { kind: NotificationKind; subject: { type: string; id: string } };

export const key = (type: string, id: string) => `${type}:${id}`;

const idsOf = (refs: readonly Ref[], type: string) => [
  ...new Set(refs.filter((ref) => ref.subject.type === type).map((ref) => ref.subject.id)),
];

/**
 * What each notification's subject is now (139): its workspaces, and where it leads. A subject that
 * no longer exists has no entry. One query per kind of subject, whatever the number of rows.
 */
export const resolveSubjects = async (
  db: Db,
  refs: readonly Ref[],
): Promise<Map<string, ResolvedSubject>> => {
  const out = new Map<string, ResolvedSubject>();
  const kindOf = new Map(refs.map((ref) => [key(ref.subject.type, ref.subject.id), ref.kind]));

  const submissions = idsOf(refs, "submission");
  if (submissions.length)
    for (const row of await db
      .selectFrom("submissions")
      .innerJoin("scopes", "scopes.id", "submissions.scope_id")
      .select(["submissions.id as id", "scopes.workspace_id as workspace_id"])
      .where("submissions.id", "in", submissions)
      .execute())
      out.set(key("submission", row.id), {
        workspaceIds: [row.workspace_id],
        link: { to: "submission", id: row.id },
      });

  const workspaces = idsOf(refs, "workspace");
  if (workspaces.length)
    for (const row of await db
      .selectFrom("workspaces")
      .select(["id", "name"])
      .where("id", "in", workspaces)
      .execute())
      out.set(key("workspace", row.id), {
        workspaceIds: [row.id],
        link: { to: "workspace", name: row.name },
      });

  const joins = idsOf(refs, "join_request");
  if (joins.length)
    for (const row of await db
      .selectFrom("workspace_access_requests")
      .leftJoin("workspaces", "workspaces.id", "workspace_access_requests.workspace_id")
      .select([
        "workspace_access_requests.id as id",
        "workspaces.id as workspace_id",
        "workspaces.name as workspace_name",
      ])
      .where("workspace_access_requests.id", "in", joins)
      .execute()) {
      const waiting = kindOf.get(key("join_request", row.id)) === "request.join_waiting";
      out.set(key("join_request", row.id), {
        workspaceIds: row.workspace_id ? [row.workspace_id] : [],
        link: waiting
          ? { to: "requests" }
          : row.workspace_name
            ? { to: "workspace", name: row.workspace_name }
            : null,
      });
    }

  const scopeMoves = idsOf(refs, "scope_move");
  if (scopeMoves.length)
    for (const row of await db
      .selectFrom("scope_moves")
      .innerJoin("workspaces", "workspaces.id", "scope_moves.to_workspace_id")
      .select([
        "scope_moves.id as id",
        "scope_moves.from_workspace_id as from_workspace_id",
        "workspaces.id as to_workspace_id",
        "workspaces.name as to_workspace_name",
      ])
      .where("scope_moves.id", "in", scopeMoves)
      .execute())
      out.set(key("scope_move", row.id), {
        workspaceIds: [
          row.to_workspace_id,
          ...(row.from_workspace_id ? [row.from_workspace_id] : []),
        ],
        link: { to: "workspace", name: row.to_workspace_name },
      });

  const itemMoves = idsOf(refs, "item_move");
  if (itemMoves.length)
    for (const row of await db
      .selectFrom("item_moves")
      .innerJoin("items", "items.id", "item_moves.item_id")
      .innerJoin("scopes", "scopes.id", "items.scope_id")
      .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
      .leftJoin("scopes as from_scope", "from_scope.id", "item_moves.from_scope_id")
      .leftJoin("scopes as to_scope", "to_scope.id", "item_moves.to_scope_id")
      .select([
        "item_moves.id as id",
        "items.name as item_name",
        "scopes.name as scope_name",
        "workspaces.id as workspace_id",
        "workspaces.name as workspace_name",
        "from_scope.workspace_id as from_workspace_id",
        "to_scope.workspace_id as to_workspace_id",
      ])
      .where("item_moves.id", "in", itemMoves)
      .execute())
      out.set(key("item_move", row.id), {
        workspaceIds: [
          ...new Set(
            [row.workspace_id, row.from_workspace_id, row.to_workspace_id].filter(
              (id): id is string => id !== null,
            ),
          ),
        ],
        link: {
          to: "item",
          workspace: row.workspace_name,
          scope: row.scope_name,
          name: row.item_name,
        },
      });

  const feedback = idsOf(refs, "feedback");
  if (feedback.length)
    for (const row of await db
      .selectFrom("feedback")
      .select("id")
      .where("id", "in", feedback)
      .execute())
      out.set(key("feedback", row.id), { workspaceIds: [], link: { to: "feedback" } });

  return out;
};

/** A notification as far as its subject goes: what it is, and where it lived when written. */
export type SubjectRow = Ref & { workspaceIds: readonly string[] };

/**
 * What each row's subject is now, aligned with `rows`; null when it can't be known (139). A subject
 * that is gone keeps the workspaces it lived in when written (migration 0042), the ones that still
 * exist, so deleting an item or a request can't make a hidden notification visible again; with none
 * of them left there is nothing to check.
 */
export const resolveRows = async (
  db: Db,
  rows: readonly SubjectRow[],
): Promise<(ResolvedSubject | null)[]> => {
  const resolved = await resolveSubjects(db, rows);
  const gone = rows.filter((row) => !resolved.has(key(row.subject.type, row.subject.id)));
  const wanted = [...new Set(gone.flatMap((row) => row.workspaceIds))];
  const existing = new Set(
    wanted.length === 0
      ? []
      : (await db.selectFrom("workspaces").select("id").where("id", "in", wanted).execute()).map(
          (row) => row.id,
        ),
  );
  return rows.map((row) => {
    const found = resolved.get(key(row.subject.type, row.subject.id));
    if (found) return found;
    const kept = row.workspaceIds.filter((id) => existing.has(id));
    return kept.length ? { workspaceIds: kept, link: null } : null;
  });
};
