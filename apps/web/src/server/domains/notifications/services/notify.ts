import type { Kysely } from "kysely";
import { newId } from "../../../db/ids";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { encodeParams, type NewNotification } from "../models/notification";
import { kyselyNotificationRepository } from "../repositories/kysely-notification-repository";
import { key, resolveSubjects } from "./subjects";

/**
 * Tells people something happened (feature 139). Call it with the transaction of the change it
 * describes, beside its audit event, so a change that rolls back notifies nobody. One row per
 * recipient; the actor is never notified, and neither are disabled or erased accounts. Returns how
 * many rows were written. Throws on parameters that don't fit: that is a bug, not something to store.
 */
export const notify = async (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  notification: NewNotification,
  now: Date = new Date(),
): Promise<number> => {
  const params = encodeParams(notification.params);
  const wanted = [...new Set(notification.recipients)].filter((id) => id !== notification.actorId);
  if (wanted.length === 0) return 0;
  const active = (
    await db
      .selectFrom("user")
      .select("id")
      .where("id", "in", wanted)
      .where("disabled_at", "is", null)
      .where("erased_at", "is", null)
      .execute()
  ).map((row) => row.id);
  // Where the subject lives now, kept with each row, so it can still be judged once it is gone.
  const where = (
    await resolveSubjects(db, [{ kind: notification.kind, subject: notification.subject }])
  ).get(key(notification.subject.type, notification.subject.id));
  const workspaceIds = where?.workspaceIds.length
    ? JSON.stringify(where.workspaceIds.slice(0, 2))
    : null;
  // The actor's row can't be erased out from under a transaction, but a stale id is just skipped.
  return kyselyNotificationRepository(db, dialect).insertMany(
    active.map((userId) => ({
      id: newId(),
      userId,
      kind: notification.kind,
      actorId: notification.actorId,
      subjectType: notification.subject.type,
      subjectId: notification.subject.id,
      params,
      workspaceIds,
      createdAt: now,
    })),
  );
};
