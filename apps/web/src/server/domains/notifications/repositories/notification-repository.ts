import type { KeysetPage } from "../../../db/keyset";
import type { Notification, NotificationKind, SubjectType } from "../models/notification";

export type NotificationFilters = {
  /** `unread` or `read`; both when absent. */
  state?: "unread" | "read";
  kind?: NotificationKind;
};

/** A notification as far as its visibility goes: its kind, its subject and where that lived. */
export type NotificationRef = {
  id: string;
  kind: NotificationKind;
  subjectType: SubjectType;
  subjectId: string;
  workspaceIds: string[];
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
  /**
   * What the person's notifications are about, newest first (up to `cap`), for judging which they
   * may see without reading each one whole. `unread` is `{ state: "unread" }`.
   */
  refs(userId: string, filters: NotificationFilters, cap: number): Promise<NotificationRef[]>;
  /** The person's unread notifications, as `refs`. */
  unread(userId: string, cap: number): Promise<NotificationRef[]>;
  /** Marks these read, the person's own and still unread only; returns the ids that changed. */
  markRead(userId: string, ids: readonly string[], at: Date): Promise<string[]>;
  /** Marks all of the person's unread notifications read; returns how many. */
  markAllRead(userId: string, at: Date): Promise<number>;
  /** Deletes notifications created before `before`; returns how many. */
  deleteOlderThan(before: Date): Promise<number>;
}
