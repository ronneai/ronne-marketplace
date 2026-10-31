import type { KeysetPage } from "../../../db/keyset";
import type { Notification, NotificationKind, SubjectType } from "../models/notification";

export type NotificationFilters = {
  /** `unread` or `read`; both when absent. */
  state?: "unread" | "read";
  kind?: NotificationKind;
};

export type NotificationPageQuery = NotificationFilters & {
  userId: string;
  size: number;
  cursor?: string;
};

/** Notification storage (feature 139). Kysely in kysely-notification-repository.ts. */
export interface NotificationRepository {
  /** One row per id; returns how many were written. */
  insertMany(
    rows: readonly {
      id: string;
      userId: string;
      kind: NotificationKind;
      actorId: string | null;
      subjectType: string;
      subjectId: string;
      params: string;
      workspaceIds: string | null;
      createdAt: Date;
    }[],
  ): Promise<number>;
  /** The person's notifications, newest first. */
  page(query: NotificationPageQuery): Promise<KeysetPage<Notification>>;
  /** The latest few, newest first. */
  latest(userId: string, limit: number): Promise<Notification[]>;
  /** How many are unread, up to `cap` (a result equal to `cap` means "that many or more"). */
  countUnread(userId: string, cap: number): Promise<number>;
  /** The person's unread notifications, newest first, with what each is about (up to `cap`). */
  unread(
    userId: string,
    cap: number,
  ): Promise<
    {
      id: string;
      kind: NotificationKind;
      subjectType: SubjectType;
      subjectId: string;
      workspaceIds: string[];
    }[]
  >;
  /** Marks these read, the person's own and still unread only; returns the ids that changed. */
  markRead(userId: string, ids: readonly string[], at: Date): Promise<string[]>;
  /** Marks all of the person's unread notifications read; returns how many. */
  markAllRead(userId: string, at: Date): Promise<number>;
  /** Deletes notifications created before `before`; returns how many. */
  deleteOlderThan(before: Date): Promise<number>;
}
